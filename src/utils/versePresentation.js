const NON_ALTERNATING_VERSE_TYPES = new Set([
  "comment",
  "readingReference",
  "refrain",
  "refrainLabel",
  "silentComment",
  "silentPrayer",
]);

export function getEffectiveAlternatingVerseIndex(verses = [], index = 0, bishopPresent = false) {
  let count = -1;

  for (let verseIndex = 0; verseIndex <= index; verseIndex += 1) {
    const verse = verses[verseIndex] || {};
    if ((verse.bishopOnly && !bishopPresent) || (verse.priestOnly && bishopPresent)) continue;
    if (verse.forceWhiteText || verse.prayerType === "White" || verse.prayerType === "Blue") continue;
    if (!NON_ALTERNATING_VERSE_TYPES.has(verse.type)) count += 1;
  }

  return count;
}

export function getAlternatingVerseColorIndex(section = {}, index = 0, bishopPresent = false) {
  if (section.forceWhiteVerses || !section.alternateEvery) return 0;

  const effectiveIndex = getEffectiveAlternatingVerseIndex(section.verses, index, bishopPresent);
  const colorIndex = Math.floor(effectiveIndex / section.alternateEvery) % 2;
  return section.reverseAlternating ? (colorIndex === 0 ? 1 : 0) : colorIndex;
}
