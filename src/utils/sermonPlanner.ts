import type { DocumentSection } from '@/components/chc/documentHtml';
import {
  SERMON_HIGHLIGHT_COLORS,
  type SermonHighlight,
  type SermonHighlightAnchor,
  type SermonHighlightColor,
  type SermonHighlightLanguage,
  type SermonPlan,
  type SermonReadingReference,
} from '@/types/sermonPlanner';

const MAX_HIGHLIGHTS = 1000;
const MAX_NOTE_LENGTH = 100_000;

function cleanText(value: unknown, maxLength = MAX_NOTE_LENGTH): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function isHighlightLanguage(value: unknown): value is SermonHighlightLanguage {
  return value === 'english' || value === 'coptic' || value === 'arabic';
}

function isHighlightColor(value: unknown): value is SermonHighlightColor {
  return SERMON_HIGHLIGHT_COLORS.includes(value as SermonHighlightColor);
}

export function isSermonHighlightAnchor(value: unknown): value is SermonHighlightAnchor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const anchor = value as Partial<SermonHighlightAnchor>;
  return typeof anchor.sectionId === 'string'
    && typeof anchor.verseId === 'string'
    && isHighlightLanguage(anchor.language)
    && Number.isInteger(Number(anchor.startOffset))
    && Number.isInteger(Number(anchor.endOffset))
    && Number(anchor.startOffset) >= 0
    && Number(anchor.endOffset) > Number(anchor.startOffset)
    && typeof anchor.quote === 'string';
}

function cleanIsoDate(value: unknown, fallback: string): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

export function normalizeSermonHighlight(value: unknown): SermonHighlight | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const highlight = value as Partial<SermonHighlight>;
  const metadata = value as Partial<Pick<SermonHighlight, 'id' | 'color' | 'note' | 'createdAt' | 'updatedAt'>>;
  const startOffset = Number(highlight.startOffset);
  const endOffset = Number(highlight.endOffset);
  const now = new Date().toISOString();
  if (
    typeof metadata.id !== 'string'
    || !isSermonHighlightAnchor(highlight)
  ) return null;

  return {
    id: metadata.id.slice(0, 120),
    sectionId: highlight.sectionId.slice(0, 512),
    verseId: highlight.verseId.slice(0, 640),
    language: highlight.language,
    startOffset,
    endOffset,
    quote: cleanText(highlight.quote, 5_000),
    color: isHighlightColor(metadata.color) ? metadata.color : 'gold',
    note: cleanText(metadata.note),
    createdAt: cleanIsoDate(metadata.createdAt, now),
    updatedAt: cleanIsoDate(metadata.updatedAt, now),
  };
}

export function emptySermonPlan(documentKey: string, serviceDate: string): SermonPlan {
  return {
    version: 1,
    documentKey,
    serviceDate,
    generalNotes: '',
    highlights: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export function normalizeSermonPlan(
  value: unknown,
  documentKey: string,
  serviceDate: string,
): SermonPlan {
  const fallback = emptySermonPlan(documentKey, serviceDate);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const plan = value as Partial<SermonPlan>;
  return {
    ...fallback,
    generalNotes: cleanText(plan.generalNotes),
    highlights: Array.isArray(plan.highlights)
      ? plan.highlights.map(normalizeSermonHighlight).filter((item): item is SermonHighlight => Boolean(item)).slice(0, MAX_HIGHLIGHTS)
      : [],
    updatedAt: cleanIsoDate(plan.updatedAt, fallback.updatedAt),
  };
}

export function mergeSermonPlans(local: SermonPlan, cloud: SermonPlan): SermonPlan {
  const byId = new Map<string, SermonHighlight>();
  for (const highlight of [...local.highlights, ...cloud.highlights]) {
    const current = byId.get(highlight.id);
    if (!current || Date.parse(highlight.updatedAt) >= Date.parse(current.updatedAt)) {
      byId.set(highlight.id, highlight);
    }
  }
  const localIsNewer = Date.parse(local.updatedAt) >= Date.parse(cloud.updatedAt);
  return {
    version: 1,
    documentKey: local.documentKey,
    serviceDate: local.serviceDate,
    generalNotes: localIsNewer ? local.generalNotes : cloud.generalNotes,
    highlights: [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).slice(0, MAX_HIGHLIGHTS),
    updatedAt: localIsNewer ? local.updatedAt : cloud.updatedAt,
  };
}

export function createSermonHighlight(
  anchor: SermonHighlightAnchor,
  color: SermonHighlightColor = 'gold',
): SermonHighlight {
  const now = new Date().toISOString();
  const randomPart = Math.random().toString(36).slice(2, 10);
  return {
    ...anchor,
    id: `sermon-${Date.now().toString(36)}-${randomPart}`,
    color,
    note: '',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Resolve a highlight's exact source reading without guessing from the most
 * recently seen unrelated hymn. Citation rows and their numbered verses live
 * together in hydrated reading sections; Synaxarium sections carry a group key.
 */
export function getSermonHighlightVerseReferences(sections: DocumentSection[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const section of sections) {
    let citation = section.sourceGroupKey === 'SYNAXARIUM' ? 'Synaxarium' : '';
    for (let index = 0; index < section.verses.length; index += 1) {
      const verse = section.verses[index];
      if (verse.type === 'readingReference') {
        citation = String(verse.english || verse.arabic || '').trim();
      }
      if (!citation) continue;
      const number = String(verse.bibleVerseNumber || '').trim();
      result[`${section.id}::v${index}`] =
        number && verse.type !== 'readingReference' ? `${citation} · v. ${number}` : citation;
    }
  }
  return result;
}

export function getSermonPlannerReferences(sections: DocumentSection[]): SermonReadingReference[] {
  const references: SermonReadingReference[] = [];
  const seen = new Set<string>();
  let synaxariumAdded = false;

  sections.forEach((section) => {
    if (section.sourceGroupKey === 'SYNAXARIUM' && !synaxariumAdded) {
      synaxariumAdded = true;
      references.push({
        id: `synaxarium:${section.id}`,
        label: 'Synaxarium',
        sectionId: section.id,
        verseId: `${section.id}::v0`,
        kind: 'synaxarium',
      });
    }

    section.verses.forEach((verse, index) => {
      if (verse.type !== 'readingReference') return;
      const label = String(verse.english || verse.arabic || '').trim();
      const signature = label.toLocaleLowerCase();
      if (!label || seen.has(signature)) return;
      seen.add(signature);
      references.push({
        id: `scripture:${section.id}:${index}`,
        label,
        sectionId: section.id,
        verseId: `${section.id}::v${index}`,
        kind: 'scripture',
      });
    });
  });

  return references;
}
