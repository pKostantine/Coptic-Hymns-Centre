import { evaluateCondition, getContextFlags } from "./conditionEngine";
import { toIsoDate as toIsoDateString } from "./dateUtils";
import { formatVerses } from "./verseFormatting";
import { loadReadingRuleRowsForDate } from "./readingCalendarRules";
import { stripAlleluiaFromPsalmVerse } from "./psalmReadingText";
import { resolveBibleReadingReference } from "./readingReferenceResolver";
import { supabase } from "./supabase";

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
  // The intro/reading/conclusion wrapper tables for each epistle-style
  // reading — PAULINE_EPISTLE/CATHOLIC_EPISTLE/PRAXIS are the "Inline"
  // (English-only) variant spliced directly into the document flow;
  // COPTIC_PAULINE_EPISTLE/COPTIC_CATHOLIC_EPISTLE/COPTIC_PRAXIS are the
  // "Subdocument" (Coptic-included) variant opened as its own button/modal.
  // Each table's own middle row (PAULINE_EPISTLE_WITH/WITHOUT_COPTIC etc.,
  // see READING_SENTINEL_MAP) resolves the actual day's scripture text.
  PAULINE_EPISTLE: { schema: "readings", table: "pauline_epistle" },
  CATHOLIC_EPISTLE: { schema: "readings", table: "catholic_epistle" },
  PRAXIS: { schema: "readings", table: "praxis" },
  COPTIC_PAULINE_EPISTLE: { schema: "readings", table: "coptic_pauline_epistle" },
  COPTIC_CATHOLIC_EPISTLE: { schema: "readings", table: "coptic_catholic_epistle" },
  COPTIC_PRAXIS: { schema: "readings", table: "coptic_praxis" },
  SEASONAL_LITURGY_HYMNS: null, // not yet in database — "seasonal_liturgy_hymns" is not an exposed schema/table
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
  VENERATION: { schema: "veneration", table: "veneration" },
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

/** "COPTIC_PAULINE_EPISTLE" -> "Coptic Pauline Epistle" — a readable fallback label for a Subdocument/whole-table-inline sentinel with no hymn_titles row anywhere, rather than showing the raw ALL_CAPS key verbatim (e.g. in the content selector). */
function humanizeSentinelKey(key) {
  return String(key || "")
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * GOSPEL_RITE always gets its "Coptic Gospel Rite" toggle button rendered
 * immediately after its content's own title (see
 * pushWholeTableInlineSections below), wherever it's spliced in. This is its
 * own dedicated zero-verse pseudo-section (rather than a flag mutated onto
 * whichever nested section happens to end up first) specifically so the
 * button's own visibility is never coupled to whether that particular piece
 * of content happens to be copticGospelRiteOnly/nonCopticGospelRiteOnly —
 * the button itself must always render so the toggle stays reachable in
 * both states, exactly matching hydrateWholeTableInlineNested's "hydrate
 * every state up front, tag the result" no-refetch approach.
 */
function buildGospelRiteToggleSection(hymnKey, anchorId) {
  if (hymnKey !== "GOSPEL_RITE") return null;
  return {
    id: `${anchorId}-gospel-rite-toggle`,
    title: { english: "", arabic: "" },
    verses: [],
    alternateEvery: null,
    forceWhiteVerses: true,
    startsGospelRiteToggle: true,
  };
}

/**
 * Places the Coptic Gospel Rite toggle right after its own content's title
 * (the first section buildWholeTableInlineSections produced — either a
 * title-only header or a title+verses section merged into one, depending on
 * whether the nested content had titles of its own) instead of before it, so
 * the reader sees "Psalm and Gospel" before being asked to pick a rite.
 */
function pushWholeTableInlineSections(hydrated, toggleSection, contentSections) {
  if (toggleSection && contentSections.length) {
    hydrated.push(contentSections[0], toggleSection, ...contentSections.slice(1));
    return;
  }
  if (toggleSection) hydrated.push(toggleSection);
  hydrated.push(...contentSections);
}

// Sentinels that resolve through the Lectionary/Bible reading flow rather
// than a schema.table — kept separate so callers can branch before treating
// an unmapped Subdocument as "not built yet".
export const READING_SENTINELS = new Set([
  "PROPHECIES",
  "COPTIC_READINGS",
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
  // Not a typo — gospel_rite.hymn_texts really does spell the Liturgy
  // Gospel sentinels this way (mixed case), unlike every other
  // WITH/WITHOUT_COPTIC sibling above (verified directly against the live
  // data) — matched here exactly as stored, not uppercased to match the
  // others.
  "Liturgy_GOSPEL_WITH_COPTIC",
  "Liturgy_GOSPEL_WITHOUT_COPTIC",
  // The actual scripture-text sentinels nested inside readings.pauline_epistle/
  // catholic_epistle/praxis/coptic_* (see SUBDOCUMENT_MAP) — everything
  // around them (intro/conclusion, title, minimization) now comes from
  // those tables directly; only the verses themselves still need live
  // day-of resolution.
  "PAULINE_EPISTLE_WITH_COPTIC",
  "PAULINE_EPISTLE_WITHOUT_COPTIC",
  "CATHOLIC_EPISTLE_WITH_COPTIC",
  "CATHOLIC_EPISTLE_WITHOUT_COPTIC",
  "PRAXIS_WITH_COPTIC",
  "PRAXIS_WITHOUT_COPTIC",
]);

// Maps each reading sentinel to the (service, reading_type) pair it needs
// out of calendar.reading_rules (normally via the public.get_readings_for_date
// RPC), and whether Coptic text should be kept. SYNAXARIUM and PSALM_RESPONSES/
// COPTIC_READINGS have no known reading_rules mapping yet (see project
// memory project_subdocument_registry.md) and are left unmapped — they
// resolve to nothing rather than guessing wrong.
const READING_SENTINEL_MAP = {
  PROPHECIES: { service: "Matins", readingType: "Prophecy", withCoptic: true },
  PAULINE_EPISTLE_WITH_COPTIC: { service: "Pauline", readingType: "Pauline Epistle", withCoptic: true },
  PAULINE_EPISTLE_WITHOUT_COPTIC: { service: "Pauline", readingType: "Pauline Epistle", withCoptic: false },
  CATHOLIC_EPISTLE_WITH_COPTIC: { service: "Catholic", readingType: "Catholic Epistle", withCoptic: true },
  CATHOLIC_EPISTLE_WITHOUT_COPTIC: { service: "Catholic", readingType: "Catholic Epistle", withCoptic: false },
  PRAXIS_WITH_COPTIC: { service: "Praxis", readingType: "Praxis", withCoptic: true },
  PRAXIS_WITHOUT_COPTIC: { service: "Praxis", readingType: "Praxis", withCoptic: false },
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
  "Liturgy_GOSPEL_WITH_COPTIC": { service: "Liturgy", readingType: "Gospel", withCoptic: true },
  "Liturgy_GOSPEL_WITHOUT_COPTIC": { service: "Liturgy", readingType: "Gospel", withCoptic: false },
};

let readingsForDateCache = null; // { isoDate, promise }
let synaxariumCache = null; // { isoDate, promise }

function getReadingsForDate(isoDate) {
  if (readingsForDateCache?.isoDate === isoDate) return readingsForDateCache.promise;
  const promise = loadReadingRuleRowsForDate(isoDate)
    .then(async (rows) => {
      return Promise.all(
        rows.map(async (row) => {
          if (!row.reading_reference) return row;
          const { resolvedSegments } = await resolveBibleReadingReference(row.reading_reference);
          return { ...row, resolved_verses: resolvedSegments };
        }),
      );
    });
  readingsForDateCache = { isoDate, promise };
  return promise;
}

/**
 * Flattens a resolved reading-rule entry's resolved_verses into plain verse
 * objects, dropping Coptic text for the "WithoutCoptic" variants. Every
 * reading shows a plain verse-number gold badge (bibleVerseNumber), same as
 * the Bible reader — never a chapter number, even when the reading spans
 * multiple chapters (the verse numbers just keep counting straight through,
 * with no visual break at the chapter boundary). The Psalm reading is the
 * one exception: it's forced into a single unbroken paragraph with no verse
 * numbers or line breaks at all, regardless of how many verses it spans.
 */
function buildReadingVerses(readingRow, withCoptic, isPsalm) {
  if (!readingRow) return [];
  const flatVerses = (readingRow.resolved_verses || []).flatMap((segment) => segment.verses || []);
  if (!flatVerses.length) return [];

  // A reading is treated like its own hymn for Coptic casing purposes: one
  // capitalized opening letter for the whole reading (its single Psalm
  // paragraph, or its first verse), not per individual verse — see
  // applyCopticCaseToReadingVerses below.
  //
  // Psalm readings also get "Alleluia" (and its Coptic/Arabic equivalents)
  // stripped out by the shared Psalm-text sanitizer. Vespers, Matins,
  // and Liturgy each already have their own dedicated Alleluia response
  // elsewhere in the service; when the day's Psalm reading happens to land
  // on a verse that itself contains "Alleluia" in the source text (bible.verses
  // has it on roughly every other Psalm verse), showing it again here reads
  // as a duplicated, out-of-place acclamation.
  if (isPsalm) {
    return applyCopticCaseToReadingVerses([
      stripAlleluiaFromPsalmVerse({
        english: flatVerses.map((v) => v.english || "").filter(Boolean).join(" "),
        coptic: withCoptic ? flatVerses.map((v) => v.coptic || "").filter(Boolean).join(" ") : "",
        arabic: flatVerses.map((v) => v.arabic || "").filter(Boolean).join(" "),
        type: "text",
      }),
    ]);
  }

  return applyCopticCaseToReadingVerses(
    flatVerses.map((v) => ({
      english: v.english || "",
      coptic: withCoptic ? v.coptic || "" : "",
      arabic: v.arabic || "",
      type: "text",
      bibleVerseNumber: String(v.verse_number),
    })),
  );
}

const bibleBookTitleCache = new Map();

/** book_key -> {english, arabic} from bible.books, cached — a self-contained lookup (rather than importing readingsService.ts's own getReadingBookTitle) since readingsService.ts already imports hydrateSupabaseServiceHymn from this file and the reverse import would be circular. */
function getBibleBookTitleByKey(bookKey) {
  if (!bookKey) return Promise.resolve(null);
  let cached = bibleBookTitleCache.get(bookKey);
  if (!cached) {
    cached = (async () => {
      const { data, error } = await supabase
        .schema("bible")
        .from("books")
        .select("title_english, title_arabic")
        .eq("book_key", bookKey)
        .maybeSingle();
      if (error) throw createReadableSupabaseError(error, "bible.books");
      return data ? { english: data.title_english || "", arabic: data.title_arabic || "" } : null;
    })();
    bibleBookTitleCache.set(bookKey, cached);
  }
  return cached;
}

/**
 * Builds the citation-style title for a reading ("Matthew 25:1-13",
 * "Philippians 1:27-2:11", "Psalm 131:7,12-13") from get_readings_for_date's
 * own resolved_verses — each segment's verses[] already carries the actual
 * fetched bible.verses chapter_number/verse_number, which for Psalms IS the
 * Septuagint numbering (that's the table's native numbering; no Hebrew/
 * Masoretic conversion happens anywhere in this RPC-based pipeline),
 * matching the user's explicit request to cite Psalms in Septuagint numbers.
 *
 * A reading can arrive as several segments (calendar.reading_rules joins
 * discrete/non-contiguous verses with "@", one segment per verse — e.g.
 * Psalm 131:7,12-13 comes back as three separate one-verse segments, not one
 * segment carrying all three) — every verse actually present, across every
 * segment, is what the citation is built from (via formatVerses), never
 * just the first segment's start and the last segment's end collapsed into
 * a min-max range, which would silently claim verses that were never part
 * of the reading (7,12,13 is not the same reading as 7-13). The one
 * exception is a genuine cross-chapter span (e.g. Philippians 1:27-2:11),
 * always a single continuous passage in this data model, never a discrete
 * list — that keeps its own start-chapter:verse-end-chapter:verse citation.
 */
async function buildReadingCitation(readingRow) {
  const segments = readingRow?.resolved_verses || [];
  if (!segments.length) return null;
  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];
  const firstVerses = firstSegment.verses || [];
  const lastVerses = lastSegment.verses || [];
  if (!firstVerses.length || !lastVerses.length) return null;

  // A citation cites ONE psalm chapter, so it reads "Psalm 67:11" — the book
  // title itself ("Psalms"/"المزامير") is the whole-book plural, wrong here.
  const bookTitle =
    firstSegment.book_key === "psalms" ? { english: "Psalm", arabic: "مزمور" } : await getBibleBookTitleByKey(firstSegment.book_key);
  if (!bookTitle || (!bookTitle.english && !bookTitle.arabic)) return null;

  const allVerses = segments.flatMap((s) => s.verses || []);
  const chapters = [...new Set(allVerses.map((v) => v.chapter_number))];

  if (chapters.length === 1) {
    const verseList = formatVerses(allVerses.map((v) => ({ verse: v.verse_number, partLabel: null })));
    return {
      english: `${bookTitle.english} ${chapters[0]}:${verseList}`.trim(),
      arabic: `${bookTitle.arabic} ${chapters[0]}:${verseList}`.trim(),
    };
  }

  // A single segment spanning multiple chapters is a genuine continuous passage
  // ("Matthew 1:27-2:11") — cite as start-end range. Multiple segments in
  // different chapters are discrete @-separated verses; list each chapter:verse
  // separately rather than implying a continuous range that was never requested.
  if (segments.length === 1) {
    const start = firstVerses[0];
    const end = lastVerses[lastVerses.length - 1];
    return {
      english: `${bookTitle.english} ${start.chapter_number}:${start.verse_number}-${end.chapter_number}:${end.verse_number}`.trim(),
      arabic: `${bookTitle.arabic} ${start.chapter_number}:${start.verse_number}-${end.chapter_number}:${end.verse_number}`.trim(),
    };
  }

  const chapterGroups = new Map();
  const chapterOrder = [];
  for (const segment of segments) {
    for (const v of (segment.verses || [])) {
      if (!chapterGroups.has(v.chapter_number)) {
        chapterOrder.push(v.chapter_number);
        chapterGroups.set(v.chapter_number, []);
      }
      chapterGroups.get(v.chapter_number).push({ verse: v.verse_number, partLabel: null });
    }
  }
  const citation = chapterOrder.map((ch) => `${ch}:${formatVerses(chapterGroups.get(ch))}`).join(", ");
  return {
    english: `${bookTitle.english} ${citation}`.trim(),
    arabic: `${bookTitle.arabic} ${citation}`.trim(),
  };
}

async function resolveReadingSentinelVerses(sentinel, isoDate) {
  const mapping = READING_SENTINEL_MAP[sentinel];
  if (!mapping) return { verses: [], citation: null };
  const readings = await getReadingsForDate(isoDate);
  const match = readings.find((r) => r.service === mapping.service && r.reading_type === mapping.readingType);
  const verses = buildReadingVerses(match, mapping.withCoptic, mapping.readingType === "Psalm");
  const citation = verses.length ? await buildReadingCitation(match) : null;
  return { verses, citation };
}

// A nested reading sentinel that becomes its own section (see
// resolveReadingSentinelSplice below) needs a real, fixed section title —
// unlike the citation, which is a computed verse shown *inside* that
// section — since the sentinel itself has no hymn_titles row. Mirrors the
// exact "Coptic X" phrasing already used by gospel_rite.hymn_titles' own
// "copticPsalm" entry ("Coptic Psalm" / "المزمور القبطي").
const COPTIC_READING_TYPE_TITLES = {
  Gospel: { english: "Coptic Gospel", arabic: "الإنجيل القبطي" },
  Psalm: { english: "Coptic Psalm", arabic: "المزمور القبطي" },
};

/**
 * Resolves a reading sentinel into either a standalone titled section (when
 * `titleShown` is true, e.g. copticGospel's rows referencing
 * *_GOSPEL_WITH_COPTIC with inline_hymn_title_shown=true — the encompassing
 * hymn itself isn't already a top-level Minimizable/Minimized unit, so this
 * splice needs to carry its own) or a flat verse splice with just an inline
 * citation line up front (every other case). Either way the citation
 * ("Matthew 25:1-13") always appears as its own verse immediately before the
 * reading's own text, never before whatever intro line the caller placed
 * ahead of the splice — when shown as a section, the section's own title is
 * a fixed "Coptic {reading type}" label instead (the citation stays a verse
 * inside it, exactly like the flat case), since the citation is a moving
 * per-day value, not a stable name to navigate by.
 */
async function resolveReadingSentinelSplice(sentinel, isoDate, titleShown, minimization, sectionId) {
  const { verses, citation } = await resolveReadingSentinelVerses(sentinel, isoDate);
  if (!verses.length) return null;

  const citationVerse = citation ? [{ type: "readingReference", english: citation.english, arabic: citation.arabic, coptic: "" }] : [];

  if (titleShown) {
    const readingType = READING_SENTINEL_MAP[sentinel]?.readingType;
    const title = COPTIC_READING_TYPE_TITLES[readingType] || { english: `Coptic ${readingType || ""}`.trim(), arabic: "" };
    return {
      kind: "section",
      section: {
        id: sectionId,
        title,
        titlePrayerType: null,
        collapsible: minimization === "Minimizable" || minimization === "Minimized",
        defaultCollapsed: minimization === "Minimized",
        verses: [...citationVerse, ...verses],
        alternateEvery: null,
        forceWhiteVerses: true,
      },
    };
  }

  return { kind: "flat", verses: [...citationVerse, ...verses] };
}

function getSynaxariumForDate(isoDate) {
  if (synaxariumCache?.isoDate === isoDate) return synaxariumCache.promise;
  const promise = supabase
    .schema("synaxarium")
    .rpc("get_day_json", { p_date: isoDate })
    .then(({ data, error }) => {
      if (error) throw new Error(`Unable to load synaxarium for ${isoDate}: ${error.message}`);
      return data || { entries: [] };
    });
  synaxariumCache = { isoDate, promise };
  return promise;
}


/** Fetches today's Synaxarium via get_day_json and maps it to hydrated sections:
 *  one title-only header for the Coptic date, then one section per saint entry
 *  with its long body text split on double-newlines for slide pagination. */
async function resolveSynaxariumSections(isoDate) {
  let dayData;
  try {
    dayData = await getSynaxariumForDate(isoDate);
  } catch {
    return [];
  }
  if (!dayData?.entries?.length) return [];

  const sections = [];

  if (dayData.coptic_date) {
    sections.push({
      id: `synaxarium-date-${isoDate}`,
      title: { english: dayData.coptic_date, arabic: "" },
      titlePrayerType: null,
      collapsible: false,
      defaultCollapsed: false,
      verses: [],
      isReading: false,
      forceWhiteVerses: true,
      prayerType: null,
      alternateEvery: null,
    });
  }

  if (dayData.intro) {
    sections.push({
      id: "synaxarium-intro",
      title: { english: "", arabic: "" },
      titlePrayerType: null,
      collapsible: false,
      defaultCollapsed: false,
      verses: [{
        english: dayData.intro.english || "",
        arabic: dayData.intro.arabic || "",
        coptic: null,
        type: "text",
        person_type: null,
        prayer_type: null,
      }],
      isReading: true,
      forceWhiteVerses: true,
      prayerType: null,
      alternateEvery: null,
    });
  }

  for (const entry of dayData.entries) {
    const verses = (entry.paragraphs || []).map((p) => ({
      english: p.english || "",
      arabic: p.arabic ?? null,
      coptic: null,
      type: "text",
      person_type: null,
      prayer_type: null,
    }));
    sections.push({
      id: entry.entry_key,
      title: { english: entry.title_english || "", arabic: entry.title_arabic || "" },
      titlePrayerType: null,
      collapsible: false,
      defaultCollapsed: false,
      verses,
      isReading: true,
      forceWhiteVerses: true,
      prayerType: null,
      alternateEvery: null,
    });
  }

  return sections;
}

/** Same as resolveReadingSentinelVerses but wraps the result as a titled section (for Subdocument/order-table-level Inline placements, which need a section object, not a bare verse list). The computed Bible citation is prepended to the verses as its own readingReference line — right before the actual reading text, never before the calling table's own intro/conclusion rows, which sit outside this section entirely. */
async function resolveReadingSentinelSection(section, isoDate) {
  const { verses, citation } = await resolveReadingSentinelVerses(section.hymn_key, isoDate);
  if (!verses.length) return null;
  const versesWithCitation = citation
    ? [{ type: "readingReference", english: citation.english, arabic: citation.arabic, coptic: "" }, ...verses]
    : verses;
  return applyCopticCaseToSection({
    id: section.id,
    hymn_key: section.hymn_key,
    title: section.title,
    titlePrayerType: section.titlePrayerType,
    collapsible: Boolean(section.collapsible),
    defaultCollapsed: Boolean(section.defaultCollapsed),
    verses: versesWithCitation,
    prayerType: null,
    alternateEvery: null,
    forceWhiteVerses: true,
  });
}

/** Merges every nested section's verses into ONE flat list under the calling section's own title/prayer_type — see the isInlinePlacement branch in hydrateWithFlags for why. */
function mergeNestedSectionsAsOneHymn(callingSection, nestedSections) {
  const verses = applyInheritedPreRefrainItalic(
    nestedSections.flatMap((s) => s.verses || []),
    callingSection.titlePrayerType,
  );
  const titlePrayerType = callingSection.titlePrayerType || null;
  const dominantPrayerType = getDominantPrayerType(titlePrayerType, verses);
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
    reverseAlternating: dominantPrayerType === "Reverse Alternating",
    forceWhiteVerses: !alternateEvery,
  };
}

// ─── Raw row fetch (ported from stuff for claude/slideshowData.js) ──────────

const ORDER_FIELDS = "item_order, hymn_key, condition, minimization, item_type";
const SERVICE_TITLE_FIELDS = "hymn_key, title_english, title_arabic, category, toggled, prayer_type";
// Note: line_id is deliberately NOT selected here — doxologies.hymn_texts is
// missing that column (every other schema's hymn_texts has it), and line_id
// isn't actually needed: line_order is sufficient for sorting.
// inline_hymn_title_shown/inline_hymn_minimization live on the row that
// carries inline_hymn_key — they decide whether the spliced-in hymn shows
// its own title, and (when shown) whether that title gets a minimize
// button, the same way the order table's own `minimization` column works.
const SERVICE_TEXT_FIELDS =
  "hymn_key, line_order, english, coptic, arabic, person_type, prayer_type, condition, item_type, inline_hymn_key, inline_hymn_title_shown, inline_hymn_minimization";
// These schemas only have their own order table + hymn_texts — no native
// hymn_titles table at all (confirmed against the live schema). Skip just
// their native title fetch; later schemas in the shared lookup order can
// still supply a title for the same hymn_key.
const SCHEMAS_WITHOUT_HYMN_TITLES = new Set([
  "gospel_responses",
  "hymn_of_the_intercessions",
  "praxis_response",
  "verses_of_the_cymbals",
]);

// Hymn-key resolution always starts in the calling schema, then walks the
// shared/common pools in this exact order. If the calling schema is one of
// these, it stays first and is skipped later in the fallback list.
const HYMN_KEY_FALLBACK_SCHEMAS = ["public", "liturgy", "psalmody", "agpeya", "veneration", "doxologies"];

function getHymnKeyLookupSchemas(schema) {
  return [...new Set([schema, ...HYMN_KEY_FALLBACK_SCHEMAS].filter(Boolean))];
}

export async function fetchServiceRows(schema, table) {
  const orderRows = await fetchOrderRows(schema, table);
  if (!orderRows.length) return [];

  const hymnKeys = uniqueNonEmpty(orderRows.map((row) => row.hymn_key));
  const lookupSchemas = getHymnKeyLookupSchemas(schema);
  const [titleRowsBySchema, textRowsBySchema] = await Promise.all([
    Promise.all(lookupSchemas.map((lookupSchema) => fetchSchemaTitlesByKeys(lookupSchema, hymnKeys))),
    Promise.all(lookupSchemas.map((lookupSchema) => fetchSchemaTextRowsByKeys(lookupSchema, hymnKeys))),
  ]);

  return flattenServiceRows(orderRows, { lookupSchemas, titleRowsBySchema, textRowsBySchema });
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
  { lookupSchemas = [], titleRowsBySchema = [], textRowsBySchema = [] } = {},
) {
  const titleMaps = lookupSchemas.map((_, index) => createTitleMap(titleRowsBySchema[index] || []));
  const textMaps = lookupSchemas.map((_, index) => createTextRowsMap(textRowsBySchema[index] || []));

  const rows = [];
  const sortedOrderRows = [...orderRows].sort(compareItemOrder);

  for (const orderRow of sortedOrderRows) {
    const hymnKey = normalizeText(orderRow.hymn_key);
    if (!hymnKey) continue;

    const title = findFirstMappedValue(titleMaps, hymnKey) || {};
    const lines = findFirstMappedValue(textMaps, hymnKey) || [];

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

function findFirstMappedValue(schemaMaps, hymnKey) {
  for (const rowsByKey of schemaMaps) {
    const value = rowsByKey.get(hymnKey);
    if (Array.isArray(value) ? value.length : value) return value;
  }
  return null;
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
    inline_hymn_title_shown: Boolean(line?.inline_hymn_title_shown),
    inline_hymn_minimization: normalizeText(line?.inline_hymn_minimization),
  };
}

// ─── Section assembly (ported, unchanged from stuff for claude/slideshowData.js) ──

const ALTERNATE_EVERY = {
  "Single Alternating": 1,
  "Reverse Alternating": 1,
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
        // Whether the spliced-in hymn shows its own title at all (rather
        // than just being a silent content splice), and — only when shown —
        // whether that title gets a minimize button, same semantics as the
        // order table's own minimization column.
        inlineHymnTitleShown: row.inline_hymn_title_shown,
        inlineHymnMinimization: row.inline_hymn_minimization,
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
        // Preserved separately from `type` so a Silent/Recited Prayer or
        // Refrain line said by a specific speaker still shows/tracks that
        // speaker — see resolvePersonRole.
        personRole: resolvePersonRole(row.person_type),
        // "Invincible Coptic" lines have no English/Arabic counterpart by
        // design (a Coptic-only exclamation like "Glory to our God") — they
        // render as a single centered column rather than trying to line up
        // against blank parallel columns.
        invincibleCoptic: row.prayer_type === "Invincible Coptic",
        // Pre-Refrain keeps its natural type/role (see resolveEffectiveVerseType
        // above) but always renders italic on top of it.
        italic: shouldItalicizeAsPreRefrain(row.prayer_type, row.title_prayer_type, row.person_type),
      });
    }
  }

  const sections = Array.from(sectionMap.values());
  for (const section of sections) {
    if (section.isSubdocumentPlaceholder) continue;

    // The hymn's own declared prayer_type (hymn_titles.prayer_type) wins for
    // the section's overall alternation scheme, except Pre-Refrain, which is
    // presentation-only italic styling and must not change color/alternation.
    // A single Refrain or Silent Prayer verse mixed into an otherwise
    // "Single Alternating" hymn must not hijack the whole section into
    // forceWhiteVerses just because it happens to be the first verse with any
    // line-level prayer_type set. Only fall back to scanning verses when the
    // hymn has no dominant title-level prayer_type of its own.
    const dominantPrayerType = getDominantPrayerType(section.titlePrayerType, section.verses);
    section.prayerType = dominantPrayerType;

    if (dominantPrayerType && Object.prototype.hasOwnProperty.call(ALTERNATE_EVERY, dominantPrayerType)) {
      section.alternateEvery = ALTERNATE_EVERY[dominantPrayerType];
      // Reverse Alternating is Single Alternating's mirror image: same
      // per-verse cadence, just starting on blue instead of white.
      section.reverseAlternating = dominantPrayerType === "Reverse Alternating";
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

/**
 * The speaker role a verse's person_type carries, independent of prayer_type
 * — unlike `type` (getServiceVerseType), which collapses a Silent
 * Prayer/Recited Prayer/Refrain verse's type to that prayer type and loses
 * the underlying speaker info entirely. Used for the rubric label
 * ("Priest:"/"Deacon:"/etc.) and the person-type-indicator suppression
 * tracking, so a silently-prayed line said by the priest still shows
 * "Priest:" (in the silent-prayer color) and still counts as a real speaker
 * change in the indicator sequence, instead of silently losing that
 * information the moment it's also a Silent/Recited Prayer or Refrain line.
 */
export function resolvePersonRole(personType) {
  if (personType === "Bishop/Priest") return "bishopOrPriest";
  if (personType === "Priest") return "priest";
  if (personType === "Deacon") return "deacon";
  if (personType === "Reader") return "reader";
  if (personType === "People") return "people";
  return null;
}

export function getServiceVerseType(personType, prayerType) {
  // A row explicitly marked BOTH Comment and Silent Prayer renders with
  // comment styling (dark, italic) but is gated by displayComments AND
  // displaySilentPrayers together, not either alone — see "silentComment"
  // handling in documentHtml.ts/VerseBlock.js.
  if (personType === "Comment" && prayerType === "Silent Prayer") return "silentComment";
  if (prayerType === "Silent Prayer") return "silentPrayer";
  if (prayerType === "Recited Prayer") return "recitedPrayer";
  if (prayerType === "Refrain") return "refrain";
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
 *
 * "Pre-Refrain" is not a real distinct role — a Pre-Refrain verse keeps
 * whatever role it would have gotten with no prayer_type at all (its own
 * person_type, or the section's inherited prayer_type), it just always
 * renders italic on top of that (see the invincibleCoptic-style `italic`
 * flag set at the verse-construction call sites below).
 */
function resolveEffectiveVerseType(personType, prayerType, sectionTitlePrayerType) {
  const ownPrayerType = isPreRefrainPrayerType(prayerType) ? "" : prayerType;
  const inheritedPrayerType = isPreRefrainPrayerType(sectionTitlePrayerType) ? "" : sectionTitlePrayerType;
  const effectivePrayerType = ownPrayerType || (personType === "Comment" ? "" : inheritedPrayerType) || "";
  return getServiceVerseType(personType, effectivePrayerType);
}

function isPreRefrainPrayerType(prayerType) {
  return normalizeText(prayerType) === "Pre-Refrain";
}

function shouldItalicizeAsPreRefrain(prayerType, inheritedPrayerType, personType) {
  if (isPreRefrainPrayerType(prayerType)) return true;
  if (normalizeText(prayerType) || personType === "Comment") return false;
  return isPreRefrainPrayerType(inheritedPrayerType);
}

function applyInheritedPreRefrainItalic(verses, inheritedPrayerType) {
  if (!isPreRefrainPrayerType(inheritedPrayerType)) return verses;
  return verses.map((verse) => {
    if (isPreRefrainPrayerType(verse.prayerType)) return { ...verse, italic: true };
    return normalizeText(verse.prayerType) ? verse : { ...verse, italic: true };
  });
}

function getDominantPrayerType(titlePrayerType, verses) {
  const normalizedTitlePrayerType = normalizeText(titlePrayerType);
  if (normalizedTitlePrayerType && !isPreRefrainPrayerType(normalizedTitlePrayerType)) return normalizedTitlePrayerType;
  return (verses || []).find((verse) => verse.prayerType && !isPreRefrainPrayerType(verse.prayerType))?.prayerType || null;
}

// ─── hydrateSupabaseServiceHymn ────────────────────────────────────────────
// The piece stuff for claude/slideshowData.js referenced but didn't include.
// Fetches + assembles a service, resolves today's condition flags, filters
// every section/verse by its condition, and recursively expands Subdocument
// and Inline placeholders. depth guards against runaway recursion the same
// way the Postgres get_service RPC does (see project_condition_engine.md).

// Real hymn_texts rows condition specific wording on WHICH document they're
// being read from (e.g. the same "adamAspasmos" hymn sits in all three
// anaphora order tables, but individual lines are conditioned on
// StBasilLiturgy/StGregoryLiturgy/StCyrilLiturgy to pick the right wording) —
// these are structural flags derived from schema/table, not the date, but
// they still need to reach evaluateCondition the same way date flags do.
const STRUCTURAL_FLAGS_BY_TABLE = {
  liturgy_of_st_basil: { StBasilLiturgy: true },
  liturgy_of_st_gregory: { StGregoryLiturgy: true },
  liturgy_of_st_cyril: { StCyrilLiturgy: true },
  liturgy_of_the_word: { PaulineIncense: true },
  vespers_praises: { VesperPraises: true },
  // Morning Doxology is its own service, named on its own. It is the only
  // thing that embeds the Agpeya's 1st Hour, so a row inside that Hour needs
  // a way to say "only when I am being prayed here".
  morning_doxology: { MorningDoxology: true },
};
const LITURGY_SCHEMA_TABLES = new Set([
  "offering_of_the_lamb",
  "liturgy_of_the_word",
  "liturgy_of_st_basil",
  "liturgy_of_st_gregory",
  "liturgy_of_st_cyril",
  "distribution",
]);
const PSALMODY_SCHEMA_TABLES = new Set(["vespers_praises", "midnight_praises", "morning_doxology", "antiphonary"]);

function deriveStructuralFlags(schema, table) {
  const flags = { ...(STRUCTURAL_FLAGS_BY_TABLE[table] || {}) };
  if (schema === "liturgy" && LITURGY_SCHEMA_TABLES.has(table)) {
    flags.Liturgy = true;
  }
  if (schema === "psalmody" && PSALMODY_SCHEMA_TABLES.has(table)) {
    // MidnightPraises means the Midnight Praises specifically — the
    // Antiphonary counts because it is only ever opened as a subdocument of
    // them. Morning Doxology used to be swept in here too, which made the two
    // impossible to tell apart in a condition; it now answers only to
    // MorningDoxology above, and Vespers Praises only to VesperPraises.
    flags.MidnightPraises = table === "midnight_praises" || table === "antiphonary";
  }
  return flags;
}

export async function hydrateSupabaseServiceHymn(schema, table, date, extraContext = {}, weekdayDate, depth = 0) {
  const structuralFlags = deriveStructuralFlags(schema, table);
  const flags = await getContextFlags(date, { ...structuralFlags, ...extraContext }, weekdayDate);
  const isoDate = toIsoDateString(date);
  return hydrateWithFlags(schema, table, flags, depth, isoDate);
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

/**
 * GOSPEL_RITE's own nested content (gospel_rite.gospel_rite) includes rows
 * conditioned on the in-document "Coptic Gospel Rite" toggle (the button
 * rendered via startsGospelRiteToggle/renderGospelRiteToggle) — same
 * "hydrate every state up front, tag the result, let the client toggle
 * without a re-fetch" principle already used for Bishop Present. Hydrated
 * TWICE (CopticGospelRite forced true and forced false) and merged: content
 * present in both stays always-visible; content present in only one state
 * gets tagged copticGospelRiteOnly/nonCopticGospelRiteOnly so
 * documentHtml.ts/SlideshowContainer can filter it purely from the live
 * toggle, exactly like bishopOnly/priestOnly. Every other whole-table Inline
 * target has no such toggle, so it's just a single ordinary hydration.
 */
async function hydrateWholeTableInlineNested(hymnKey, target, flags, depth, isoDate) {
  if (hymnKey !== "GOSPEL_RITE") {
    return safeHydrateNested(target.schema, target.table, flags, depth, isoDate);
  }

  const [onSections, offSections] = await Promise.all([
    safeHydrateNested(target.schema, target.table, { ...flags, CopticGospelRite: true }, depth, isoDate),
    safeHydrateNested(target.schema, target.table, { ...flags, CopticGospelRite: false }, depth, isoDate),
  ]);

  const offIds = new Set(offSections.map((s) => s.id));
  const onIds = new Set(onSections.map((s) => s.id));
  const merged = onSections.map((s) => {
    if (offIds.has(s.id)) return s;
    // A "-contN" id (see flushVerses in hydrateWithFlags) means this hymn's
    // own verse flow got split into multiple chunks mid-hydration — the only
    // way that happens is a CopticGospelRite-gated splice sitting in the
    // *middle* of an otherwise-unconditional hymn (e.g. introductionAndPsalm:
    // its own Reader line, then the CopticGospelRite-only Coptic Gospel
    // splice, then its own unconditional Psalm intro/text). The off
    // hydration never hits that splice, so it never splits — its single
    // unsplit chunk keeps the base id, and this continuation's own id never
    // appears there even though its content (the hymn's own later lines) is
    // just as unconditional. Tag it copticGospelRiteOnly only when even its
    // *base* id is missing from off — genuinely new content, not a chunking
    // artifact of unconditional content that happened to land after a split.
    const baseId = s.id.replace(/-cont\d+$/, "");
    if (baseId !== s.id && offIds.has(baseId)) return s;
    return { ...s, copticGospelRiteOnly: true };
  });
  const offOnly = offSections.filter((s) => !onIds.has(s.id)).map((s) => ({ ...s, nonCopticGospelRiteOnly: true }));
  return [...merged, ...offOnly];
}

/**
 * Whether a verse/section survives hydration regardless of the *current*
 * Bishop Present toggle: its condition is evaluated once with BishopPresent
 * forced true and once forced false (every other flag — weekday, season,
 * date, etc. — stays exactly as already computed for the day), and it's
 * included if EITHER passes. That way the document is always hydrated with
 * both the bishop-present content and the priest-only content already
 * present, tagged with which state each needs — so toggling Bishop Present
 * afterward is a pure client-side re-render (see bishopOnly/priestOnly on
 * the resulting section/verse), never a re-fetch.
 */
function evaluateBishopAwareVisibility(condition, flags) {
  if (!String(condition || "").trim()) return { visible: true, bishopOnly: false, priestOnly: false };
  const withBishop = evaluateCondition(condition, { ...flags, BishopPresent: true });
  const withoutBishop = evaluateCondition(condition, { ...flags, BishopPresent: false });
  return {
    visible: withBishop || withoutBishop,
    bishopOnly: withBishop && !withoutBishop,
    priestOnly: withoutBishop && !withBishop,
  };
}

// Expands each side's collapsed {visible, bishopOnly, priestOnly} back into
// its two per-branch booleans (visible-with-bishop, visible-without-bishop)
// before combining, rather than combining bishopOnly/priestOnly directly —
// those two flags alone can't tell "unrestricted and visible in both
// branches" apart from "condition false in both branches" (both read as
// bishopOnly=false, priestOnly=false), so combining them without `visible`
// silently resurrected verses whose condition never actually matched.
function combineBishopVisibility(outer, inner) {
  const outerWithBishop = outer.visible && !outer.priestOnly;
  const outerWithoutBishop = outer.visible && !outer.bishopOnly;
  const innerWithBishop = inner.visible && !inner.priestOnly;
  const innerWithoutBishop = inner.visible && !inner.bishopOnly;

  const withBishop = outerWithBishop && innerWithBishop;
  const withoutBishop = outerWithoutBishop && innerWithoutBishop;
  return {
    visible: withBishop || withoutBishop,
    bishopOnly: withBishop && !withoutBishop,
    priestOnly: withoutBishop && !withBishop,
  };
}

/**
 * Whole-table Inline sentinel splices (GOSPEL_RITE, VERSES_OF_THE_CYMBALS,
 * etc.) are governed by the calling schema's own hymn_titles/order-table row
 * for the sentinel key — same "look at what the calling schema gives it"
 * principle as any other hymn_key: if it's given a title, display it; if
 * it's given a prayer_type, follow it; if it's given a minimization,
 * include it.
 *
 * How that title is actually placed depends on whether the target schema's
 * nested content has titles of its own:
 *  - GOSPEL_RITE's target (gospel_rite.gospel_rite) has its own native
 *    hymn_titles — dozens of individually titled, individually Minimized
 *    psalm trailers/responses. Those stay separate sections exactly as
 *    hydrated; the calling schema's own title for "GOSPEL_RITE" itself (if
 *    given) is prepended as its own header section in front of them.
 *  - VERSES_OF_THE_CYMBALS's target (verses_of_the_cymbals) has no native
 *    hymn_titles at all — ~90 condition-gated, individually untitled verse
 *    blocks that are really one continuous hymn. There's nothing of theirs
 *    to preserve individually, so every verse from every nested hymn_key is
 *    merged into ONE flat section using the calling schema's own
 *    title/prayer_type/minimization — the person-type indicator only
 *    restarts once, at the very first verse, exactly as if this were a
 *    single ordinary hymn rather than dozens spliced together.
 */
function buildWholeTableInlineSections(nestedSections, callingRow) {
  if (!nestedSections.length) return [];
  const nestedSectionsHaveOwnTitles = nestedSections.some((s) => s.title?.english || s.title?.arabic);

  if (nestedSectionsHaveOwnTitles) {
    const header = buildInlineTitleOnlySection(callingRow);
    return header ? [header, ...nestedSections] : nestedSections;
  }

  return [mergeIntoOneInlineSection(callingRow, nestedSections)];
}

function buildInlineTitleOnlySection(callingRow) {
  if (!callingRow || !(callingRow.title?.english || callingRow.title?.arabic)) return null;
  return {
    id: callingRow.id,
    title: callingRow.title,
    titlePrayerType: callingRow.titlePrayerType || null,
    collapsible: Boolean(callingRow.collapsible),
    defaultCollapsed: Boolean(callingRow.defaultCollapsed),
    verses: [],
    alternateEvery: null,
    forceWhiteVerses: true,
    bishopOnly: callingRow.bishopOnly,
    priestOnly: callingRow.priestOnly,
  };
}

function mergeIntoOneInlineSection(callingRow, nestedSections) {
  const verses = applyInheritedPreRefrainItalic(
    nestedSections.flatMap((s) => s.verses || []),
    callingRow?.titlePrayerType,
  );
  const titlePrayerType = callingRow?.titlePrayerType || null;
  const dominantPrayerType = getDominantPrayerType(titlePrayerType, verses);
  const merged = {
    id: callingRow?.id,
    title: callingRow?.title || { english: "", arabic: "" },
    titlePrayerType,
    collapsible: Boolean(callingRow?.collapsible),
    defaultCollapsed: Boolean(callingRow?.defaultCollapsed),
    verses,
    prayerType: dominantPrayerType,
    bishopOnly: callingRow?.bishopOnly,
    priestOnly: callingRow?.priestOnly,
  };
  if (dominantPrayerType && Object.prototype.hasOwnProperty.call(ALTERNATE_EVERY, dominantPrayerType)) {
    merged.alternateEvery = ALTERNATE_EVERY[dominantPrayerType];
    merged.reverseAlternating = dominantPrayerType === "Reverse Alternating";
  } else {
    merged.alternateEvery = null;
    merged.forceWhiteVerses = true;
  }
  return applyCopticCaseToSection(merged);
}

// A saint hymn can be listed on more than one sequence row for calendar
// reasons — ArchangelMichael's psali sits on both his Hathor 12 and his
// Paone 12 rows, and the Adam and Vatos variants of one psali are two rows
// again. With his base condition active every one of those matches, and the
// same hymn would render two or three times over.
//
// Scoped deliberately to rows that actually carry a saint hymn condition:
// plenty of documents repeat a hymn_key on purpose (the Agpeya prays Our
// Father twice in an Hour), and those rows have no saint condition, so a
// blanket dedupe would silently eat them.
const SAINT_HYMN_CONDITION_RE = /[A-Za-z][A-Za-z0-9_]*:(?:Doxology|VOC|Psali|Veneration)/;

function dropDuplicateSaintHymns(sections) {
  const seen = new Set();
  return sections.filter((section) => {
    if (!SAINT_HYMN_CONDITION_RE.test(section.condition || "")) return true;
    if (!section.hymn_key) return true;
    if (seen.has(section.hymn_key)) return false;
    seen.add(section.hymn_key);
    return true;
  });
}

async function hydrateWithFlags(schema, table, flags, depth, isoDate) {
  const rawRows = await fetchServiceRows(schema, table);
  const sections = assembleServiceSections(rawRows);

  const visibleSections = dropDuplicateSaintHymns(
    sections
      .map((section) => {
        const visibility = evaluateBishopAwareVisibility(section.condition, flags);
        return visibility.visible
          ? { ...section, bishopOnly: visibility.bishopOnly, priestOnly: visibility.priestOnly }
          : null;
      })
      .filter(Boolean),
  );

  const hydrated = [];
  for (const section of visibleSections) {
    // A Hyperlink placeholder leaves this document altogether for another
    // service, so — unlike a Subdocument, whose content is prefetched here and
    // stashed for its modal — there is nothing to hydrate: the destination
    // builds itself when its own screen mounts. The section carries just the
    // all-caps key; which route that resolves to is a presentation concern
    // (HYPERLINK_TARGETS in constants/manifest.ts), kept out of here so this
    // module stays free of routing.
    if (section.isHyperlink) {
      hydrated.push({
        id: section.id,
        title: {
          english: section.title.english || humanizeSentinelKey(section.hymn_key),
          arabic: section.title.arabic,
        },
        verses: [],
        isHyperlinkButton: true,
        hyperlinkKey: section.hymn_key,
        alternateEvery: null,
        forceWhiteVerses: true,
        bishopOnly: section.bishopOnly,
        priestOnly: section.priestOnly,
      });
      continue;
    }

    if (section.isSubdocumentPlaceholder) {
      const target = SUBDOCUMENT_MAP[section.hymn_key];
      if (!target) {
        if (section.hymn_key === "SYNAXARIUM" && isoDate) {
          const synaxariumSections = await resolveSynaxariumSections(isoDate);
          const label = section.title?.english || "Synaxarium";
          hydrated.push({
            id: section.id,
            title: { english: label, arabic: section.title?.arabic || "السنكسار" },
            verses: [],
            isSubdocumentButton: true,
            subdocumentKey: "SYNAXARIUM",
            subdocumentTarget: null,
            subdocumentSections: synaxariumSections,
            alternateEvery: null,
            forceWhiteVerses: true,
            bishopOnly: section.bishopOnly,
            priestOnly: section.priestOnly,
          });
          continue;
        }
        if (READING_SENTINELS.has(section.hymn_key) && isoDate) {
          const readingSection = await resolveReadingSentinelSection(section, isoDate);
          if (readingSection) {
            hydrated.push({
              ...readingSection,
              bishopOnly: section.bishopOnly,
              priestOnly: section.priestOnly,
            });
          }
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
      // calling schema's hymn_titles, then the shared fallback schemas,
      // falling back to a humanized sentinel key (e.g. "COPTIC_PRAXIS" ->
      // "Coptic Praxis") when no title is defined anywhere, rather than
      // showing the raw ALL_CAPS key verbatim in the content selector.
      const label = section.title.english || humanizeSentinelKey(section.hymn_key);
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
          bishopOnly: section.bishopOnly,
          priestOnly: section.priestOnly,
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
        bishopOnly: section.bishopOnly,
        priestOnly: section.priestOnly,
      });
      continue;
    }

    if (section.isInlinePlacement) {
      // A reading-resolution sentinel (e.g. PAULINE_EPISTLE_WITHOUT_COPTIC,
      // nested inside readings.pauline_epistle between its introduction and
      // conclusion rows) needs the day's actual scripture text, not a
      // schema.table lookup — same live resolution as the Subdocument branch
      // above, just producing an inline section instead of a button.
      if (READING_SENTINELS.has(section.hymn_key) && isoDate) {
        const readingSection = await resolveReadingSentinelSection(section, isoDate);
        if (readingSection) hydrated.push(readingSection);
        continue;
      }

      // An order-table-level Inline placeholder (item_type = "Inline" on the
      // order row itself, hymn_key an all-caps sentinel like GOSPEL_RITE or
      // VERSES_OF_THE_CYMBALS) is structurally identical to a Subdocument
      // placeholder — it always references another whole type-3 table —
      // except it splices that table's content directly into this document
      // instead of becoming a button. See buildWholeTableInlineSections for
      // how the calling row's own title/prayer_type/minimization (already
      // resolved onto `section` above, same as any other hymn_key) get
      // applied to the imported content.
      const target = resolveWholeTableInlineTarget(section.hymn_key);
      if (!target || depth >= 3) continue;
      const nestedSections = await hydrateWholeTableInlineNested(section.hymn_key, target, flags, depth + 1, isoDate);
      const toggleSection = buildGospelRiteToggleSection(section.hymn_key, section.id);
      pushWholeTableInlineSections(hydrated, toggleSection, buildWholeTableInlineSections(nestedSections, section));
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
      // Only the very first chunk shows the hymn's title — a chunk that
      // resumes after a shown-title inline splice interrupted the flow is a
      // continuation of the same hymn, not a new one, so it must not repeat
      // the title again.
      const title = splitIndex === 0 ? section.title : { english: "", arabic: "" };
      hydrated.push(applyCopticCaseToSection({ ...section, id, title, hymnKey: section.hymn_key, verses }));
      splitIndex += 1;
      pushedAnything = true;
      verses = [];
    };

    for (const verse of section.verses) {
      const verseVisibility = evaluateBishopAwareVisibility(verse.condition, flags);
      if (!verseVisibility.visible) continue;

      if (verse.type === "inlinePlaceholder") {
        if (depth >= 3) continue;

        // A reading-resolution sentinel embedded mid-verse (e.g. gospel_rite's
        // "gospel"/"copticPsalm" hymns splicing in VESPERS_GOSPEL_WITH_COPTIC)
        // needs the day's live scripture text, with a citation line of its
        // own ("Matthew 25:1-13") right before it — always a silent splice
        // into this hymn's own flowing verses, never its own section: the
        // encompassing hymn (e.g. "copticPsalm") is always already the
        // top-level Minimizable/Minimized unit here (its own order-table row
        // carries that), so a second, nested collapse just for this splice
        // would wrongly split it off as if it were its own separate hymn.
        if (READING_SENTINELS.has(verse.inlineHymnKey) && isoDate) {
          const spliced = await resolveReadingSentinelSplice(verse.inlineHymnKey, isoDate, false, null, `${section.id}-inline-${verse.inlineHymnKey}`);
          if (spliced) verses.push(...spliced.verses);
          continue;
        }

        const wholeTableTarget = resolveWholeTableInlineTarget(verse.inlineHymnKey);
        if (wholeTableTarget) {
          flushVerses();
          const nestedSections = await hydrateWholeTableInlineNested(verse.inlineHymnKey, wholeTableTarget, flags, depth + 1, isoDate);
          const toggleSection = buildGospelRiteToggleSection(verse.inlineHymnKey, `${section.id}-inline-${verse.inlineHymnKey}`);
          // Same calling-schema-gives-the-title principle as the top-level
          // Inline placeholder above, just sourced from this line's own
          // inline_hymn_title_shown/inline_hymn_minimization (the type-2
          // table's per-line equivalent) instead of a top-level order row.
          const inlineSentinelTitle = await fetchInlineHymnTitle(schema, verse.inlineHymnKey);
          const hasOwnSentinelTitle =
            Boolean(verse.inlineHymnTitleShown) &&
            Boolean(inlineSentinelTitle?.title_english || inlineSentinelTitle?.title_arabic);
          const callingRow = {
            id: `${section.id}-inline-${verse.inlineHymnKey}`,
            title: hasOwnSentinelTitle
              ? { english: inlineSentinelTitle.title_english || "", arabic: inlineSentinelTitle.title_arabic || "" }
              : { english: "", arabic: "" },
            titlePrayerType: hasOwnSentinelTitle ? inlineSentinelTitle.prayer_type || null : section.titlePrayerType,
            collapsible:
              verse.inlineHymnMinimization === "Minimizable" ||
              verse.inlineHymnMinimization === "Minimized" ||
              Boolean(section.collapsible),
            defaultCollapsed: verse.inlineHymnMinimization === "Minimized" || Boolean(section.defaultCollapsed),
            bishopOnly: verseVisibility.bishopOnly,
            priestOnly: verseVisibility.priestOnly,
          };
          pushWholeTableInlineSections(hydrated, toggleSection, buildWholeTableInlineSections(nestedSections, callingRow));
          pushedAnything = true;
          continue;
        }

        // Regular single-hymn-key inline splice. Two distinct behaviors,
        // decided by the triggering line's own inline_hymn_title_shown
        // column: if true (and the inline hymn actually has a title in the
        // ordered schema lookup), it's treated as its OWN hymn — flush
        // whatever the parent had so far, push a standalone section with
        // that title, its own prayer-type-driven color
        // alternation, and (since suppression/rubric restart operates
        // per-section) a fresh restart of the person-type indicators — then
        // keep accumulating the parent's remaining verses in a new chunk
        // afterward. If inline_hymn_title_shown is false, it's just a
        // content splice regardless of whether the inline hymn has a title
        // row: pull in its verses only, with the destination line's own
        // person_type/prayer_type overriding the source, per
        // resolveEffectiveVerseType's cascade, and no restart.
        const inlineTitle = await fetchInlineHymnTitle(schema, verse.inlineHymnKey);
        const hasOwnTitle = Boolean(verse.inlineHymnTitleShown) && Boolean(inlineTitle?.title_english || inlineTitle?.title_arabic);
        const inlineTitlePrayerType = hasOwnTitle ? inlineTitle.prayer_type || null : section.titlePrayerType;

        // A Comment row is a stage direction intrinsic to the source hymn
        // (e.g. "If a bishop is present, the following verse is added.") —
        // the calling line's own person_type/prayer_type override exists to
        // reassign a *speaker* onto the spliced-in content (e.g. "recite
        // this as the Deacon" regardless of what the source table says),
        // never to silently turn a stage direction into spoken dialogue —
        // resolveInlineHymnVerses applies that same rule at every nesting
        // level.
        const built = await resolveInlineHymnVerses(
          schema,
          verse.inlineHymnKey,
          isoDate,
          flags,
          verseVisibility,
          verse.overridePersonType,
          verse.overridePrayerType,
          inlineTitlePrayerType,
          0,
        );
        const hasNestedSections = built.segments.some((seg) => seg.kind === "section");

        if (hasOwnTitle) {
          flushVerses();
          const flatVerses = built.segments.flatMap((seg) => (seg.kind === "verses" ? seg.verses : seg.section.verses));
          const dominantPrayerType = getDominantPrayerType(inlineTitlePrayerType, flatVerses);
          const alternateEvery =
            dominantPrayerType && Object.prototype.hasOwnProperty.call(ALTERNATE_EVERY, dominantPrayerType)
              ? ALTERNATE_EVERY[dominantPrayerType]
              : null;
          const sectionVisibility = combineBishopVisibility(verseVisibility, {
            visible: true,
            bishopOnly: false,
            priestOnly: false,
          });
          hydrated.push(
            applyCopticCaseToSection({
              id: `${section.id}-inline-${verse.inlineHymnKey}`,
              hymn_key: verse.inlineHymnKey,
              title: { english: inlineTitle.title_english || "", arabic: inlineTitle.title_arabic || "" },
              titlePrayerType: inlineTitlePrayerType,
              // inline_hymn_minimization works exactly like a type-3 order
              // table's own minimization column on this shown title — and
              // when the encapsulating hymn itself is Minimizable/Minimized
              // (section.collapsible/defaultCollapsed, from the ORDER
              // table's own minimization), the inline hymn follows that
              // lead too, on top of whatever its own column says.
              collapsible:
                verse.inlineHymnMinimization === "Minimizable" ||
                verse.inlineHymnMinimization === "Minimized" ||
                Boolean(section.collapsible),
              defaultCollapsed: verse.inlineHymnMinimization === "Minimized" || Boolean(section.defaultCollapsed),
              verses: flatVerses,
              prayerType: dominantPrayerType,
              alternateEvery,
              reverseAlternating: dominantPrayerType === "Reverse Alternating",
              forceWhiteVerses: !alternateEvery,
              bishopOnly: sectionVisibility.bishopOnly,
              priestOnly: sectionVisibility.priestOnly,
            }),
          );
          pushedAnything = true;
        } else if (hasNestedSections) {
          // The inline hymn itself has no title of its own (e.g.
          // gospel_rite's "copticGospel", whose own hymn_titles row is
          // blank), but one of ITS internal rows individually declared
          // inline_hymn_title_shown=true on a nested reading-sentinel
          // reference (e.g. the WITH_COPTIC gospel sentinel). This line's own
          // condition (e.g. "CopticGospelRite") already gates the whole
          // thing, so EVERY piece produced here — copticGospel's own framing
          // verses (both before AND after the nested section, kept in their
          // true relative order via `built.segments`) and the nested titled
          // section itself — is pushed as its own independent hydrated
          // entry, deliberately never merged into the calling hymn's own
          // `verses`/flushVerses accumulator. Mixing any of it in there
          // would make it wrongly survive gospel_rite's dual on/off
          // CopticGospelRite hydration+merge (hydrateWholeTableInlineNested)
          // as always-visible, and — since that merge also treats a new
          // section id as "exclusive to whichever hydration produced it" —
          // would make the calling hymn's own *later*, unconditional content
          // (accumulated into a new chunk after this flush) wrongly get
          // treated as exclusive to this condition too, just for having
          // landed on a different chunk id than the no-split off hydration.
          flushVerses();
          let wrapIndex = 0;
          for (const seg of built.segments) {
            if (seg.kind === "section") {
              hydrated.push(applyCopticCaseToSection({ ...seg.section }));
            } else {
              hydrated.push(
                applyCopticCaseToSection({
                  id: `${section.id}-inline-${verse.inlineHymnKey}-wrap${wrapIndex++}`,
                  title: { english: "", arabic: "" },
                  verses: seg.verses,
                  alternateEvery: null,
                  forceWhiteVerses: true,
                  bishopOnly: verseVisibility.bishopOnly,
                  priestOnly: verseVisibility.priestOnly,
                }),
              );
            }
          }
          pushedAnything = true;
        } else {
          verses.push(...built.segments.flatMap((seg) => seg.verses));
        }
        continue;
      }

      // Combine the verse's own condition with the enclosing section's
      // bishop visibility — if the ORDER ROW that produced this section has
      // condition=BishopPresent, the section gets bishopOnly:true, but the
      // individual verse (which has no condition of its own) gets
      // bishopOnly:false from verseVisibility alone. Without combining,
      // mergeIntoOneInlineSection (VOC, etc.) loses the restriction because
      // it inherits only the calling-row's flags, not the nested sections'.
      const sectionVisibility = { visible: true, bishopOnly: section.bishopOnly || false, priestOnly: section.priestOnly || false };
      const combined = combineBishopVisibility(sectionVisibility, verseVisibility);
      // vocKyrieEleison is a refrain-style response that always stands on its
      // own outside the Single Alternating cadence regardless of where it falls
      // in the merged VOC section — force white so it's excluded from the
      // alternating parity count in both renderers.
      const forceWhiteText = section.hymn_key === "vocKyrieEleison" ? true : (verse.forceWhiteText || false);
      // copticPsalm's own fixed intro line ("Ⲯⲁⲗⲙⲟⲥ ⲧⲱ ⲇⲁⲩⲓⲇ...") announces the
      // psalm that follows — the section's one capital letter belongs to the
      // actual (spliced-in, live) Psalm text after it, not to this framing
      // line, so it's excluded from applyCopticCaseToSection's search for
      // which verse to capitalize (it still gets lowercased normally).
      // vocKyrieEleison is a short refrain opener; the capital belongs to the
      // first verse of the following hymn (Adam/Vatos introduction, etc.).
      const skipHymnCapitalization =
        section.hymn_key === "copticPsalm" || section.hymn_key === "vocKyrieEleison" ? true : (verse.skipHymnCapitalization || false);
      verses.push({ ...verse, bishopOnly: combined.bishopOnly, priestOnly: combined.priestOnly, forceWhiteText, skipHymnCapitalization });
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
// ⲭ/Ⲭ (U+2CAC/U+2CAD), ϭ/Ϭ (U+03EC/U+03ED), ϯ/Ϯ (U+03EE/U+03EF) are
// Coptic letters that toLocaleLowerCase/toLocaleUpperCase do not reliably
// case-fold in all JS engines — listed explicitly below and handled via a
// manual lookup table rather than relying on the engine's Unicode case tables.
const COPTIC_CHAR_PATTERN = /[Ϣ-ϯⲀ-⳿ⲭⲬϭϮ]/;
const COPTIC_CHAR_GLOBAL_PATTERN = /[Ϣ-ϯⲀ-⳿ⲭⲬϭϮ]/g;
const COPTIC_TO_LOWER = { Ⲭ: 'ⲭ', Ϭ: 'ϭ', Ϯ: 'ϯ' };
const COPTIC_TO_UPPER = { ⲭ: 'Ⲭ', ϭ: 'Ϭ', ϯ: 'Ϯ' };

// A reading spliced inline into a hymn (e.g. "Coptic Psalm" housing the
// day's live Psalm text via resolveReadingSentinelSplice) has ALREADY been
// through its own independent Coptic case pass -- applyCopticCaseToReadingVerses,
// which capitalizes the reading's own first letter, not the housing hymn's.
// Without excluding those verses here, this section-wide pass would
// re-lowercase them (undoing that) and could hand the ONE capital this hymn
// gets to whatever the housing hymn's own leading verse happens to be
// instead of the actual reading text -- see buildReadingVerses.
//
// skipHymnCapitalization (set on copticPsalm's own framing verse -- see
// hydrateWholeTableInlineNested) opts a verse OUT of ever receiving that one
// capital, without exempting it from the ordinary lowercase pass -- unlike
// readingCaseNormalized, which is fully hands-off (already correctly cased).
function applyCopticCaseToSection(section) {
  const verses = section.verses.map((verse) =>
    verse.coptic && !verse.readingCaseNormalized ? { ...verse, coptic: lowercaseCoptic(verse.coptic) } : verse,
  );

  if (section.title?.english) {
    const firstIndex = verses.findIndex(
      (verse) => !verse.readingCaseNormalized && !verse.skipHymnCapitalization && verse.coptic && verse.coptic.trim(),
    );
    if (firstIndex !== -1) {
      verses[firstIndex] = { ...verses[firstIndex], coptic: uppercaseFirstCopticChar(verses[firstIndex].coptic) };
    }
  }

  return { ...section, verses };
}

function lowercaseCoptic(text) {
  return text.replace(COPTIC_CHAR_GLOBAL_PATTERN, (char) => COPTIC_TO_LOWER[char] ?? char.toLocaleLowerCase());
}

function uppercaseFirstCopticChar(text) {
  const index = text.search(COPTIC_CHAR_PATTERN);
  if (index === -1) return text;
  const upper = COPTIC_TO_UPPER[text[index]] ?? text[index].toLocaleUpperCase();
  return text.slice(0, index) + upper + text.slice(index + 1);
}

// Readings (buildReadingVerses above) source Coptic text from bible.verses,
// not hymn_texts -- same underlying data/case convention the standalone
// Bible reader already normalizes (see lowercaseCopticCharacters in
// bibleDocumentHtml.ts), which additionally restores the "Ⲋ" numeral-6 glyph
// after the blanket lowercase pass since it has no true lowercase form. This
// mirrors that Bible-reader normalization rather than reusing
// lowercaseCoptic above, which is tuned for hymn_texts's own convention and
// lacks the "Ⲋ" fix-up.
function lowercaseBibleCoptic(text) {
  return text.replace(COPTIC_CHAR_GLOBAL_PATTERN, (char) => COPTIC_TO_LOWER[char] ?? char.toLocaleLowerCase()).replace(/ⲋ/g, "Ⲋ");
}

function applyCopticCaseToReadingVerses(verses) {
  // readingCaseNormalized marks every verse (not just the capitalized one) so
  // applyCopticCaseToSection never re-lowercases them if this reading is
  // later spliced into a housing hymn (e.g. "Coptic Psalm") — re-running the
  // hymn-oriented lowercase pass would both undo the capital below and, for
  // any verse containing "Ⲋ", silently corrupt it (lowercaseCoptic lacks the
  // "Ⲋ" fix-up lowercaseBibleCoptic applies, since that glyph has no true
  // lowercase form).
  const normalized = verses.map((verse) =>
    verse.coptic ? { ...verse, coptic: lowercaseBibleCoptic(verse.coptic), readingCaseNormalized: true } : verse,
  );
  const firstIndex = normalized.findIndex((verse) => verse.coptic && verse.coptic.trim());
  if (firstIndex !== -1) {
    normalized[firstIndex] = { ...normalized[firstIndex], coptic: uppercaseFirstCopticChar(normalized[firstIndex].coptic) };
  }
  return normalized;
}

const INLINE_TEXT_FIELDS =
  "hymn_key, line_order, english, coptic, arabic, person_type, prayer_type, condition, item_type, inline_hymn_key, inline_hymn_title_shown, inline_hymn_minimization";

async function fetchInlineHymnVerses(schema, hymnKey) {
  for (const lookupSchema of getHymnKeyLookupSchemas(schema)) {
    const { data, error } = await supabase
      .schema(lookupSchema)
      .from("hymn_texts")
      .select(INLINE_TEXT_FIELDS)
      .eq("hymn_key", hymnKey)
      .order("line_order", { ascending: true });
    if (error) throw createReadableSupabaseError(error, `${lookupSchema}.hymn_texts`);
    if (data?.length) return data;
  }

  return [];
}

/**
 * Resolves one hymn_key's own hymn_texts rows into flat verse objects (plus
 * any standalone titled sections bubbled up from nested reading-sentinel
 * splices — see `sections` below), recursively following any further
 * inline_hymn_key references those rows carry themselves — e.g. gospel_rite's
 * "copticGospel" hymn is itself just 3 rows, each an inline reference to
 * VESPERS_GOSPEL_WITH_COPTIC/MATINS_GOSPEL_WITH_COPTIC/Liturgy_GOSPEL_WITH_COPTIC
 * (condition-gated by Vespers/Matins/Liturgy), each with its own
 * inline_hymn_title_shown=true/inline_hymn_minimization="Minimized". A naive
 * one-level splice (just reading english/coptic/arabic off each row) renders
 * those as blank lines instead of recursing into them, since the row
 * carrying the reference has no text of its own. Each row's own condition
 * combines with `outerVisibility` (the condition chain leading down to this
 * point, e.g. "introductionAndPsalm"'s own CopticGospelRite-gated line) via
 * combineBishopVisibility, so a condition anywhere in the chain being
 * unsatisfied correctly drops the content — exactly matching "inline hymns
 * take the conditions of their parent lines".
 *
 * Returns `{ verses, sections }`: `verses` is the flat splice content (what
 * this function used to return outright); `sections` collects any nested
 * reading-sentinel rows whose own inline_hymn_title_shown asked to become a
 * standalone titled/collapsible section (via resolveReadingSentinelSplice)
 * rather than a silent splice — e.g. copticGospel's 3 rows each resolve to
 * exactly one visible section (Vespers/Matins/Liturgy are mutually
 * exclusive), titled with the day's own Bible citation and Minimized per the
 * DB's own inline_hymn_minimization, the caller (the regular single-hymn-key
 * inline splice branch below) pushes them as their own hydrated entries.
 */
async function resolveInlineHymnVerses(
  schema,
  hymnKey,
  isoDate,
  flags,
  outerVisibility,
  overridePersonType,
  overridePrayerType,
  inlineTitlePrayerType,
  depth,
) {
  if (depth >= 5) return { segments: [] };
  const rows = await fetchInlineHymnVerses(schema, hymnKey);
  const segments = [];
  let currentVerses = [];

  // A run of plain verses is buffered here and only turned into its own
  // {kind:"verses"} segment once something breaks the run (a nested titled
  // section) or the rows run out — this is what lets copticGospel's own
  // framing lines (before AND after its nested WITH_COPTIC gospel section)
  // stay in their true relative position, instead of collapsing to two flat
  // "all verses" / "all sections" buckets that lose which came first.
  const flushCurrentVerses = () => {
    if (currentVerses.length) {
      segments.push({ kind: "verses", verses: currentVerses });
      currentVerses = [];
    }
  };

  for (const row of rows) {
    const rowVisibility = combineBishopVisibility(outerVisibility, evaluateBishopAwareVisibility(row.condition, flags));
    if (!rowVisibility.visible) continue;

    if (row.inline_hymn_key && isInlineLineItem(row.item_type)) {
      if (READING_SENTINELS.has(row.inline_hymn_key) && isoDate) {
        const spliced = await resolveReadingSentinelSplice(
          row.inline_hymn_key,
          isoDate,
          row.inline_hymn_title_shown,
          row.inline_hymn_minimization,
          `${hymnKey}-${row.line_order}-${row.inline_hymn_key}`,
        );
        if (spliced?.kind === "section") {
          flushCurrentVerses();
          segments.push({ kind: "section", section: { ...spliced.section, bishopOnly: rowVisibility.bishopOnly, priestOnly: rowVisibility.priestOnly } });
        } else if (spliced) {
          currentVerses.push(...spliced.verses.map((v) => ({ ...v, bishopOnly: rowVisibility.bishopOnly, priestOnly: rowVisibility.priestOnly })));
        }
        continue;
      }
      // A whole-table sentinel (GOSPEL_RITE, VERSES_OF_THE_CYMBALS, etc.)
      // this deep would need buildWholeTableInlineSections' section-
      // producing shape, which doesn't fit this splice's "just a flat verse
      // list" contract — no real data currently nests one this deep, so
      // it's left unresolved (silently dropped) rather than guessed at.
      if (!resolveWholeTableInlineTarget(row.inline_hymn_key)) {
        const nested = await resolveInlineHymnVerses(
          schema,
          row.inline_hymn_key,
          isoDate,
          flags,
          rowVisibility,
          row.person_type || overridePersonType,
          row.prayer_type || overridePrayerType,
          inlineTitlePrayerType,
          depth + 1,
        );
        for (const seg of nested.segments) {
          if (seg.kind === "verses") {
            currentVerses.push(...seg.verses);
          } else {
            flushCurrentVerses();
            segments.push(seg);
          }
        }
      }
      continue;
    }

    const isCommentRow = row.person_type === "Comment";
    const effectivePersonType = isCommentRow ? row.person_type : overridePersonType || row.person_type || "";
    const effectivePrayerType = isCommentRow ? row.prayer_type || "" : overridePrayerType || row.prayer_type || "";
    currentVerses.push({
      english: row.english || "",
      coptic: row.coptic || "",
      arabic: row.arabic || "",
      type: resolveEffectiveVerseType(effectivePersonType, effectivePrayerType, inlineTitlePrayerType),
      prayerType: effectivePrayerType || null,
      personRole: resolvePersonRole(effectivePersonType),
      invincibleCoptic: effectivePrayerType === "Invincible Coptic",
      italic: shouldItalicizeAsPreRefrain(effectivePrayerType, inlineTitlePrayerType, effectivePersonType),
      bishopOnly: rowVisibility.bishopOnly,
      priestOnly: rowVisibility.priestOnly,
    });
  }

  flushCurrentVerses();
  return { segments };
}

const INLINE_TITLE_FIELDS = "hymn_key, title_english, title_arabic, prayer_type";

/** Whether an inline-spliced hymn should be treated as its own hymn (own title, own alternation, restarted person-type indicators) hinges entirely on whether it has a row in hymn_titles — same schema search order as fetchInlineHymnVerses. Returns null if no title row exists anywhere. */
async function fetchInlineHymnTitle(schema, hymnKey) {
  for (const lookupSchema of getHymnKeyLookupSchemas(schema)) {
    if (SCHEMAS_WITHOUT_HYMN_TITLES.has(lookupSchema)) continue;
    const { data, error } = await supabase
      .schema(lookupSchema)
      .from("hymn_titles")
      .select(INLINE_TITLE_FIELDS)
      .eq("hymn_key", hymnKey)
      .maybeSingle();
    if (error) throw createReadableSupabaseError(error, `${lookupSchema}.hymn_titles`);
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
