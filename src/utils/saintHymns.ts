import type { DocumentVerse } from '../components/chc/documentHtml';
import { buildVerseFromTextRow } from './hymnLibrary';
import { supabase } from './supabase';

/**
 * Saint hymn conditions are hierarchical: a base token names the saint
 * (`StMark`) and child tokens name his individual hymns (`StMark:Doxology1`,
 * `StMark:VOC`, `StMark:Veneration`). This module builds the index the saint
 * picker needs — base -> the distinct child hymn tokens that actually exist —
 * by reading the six tables those children live in exactly once per session.
 *
 * Deliberately generic. Nothing here knows any particular saint; a new saint,
 * an extra doxology or a future veneration melody appears in the menu as soon
 * as a condition follows the same `Base:Child` shape.
 */

/** Only these child namespaces are hymn choices. `:Feast` and any other child still works as a condition, it just isn't something to pick from a menu. */
const HYMN_CATEGORIES = ['Doxology', 'VOC', 'Psali', 'Hiten', 'PraxisResponse', 'Veneration'] as const;
export type SaintHymnCategory = (typeof HYMN_CATEGORIES)[number];

/**
 * Order the categories appear within one saint's menu: the Praises hymns
 * first, then the two from the Liturgy, then the Axios that closes it.
 */
const CATEGORY_ORDER: Record<SaintHymnCategory, number> = {
  Doxology: 0,
  VOC: 1,
  Psali: 2,
  Hiten: 3,
  PraxisResponse: 4,
  Veneration: 5,
};

const CATEGORY_LABEL: Record<SaintHymnCategory, string> = {
  Doxology: 'Doxology',
  // Always plural, even where a saint has only one — "Verses of the Cymbals"
  // is the name of the hymn, not a count of what's in it.
  VOC: 'Verses of the Cymbals',
  Psali: 'Psali',
  // Left as the name it is actually called by, the same way Psali is — this is
  // the hymn of the intercessions, from hymn_of_the_intercessions.
  Hiten: 'Hiten',
  PraxisResponse: 'Praxis Response',
  Veneration: 'Veneration',
};

const SAINT_TOKEN_RE = new RegExp(
  `([A-Za-z][A-Za-z0-9_]*):(${HYMN_CATEGORIES.join('|')})([A-Za-z0-9_]*)`,
  'g',
);

export interface SaintHymnOption {
  /** The full child condition token, e.g. `StMark:VOC` — what selection activates. */
  token: string;
  category: SaintHymnCategory;
  /** `Doxology1` -> `Doxology 1`, `VOC` -> `Verse of the Cymbals`. */
  label: string;
  sort: number;
}

export interface SaintEntry {
  /** Base condition token, e.g. `StMark`. Never activated by picking a child. */
  base: string;
  name: string;
  options: SaintHymnOption[];
  sort: number;
}

/**
 * `Doxology1` -> `Doxology 1`, `VOC` -> `Verse of the Cymbals`,
 * `VOC2` -> `Verse of the Cymbals 2`, `Psali` -> `Psali`.
 * A bare category keeps its bare label — a saint with one Psali says "Psali",
 * not "Psali 1".
 */
function optionLabel(category: SaintHymnCategory, suffix: string): string {
  const base = CATEGORY_LABEL[category];
  const trimmed = suffix.trim();
  return trimmed ? `${base} ${trimmed}` : base;
}

/**
 * Fallback display name for a saint with no `calendar.condition_flags` title:
 * split the CamelCase token and lower the connecting words, so
 * `StJohnTheBaptist` reads "St. John the Baptist" rather than
 * "St John The Baptist".
 */
const CONNECTORS = new Set(['the', 'of', 'and', 'in', 'his', 'her', 'to', 'for', 'on', 'at', 'with']);

export function humanizeSaintBase(base: string): string {
  const words = String(base || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_]+/)
    .filter(Boolean);

  return words
    .map((word, index) => {
      if (index > 0 && CONNECTORS.has(word.toLowerCase())) return word.toLowerCase();
      if (index === 0 && word === 'St') return 'St.';
      return word;
    })
    .join(' ');
}

function collectTokens(conditions: (string | null | undefined)[], into: Map<string, Set<string>>) {
  for (const condition of conditions) {
    if (!condition) continue;
    for (const match of condition.matchAll(SAINT_TOKEN_RE)) {
      const [token, base] = match;
      if (!into.has(base)) into.set(base, new Set());
      // Keyed by the FULL token, so an Adam and a Vatos row that both say
      // `StMark:Psali1` collapse to one menu option rather than two.
      into.get(base)!.add(token);
    }
  }
}

async function fetchConditions(schema: string, table: string, extra?: { column: string; value: string }) {
  let query = supabase.schema(schema).from(table).select('condition');
  if (extra) query = query.eq(extra.column, extra.value);
  const { data, error } = await query;
  if (error) throw new Error(`Unable to load ${schema}.${table} conditions: ${error.message}`);
  return (data || []).map((row: { condition: string | null }) => row.condition);
}

let indexPromise: Promise<SaintEntry[]> | null = null;

/**
 * Base -> available child hymn tokens, ordered traditionally.
 *
 * The order is the veneration Axios sequence (St Mary, the archangels, the
 * Four Incorporeal Creatures, the twenty-four presbyters, John the Baptist,
 * the apostles, the martyrs...), which is the same sequence the doxologies
 * follow while covering far more saints. A saint with no Axios line — a few
 * only have doxologies — sorts after those, by its doxology position.
 *
 * Cached for the session: this is five small reads, and the picker would
 * otherwise redo them every time a saint is tapped.
 */
export function getSaintHymnIndex(): Promise<SaintEntry[]> {
  if (!indexPromise) {
    indexPromise = buildIndex().catch((error) => {
      // Don't cache a failure — a transient network error should not leave the
      // picker permanently empty for the rest of the session.
      indexPromise = null;
      throw error;
    });
  }
  return indexPromise;
}

async function buildIndex(): Promise<SaintEntry[]> {
  const [venerationRows, doxologyRows, vocConditions, psaliConditions, hitenConditions, praxisConditions, flagRows, orderRows] =
    await Promise.all([
    (async () => {
      const { data, error } = await supabase
        .schema('veneration')
        .from('hymn_texts')
        .select('line_order, condition')
        .eq('hymn_key', 'axios');
      if (error) throw new Error(`Unable to load veneration conditions: ${error.message}`);
      return (data || []) as { line_order: string | number; condition: string | null }[];
    })(),
    (async () => {
      const { data, error } = await supabase
        .schema('doxologies')
        .from('doxologies')
        .select('item_order, condition');
      if (error) throw new Error(`Unable to load doxology conditions: ${error.message}`);
      return (data || []) as { item_order: string | number; condition: string | null }[];
    })(),
    fetchConditions('verses_of_the_cymbals', 'verses_of_the_cymbals'),
    fetchConditions('psalmody', 'midnight_praises'),
    fetchConditions('hymn_of_the_intercessions', 'hymn_of_the_intercessions'),
    fetchConditions('praxis_response', 'praxis_response'),
    (async () => {
      const { data, error } = await supabase
        .schema('calendar')
        .from('condition_flags')
        .select('flag_key, title_english');
      if (error) return [] as { flag_key: string; title_english: string | null }[];
      return (data || []) as { flag_key: string; title_english: string | null }[];
    })(),
    (async () => {
      const { data, error } = await supabase.from('saint_order').select('flag_key, sort_order');
      // Soft-fail: an unreachable order table should degrade to the inferred
      // order below, never leave the picker empty.
      if (error) return [] as { flag_key: string; sort_order: number | string | null }[];
      return (data || []) as { flag_key: string; sort_order: number | string | null }[];
    })(),
  ]);

  const childrenByBase = new Map<string, Set<string>>();
  collectTokens(venerationRows.map((row) => row.condition), childrenByBase);
  collectTokens(doxologyRows.map((row) => row.condition), childrenByBase);
  collectTokens(vocConditions, childrenByBase);
  collectTokens(psaliConditions, childrenByBase);
  collectTokens(hitenConditions, childrenByBase);
  collectTokens(praxisConditions, childrenByBase);

  // Traditional position: Axios line order first, then doxology order for the
  // handful of saints with no Axios line, offset so they always follow.
  const DOXOLOGY_OFFSET = 100000;
  // Anything absent from public.saint_order sorts after everything present in
  // it, however large its curated sort_order grows.
  const UNLISTED_OFFSET = Number.MAX_SAFE_INTEGER / 4;
  const sortByBase = new Map<string, number>();
  const noteSort = (condition: string | null, value: number, offset: number) => {
    if (!condition) return;
    for (const match of condition.matchAll(SAINT_TOKEN_RE)) {
      const base = match[1];
      const candidate = offset + value;
      const existing = sortByBase.get(base);
      if (existing === undefined || candidate < existing) sortByBase.set(base, candidate);
    }
  };
  for (const row of venerationRows) noteSort(row.condition, Number(row.line_order) || 0, 0);
  for (const row of doxologyRows) noteSort(row.condition, Number(row.item_order) || 0, DOXOLOGY_OFFSET);

  const nameByFlag = new Map<string, string>();
  for (const row of flagRows) {
    if (row.title_english) nameByFlag.set(row.flag_key, row.title_english);
  }

  // public.saint_order is the formal, hand-maintained order and wins outright
  // where a saint is listed. The Axios/doxology derivation above stays as the
  // fallback for anything not in the table yet — a saint added to the hymn
  // tables still appears in a sensible place before anyone curates his row.
  // Listed saints always precede unlisted ones, so a partially filled table
  // never scatters curated entries through the inferred tail.
  const explicitOrder = new Map<string, number>();
  for (const row of orderRows) {
    const value = Number(row.sort_order);
    if (Number.isFinite(value)) explicitOrder.set(row.flag_key, value);
  }

  const entries: SaintEntry[] = [];
  for (const [base, tokens] of childrenByBase) {
    const options: SaintHymnOption[] = [];
    for (const token of tokens) {
      const match = new RegExp(`^${base}:(${HYMN_CATEGORIES.join('|')})([A-Za-z0-9_]*)$`).exec(token);
      if (!match) continue;
      const category = match[1] as SaintHymnCategory;
      const suffix = match[2] || '';
      options.push({
        token,
        category,
        label: optionLabel(category, suffix),
        sort: CATEGORY_ORDER[category] * 1000 + (Number(suffix) || 0),
      });
    }
    if (!options.length) continue;
    // A saint whose only hymn is the Axios veneration doesn't earn a menu row.
    // That Axios is sung on his feast, and the calendar already turns it on
    // there through the saint's own `:Feast` condition — picking it by hand on
    // any other day isn't a real need. These are the bulk of the book, so
    // dropping them is what makes the remaining list navigable.
    if (options.every((option) => option.category === 'Veneration')) continue;
    options.sort((a, b) => a.sort - b.sort || a.token.localeCompare(b.token));
    const explicit = explicitOrder.get(base);
    entries.push({
      base,
      name: nameByFlag.get(base) || humanizeSaintBase(base),
      options,
      // UNLISTED_OFFSET keeps every curated row ahead of every inferred one.
      sort: explicit !== undefined ? explicit : UNLISTED_OFFSET + (sortByBase.get(base) ?? Number.MAX_SAFE_INTEGER / 2),
    });
  }

  entries.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  return entries;
}


/**
 * Where a category's condition lives, and where the text it brings in comes
 * from. Every one of these schemas has the same shape — an order table of
 * `item_order, hymn_key, condition` pointing at lines in its own hymn_texts,
 * titled by its own hymn_titles.
 */
const CATEGORY_SOURCE: Record<SaintHymnCategory, { schema: string; orderTable: string | null }> = {
  Doxology: { schema: 'doxologies', orderTable: 'doxologies' },
  VOC: { schema: 'verses_of_the_cymbals', orderTable: 'verses_of_the_cymbals' },
  Psali: { schema: 'psalmody', orderTable: 'midnight_praises' },
  Hiten: { schema: 'hymn_of_the_intercessions', orderTable: 'hymn_of_the_intercessions' },
  PraxisResponse: { schema: 'praxis_response', orderTable: 'praxis_response' },
  // The Axios is one hymn carrying a line per saint, so the condition sits on
  // the line itself and there is no order row to go through.
  Veneration: { schema: 'veneration', orderTable: null },
};

const VENERATION_HYMN_KEY = 'axios';

export interface SaintHymnPreviewHymn {
  hymnKey: string;
  title: { english: string; arabic: string };
  /** The hymn's own prayer_type, which a verse without one of its own inherits — exactly as a section's does in a real document. */
  titlePrayerType: string | null;
  /** Built by the same function the document builds its verses with, so the preview can be handed straight to the document renderer. */
  verses: DocumentVerse[];
}

function escapeForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether a stored condition really names this token, rather than merely
 * containing its letters. `StMark:Psali1` must not match `StMark:Psali10`,
 * and the database is queried with a LIKE that cannot tell them apart (an
 * underscore in a saint's token is a LIKE wildcard, too) — so the query casts
 * a wide net and this decides.
 */
function referencesToken(condition: string | null | undefined, token: string): boolean {
  if (!condition) return false;
  return new RegExp(`${escapeForRegExp(token)}(?![A-Za-z0-9_])`).test(condition);
}

function hasText(verse: DocumentVerse) {
  return Boolean(verse.english.trim() || verse.coptic.trim() || verse.arabic.trim());
}

interface TextRow {
  hymn_key: string;
  line_order: string | number | null;
  english: string | null;
  coptic: string | null;
  arabic: string | null;
  person_type: string | null;
  prayer_type: string | null;
}

/** Every column the document's own verse builder reads, so a previewed verse is the verse. */
const TEXT_COLUMNS = 'hymn_key, line_order, english, coptic, arabic, person_type, prayer_type';

const byLineOrder = (a: TextRow, b: TextRow) => (Number(a.line_order) || 0) - (Number(b.line_order) || 0);

function toVerses(rows: TextRow[], titlePrayerType: string | null): DocumentVerse[] {
  return rows
    .sort(byLineOrder)
    .map((row) => buildVerseFromTextRow(row, titlePrayerType) as DocumentVerse)
    .filter(hasText);
}

interface HymnTitle {
  english: string;
  arabic: string;
  prayerType: string | null;
}

async function loadTitles(schema: string, hymnKeys: string[]) {
  const titles = new Map<string, HymnTitle>();
  if (!hymnKeys.length) return titles;

  const { data } = await supabase
    .schema(schema)
    .from('hymn_titles')
    .select('hymn_key, title_english, title_arabic, prayer_type')
    .in('hymn_key', hymnKeys);

  // Only real titles go in the map, so a row that exists with nothing in it
  // falls through to the caller's fallback rather than registering as a title
  // and rendering blank. Two of these six schemas have no hymn_titles table at
  // all, which arrives here as no data and is handled by the same fallback --
  // the error is deliberately not raised, since a missing name is no reason to
  // refuse to show the hymn.
  for (const row of (data || []) as {
    hymn_key: string;
    title_english: string | null;
    title_arabic: string | null;
    prayer_type: string | null;
  }[]) {
    const english = row.title_english || '';
    const arabic = row.title_arabic || '';
    if (english || arabic || row.prayer_type) {
      titles.set(row.hymn_key, { english, arabic, prayerType: row.prayer_type || null });
    }
  }
  return titles;
}

async function loadPreview(token: string, category: SaintHymnCategory): Promise<SaintHymnPreviewHymn[]> {
  const source = CATEGORY_SOURCE[category];

  if (!source.orderTable) {
    const { data, error } = await supabase
      .schema(source.schema)
      .from('hymn_texts')
      .select(`${TEXT_COLUMNS}, condition`)
      .eq('hymn_key', VENERATION_HYMN_KEY)
      .ilike('condition', `%${token}%`);
    if (error) throw new Error(`Unable to load this hymn: ${error.message}`);

    const titles = await loadTitles(source.schema, [VENERATION_HYMN_KEY]);
    const title = titles.get(VENERATION_HYMN_KEY);
    const rows = ((data || []) as (TextRow & { condition: string | null })[])
      .filter((row) => referencesToken(row.condition, token));
    const verses = toVerses(rows, title?.prayerType ?? null);
    if (!verses.length) return [];

    return [{
      hymnKey: VENERATION_HYMN_KEY,
      title: {
        english: title?.english || CATEGORY_LABEL[category],
        arabic: title?.arabic || '',
      },
      titlePrayerType: title?.prayerType ?? null,
      verses,
    }];
  }

  const { data: orderData, error: orderError } = await supabase
    .schema(source.schema)
    .from(source.orderTable)
    .select('item_order, hymn_key, condition')
    .ilike('condition', `%${token}%`);
  if (orderError) throw new Error(`Unable to load this hymn: ${orderError.message}`);

  const orderRows = ((orderData || []) as { item_order: string | number | null; hymn_key: string; condition: string | null }[])
    .filter((row) => referencesToken(row.condition, token))
    .sort((a, b) => (Number(a.item_order) || 0) - (Number(b.item_order) || 0));

  // One token can bring in more than one hymn — an Adam and a Vatos Psali for
  // the same saint, say. Kept in the order they are prayed in, de-duplicated
  // where the same hymn is placed twice.
  const hymnKeys: string[] = [];
  for (const row of orderRows) {
    if (row.hymn_key && !hymnKeys.includes(row.hymn_key)) hymnKeys.push(row.hymn_key);
  }
  if (!hymnKeys.length) return [];

  const [{ data: textData, error: textError }, titles] = await Promise.all([
    supabase
      .schema(source.schema)
      .from('hymn_texts')
      .select(TEXT_COLUMNS)
      .in('hymn_key', hymnKeys),
    loadTitles(source.schema, hymnKeys),
  ]);
  if (textError) throw new Error(`Unable to load this hymn: ${textError.message}`);

  const linesByHymn = new Map<string, TextRow[]>();
  for (const row of (textData || []) as TextRow[]) {
    if (!linesByHymn.has(row.hymn_key)) linesByHymn.set(row.hymn_key, []);
    linesByHymn.get(row.hymn_key)!.push(row);
  }

  return hymnKeys
    .map((hymnKey) => {
      const title = titles.get(hymnKey);
      return {
        hymnKey,
        title: {
          english: title?.english || humanizeSaintBase(hymnKey),
          arabic: title?.arabic || '',
        },
        titlePrayerType: title?.prayerType ?? null,
        verses: toVerses(linesByHymn.get(hymnKey) || [], title?.prayerType ?? null),
      };
    })
    .filter((hymn) => hymn.verses.length > 0);
}

const previewCache = new Map<string, Promise<SaintHymnPreviewHymn[]>>();

/**
 * The actual text a saint hymn choice brings into the service — what the
 * picker shows behind its preview button, so a choice can be made by reading
 * the hymn rather than by recognising its key.
 *
 * Cached per token for the session, and a failure is not cached, so a
 * transient network error does not leave one hymn permanently unpreviewable.
 */
export function getSaintHymnPreview(token: string, category: SaintHymnCategory): Promise<SaintHymnPreviewHymn[]> {
  const cached = previewCache.get(token);
  if (cached) return cached;

  const pending = loadPreview(token, category).catch((error) => {
    previewCache.delete(token);
    throw error;
  });
  previewCache.set(token, pending);
  return pending;
}
