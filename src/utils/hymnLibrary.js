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
  PROCESSION_OF_THE_CROSS: null, // not yet in database
  VENERATION_MELODIES: null, // target table unclear, see project memory
};

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

// ─── Raw row fetch (ported from stuff for claude/slideshowData.js) ──────────

const ORDER_FIELDS = "item_order, hymn_key, condition, minimization, item_type";
const SERVICE_TITLE_FIELDS = "hymn_key, title_english, title_arabic, category, toggled, prayer_type";
// Note: line_id is deliberately NOT selected here — doxologies.hymn_texts is
// missing that column (every other schema's hymn_texts has it), and line_id
// isn't actually needed: line_order is sufficient for sorting.
const SERVICE_TEXT_FIELDS =
  "hymn_key, line_order, english, coptic, arabic, person_type, prayer_type, condition, item_type, inline_hymn_key";

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
  if (!hymnKeys.length) return [];
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
  const results = await Promise.all(
    chunk(hymnKeys, HYMN_KEY_CHUNK_SIZE).map(async (batch) => {
      const { data, error } = await supabase
        .schema(schema)
        .from("hymn_texts")
        .select(SERVICE_TEXT_FIELDS)
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
        type: getServiceVerseType(row.person_type, row.prayer_type),
        prayerType: row.prayer_type || null,
      });
    }
  }

  const sections = Array.from(sectionMap.values());
  for (const section of sections) {
    if (section.isSubdocumentPlaceholder) continue;

    const dominantPrayerType =
      section.verses.find((v) => v.prayerType)?.prayerType || section.titlePrayerType || null;
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
  if (personType === "Priest" || personType === "Bishop/Priest") return "priest";
  if (personType === "Deacon") return "deacon";
  if (personType === "Reader") return "reader";
  if (personType === "People") return "people";
  return "text";
}

// ─── hydrateSupabaseServiceHymn ────────────────────────────────────────────
// The piece stuff for claude/slideshowData.js referenced but didn't include.
// Fetches + assembles a service, resolves today's condition flags, filters
// every section/verse by its condition, and recursively expands Subdocument
// and Inline placeholders. depth guards against runaway recursion the same
// way the Postgres get_service RPC does (see project_condition_engine.md).

export async function hydrateSupabaseServiceHymn(schema, table, date, extraContext = {}, depth = 0) {
  const flags = await getContextFlags(date, extraContext);
  return hydrateWithFlags(schema, table, flags, depth);
}

async function hydrateWithFlags(schema, table, flags, depth) {
  const rawRows = await fetchServiceRows(schema, table);
  const sections = assembleServiceSections(rawRows);

  const visibleSections = sections.filter((section) => evaluateCondition(section.condition, flags));

  const hydrated = [];
  for (const section of visibleSections) {
    if (section.isSubdocumentPlaceholder) {
      if (depth >= 3) continue;
      const target = SUBDOCUMENT_MAP[section.hymn_key];
      if (!target) continue; // not-yet-built or reading-sentinel; handled elsewhere
      const nested = await hydrateWithFlags(target.schema, target.table, flags, depth + 1);
      hydrated.push(...nested);
      continue;
    }

    const verses = [];
    for (const verse of section.verses) {
      if (!evaluateCondition(verse.condition, flags)) continue;

      if (verse.type === "inlinePlaceholder") {
        if (depth >= 3) continue;
        const inlineVerses = await fetchInlineHymnVerses(schema, verse.inlineHymnKey);
        inlineVerses
          .filter((row) => evaluateCondition(row.condition, flags))
          .forEach((row) => {
            verses.push({
              english: row.english || "",
              coptic: row.coptic || "",
              arabic: row.arabic || "",
              type: getServiceVerseType(row.person_type, row.prayer_type),
              prayerType: row.prayer_type || null,
            });
          });
        continue;
      }

      verses.push(verse);
    }

    hydrated.push({ ...section, verses });
  }

  return hydrated;
}

const INLINE_TEXT_FIELDS =
  "hymn_key, line_order, english, coptic, arabic, person_type, prayer_type, condition";

async function fetchInlineHymnVerses(schema, hymnKey) {
  const { data: nativeRows, error: nativeError } = await supabase
    .schema(schema)
    .from("hymn_texts")
    .select(INLINE_TEXT_FIELDS)
    .eq("hymn_key", hymnKey)
    .order("line_order", { ascending: true });
  if (nativeError) throw createReadableSupabaseError(nativeError, `${schema}.hymn_texts`);
  if (nativeRows?.length) return nativeRows;

  if (schema === "public") return [];

  const { data: publicRows, error: publicError } = await supabase
    .schema("public")
    .from("hymn_texts")
    .select(INLINE_TEXT_FIELDS)
    .eq("hymn_key", hymnKey)
    .order("line_order", { ascending: true });
  if (publicError) throw createReadableSupabaseError(publicError, "public.hymn_texts");
  return publicRows || [];
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
