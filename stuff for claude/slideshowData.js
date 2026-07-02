import { supabase } from "./supabase";

// ─── Service table registry ───────────────────────────────────────────────────
// Maps manifest (categoryId, hymnId) pairs to the Supabase schema + order table
// that drives that service. Content is assembled from schema-local order,
// hymn_titles, and hymn_texts tables.

const SERVICE_TABLE_MAP = {
  // Psalmody
  "psalmody/vespers_praises":  { schema: "psalmody", table: "vespers_praises" },
  "psalmody/midnight_praises": { schema: "psalmody", table: "midnight_praises" },
  "psalmody/morning_praises":  { schema: "psalmody", table: "morning_doxology" },

  // Liturgy – Raising of Incense (vespers and matins share the same order table;
  // per-service items are distinguished by the condition field)
  "liturgy/liturgy_vespers": { schema: "liturgy", table: "raising_of_incense" },
  "liturgy/liturgy_matins":  { schema: "liturgy", table: "raising_of_incense" },

  // Liturgy – Divine Liturgy
  "liturgy/liturgy_offering_of_the_lamb":  { schema: "liturgy", table: "offering_of_the_lamb" },
  "liturgy/liturgy_liturgy_of_the_word":   { schema: "liturgy", table: "liturgy_of_the_word" },
  "liturgy/liturgy_st_basil":              { schema: "liturgy", table: "liturgy_of_st_basil" },
  "liturgy/liturgy_st_gregory":            { schema: "liturgy", table: "liturgy_of_st_gregory" },
  "liturgy/liturgy_st_cyril":              { schema: "liturgy", table: "liturgy_of_st_cyril" },
  "liturgy/liturgy_distribution":          { schema: "liturgy", table: "distribution" },

  // Veneration
  "veneration/veneration": { schema: "veneration", table: "veneration" },

  // Agpeya
  "agpeya/agpeya_introduction_of_every_hour": { schema: "agpeya", table: "introduction_to_every_hour" },
  "agpeya/agpeya_first_hour":                 { schema: "agpeya", table: "first_hour" },
  "agpeya/agpeya_third_hour":                 { schema: "agpeya", table: "third_hour" },
  "agpeya/agpeya_sixth_hour":                 { schema: "agpeya", table: "sixth_hour" },
  "agpeya/agpeya_ninth_hour":                 { schema: "agpeya", table: "ninth_hour" },
  "agpeya/agpeya_eleventh_hour":              { schema: "agpeya", table: "eleventh_hour" },
  "agpeya/agpeya_twelfth_hour":               { schema: "agpeya", table: "twelfth_hour" },
  "agpeya/agpeya_prayer_of_the_veil":         { schema: "agpeya", table: "prayer_of_the_veil" },
  "agpeya/agpeya_midnight_hour":              { schema: "agpeya", table: "midnight_hour" },
  "agpeya/agpeya_other_prayers":              { schema: "agpeya", table: "other_prayers" },
};

export function lookupServiceTable(categoryId, hymnId) {
  return SERVICE_TABLE_MAP[`${categoryId}/${hymnId}`] || null;
}

// ─── Subdocument sentinel → schema.table registry ────────────────────────────
// When an order-table row has item_type='Subdocument', its hymn_key is a
// SCREAMING_SNAKE_CASE sentinel that maps to a separate service table to splice in.
// Entries that are null mean the content hasn't been built yet — skip gracefully.

export const SUBDOCUMENT_MAP = {
  ANTIPHONARY:             { schema: "psalmody",                 table: "antiphonary" },
  CANONS:                  { schema: "canons",                   table: "canons" },
  DOXOLOGIES:              { schema: "doxologies",               table: "doxologies" },
  GOSPEL_RITE:             { schema: "gospel_rite",              table: "gospel_rite" },
  THE_FIVE_SHORT_LITANIES: { schema: "litanies",                 table: "the_five_short_litanies" },
  THREE_GREAT_LITANIES:    { schema: "litanies",                 table: "the_three_great_litanies" },
  THE_THREE_GREAT_LITANIES: { schema: "litanies",                table: "the_three_great_litanies" },
  GOSPEL_RESPONSES:        { schema: "gospel_rite",              table: "gospel_rite" },
  PRAXIS_RESPONSE:         { schema: "praxis_response",          table: "praxis_response" },
  HYMN_OF_THE_INTERCESSIONS: { schema: "hymn_of_the_intercessions", table: "hymn_of_the_intercessions" },
  VERSES_OF_THE_CYMBALS:   { schema: "verses_of_the_cymbals",   table: "verses_of_the_cymbals" },
  PROCESSION_OF_THE_CROSS: null,   // not yet in database
  PROPHECIES:              null,   // placeholder only; reading content is calendar-driven
  THIRD_HOUR:              { schema: "agpeya", table: "third_hour" },
  SIXTH_HOUR:              { schema: "agpeya", table: "sixth_hour" },
  NINTH_HOUR:              { schema: "agpeya", table: "ninth_hour" },
  ELEVENTH_HOUR:           { schema: "agpeya", table: "eleventh_hour" },
  TWELFTH_HOUR:            { schema: "agpeya", table: "twelfth_hour" },
  PRAYER_OF_THE_VEIL:      { schema: "agpeya", table: "prayer_of_the_veil" },
};

// ─── Schema-table fetch ───────────────────────────────────────────────────────
//
// Liturgical schemas use the shared 3-table pattern:
//   hymn_titles  = item metadata/title catalog
//   hymn_texts   = ordered text lines by hymn_key
//   order table  = ordered service index by hymn_key
//
// The app reads those tables directly. Order and conditions remain database
// data; JavaScript only assembles rows into the section shape used by the UI.

const ORDER_FIELDS = "item_order, hymn_key, condition, minimization, item_type";
const SERVICE_TITLE_FIELDS =
  "hymn_key, title_english, title_arabic, category, toggled, prayer_type";
const SERVICE_TEXT_FIELDS =
  "line_id, hymn_key, line_order, english, coptic, arabic, person_type, prayer_type, condition, item_type, inline_hymn_key";

export async function fetchServiceRows(schema, table) {
  const orderRows = await fetchOrderRows(schema, table);
  if (!orderRows.length) return [];

  const hymnKeys = uniqueNonEmpty(orderRows.map((row) => row.hymn_key));
  const [
    nativeTitleRows,
    nativeTextRows,
    publicTitleRows,
    publicTextRows,
  ] = await Promise.all([
    fetchSchemaTitlesByKeys(schema, hymnKeys),
    fetchSchemaTextRowsByKeys(schema, hymnKeys),
    schema === "public" ? Promise.resolve([]) : fetchSchemaTitlesByKeys("public", hymnKeys),
    schema === "public" ? Promise.resolve([]) : fetchSchemaTextRowsByKeys("public", hymnKeys),
  ]);

  return flattenServiceRows(orderRows, {
    nativeTitleRows,
    nativeTextRows,
    publicTitleRows,
    publicTextRows,
  });
}

async function fetchOrderRows(schema, table) {
  const { data, error } = await supabase
    .schema(schema)
    .from(table)
    .select(ORDER_FIELDS)
    .order("item_order", { ascending: true });

  if (error) {
    throw createReadableSupabaseError(error, `${schema}.${table}`);
  }

  return data || [];
}

async function fetchSchemaTitlesByKeys(schema, hymnKeys) {
  if (!hymnKeys.length) return [];

  const { data, error } = await supabase
    .schema(schema)
    .from("hymn_titles")
    .select(SERVICE_TITLE_FIELDS)
    .in("hymn_key", hymnKeys);

  if (error) {
    throw createReadableSupabaseError(error, `${schema}.hymn_titles`);
  }

  return data || [];
}

async function fetchSchemaTextRowsByKeys(schema, hymnKeys) {
  if (!hymnKeys.length) return [];

  const { data, error } = await supabase
    .schema(schema)
    .from("hymn_texts")
    .select(SERVICE_TEXT_FIELDS)
    .in("hymn_key", hymnKeys)
    .order("hymn_key", { ascending: true })
    .order("line_order", { ascending: true });

  if (error) {
    throw createReadableSupabaseError(error, `${schema}.hymn_texts`);
  }

  return data || [];
}

function flattenServiceRows(orderRows, {
  nativeTitleRows = [],
  nativeTextRows = [],
  publicTitleRows = [],
  publicTextRows = [],
} = {}) {
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
  return new Map(
    titleRows
      .map((row) => [normalizeText(row.hymn_key), row])
      .filter(([key]) => key),
  );
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
    title_category: normalizeText(title.category),
    title_toggled: title.toggled,
    title_prayer_type: normalizeText(title.prayer_type),
    line_id: line?.line_id ?? null,
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

// ─── Section assembly ─────────────────────────────────────────────────────────
// Groups flat RPC rows into sections — one per (item_order, hymn_key) pair.
//
// Subdocument rows (placement_item_type='Subdocument') are returned as
// placeholder sections with isSubdocumentPlaceholder=true and no verses.
// hydrateSupabaseServiceHymn in hymnLibrary.js expands them after assembly.
//
// Inline rows (line_item_type='Inline') carry an inline_hymn_key; the
// inlineHymnKey is preserved on the verse for later expansion.

// ─── Prayer-type → alternating model ─────────────────────────────────────────
//
// Prayer Type (DB enum)   Rendering behaviour
// ─────────────────────   ───────────────────────────────────────────────────
// Single Alternating      Color flips every 1 verse  (cantor/people, 1-1-1-1)
// Double Alternating      Color flips every 2 verses (aa-bb-aa-bb pattern)
// Quadruple Alternating   Color flips every 4 verses
// Chanted Prayer / null   All white, no alternating (forceWhiteVerses)
// Recited Prayer          All white + gated by copticRecitedPrayers toggle
// Silent Prayer           All white + gated by copticRecitedPrayers toggle
// Refrain                 Rendered as refrain verse type
// Pre-Refrain             Rendered as refrainLabel verse type
// Invincible Coptic       Coptic-only; rendered as regular text for now

const ALTERNATE_EVERY = {
  "Single Alternating":    1,
  "Double Alternating":    2,
  "Reverse Single Alternating": 1,
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
        // Subdocument placeholders become button sections (modal) in hymnLibrary.
        isSubdocumentPlaceholder: isSubdoc,
        // Inline placement rows with no local text can splice another service
        // table in place. Inline placement rows with local text render normally.
        isInlinePlacement,
        isHyperlink,
        title: {
          english: row.title_english || "",
          arabic: row.title_arabic || "",
        },
        titlePrayerType: row.title_prayer_type || null,
        verses: [],
      });
    }

    // Subdocument / hyperlink order rows carry no verse content.
    if (isSubdoc || isHyperlink) continue;

    // Inline rows are pure pointers (english/coptic/arabic all null).
    // Insert an inlinePlaceholder so hydrateSupabaseServiceHymn can expand them.
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

  // Second pass: derive section-level rendering flags from dominant prayer_type.
  const sections = Array.from(sectionMap.values());
  for (const section of sections) {
    if (section.isSubdocumentPlaceholder) continue;

    // Use the first verse that carries a prayer_type as the section's dominant type.
    // (All verses in a single hymn piece normally share the same prayer_type.)
    const dominantPrayerType =
      section.verses.find((v) => v.prayerType)?.prayerType ||
      section.titlePrayerType ||
      null;
    section.prayerType = dominantPrayerType;

    if (dominantPrayerType && Object.prototype.hasOwnProperty.call(ALTERNATE_EVERY, dominantPrayerType)) {
      // Alternating prayer: colour flips every N verses
      section.alternateEvery = ALTERNATE_EVERY[dominantPrayerType];
      section.reverseAlternating = dominantPrayerType === "Reverse Single Alternating";
    } else {
      // Chanted Prayer, null, Recited Prayer, Silent Prayer, etc.
      // → no colour alternation; all text renders white
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
  // Prayer type takes precedence over person type
  if (prayerType === "Silent Prayer")  return "silentPrayer";
  if (prayerType === "Recited Prayer") return "recitedPrayer";
  if (prayerType === "Refrain")        return "refrain";
  if (prayerType === "Pre-Refrain")    return "refrainLabel";
  // Person type determines speaker role
  if (personType === "Comment")                            return "comment";
  if (personType === "Priest" || personType === "Bishop/Priest") return "priest";
  if (personType === "Deacon")                             return "deacon";
  if (personType === "Reader")                             return "reader";
  if (personType === "People")                             return "people";
  return "text";
}

// ─── Single-hymn helpers (schema-local hymn_titles / hymn_texts) ──────────────

const TITLE_FIELDS =
  "hymn_key, category, title_english, title_arabic, toggled, prayer_type";
const TEXT_FIELDS =
  "hymn_key, line_order, english, coptic, arabic, condition, person_type, prayer_type, item_type, inline_hymn_key";

export async function fetchHymnTitles(schema = "public") {
  const { data, error } = await supabase
    .schema(schema)
    .from("hymn_titles")
    .select(TITLE_FIELDS)
    .order("category", { ascending: true })
    .order("title_english", { ascending: true });

  if (error) {
    throw createReadableSupabaseError(error, `${schema}.hymn_titles`);
  }

  return (data || [])
    .filter((title) => String(title.hymn_key || "").trim())
    .map((title) => ({
      category: normalizeText(title.category),
      hymn_key: normalizeText(title.hymn_key),
      prayer_type: normalizeText(title.prayer_type),
      title_arabic: normalizeText(title.title_arabic),
      title_english: normalizeText(title.title_english),
      toggled: title.toggled,
    }));
}

export async function fetchHymnRows(hymnKey, schema = "public") {
  const { data, error } = await supabase
    .schema(schema)
    .from("hymn_texts")
    .select(TEXT_FIELDS)
    .eq("hymn_key", hymnKey)
    .order("line_order", { ascending: true });

  if (error) {
    throw createReadableSupabaseError(error, `${schema}.hymn_texts`);
  }

  return (data || []).map((row, index) => ({
    arabic: normalizeText(row.arabic),
    condition: normalizeText(row.condition),
    coptic: normalizeText(row.coptic),
    english: normalizeText(row.english),
    hymn_key: normalizeText(row.hymn_key),
    inline_hymn_key: normalizeText(row.inline_hymn_key),
    item_type: normalizeText(row.item_type),
    line_order: Number.isFinite(Number(row.line_order))
      ? Number(row.line_order)
      : index + 1,
    person_type: normalizeText(row.person_type),
    prayer_type: normalizeText(row.prayer_type),
  }));
}

export function toSlideshowSections(title, rows) {
  if (!title) {
    return [];
  }

  const verses = rows
    .filter(hasDisplayText)
    .map((row) => ({
      arabic: row.arabic,
        coptic: row.coptic,
        english: row.english,
        type: getServiceVerseType(row.person_type, row.prayer_type) ||
          getVerseType(row.condition),
      }));

  return [
    {
      id: title.hymn_key,
      title: {
        arabic: title.title_arabic,
        english: title.title_english || title.hymn_key,
      },
      verses,
    },
  ];
}

function createReadableSupabaseError(error, tableName) {
  const relation = String(tableName || "").includes(".")
    ? tableName
    : `public.${tableName}`;

  if (error?.code === "42501") {
    return new Error(
      `Permission denied for ${relation}. Grant SELECT to anon and add a read policy for this publishable key.`,
    );
  }

  if (error?.code === "PGRST205") {
    return new Error(
      `Supabase could not find ${relation}. Confirm the table exists in the expected schema.`,
    );
  }

  return new Error(error?.message || `Unable to read ${relation}.`);
}

function getVerseType(condition) {
  const value = String(condition || "").trim().toLowerCase();

  if (!value) {
    return "text";
  }

  if (/comment|note|rubric|instruction/.test(value)) {
    return "comment";
  }

  return "text";
}

function hasDisplayText(row) {
  return ["arabic", "coptic", "english"].some((key) =>
    String(row[key] || "").trim(),
  );
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
    compareNumericLike(left.line_order, right.line_order) ||
    compareNumericLike(left.line_id, right.line_id)
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
