/**
 * Shared visual metrics for the scrolling document reader and Slideshow Mode.
 *
 * Slideshow is a paginated presentation of the same document, not a separate
 * visual theme. Keep all typography/control sizing that exists in both
 * renderers here so they cannot silently drift apart again.
 */
export function getDocumentVisualMetrics(fontSize = 18) {
  const safeFontSize = Math.max(Number(fontSize) || 18, 1);
  const sectionTitleFontSize = Math.max(Math.round(safeFontSize * 0.5), 14);
  const sectionTitleLineHeight = Math.max(Math.round(safeFontSize * 0.62), 18);
  const openButtonFontSize = Math.max(Math.round(sectionTitleFontSize * 1.3), 18);
  const openButtonLineHeight = Math.max(Math.round(sectionTitleLineHeight * 1.3), 24);

  return {
    arabicFontSize: Math.round(safeFontSize * 1.15),
    arabicVerseLineHeight: Math.round(safeFontSize * 1.6),
    copticFontSize: Math.round(safeFontSize * 1.25),
    openButtonFontSize,
    openButtonLineHeight,
    sectionTitleFontSize,
    sectionTitleLineHeight,
    speakerFontSize: safeFontSize,
    speakerLineHeight: Math.round(safeFontSize * 1.3),
    verseFontSize: safeFontSize,
    verseLineHeight: Math.round(safeFontSize * 1.3),
  };
}

export const DOCUMENT_CONTROL_GEOMETRY = Object.freeze({
  subdocument: Object.freeze({
    borderRadius: 12,
    gap: 8,
    maxWidth: 420,
    minHeight: 168,
    paddingHorizontal: 16,
    paddingVertical: 24,
    widthPercent: 84,
  }),
  hyperlink: Object.freeze({
    borderRadius: 12,
    gap: 16,
    maxWidth: 420,
    minHeight: 72,
    paddingHorizontal: 24,
    paddingVertical: 16,
    widthPercent: 84,
  }),
  gospelRite: Object.freeze({
    borderRadius: 999,
    dotSize: 10,
    gap: 8,
    marginBottom: 24,
    paddingHorizontal: 24,
    paddingVertical: 8,
  }),
});
