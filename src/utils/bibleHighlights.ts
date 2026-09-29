import {
  BIBLE_HIGHLIGHT_COLORS,
  BIBLE_HIGHLIGHT_LANGUAGES,
  type BibleHighlight,
  type BibleHighlightAnchor,
  type BibleHighlightBook,
  type BibleHighlightColor,
  type BibleHighlightLanguage,
} from '@/types/bibleHighlights';

// A whole book's worth (Psalms is 151 chapters), well within the table's cap.
const MAX_HIGHLIGHTS = 2000;
const MAX_HIGHLIGHT_DELETIONS = 2000;

function isLanguage(value: unknown): value is BibleHighlightLanguage {
  return BIBLE_HIGHLIGHT_LANGUAGES.includes(value as BibleHighlightLanguage);
}

export function isBibleHighlightColor(value: unknown): value is BibleHighlightColor {
  return BIBLE_HIGHLIGHT_COLORS.includes(value as BibleHighlightColor);
}

function cleanIsoDate(value: unknown, fallback: string): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

export function isBibleHighlightAnchor(value: unknown): value is BibleHighlightAnchor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const anchor = value as Partial<BibleHighlightAnchor>;
  return typeof anchor.verseId === 'string'
    && anchor.verseId.length > 0
    && isLanguage(anchor.language)
    && Number.isInteger(Number(anchor.startOffset))
    && Number.isInteger(Number(anchor.endOffset))
    && Number(anchor.startOffset) >= 0
    && Number(anchor.endOffset) > Number(anchor.startOffset)
    && typeof anchor.quote === 'string';
}

export function normalizeBibleHighlight(value: unknown): BibleHighlight | null {
  if (!isBibleHighlightAnchor(value)) return null;
  const highlight = value as Partial<BibleHighlight> & BibleHighlightAnchor;
  if (typeof highlight.id !== 'string' || !highlight.id) return null;
  const now = new Date().toISOString();
  return {
    id: highlight.id.slice(0, 120),
    verseId: highlight.verseId.slice(0, 64),
    language: highlight.language,
    startOffset: Number(highlight.startOffset),
    endOffset: Number(highlight.endOffset),
    quote: highlight.quote.slice(0, 5_000),
    color: isBibleHighlightColor(highlight.color) ? highlight.color : 'gold',
    createdAt: cleanIsoDate(highlight.createdAt, now),
    updatedAt: cleanIsoDate(highlight.updatedAt, now),
  };
}

function normalizeDeletions(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([id, deletedAt]) => id.length > 0 && id.length <= 120 && typeof deletedAt === 'string' && !Number.isNaN(Date.parse(deletedAt)))
      .sort(([, left], [, right]) => Date.parse(String(right)) - Date.parse(String(left)))
      .slice(0, MAX_HIGHLIGHT_DELETIONS),
  );
}

export function emptyBibleHighlightBook(bookKey: string): BibleHighlightBook {
  return { version: 1, bookKey, highlights: [], highlightDeletions: {}, updatedAt: new Date(0).toISOString() };
}

export function normalizeBibleHighlightBook(value: unknown, bookKey: string): BibleHighlightBook {
  const fallback = emptyBibleHighlightBook(bookKey);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const book = value as Partial<BibleHighlightBook>;
  return {
    ...fallback,
    highlights: Array.isArray(book.highlights)
      ? book.highlights.map(normalizeBibleHighlight).filter((item): item is BibleHighlight => Boolean(item)).slice(0, MAX_HIGHLIGHTS)
      : [],
    highlightDeletions: normalizeDeletions(book.highlightDeletions),
    updatedAt: cleanIsoDate(book.updatedAt, fallback.updatedAt),
  };
}

/** Newest copy of each highlight wins; a removal wins over any copy older than it — the same rules as the Sermon Planner's notes. */
export function mergeBibleHighlightBooks(local: BibleHighlightBook, cloud: BibleHighlightBook): BibleHighlightBook {
  const byId = new Map<string, BibleHighlight>();
  for (const highlight of [...local.highlights, ...cloud.highlights]) {
    const current = byId.get(highlight.id);
    if (!current || Date.parse(highlight.updatedAt) >= Date.parse(current.updatedAt)) byId.set(highlight.id, highlight);
  }
  const highlightDeletions: Record<string, string> = {};
  for (const deletions of [cloud.highlightDeletions, local.highlightDeletions]) {
    for (const [id, deletedAt] of Object.entries(deletions)) {
      const current = highlightDeletions[id];
      if (!current || Date.parse(deletedAt) >= Date.parse(current)) highlightDeletions[id] = deletedAt;
    }
  }
  return {
    version: 1,
    bookKey: local.bookKey,
    highlights: [...byId.values()]
      .filter((highlight) => {
        const deletedAt = highlightDeletions[highlight.id];
        return !deletedAt || Date.parse(highlight.updatedAt) > Date.parse(deletedAt);
      })
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .slice(0, MAX_HIGHLIGHTS),
    highlightDeletions: normalizeDeletions(highlightDeletions),
    updatedAt: Date.parse(local.updatedAt) >= Date.parse(cloud.updatedAt) ? local.updatedAt : cloud.updatedAt,
  };
}

export function createBibleHighlight(anchor: BibleHighlightAnchor, color: BibleHighlightColor = 'gold'): BibleHighlight {
  const now = new Date().toISOString();
  return {
    verseId: anchor.verseId,
    language: anchor.language,
    startOffset: Number(anchor.startOffset),
    endOffset: Number(anchor.endOffset),
    quote: anchor.quote,
    id: `bible-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    color,
    createdAt: now,
    updatedAt: now,
  };
}
