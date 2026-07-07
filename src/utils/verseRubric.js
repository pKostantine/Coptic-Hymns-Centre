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

/** Verse types that get a speaker-rubric label/indicator at all (Refrain included — "Refrain:" is a rubric label like any other speaker). */
const RUBRIC_TYPES = new Set(["priest", "bishop", "deacon", "reader", "people", "refrain"]);

export function isRubricType(resolvedType) {
  return RUBRIC_TYPES.has(resolvedType);
}

/**
 * For each verse in a hymn (a single section — this always operates within
 * one hymn's own verse list, so it naturally "restarts" at every new hymn),
 * decide whether its speaker-type indicator should be suppressed: shown only
 * on the first verse of a run of the same resolved type, comments never
 * counting as a "previous verse" for this purpose (skipped entirely, in
 * either direction of the scan). Matches the person-type-indicator algorithm
 * verbatim in both the scrolling WebView reader and slideshow mode.
 */
export function computeSuppressSpeakerLabelFlags(verses, bishopPresent) {
  const resolvedTypes = verses.map((verse) => resolveRubricKey(verse.type, bishopPresent));
  return verses.map((verse, index) => {
    if ((verse.bishopOnly && !bishopPresent) || (verse.priestOnly && bishopPresent)) return false;
    const resolved = resolvedTypes[index];
    if (!isRubricType(resolved)) return false;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (verses[i].type === "comment") continue;
      if ((verses[i].bishopOnly && !bishopPresent) || (verses[i].priestOnly && bishopPresent)) continue;
      return resolvedTypes[i] === resolved;
    }
    return false;
  });
}
