import { COLORS, SPACING } from '../../constants/theme';

export interface DocumentVerse {
  english: string;
  coptic: string;
  arabic: string;
  type: string;
  prayerType?: string | null;
}

export interface DocumentSection {
  id: string;
  title: { english: string; arabic: string };
  verses: DocumentVerse[];
  alternateEvery?: number | null;
  forceWhiteVerses?: boolean;
  /** hymn_titles.prayer_type — "Silent Prayer" here means the whole hymn is a silent prayer. */
  titlePrayerType?: string | null;
}

export interface VisibleColumns {
  english: boolean;
  coptic: boolean;
  arabic: boolean;
}

const DEFAULT_VISIBLE_COLUMNS: VisibleColumns = { english: true, coptic: true, arabic: true };

const RUBRIC: Record<string, { color: string; english: string; arabic: string; class: string }> = {
  priest: { color: COLORS.priest, english: 'Priest:', arabic: 'الكاهن:', class: 'priest' },
  bishop: { color: COLORS.bishop, english: 'Bishop:', arabic: 'الأسقف:', class: 'bishop' },
  deacon: { color: COLORS.deacon, english: 'Deacon:', arabic: 'الشماس:', class: 'deacon' },
  reader: { color: COLORS.reader, english: 'Reader:', arabic: 'القارئ:', class: 'reader' },
  people: { color: COLORS.people, english: 'People:', arabic: 'الشعب:', class: 'people' },
};

/**
 * Builds the trilingual liturgical document HTML shared by the native
 * (react-native-webview) and web (iframe) renderers. Ported 1:1 from the
 * predecessor app's `buildHymnDocumentHtml`/`buildHtmlSectionTitle`/
 * `buildHtmlVerse` (HymnDisplayScreen.js): a CSS-grid title row + one
 * CSS-grid verse row per verse, with as many columns as visible languages.
 */
export function buildDocumentHtml(
  sections: DocumentSection[],
  {
    copticFontDataUri,
    fontSize,
    visibleColumns = DEFAULT_VISIBLE_COLUMNS,
    selectText = false,
    displayComments = false,
    displaySilentPrayers = false,
  }: {
    copticFontDataUri: string;
    fontSize: number;
    visibleColumns?: VisibleColumns;
    selectText?: boolean;
    displayComments?: boolean;
    displaySilentPrayers?: boolean;
  },
) {
  const sectionTitleFontSize = Math.max(Math.round(fontSize * 0.5), 14);
  const sectionTitleLineHeight = Math.max(Math.round(fontSize * 0.62), 18);
  const copticFontSize = Math.round(fontSize * 1.25);
  const arabicFontSize = Math.round(fontSize * 1.15);
  const verseLineHeight = Math.round(fontSize * 1.25);

  const visibleSections = sections.filter(
    (section) => displaySilentPrayers || section.titlePrayerType !== 'Silent Prayer',
  );
  const htmlSections = visibleSections
    .map((section) => renderSection(section, { fontSize, visibleColumns, displayComments, displaySilentPrayers }))
    .join('');

  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&display=swap");
      @font-face {
        font-family: "CopticCHC";
        src: url("${copticFontDataUri}") format("truetype");
        font-weight: 400;
        font-style: normal;
      }
      html, body {
        background: ${COLORS.black};
        color: ${COLORS.white};
        margin: 0;
        padding: 0;
        width: 100%;
        -webkit-text-size-adjust: 100%;
      }
      body {
        font-family: Georgia, serif;
        overflow-x: hidden;
        -webkit-user-select: ${selectText ? 'text' : 'none'};
        user-select: ${selectText ? 'text' : 'none'};
      }
      .document {
        box-sizing: border-box;
        padding: ${SPACING.md}px ${SPACING.md}px ${SPACING.xl}px;
        max-width: 100vw;
      }
      .section {
        box-sizing: border-box;
        margin-bottom: ${SPACING.xl}px;
        width: 100%;
      }
      .title-row, .verse-row {
        box-sizing: border-box;
        display: grid;
        width: 100%;
      }
      .title-row {
        align-items: center;
        grid-template-columns: 1fr;
      }
      .title-text-group {
        display: grid;
      }
      .cell, .title-cell {
        box-sizing: border-box;
        min-width: 0;
        overflow-wrap: break-word;
        padding: ${SPACING.sm}px ${SPACING.xs}px;
      }
      .verse-text {
        font-size: ${fontSize}px;
        letter-spacing: 0 !important;
        line-height: ${verseLineHeight}px;
        margin: 0;
        overflow-wrap: break-word;
        text-align: justify;
        text-justify: inter-word;
      }
      .english { font-family: Georgia, serif !important; }
      .coptic {
        font-family: CopticCHC, Georgia, serif !important;
        font-size: ${copticFontSize}px;
        line-height: ${verseLineHeight}px;
      }
      .arabic {
        direction: rtl;
        font-family: "Amiri", serif !important;
        font-size: ${arabicFontSize}px;
        line-height: ${verseLineHeight}px;
      }
      .centered { text-align: center; }
      .speaker-label.priest { color: ${COLORS.priest}; }
      .speaker-label.bishop { color: ${COLORS.bishop}; }
      .speaker-label.people { color: ${COLORS.people}; }
      .speaker-label.deacon, .speaker-label.reader { color: ${COLORS.deacon}; }
      .section-title {
        color: ${COLORS.gold};
        font-family: Georgia, serif;
        font-size: ${sectionTitleFontSize}px;
        font-weight: 700;
        line-height: ${sectionTitleLineHeight}px;
        margin: 0;
      }
      .section-title.arabic {
        font-family: "Amiri", serif;
        text-align: right;
      }
    </style>
  </head>
  <body>
    <main class="document">${htmlSections}</main>
    <script>
      window.scrollToSection = function (sectionId) {
        var element = document.getElementById(sectionId);
        if (element) {
          var top = element.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0);
          window.scrollTo({ top: Math.max(top - 1, 0), behavior: 'auto' });
        }
      };
    </script>
  </body>
</html>`;
}

function renderSection(
  section: DocumentSection,
  opts: {
    fontSize: number;
    visibleColumns: VisibleColumns;
    displayComments: boolean;
    displaySilentPrayers: boolean;
  },
) {
  const { visibleColumns, displayComments, displaySilentPrayers } = opts;
  const titleHtml = renderSectionTitle(section, visibleColumns);

  // Speaker-label suppression (only the first verse of a consecutive same-speaker
  // run shows its "Priest:"/"Deacon:"/etc. label) is computed against the full,
  // unfiltered verse list — comments never break a speaker run, whether or not
  // they're currently visible — then verses are filtered for display.
  const suppressFlags = computeSuppressSpeakerLabelFlags(section.verses);
  const versesHtml = section.verses
    .map((verse, index) => ({ verse, index }))
    .filter(({ verse }) => displayComments || verse.type !== 'comment')
    .filter(({ verse }) => displaySilentPrayers || verse.type !== 'silentPrayer')
    .map(({ verse, index }) => renderVerse(verse, index, section, suppressFlags[index], opts))
    .join('');

  return `
    <section class="section" id="${escapeAttribute(section.id)}" data-section-id="${escapeAttribute(section.id)}">
      ${titleHtml}
      <div class="section-content">${versesHtml}</div>
    </section>
  `;
}

/** A verse's speaker label is suppressed if the nearest preceding non-comment verse shares its type. */
function computeSuppressSpeakerLabelFlags(verses: DocumentVerse[]): boolean[] {
  return verses.map((verse, index) => {
    if (!RUBRIC[verse.type]) return false;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (verses[i].type === 'comment') continue;
      return verses[i].type === verse.type;
    }
    return false;
  });
}

function renderSectionTitle(section: DocumentSection, visibleColumns: VisibleColumns) {
  const titleEn = section.title?.english || '';
  const titleAr = section.title?.arabic || '';
  if (!titleEn && !titleAr) return '';

  const languages: { align: string; className: string; text: string }[] = [];
  const showEnglish = visibleColumns.english;
  const showArabic = visibleColumns.arabic && Boolean(titleAr);

  if (showEnglish) {
    languages.push({ align: showArabic ? 'left' : 'center', className: 'english', text: titleEn });
  }
  if (showArabic) {
    languages.push({ align: showEnglish ? 'right' : 'center', className: 'arabic', text: formatArabicDigits(titleAr) });
  }
  if (!languages.length) {
    languages.push({ align: 'center', className: 'english', text: titleEn });
  }

  const gridTemplateColumns = `repeat(${Math.max(languages.length, 1)}, minmax(0, 1fr))`;
  const titleCells = languages
    .map(
      (language) => `
        <div class="title-cell">
          <p class="section-title ${language.className}" style="text-align: ${language.align};">${escapeHtml(language.text)}</p>
        </div>
      `,
    )
    .join('');

  return `
    <div class="title-row">
      <div class="title-text-group" style="grid-template-columns: ${gridTemplateColumns};">
        ${titleCells}
      </div>
    </div>
  `;
}

function renderVerse(
  verse: DocumentVerse,
  index: number,
  section: DocumentSection,
  suppressSpeakerLabel: boolean,
  { visibleColumns }: { fontSize: number; visibleColumns: VisibleColumns },
) {
  const { color, italic } = resolveVerseColor(verse, index, section);
  const rubric = suppressSpeakerLabel ? undefined : RUBRIC[verse.type];
  const isCentered = verse.type === 'refrainLabel' || verse.type === 'readingReference';

  const languages: { className: string; key: keyof VisibleColumns; text: string; speakerLabel?: string; speakerClass?: string }[] = [
    { className: 'english', key: 'english' as const, text: verse.english || '', speakerLabel: rubric?.english, speakerClass: rubric?.class },
    { className: 'coptic', key: 'coptic' as const, text: verse.coptic || '' },
    {
      className: 'arabic',
      key: 'arabic' as const,
      text: formatArabicDigits(verse.arabic || ''),
      speakerLabel: rubric?.arabic,
      speakerClass: rubric?.class,
    },
  ].filter((language) => visibleColumns[language.key]);

  const gridTemplateColumns = `repeat(${Math.max(languages.length, 1)}, minmax(0, 1fr))`;
  const textStyle = `color:${color}; font-style:${italic ? 'italic' : 'normal'};`;

  const cells = languages
    .map(
      (language) => `
        <div class="cell">
          <p class="verse-text ${language.className} ${isCentered ? 'centered' : ''}" style="${textStyle}">${
            language.speakerLabel ? `<span class="speaker-label ${language.speakerClass}">${escapeHtml(language.speakerLabel)}</span><br/>` : ''
          }${escapeHtml(language.text)}</p>
        </div>
      `,
    )
    .join('');

  return `<div class="verse-row" style="grid-template-columns: ${gridTemplateColumns};">${cells}</div>`;
}

function resolveVerseColor(verse: DocumentVerse, index: number, section: DocumentSection) {
  if (verse.type === 'comment') return { color: COLORS.comment, italic: true };
  if (verse.type === 'silentPrayer') return { color: COLORS.silent, italic: false };
  if (verse.type === 'refrain' || verse.type === 'refrainLabel') return { color: COLORS.refrain, italic: false };
  if (verse.type === 'readingReference') return { color: COLORS.gold, italic: false };
  if (section.forceWhiteVerses || !section.alternateEvery) return { color: COLORS.white, italic: false };

  const colorIndex = Math.floor(index / section.alternateEvery) % 2;
  return { color: colorIndex === 0 ? COLORS.white : COLORS.rowBlue, italic: false };
}

const EASTERN_ARABIC_DIGITS: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩',
};

function formatArabicDigits(text: string) {
  return String(text || '').replace(/\d/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit);
}

function escapeHtml(text: string) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

function escapeAttribute(text: string) {
  return String(text || '').replace(/"/g, '&quot;');
}
