import { supabase } from "./supabase";
import { evaluateCondition, getContextFlags } from "./conditionEngine";

// ─── Subdocument sentinel → schema.table registry ────────────────────────────
// Verified against live DB usage (see project memory project_subdocument_registry.md).
// Entries that are null mean the content hasn't been built yet — skip gracefully.
// Reading-resolution sentinels (PROPHECIES, PAULINE_EPISTLE, *_WITH_COPTIC, etc.)
// are NOT schema/table targets — they route through the Lectionary/Bible reader
// instead, so they're deliberately absent here.

export const SUBDOCUMENT_MAP = {
  ANTIPHONARY: { schema: "psalmody", table: "antiphonary" },
  CANONS: { schema: "canons", table: "canons" },
  DOXOLOGIES: { schema: "doxologies", table: "doxologies" },
  GOSPEL_RITE: { schema: "gospel_rite", table: "gospel_rite" },
  GOSPEL_RESPONSES: { schema: "gospel_responses", table: "gospel_responses" },
  THE_FIVE_SHORT_LITANIES: { schema: "litanies", table: "the_five_short_litanies" },
  THREE_GREAT_LITANIES: { schema: "litanies", table: "the_three_great_litanies" },
  THE_THREE_GREAT_LITANIES: { schema: "litanies", table: "the_three_great_litanies" },
  PRAXIS_RESPONSE: { schema: "praxis_response", table: "praxis_response" },
  HYMN_OF_THE_INTERCESSIONS: { schema: "hymn_of_the_intercessions", table: "hymn_of_the_intercessions" },
  VERSES_OF_THE_CYMBALS: { schema: "verses_of_the_cymbals", table: "verses_of_the_cymbals" },
  SEASONAL_LITURGY_HYMNS: { schema: "seasonal_liturgy_hymns", table: "seasonal_liturgy_hymns" },
  THIRD_HOUR: { schema: "agpeya", table: "third_hour" },
  SIXTH_HOUR: { schema: "agpeya", table: "sixth_hour" },
  NINTH_HOUR: { schema: "agpeya", table: "ninth_hour" },
  ELEVENTH_HOUR: { schema: "agpeya", table: "eleventh_hour" },
  TWELFTH_HOUR: { schema: "agpeya", table: "twelfth_hour" },
  PRAYER_OF_THE_VEIL: { schema: "agpeya", table: "prayer_of_the_veil" },
  INTRODUCTION_TO_EVERY_HOUR: { schema: "agpeya", table: "introduction_to_every_hour" },
  FIRST_HOUR: { schema: "agpeya", table: "first_hour" },
  MIDNIGHT_HOUR: { schema: "agpeya", table: "midnight_hour" },
  OTHER_PRAYERS: { schema: "agpeya", table: "other_prayers" },
  PROCESSION_OF_THE_CROSS: null, // not yet in database
  VENERATION_MELODIES: null, // target table unclear, see project memory
};

const ALL_CAPS_KEY_REGEX = /^[A-Z][A-Z0-9_]*$/;

/**
 * Any Subdocument OR Inline item_type in an order table referencing an
 * all-caps hymn_key always points at *another entire type-3 order table*
 * from a different schema, resolved via SUBDOCUMENT_MAP — e.g. the
 * VERSES_OF_THE_CYMBALS inline in matins/vespers references the whole
 * verses_of_the_cymbals.verses_of_the_cymbals table, and GOSPEL_RITE
 * references the whole gospel_rite.gospel_rite table. This is NOT a
 * hymn_key lookup within that schema's hymn_texts (that key doesn't exist
 * as a row there) — it must be recursively hydrated like a Subdocument.
 */
function resolveWholeTableInlineTarget(hymnKey) {
  return ALL_CAPS_KEY_REGEX.test(hymnKey) ? SUBDOCUMENT_MAP[hymnKey] || null : null;
}

// Sentinels that resolve through the Lectionary/Bible reading flow rather
// than a schema.table — kept separate so callers can branch before treating
// an unmapped Subdocument as "not built yet".
export const READING_SENTINELS = new Set([
  "PROPHECIES",
  "CATHOLIC_EPISTLE",
  "COPTIC_CATHOLIC_EPISTLE",
  "COPTIC_PAULINE_EPISTLE",
  "COPTIC_PRAXIS",
  "COPTIC_READINGS",
  "PAULINE_EPISTLE",
  "PRAXIS",
  "PSALM_RESPONSES",
  "SYNAXARIUM",
  "LITURGY_PSALM_WITH_COPTIC",
  "LITURGY_PSALM_WITHOUT_COPTIC",
  "MATINS_GOSPEL_WITH_COPTIC",
  "MATINS_GOSPEL_WITHOUT_COPTIC",
  "MATINS_PSALM_WITH_COPTIC",
  "MATINS_PSALM_WITHOUT_COPTIC",
  "VESPERS_GOSPEL_WITH_COPTIC",
  "VESPERS_GOSPEL_WITHOUT_COPTIC",
  "VESPERS_PSALM_WITH_COPTIC",
  "VESPERS_PSALM_WITHOUT_COPTIC",
]);

// Maps each reading sentinel to the (service, reading_type) pair it needs
// out of calendar.reading_rules (via the public.get_readings_for_date RPC),
// and whether Coptic text should be kept. SYNAXARIUM and PSALM_RESPONSES/
// COPTIC_READINGS have no known reading_rules mapping yet (see project
// memory project_subdocument_registry.md) and are left unmapped — they
// resolve to nothing rather than guessing wrong.
const READING_SENTINEL_MAP = {
  PROPHECIES: { service: "Matins", readingType: "Prophecy", withCoptic: true },
  CATHOLIC_EPISTLE: { service: "Catholic", readingType: "Catholic Epistle", withCoptic: true },
  COPTIC_CATHOLIC_EPISTLE: { service: "Catholic", readingType: "Catholic Epistle", withCoptic: true },
  COPTIC_PAULINE_EPISTLE: { service: "Pauline", readingType: "Pauline Epistle", withCoptic: true },
  PAULINE_EPISTLE: { service: "Pauline", readingType: "Pauline Epistle", withCoptic: true },
  COPTIC_PRAXIS: { service: "Praxis", readingType: "Praxis", withCoptic: true },
  PRAXIS: { service: "Praxis", readingType: "Praxis", withCoptic: true },
  LITURGY_PSALM_WITH_COPTIC: { service: "Liturgy", readingType: "Psalm", withCoptic: true },
  LITURGY_PSALM_WITHOUT_COPTIC: { service: "Liturgy", readingType: "Psalm", withCoptic: false },
  MATINS_GOSPEL_WITH_COPTIC: { service: "Matins", readingType: "Gospel", withCoptic: true },
  MATINS_GOSPEL_WITHOUT_COPTIC: { service: "Matins", readingType: "Gospel", withCoptic: false },
  MATINS_PSALM_WITH_COPTIC: { service: "Matins", readingType: "Psalm", withCoptic: true },
  MATINS_PSALM_WITHOUT_COPTIC: { service: "Matins", readingType: "Psalm", withCoptic: false },
  VESPERS_GOSPEL_WITH_COPTIC: { service: "Vespers", readingType: "Gospel", withCoptic: true },
  VESPERS_GOSPEL_WITHOUT_COPTIC: { service: "Vespers", readingType: "Gospel", withCoptic: false },
  VESPERS_PSALM_WITH_COPTIC: { service: "Vespers", readingType: "Psalm", withCoptic: true },
  VESPERS_PSALM_WITHOUT_COPTIC: { service: "Vespers", readingType: "Psalm", withCoptic: false },
};

let readingsForDateCache = null; // { isoDate, promise }

function getReadingsForDate(isoDate) {
  if (readingsForDateCache?.isoDate === isoDate) return readingsForDateCache.promise;
  const promise = supabase
    .rpc("get_readings_for_date", { p_date: isoDate })
    .then(({ data, error }) => {
      if (error) throw new Error(`Unable to load readings for ${isoDate}: ${error.message}`);
      return data || [];
    });
  readingsForDateCache = { isoDate, promise };
  return promise;
}

/** Flattens a get_readings_for_date entry's resolved_verses into plain verse objects, dropping Coptic text for the "WithoutCoptic" variants. */
function buildReadingVerses(readingRow, withCoptic) {
  if (!readingRow) return [];
  return (readingRow.resolved_verses || []).flatMap((segment) =>
    (segment.verses || []).map((v) => ({
      english: `${v.chapter_number}:${v.verse_number} ${v.english || ""}`.trim(),
      coptic: withCoptic ? v.coptic || "" : "",
      arabic: v.arabic || "",
      type: "text",
    })),
  );
}

async function resolveReadingSentinelVerses(sentinel, isoDate) {
  const mapping = READING_SENTINEL_MAP[sentinel];
  if (!mapping) return [];
  const readings = await getReadingsForDate(isoDate);
  const match = readings.find((r) => r.service === mapping.service && r.reading_type === mapping.readingType);
  return buildReadingVerses(match, mapping.withCoptic);
}

/** Same as resolveReadingSentinelVerses but wraps the result as a titled section (for Subdocument/order-table-level Inline placements, which need a section object, not a bare verse list). */
async function resolveReadingSentinelSection(section, isoDate) {
  const verses = await resolveReadingSentinelVerses(section.hymn_key, isoDate);
  if (!verses.length) return null;
  return applyCopticCaseToSection({
    id: section.id,
    hymn_key: section.hymn_key,
    title: section.title,
    titlePrayerType: section.titlePrayerType,
    collapsible: Boolean(section.collapsible),
    defaultCollapsed: Boolean(section.defaultCollapsed),
    verses,
    prayerType: null,
    alternateEvery: null,
    forceWhiteVerses: true,
  });
}

/** Merges every nested section's verses into ONE flat list under the calling section's own title/prayer_type — see the isInlinePlacement branch in hydrateWithFlags for why. */
function mergeNestedSectionsAsOneHymn(callingSection, nestedSections) {
  const verses = nestedSections.flatMap((s) => s.verses || []);
  const titlePrayerType = callingSection.titlePrayerType || null;
  const dominantPrayerType = titlePrayerType || verses.find((v) => v.prayerType)?.prayerType || null;
  const alternateEvery =
    dominantPrayerType && Object.prototype.hasOwnProperty.call(ALTERNATE_EVERY, dominantPrayerType)
      ? ALTERNATE_EVERY[dominantPrayerType]
      : null;
  return {
    id: callingSection.id,
    hymn_key: callingSection.hymn_key,
    title: callingSection.title,
    titlePrayerType,
    collapsible: Boolean(callingSection.collapsible),
    defaultCollapsed: Boolean(callingSection.defaultCollapsed),
    verses,
    prayerType: dominantPrayerType,
    alternateEvery,
    forceWhiteVerses: !alternateEvery,
  };
}

// ─── Raw row fetch (ported from stuff for claude/slideshowData.js) ──────────

const ORDER_FIELDS = "item_order, hymn_key, condition, minimization, item_type";
const SERVICE_TITLE_FIELDS = "hymn_key, title_english, title_arabic, category, toggled, prayer_type";
// Note: line_id is deliberately NOT selected here — doxologies.hymn_texts is
// missing that column (every other schema's hymn_texts has it), and line_id
// isn't actually needed: line_order is sufficient for sorting.
const SERVICE_TEXT_FIELDS =
  "hymn_key, line_order, english, coptic, arabic, person_type, prayer_type, condition, item_type, inline_hymn_key";
// agpeya.hymn_texts is missing both item_type and inline_hymn_key (every
// other schema's hymn_texts has them) — omit those columns there so the
// query doesn't 400, and agpeya lines simply never resolve as
// Inline/Subdocument/Hyperlink line items (which matches reality: agpeya
// hymn_texts never uses those).
const SERVICE_TEXT_FIELDS_NO_ITEM_TYPE =
  "hymn_key, line_order, english, coptic, arabic, person_type, prayer_type, condition";
const SCHEMAS_WITHOUT_TEXT_ITEM_TYPE = new Set(["agpeya"]);
// These schemas only have their own order table + hymn_texts — no
// hymn_titles table at all (confirmed against the live schema) — so every
// hymn_key in them is titleless by construction. Skip the fetch entirely
// rather than 404ing and crashing the whole recursive hydration chain.
const SCHEMAS_WITHOUT_HYMN_TITLES = new Set([
  "gospel_responses",
  "hymn_of_the_intercessions",
  "praxis_response",
  "verses_of_the_cymbals",
]);

export async function fetchServiceRows(schema, table) {
  const orderRows = await fetchOrderRows(schema, table);
  if (!orderRows.length) return [];

  const hymnKeys = uniqueNonEmpty(orderRows.map((row) => row.hymn_key));
  const [nativeTitleRows, nativeTextRows, publicTitleRows, publicTextRows] = await Promise.all([
    fetchSchemaTitlesByKeys(schema, hymnKeys),
    fetchSchemaTextRowsByKeys(schema, hymnKeys),
    schema === "public" ? Promise.resolve([]) : fetchSchemaTitlesByKeys("public", hymnKeys),
    schema === "public" ? Promise.resolve([]) : fetchSchemaTextRowsByKeys("public", hymnKeys),
  ]);

  return flattenServiceRows(orderRows, { nativeTitleRows, nativeTextRows, publicTitleRows, publicTextRows });
}

async function fetchOrderRows(schema, table) {
  const { data, error } = await supabase
    .schema(schema)
    .from(table)
    .select(ORDER_FIELDS)
    .order("item_order", { ascending: true });
  if (error) throw createReadableSupabaseError(error, `${schema}.${table}`);
  return data || [];
}

// Order tables can have hundreds of distinct hymn_keys (e.g. psalmody.midnight_praises
// has 426). Supabase's .in() filter is sent as a URL query string, and a single
// request with that many keys blows past the server's ~16KB header limit
// (HeadersOverflowError). Chunk into batches well under that limit and merge.
const HYMN_KEY_CHUNK_SIZE = 100;

function chunk(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

async function fetchSchemaTitlesByKeys(schema, hymnKeys) {
  if (!hymnKeys.length || SCHEMAS_WITHOUT_HYMN_TITLES.has(schema)) return [];
  const results = await Promise.all(
    chunk(hymnKeys, HYMN_KEY_CHUNK_SIZE).map(async (batch) => {
      const { data, error } = await supabase
        .schema(schema)
        .from("hymn_titles")
        .select(SERVICE_TITLE_FIELDS)
        .in("hymn_key", batch);
      if (error) throw createReadableSupabaseError(error, `${schema}.hymn_titles`);
      return data || [];
    }),
  );
  return results.flat();
}

async function fetchSchemaTextRowsByKeys(schema, hymnKeys) {
  if (!hymnKeys.length) return [];
  const selectFields = SCHEMAS_WITHOUT_TEXT_ITEM_TYPE.has(schema) ? SERVICE_TEXT_FIELDS_NO_ITEM_TYPE : SERVICE_TEXT_FIELDS;
  const results = await Promise.all(
    chunk(hymnKeys, HYMN_KEY_CHUNK_SIZE).map(async (batch) => {
      const { data, error } = await supabase
        .schema(schema)
        .from("hymn_texts")
        .select(selectFields)
        .in("hymn_key", batch)
        .order("hymn_key", { ascending: true })
        .order("line_order", { ascending: true });
      if (error) throw createReadableSupabaseError(error, `${schema}.hymn_texts`);
      return data || [];
    }),
  );
  return results.flat();
}

function flattenServiceRows(
  orderRows,
  { nativeTitleRows = [], nativeTextRows = [], publicTitleRows = [], publicTextRows = [] } = {},
) {
  const nativeTitleByKey = createTitleMap(nativeTitleRows);
  const publicTitleByKey = createTitleMap(publicTitleRows);
  const nativeTextRowsByKey = createTextRowsMap(nativeTextRows);
  const publicTextRowsByKey = createTextRowsMap(publicTextRows);

  const rows = [];
  const sortedOrderRows = [...orderRows].sort(compareItemOrder);

  for (const orderRow of sortedOrderRows) {
    const hymnKey = normalizeText(orderRow.hymn_key);
    if (!hymnKey) continue;

    const title = nativeTitleByKey.get(hymnKey) || publicTitleByKey.get(hymnKey) || {};
    const nativeLines = nativeTextRowsByKey.get(hymnKey) || [];
    const publicLines = publicTextRowsByKey.get(hymnKey) || [];
    const lines = nativeLines.length ? nativeLines : publicLines;

    if (!lines.length) {
      rows.push(createFlatServiceRow(orderRow, title, null));
      continue;
    }

    [...lines].sort(compareLineOrder).forEach((line) => {
      rows.push(createFlatServiceRow(orderRow, title, line));
    });
  }

  return rows;
}

function createTitleMap(titleRows = []) {
  return new Map(titleRows.map((row) => [normalizeText(row.hymn_key), row]).filter(([key]) => key));
}

function createTextRowsMap(textRows = []) {
  const rowsByKey = new Map();
  for (const row of textRows) {
    const key = normalizeText(row.hymn_key);
    if (!key) continue;
    if (!rowsByKey.has(key)) rowsByKey.set(key, []);
    rowsByKey.get(key).push(row);
  }
  return rowsByKey;
}

function createFlatServiceRow(orderRow, title, line) {
  return {
    item_order: normalizeNumeric(orderRow.item_order),
    hymn_key: normalizeText(orderRow.hymn_key),
    placement_condition: normalizeText(orderRow.condition),
    placement_item_type: normalizeText(orderRow.item_type),
    minimization: normalizeText(orderRow.minimization),
    title_english: normalizeText(title.title_english),
    title_arabic: normalizeText(title.title_arabic),
    title_prayer_type: normalizeText(title.prayer_type),
    line_order: line ? normalizeNumeric(line.line_order) : null,
    english: normalizeText(line?.english),
    coptic: normalizeText(line?.coptic),
    arabic: normalizeText(line?.arabic),
    person_type: normalizeText(line?.person_type),
    prayer_type: normalizeText(line?.prayer_type),
    line_condition: normalizeText(line?.condition),
    line_item_type: normalizeText(line?.item_type),
    inline_hymn_key: normalizeText(line?.inline_hymn_key),
  };
}

// ─── Section assembly (ported, unchanged from stuff for claude/slideshowData.js) ──

const ALTERNATE_EVERY = {
  "Single Alternating": 1,
  "Double Alternating": 2,
  "Quadruple Alternating": 4,
};

export function assembleServiceSections(rawRows) {
  const sectionMap = new Map();

  for (const row of [...(rawRows || [])].sort(compareFlatServiceRows)) {
    const key = `${row.item_order}::${row.hymn_key}`;
    const placementItemType = normalizeText(row.placement_item_type);
    const isSubdoc = placementItemType === "Subdocument";
    const isInlinePlacement = placementItemType === "Inline";
    const isHyperlink = placementItemType === "Hyperlink";
    const minimization = normalizeText(row.minimization);

    if (!sectionMap.has(key)) {
      sectionMap.set(key, {
        id: `${row.hymn_key}-${row.item_order}`,
        hymn_key: row.hymn_key,
        condition: normalizeText(row.placement_condition),
        minimization: minimization || null,
        collapsible: minimization === "Minimizable" || minimization === "Minimized",
        defaultCollapsed: minimization === "Minimized",
        isSubdocumentPlaceholder: isSubdoc,
        isInlinePlacement,
        isHyperlink,
        title: { english: row.title_english || "", arabic: row.title_arabic || "" },
        titlePrayerType: row.title_prayer_type || null,
        verses: [],
      });
    }

    if (isSubdoc || isHyperlink) continue;

    if (row.inline_hymn_key && isInlineLineItem(row.line_item_type)) {
      sectionMap.get(key).verses.push({
        type: "inlinePlaceholder",
        inlineHymnKey: row.inline_hymn_key,
        inlineItemType: normalizeText(row.line_item_type),
        condition: normalizeText(row.line_condition),
        // The destination line's own person_type/prayer_type (if any)
        // override whatever the imported hymn's own lines carry.
        overridePersonType: row.person_type || null,
        overridePrayerType: row.prayer_type || null,
        english: "",
        coptic: "",
        arabic: "",
      });
      continue;
    }

    if (row.english || row.coptic || row.arabic) {
      sectionMap.get(key).verses.push({
        english: row.english || "",
        coptic: row.coptic || "",
        arabic: row.arabic || "",
        condition: normalizeText(row.line_condition),
        type: resolveEffectiveVerseType(row.person_type, row.prayer_type, row.title_prayer_type),
        prayerType: row.prayer_type || null,
      });
    }
  }

  const sections = Array.from(sectionMap.values());
  for (const section of sections) {
    if (section.isSubdocumentPlaceholder) continue;

    // The hymn's own declared prayer_type (hymn_titles.prayer_type) always
    // wins for the section's overall alternation scheme — a single Refrain
    // or Silent Prayer verse mixed into an otherwise "Single Alternating"
    // hymn must not hijack the whole section into forceWhiteVerses just
    // because it happens to be the first verse with any line-level
    // prayer_type set. Only fall back to scanning verses when the hymn has
    // no title-level prayer_type of its own.
    const dominantPrayerType =
      section.titlePrayerType || section.verses.find((v) => v.prayerType)?.prayerType || null;
    section.prayerType = dominantPrayerType;

    if (dominantPrayerType && Object.prototype.hasOwnProperty.call(ALTERNATE_EVERY, dominantPrayerType)) {
      section.alternateEvery = ALTERNATE_EVERY[dominantPrayerType];
    } else {
      section.alternateEvery = null;
      section.forceWhiteVerses = true;
    }
  }

  return sections;
}

function isInlineLineItem(itemType) {
  return ["Inline", "Subdocument", "Hyperlink"].includes(normalizeText(itemType));
}

export function getServiceVerseType(personType, prayerType) {
  if (prayerType === "Silent Prayer") return "silentPrayer";
  if (prayerType === "Recited Prayer") return "recitedPrayer";
  if (prayerType === "Refrain") return "refrain";
  if (prayerType === "Pre-Refrain") return "refrainLabel";
  if (personType === "Comment") return "comment";
  // "Bishop/Priest" is a distinct type from plain "Priest": the renderer
  // resolves it to "Bishop:" or "Priest:" at display time based on the
  // Bishop Present toggle, whereas plain "Priest" always shows "Priest:".
  if (personType === "Bishop/Priest") return "bishopOrPriest";
  if (personType === "Priest") return "priest";
  if (personType === "Deacon") return "deacon";
  if (personType === "Reader") return "reader";
  if (personType === "People") return "people";
  return "text";
}

/**
 * A verse without its own prayer_type inherits the hymn's overall
 * prayer_type (e.g. a whole hymn titled "Silent Prayer" or "Recited Prayer")
 * — but only when the verse doesn't give its own prayer_type ("any verses
 * that give a specific prayer type to override it" keep their own). Comment
 * lines are exempt from inheriting: a comment is always styled as a comment
 * regardless of the hymn it sits inside (its *visibility* is separately
 * gated by whether the section counts as a silent prayer — see
 * isCommentWithinSilentPrayer in documentHtml.ts).
 */
function resolveEffectiveVerseType(personType, prayerType, sectionTitlePrayerType) {
  const effectivePrayerType = prayerType || (personType === "Comment" ? "" : sectionTitlePrayerType) || "";
  return getServiceVerseType(personType, effectivePrayerType);
}

// ─── hydrateSupabaseServiceHymn ────────────────────────────────────────────
// The piece stuff for claude/slideshowData.js referenced but didn't include.
// Fetches + assembles a service, resolves today's condition flags, filters
// every section/verse by its condition, and recursively expands Subdocument
// and Inline placeholders. depth guards against runaway recursion the same
// way the Postgres get_service RPC does (see project_condition_engine.md).

export async function hydrateSupabaseServiceHymn(schema, table, date, extraContext = {}, weekdayDate, depth = 0) {
  const flags = await getContextFlags(date, extraContext, weekdayDate);
  const isoDate = toIsoDateString(date);
  return hydrateWithFlags(schema, table, flags, depth, isoDate);
}

function toIsoDateString(date) {
  if (typeof date === "string") return date;
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

// A single misconfigured or inaccessible nested schema (e.g. one not yet
// added to Supabase's exposed-schemas list) must not take down an entire
// parent document just because it references that schema somewhere — log
// and degrade gracefully to "no nested content" instead.
async function safeHydrateNested(schema, table, flags, depth, isoDate) {
  try {
    return await hydrateWithFlags(schema, table, flags, depth, isoDate);
  } catch (error) {
    console.warn(`Failed to load nested content ${schema}.${table}: ${error?.message || error}`);
    return [];
  }
}

async function hydrateWithFlags(schema, table, flags, depth, isoDate) {
  const rawRows = await fetchServiceRows(schema, table);
  const sections = assembleServiceSections(rawRows);

  const visibleSections = sections.filter((section) => evaluateCondition(section.condition, flags));

  const hydrated = [];
  for (const section of visibleSections) {
    if (section.isSubdocumentPlaceholder) {
      const target = SUBDOCUMENT_MAP[section.hymn_key];
      if (!target) {
        if (READING_SENTINELS.has(section.hymn_key) && isoDate) {
          const readingSection = await resolveReadingSentinelSection(section, isoDate);
          if (readingSection) hydrated.push(readingSection);
        }
        continue; // not-yet-built, or a reading sentinel with no live mapping/data
      }
      if (depth >= 3) continue;
      // Subdocuments render as a button in the parent document — tapping it
      // opens a full-screen modal with the nested document, rather than
      // splicing the nested content inline. The nested content is prefetched
      // right here (during the parent's own hydration) and stashed on the
      // button, so opening the modal is a local filter/render, never a fresh
      // Supabase round-trip. The button's own label is resolved from the
      // calling schema's hymn_titles (public fallback), falling back to the
      // sentinel key itself when no title is defined.
      const label = section.title.english || section.hymn_key;
      const subdocumentSections = await safeHydrateNested(target.schema, target.table, flags, depth + 1, isoDate);

      if (section.hymn_key === "ANTIPHONARY") {
        hydrated.push({
          id: section.id,
          title: { english: label, arabic: section.title.arabic },
          verses: [],
          isAntiphonaryButton: true,
          subdocumentSections: addTuneMarkersToAntiphonarySections(subdocumentSections),
          alternateEvery: null,
          forceWhiteVerses: true,
        });
        continue;
      }
      hydrated.push({
        id: section.id,
        title: { english: label, arabic: section.title.arabic },
        verses: [],
        isSubdocumentButton: true,
        subdocumentKey: section.hymn_key,
        subdocumentTarget: target,
        subdocumentSections,
        alternateEvery: null,
        forceWhiteVerses: true,
      });
      continue;
    }

    if (section.isInlinePlacement) {
      // An order-table-level Inline placeholder (item_type = "Inline" on the
      // order row itself, hymn_key an all-caps sentinel like GOSPEL_RITE or
      // CANONS) is structurally identical to a Subdocument placeholder — it
      // always references another whole type-3 table — except it splices
      // that table's content directly into this document instead of
      // becoming a button. The WHOLE imported schema is treated as ONE
      // hymn using the calling row's own title/prayer_type (e.g.
      // VERSES_OF_THE_CYMBALS imported into raising_of_incense has its own
      // title "Verses of the Cymbals" and prayer type "Single Alternating"
      // in liturgy.hymn_titles) — every verse from every nested hymn_key is
      // merged into one flat verse list so the person-type indicator only
      // restarts once, at the very first verse, exactly as if this were a
      // single hymn rather than several spliced together.
      const target = resolveWholeTableInlineTarget(section.hymn_key);
      if (target && depth < 3) {
        const nestedSections = await safeHydrateNested(target.schema, target.table, flags, depth + 1, isoDate);
        hydrated.push(applyCopticCaseToSection(mergeNestedSectionsAsOneHymn(section, nestedSections)));
        continue;
      }
      if (!target && READING_SENTINELS.has(section.hymn_key) && isoDate) {
        const readingSection = await resolveReadingSentinelSection(section, isoDate);
        if (readingSection) hydrated.push(readingSection);
      }
      continue;
    }

    // A section's verses can be interrupted by a whole-table Inline
    // reference (an all-caps key), which splices in *other sections* rather
    // than more verses of this one — so a section can split into several
    // pushed entries around each such reference. Never push a redundant
    // empty/title-repeating chunk once something has already been shown for
    // this section.
    let verses = [];
    let splitIndex = 0;
    let pushedAnything = false;

    const flushVerses = () => {
      if (!verses.length && pushedAnything) {
        verses = [];
        return;
      }
      const id = splitIndex === 0 ? section.id : `${section.id}-cont${splitIndex}`;
      hydrated.push(applyCopticCaseToSection({ ...section, id, hymnKey: section.hymn_key, verses }));
      splitIndex += 1;
      pushedAnything = true;
      verses = [];
    };

    for (const verse of section.verses) {
      if (!evaluateCondition(verse.condition, flags)) continue;

      if (verse.type === "inlinePlaceholder") {
        if (depth >= 3) continue;

        const wholeTableTarget = resolveWholeTableInlineTarget(verse.inlineHymnKey);
        if (wholeTableTarget) {
          // Spliced as plain continuation verses of the CURRENT hymn (not
          // separate sections) — "treated as one hymn" applies here too,
          // even though the whole-table reference is injected mid-verse-list
          // rather than at the order-table level.
          const nestedSections = await safeHydrateNested(wholeTableTarget.schema, wholeTableTarget.table, flags, depth + 1, isoDate);
          verses.push(...nestedSections.flatMap((s) => s.verses || []));
          continue;
        }

        if (READING_SENTINELS.has(verse.inlineHymnKey) && isoDate) {
          const readingVerses = await resolveReadingSentinelVerses(verse.inlineHymnKey, isoDate);
          verses.push(...readingVerses);
          continue;
        }

        // Regular single-hymn-key inline splice. Two distinct behaviors,
        // decided by whether the inline hymn has its own row in its schema's
        // hymn_titles (public fallback, same as everywhere else): if it does,
        // it's treated as its OWN hymn — flush whatever the parent had so
        // far, push a standalone section with that title, its own
        // prayer-type-driven color alternation, and (since suppression/
        // rubric restart operates per-section) a fresh restart of the
        // person-type indicators — then keep accumulating the parent's
        // remaining verses in a new chunk afterward. If it has no title,
        // it's just a content splice: pull in its verses only, with the
        // destination line's own person_type/prayer_type overriding the
        // source, per resolveEffectiveVerseType's cascade, and no restart.
        const inlineTitle = await fetchInlineHymnTitle(schema, verse.inlineHymnKey);
        const hasOwnTitle = Boolean(inlineTitle?.title_english || inlineTitle?.title_arabic);
        const inlineTitlePrayerType = hasOwnTitle ? inlineTitle.prayer_type || null : section.titlePrayerType;

        const inlineVerses = await fetchInlineHymnVerses(schema, verse.inlineHymnKey);
        const builtVerses = inlineVerses
          .filter((row) => evaluateCondition(row.condition, flags))
          .map((row) => {
            const effectivePersonType = verse.overridePersonType || row.person_type || "";
            const effectivePrayerType = verse.overridePrayerType || row.prayer_type || "";
            return {
              english: row.english || "",
              coptic: row.coptic || "",
              arabic: row.arabic || "",
              type: resolveEffectiveVerseType(effectivePersonType, effectivePrayerType, inlineTitlePrayerType),
              prayerType: effectivePrayerType || null,
            };
          });

        if (hasOwnTitle) {
          flushVerses();
          const dominantPrayerType = inlineTitlePrayerType || builtVerses.find((v) => v.prayerType)?.prayerType || null;
          const alternateEvery =
            dominantPrayerType && Object.prototype.hasOwnProperty.call(ALTERNATE_EVERY, dominantPrayerType)
              ? ALTERNATE_EVERY[dominantPrayerType]
              : null;
          hydrated.push(
            applyCopticCaseToSection({
              id: `${section.id}-inline-${verse.inlineHymnKey}`,
              hymn_key: verse.inlineHymnKey,
              title: { english: inlineTitle.title_english || "", arabic: inlineTitle.title_arabic || "" },
              titlePrayerType: inlineTitlePrayerType,
              collapsible: false,
              defaultCollapsed: false,
              verses: builtVerses,
              prayerType: dominantPrayerType,
              alternateEvery,
              forceWhiteVerses: !alternateEvery,
            }),
          );
          pushedAnything = true;
        } else {
          verses.push(...builtVerses);
        }
        continue;
      }

      verses.push(verse);
    }

    flushVerses();
  }

  return hydrated;
}

// ─── Antiphonary tune markers ──────────────────────────────────────────────
// Each day's antiphon is chanted first in the Adam tune, then switches to
// the Vatos tune partway through (typically at the "through the
// intercessions/prayers of..." refrain). Ported from the old app's
// addTuneMarkersToAntiphonary — the DB has no "tune" column, so this is
// computed client-side by phrase-matching, same as before.
const SWITCH_TO_VATOS_REGEX =
  /\bthrough\s+((the\s+)?intercessions?|his\s+intercessions?|her\s+intercessions?|their\s+intercessions?|the\s+prayers?|his\s+prayers?|her\s+prayers?|their\s+prayers?)\b/i;

/** Mutates nothing — returns new section objects with verse.tune set to "adam"/"vatos". The Introduction section is left untouched (it's structured by day-type condition, not tune). */
export function addTuneMarkersToAntiphonarySections(sections) {
  return sections.map((section) => {
    if (/^introduction$/i.test(section.title?.english || "")) return section;

    const verses = section.verses || [];
    const switchIndex = verses.findIndex((verse) => SWITCH_TO_VATOS_REGEX.test(verse.english || ""));
    if (switchIndex === -1) return section;

    return {
      ...section,
      verses: verses.map((verse, index) => ({ ...verse, tune: index <= switchIndex ? "adam" : "vatos" })),
    };
  });
}

// ─── Coptic case normalization ──────────────────────────────────────────────
// Coptic hymn_texts rows are stored uppercase/mixed-case; the traditional
// print convention is all-lowercase Coptic with a single capitalized initial
// letter opening the hymn (only when the hymn actually has an English title
// to "open" — untitled continuation sections don't get a capital).
const COPTIC_CHAR_PATTERN = /[Ϣ-ϯⲀ-⳿]/;
const COPTIC_CHAR_GLOBAL_PATTERN = /[Ϣ-ϯⲀ-⳿]/g;

function applyCopticCaseToSection(section) {
  const verses = section.verses.map((verse) =>
    verse.coptic ? { ...verse, coptic: lowercaseCoptic(verse.coptic) } : verse,
  );

  if (section.title?.english) {
    const firstIndex = verses.findIndex((verse) => verse.coptic && verse.coptic.trim());
    if (firstIndex !== -1) {
      verses[firstIndex] = { ...verses[firstIndex], coptic: uppercaseFirstCopticChar(verses[firstIndex].coptic) };
    }
  }

  return { ...section, verses };
}

function lowercaseCoptic(text) {
  return text.replace(COPTIC_CHAR_GLOBAL_PATTERN, (char) => char.toLocaleLowerCase());
}

function uppercaseFirstCopticChar(text) {
  const index = text.search(COPTIC_CHAR_PATTERN);
  if (index === -1) return text;
  return text.slice(0, index) + text[index].toLocaleUpperCase() + text.slice(index + 1);
}

const INLINE_TEXT_FIELDS =
  "hymn_key, line_order, english, coptic, arabic, person_type, prayer_type, condition";

// Hymn-key lookups (inline splices, whole-table references) search the
// calling schema first, then this fixed fallback order — public (the
// shared cross-schema hymn pool), then liturgy, agpeya, psalmody, veneration
// — stopping at the first schema that actually has the key.
const HYMN_KEY_FALLBACK_SCHEMAS = ["public", "liturgy", "agpeya", "psalmody", "veneration"];

async function fetchInlineHymnVerses(schema, hymnKey) {
  const { data: nativeRows, error: nativeError } = await supabase
    .schema(schema)
    .from("hymn_texts")
    .select(INLINE_TEXT_FIELDS)
    .eq("hymn_key", hymnKey)
    .order("line_order", { ascending: true });
  if (nativeError) throw createReadableSupabaseError(nativeError, `${schema}.hymn_texts`);
  if (nativeRows?.length) return nativeRows;

  for (const fallbackSchema of HYMN_KEY_FALLBACK_SCHEMAS) {
    if (fallbackSchema === schema) continue;
    const { data, error } = await supabase
      .schema(fallbackSchema)
      .from("hymn_texts")
      .select(INLINE_TEXT_FIELDS)
      .eq("hymn_key", hymnKey)
      .order("line_order", { ascending: true });
    if (error) throw createReadableSupabaseError(error, `${fallbackSchema}.hymn_texts`);
    if (data?.length) return data;
  }

  return [];
}

const INLINE_TITLE_FIELDS = "hymn_key, title_english, title_arabic, prayer_type";

/** Whether an inline-spliced hymn should be treated as its own hymn (own title, own alternation, restarted person-type indicators) hinges entirely on whether it has a row in hymn_titles — same schema search order as fetchInlineHymnVerses. Returns null if no title row exists anywhere. */
async function fetchInlineHymnTitle(schema, hymnKey) {
  if (!SCHEMAS_WITHOUT_HYMN_TITLES.has(schema)) {
    const { data, error } = await supabase
      .schema(schema)
      .from("hymn_titles")
      .select(INLINE_TITLE_FIELDS)
      .eq("hymn_key", hymnKey)
      .maybeSingle();
    if (error) throw createReadableSupabaseError(error, `${schema}.hymn_titles`);
    if (data) return data;
  }

  for (const fallbackSchema of HYMN_KEY_FALLBACK_SCHEMAS) {
    if (fallbackSchema === schema || SCHEMAS_WITHOUT_HYMN_TITLES.has(fallbackSchema)) continue;
    const { data, error } = await supabase
      .schema(fallbackSchema)
      .from("hymn_titles")
      .select(INLINE_TITLE_FIELDS)
      .eq("hymn_key", hymnKey)
      .maybeSingle();
    if (error) throw createReadableSupabaseError(error, `${fallbackSchema}.hymn_titles`);
    if (data) return data;
  }

  return null;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function createReadableSupabaseError(error, tableName) {
  const relation = String(tableName || "").includes(".") ? tableName : `public.${tableName}`;
  if (error?.code === "42501") {
    return new Error(`Permission denied for ${relation}. Grant SELECT to anon and add a read policy.`);
  }
  if (error?.code === "PGRST205") {
    return new Error(`Supabase could not find ${relation}. Confirm the table exists in the expected schema.`);
  }
  return new Error(error?.message || `Unable to read ${relation}.`);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeNumeric(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

function uniqueNonEmpty(values) {
  return [...new Set((values || []).map(normalizeText).filter(Boolean))];
}

function compareItemOrder(left, right) {
  return compareNumericLike(left.item_order, right.item_order);
}

function compareLineOrder(left, right) {
  return compareNumericLike(left.line_order, right.line_order);
}

function compareFlatServiceRows(left, right) {
  return (
    compareNumericLike(left.item_order, right.item_order) ||
    normalizeText(left.hymn_key).localeCompare(normalizeText(right.hymn_key)) ||
    compareNumericLike(left.line_order, right.line_order)
  );
}

function compareNumericLike(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return normalizeText(left).localeCompare(normalizeText(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
