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
