import { formatArabicDigits } from '../../utils/displayText';
import { DocumentSection } from './documentHtml';

/**
 * What a section is called in a list of this document's contents: the content
 * selector's rows, and the header of a subdocument opened from one. Both need
 * the same answer -- a reading carries no title of its own, and what names it
 * for a reader is the citation it resolves to on the day.
 */

const READING_REFERENCE_SELECTOR_TITLES = new Set(['pauline epistle', 'catholic epistle', 'praxis']);
const READING_REFERENCE_SELECTOR_KEY_PATTERN = /^(PAULINE_EPISTLE|CATHOLIC_EPISTLE|PRAXIS)(_|$)/;
const READING_REFERENCE_SELECTOR_KEY_TITLES: Record<string, { english: string; arabic: string }> = {
  PAULINE_EPISTLE: { english: 'Pauline Epistle', arabic: 'البولس' },
  CATHOLIC_EPISTLE: { english: 'Catholic Epistle', arabic: 'الكاثوليكون' },
  PRAXIS: { english: 'Praxis', arabic: 'الإبركسيس' },
};

function normalizeSelectorTitle(value?: string) {
  return String(value || '')
    .trim()
    .replace(/^the\s+/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function shouldAppendReadingReference(section: DocumentSection, readingReference?: { english?: string; arabic?: string }) {
  if (!readingReference?.english && !readingReference?.arabic) return false;
  const key = String(section.hymnKey || (section as DocumentSection & { hymn_key?: string }).hymn_key || '').toUpperCase();
  return READING_REFERENCE_SELECTOR_TITLES.has(normalizeSelectorTitle(section.title?.english)) ||
    READING_REFERENCE_SELECTOR_KEY_PATTERN.test(key);
}

function getReadingReferenceSelectorBaseTitle(section: DocumentSection) {
  if (section.title?.english || section.title?.arabic) return section.title;
  const key = String(section.hymnKey || (section as DocumentSection & { hymn_key?: string }).hymn_key || '').toUpperCase();
  const match = key.match(READING_REFERENCE_SELECTOR_KEY_PATTERN);
  return match ? READING_REFERENCE_SELECTOR_KEY_TITLES[match[1]] : null;
}

function appendReadingReference(title: string, reference?: string) {
  const cleanTitle = String(title || '').trim();
  const cleanReference = String(reference || '').trim();
  if (!cleanTitle || !cleanReference) return cleanTitle;
  if (cleanTitle.includes(`(${cleanReference})`)) return cleanTitle;
  return `${cleanTitle} (${cleanReference})`;
}

export function getSectionSelectorTitle(section: DocumentSection): { english: string; arabic: string } {
  const title = resolveSectionSelectorTitle(section);
  // Arabic carries its own numerals wherever the app writes Arabic, so a
  // reading listed as متى 11:11-19 belongs here as متى ١١:١١-١٩. Applied to the
  // title once, rather than at each place one is drawn, because every one of
  // those falls back to the Arabic when a section has no English title.
  return { english: title?.english || '', arabic: formatArabicDigits(title?.arabic || '') };
}

function resolveSectionSelectorTitle(section: DocumentSection): { english: string; arabic: string } {
  const readingReference = section.verses.find((verse) => verse.type === 'readingReference');
  const baseTitle = getReadingReferenceSelectorBaseTitle(section);
  if (baseTitle) {
    if (!shouldAppendReadingReference(section, readingReference)) return section.title;
    return {
      english: appendReadingReference(baseTitle.english || '', readingReference?.english),
      arabic: appendReadingReference(baseTitle.arabic || '', readingReference?.arabic),
    };
  }
  return {
    english: readingReference?.english || '',
    arabic: readingReference?.arabic || '',
  };
}
