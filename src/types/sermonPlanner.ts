export const SERMON_HIGHLIGHT_COLORS = ['gold', 'rose', 'blue', 'green'] as const;

export type SermonHighlightColor = (typeof SERMON_HIGHLIGHT_COLORS)[number];
export type SermonHighlightLanguage = 'english' | 'coptic' | 'arabic';

export interface SermonHighlightAnchor {
  sectionId: string;
  verseId: string;
  language: SermonHighlightLanguage;
  startOffset: number;
  endOffset: number;
  quote: string;
}

export interface SermonHighlight extends SermonHighlightAnchor {
  id: string;
  color: SermonHighlightColor;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface SermonPlan {
  version: 1;
  documentKey: string;
  serviceDate: string;
  generalNotes: string;
  highlights: SermonHighlight[];
  updatedAt: string;
}

export interface SermonReadingReference {
  id: string;
  label: string;
  sectionId: string;
  verseId: string;
  kind: 'scripture' | 'synaxarium';
}

