// ─── Shared speaker/rubric resolution ──────────────────────────────────────
// Single source of truth for "who is speaking this verse" logic, used by
// BOTH the WebView document renderer (documentHtml.ts) and the Slideshow
// renderer (SlideshowContainer.js/VerseBlock.js) — they must never diverge,
// since slideshow mode is only a different *display* of the same document,
// not a different set of rules.

/** "Bishop/Priest" (verse.type === "bishopOrPriest") resolves to "bishop" or "priest" at render time based on the Bishop Present toggle; every other type passes through unchanged. */
export function resolveRubricKey(verseType, bishopPresent) {
  if (verseType === "bishopOrPriest") return bishopPresent ? "bishop" : "priest";
  return verseType;
}

/**
 * The type to use for rubric label lookup AND person-type-indicator
 * tracking — verse.personRole when the verse has one, verse.type otherwise.
 * A Silent/Recited Prayer or Refrain line's `type` collapses to that prayer
 * type (silentPrayer/recitedPrayer/refrain), losing which speaker said
 * it — personRole (set independently in hymnLibrary.js from person_type
 * alone) preserves that, so e.g. a silently-prayed line said by the priest
 * still shows/tracks as "Priest:", just rendered in the silent-prayer color.
 */
export function resolveVerseRubricType(verse, bishopPresent) {
  return resolveRubricKey(verse.personRole || verse.type, bishopPresent);
}

/**
 * Whether a verse should be drawn in the People colour instead of its normal
 * body colour — the one definition both renderers use, so documentHtml.ts and
 * VerseBlock.js cannot drift apart on it.
 *
 * Two gates, both required:
 *
 *  - `allSpeakerLabelsSuppressed` is the Agpeya book's whole-document "hide
 *    every speaker indicator" state (its Hours are prayed by one person, so a
 *    speaker role has no one to address). NOT a verse's own suppression flag,
 *    which is also set throughout the liturgies whenever a line repeats the
 *    previous speaker — keying on that would tint People lines in every
 *    service.
 *  - The hymn is titled "Litanies". Every People line in the Agpeya today
 *    already sits in one of the ten Litanies hymns (38 lines, none outside),
 *    so this changes nothing currently visible — it is here so a People line
 *    added to some other hymn later doesn't silently start colouring itself.
 */
export function shouldUsePeopleLineColor(section, verse, bishopPresent, allSpeakerLabelsSuppressed) {
  if (!allSpeakerLabelsSuppressed) return false;
  if (!/^litanies$/i.test(String(section?.title?.english || "").trim())) return false;
  return resolveVerseRubricType(verse, bishopPresent) === "people";
}

/** Verse types that get a speaker-rubric label/indicator at all (Refrain included — "Refrain:" is a rubric label like any other speaker). */
const RUBRIC_TYPES = new Set(["priest", "bishop", "deacon", "reader", "people", "refrain"]);

export function isRubricType(resolvedType) {
  return RUBRIC_TYPES.has(resolvedType);
}

/**
 * Whole-document version of speaker-label suppression: walks every section
 * in document order (not each section in isolation), so a person-type
 * indicator only re-shows where the reader would actually perceive a new
 * hymn starting.
 *
 * The caller must pass only the sections/verses that are actually DISPLAYED
 * — already filtered for displayComments/displaySilentPrayers/bishopPresent
 * — since this function decides suppression purely among what's visible, it
 * never accounts for hidden verses/sections.
 *
 * Rules:
 *  - The very first non-comment verse in the whole document always shows.
 *  - Walking forward, a verse's indicator is suppressed unless its resolved
 *    type differs from the most recently encountered non-comment verse's
 *    resolved type — comments (including silentComment) are entirely
 *    transparent to this tracking, skipped in either direction.
 *  - Crossing into a new section: if that section has a displayed title,
 *    the cycle restarts — its first verse always shows, regardless of what
 *    came right before. If the section has no displayed title, it reads as
 *    a seamless continuation of the previous section — the same "only if it
 *    changed" comparison carries straight through the boundary. The one
 *    exception: a section immediately following a Minimizable/Minimized
 *    hymn always restarts too, titled or not — a minimized hymn reads as
 *    optional/collapsible content, so whatever comes after it needs its own
 *    fresh indicator rather than silently inheriting the last speaker shown
 *    before the (possibly-collapsed) minimized hymn.
 *
 * Returns a Map from verse object to a suppress boolean, keyed by object
 * reference — verse objects are stable within one render pass, so callers
 * look their own verses up directly rather than by index.
 *
 * `forceSuppressAll`, when true, skips the whole walk and marks every verse
 * suppressed unconditionally — the Agpeya's own person-type indicators
 * (Priest:/Deacon:/etc.) are hidden by default (the Hours are meant to be
 * prayed by one person, so a speaker-role indicator has no audience to
 * address), but reappear when an Hour is opened as a subdocument from within
 * a liturgical service (Vespers/Matins/Liturgy), where those roles are real
 * again — see ServiceDocument.tsx's `suppressAllSpeakerLabels`.
 */
export function computeGlobalSuppressSpeakerLabelFlags(sections, bishopPresent, forceSuppressAll = false) {
  const suppressMap = new Map();
  let lastType = null;
  let lastSection = null;

  if (forceSuppressAll) {
    for (const section of sections) {
      for (const verse of section.verses || []) {
        suppressMap.set(verse, true);
      }
    }
    return suppressMap;
  }

  for (const section of sections) {
    const sectionHasTitle = Boolean(section.title?.english || section.title?.arabic);
    const verses = section.verses || [];

    for (const verse of verses) {
      if (verse.type === "comment" || verse.type === "silentComment") continue;

      const resolvedType = resolveVerseRubricType(verse, bishopPresent);
      const isFirstOfSection = lastSection !== section;
      const previousHymnWasMinimizable = isFirstOfSection && Boolean(lastSection?.collapsible);

      let suppress;
      if (isFirstOfSection && (sectionHasTitle || previousHymnWasMinimizable)) {
        suppress = false;
      } else if (lastType === null) {
        suppress = false;
      } else {
        suppress = resolvedType === lastType;
      }
      if (!isRubricType(resolvedType)) suppress = true;

      suppressMap.set(verse, suppress);
      lastType = resolvedType;
      lastSection = section;
    }
  }

  return suppressMap;
}
