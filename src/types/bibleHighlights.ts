import { SERMON_HIGHLIGHT_COLORS, type SermonHighlightColor } from './sermonPlanner';

/** The Bible reader's columns, each highlightable on its own. */
export const BIBLE_HIGHLIGHT_LANGUAGES = [
  'english', 'englishNkjv', 'englishFromCoptic', 'coptic', 'greek', 'arabic', 'arabicFromCoptic', 'french',
] as const;

export type BibleHighlightLanguage = (typeof BIBLE_HIGHLIGHT_LANGUAGES)[number];

/** Same four colours as the Sermon Planner's highlights. */
export const BIBLE_HIGHLIGHT_COLORS = SERMON_HIGHLIGHT_COLORS;
export type BibleHighlightColor = SermonHighlightColor;

export interface BibleHighlightAnchor {
  /** "chapter:verse" in the stored (Septuagint) numbering, so a Psalm highlight holds in either numbering. */
  verseId: string;
  language: BibleHighlightLanguage;
  startOffset: number;
  endOffset: number;
  quote: string;
}

export interface BibleHighlight extends BibleHighlightAnchor {
  id: string;
  color: BibleHighlightColor;
  createdAt: string;
  updatedAt: string;
}

/** One book's highlights — the unit stored on the device and synced to bible_highlights. */
export interface BibleHighlightBook {
  version: 1;
  bookKey: string;
  highlights: BibleHighlight[];
  /** id -> when it was removed, so a removal on one device isn't undone by another's older copy. */
  highlightDeletions: Record<string, string>;
  updatedAt: string;
}
