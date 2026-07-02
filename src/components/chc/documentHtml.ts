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
}

/**
 * Builds the trilingual liturgical document HTML shared by the native
 * (react-native-webview) and web (iframe) renderers: section title (English
 * + Arabic, 50% font size) above each hymn, then a borderless table with one
 * row per verse and one column per language, all justified.
 */
export function buildDocumentHtml(
  sections: DocumentSection[],
  { copticFontDataUri, fontSize }: { copticFontDataUri: string; fontSize: number },
) {
  const titleFontSize = Math.max(Math.round(fontSize * 0.5), 13);
  const copticFontSize = Math.round(fontSize * 1.25);
  const arabicFontSize = Math.round(fontSize * 1.15);

  const body = sections.map((section) => renderSection(section, { titleFontSize, fontSize, copticFontSize, arabicFontSize })).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&display=swap");
    @font-face {
      font-family: "CopticCHC";
      src: url("${copticFontDataUri}") format("truetype");
      font-weight: 400;
      font-style: normal;
    }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body {
      margin: 0;
      padding: 0;
      background: ${COLORS.black};
      color: ${COLORS.white};
    }
    body {
      padding: ${SPACING.md}px ${SPACING.md}px ${SPACING.xxl}px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-bottom: ${SPACING.lg}px;
    }
    td {
      border: none;
      vertical-align: top;
      padding: ${SPACING.sm}px ${SPACING.xs}px;
      width: 33.333%;
    }
    .verse-text {
      text-align: justify;
      text-justify: inter-word;
      line-height: 1.5;
      word-wrap: break-word;
    }
    .col-en { font-family: "Cormorant Garamond", Georgia, serif; direction: ltr; }
    .col-co { font-family: "CopticCHC", serif; direction: ltr; }
    .col-ar { font-family: "Amiri", serif; direction: rtl; }
    .section-title-row td { padding-top: ${SPACING.lg}px; padding-bottom: ${SPACING.xs}px; }
    .section-title-en { text-align: left; font-family: "Cormorant Garamond", Georgia, serif; font-weight: 700; color: ${COLORS.gold}; }
    .section-title-ar { text-align: right; font-family: "Amiri", serif; font-weight: 700; color: ${COLORS.gold}; direction: rtl; }
    .rubric { font-weight: 700; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

const RUBRIC: Record<string, { color: string; english: string; arabic: string }> = {
  priest: { color: COLORS.priest, english: 'Priest:', arabic: 'الكاهن:' },
  bishop: { color: COLORS.bishop, english: 'Bishop:', arabic: 'الأسقف:' },
  deacon: { color: COLORS.deacon, english: 'Deacon:', arabic: 'الشماس:' },
  reader: { color: COLORS.reader, english: 'Reader:', arabic: 'القارئ:' },
  people: { color: COLORS.people, english: 'People:', arabic: 'الشعب:' },
};

function renderSection(
  section: DocumentSection,
  opts: { titleFontSize: number; fontSize: number; copticFontSize: number; arabicFontSize: number },
) {
  const { titleFontSize, fontSize, copticFontSize, arabicFontSize } = opts;
  const titleEn = escapeHtml(section.title?.english || '');
  const titleAr = escapeHtml(section.title?.arabic || '');

  const titleRow =
    titleEn || titleAr
      ? `<table><tr class="section-title-row">
           <td class="section-title-en" style="font-size:${titleFontSize}px; width:50%;">${titleEn}</td>
           <td class="section-title-ar" style="font-size:${titleFontSize}px; width:50%;">${titleAr}</td>
         </tr></table>`
      : '';

  const verseRows = section.verses
    .map((verse, index) => renderVerseRow(verse, index, section, { fontSize, copticFontSize, arabicFontSize }))
    .join('\n');

  return `${titleRow}\n<table>${verseRows}</table>`;
}

function renderVerseRow(
  verse: DocumentVerse,
  index: number,
  section: DocumentSection,
  { fontSize, copticFontSize, arabicFontSize }: { fontSize: number; copticFontSize: number; arabicFontSize: number },
) {
  const { color, italic } = resolveVerseColor(verse, index, section);
  const rubric = RUBRIC[verse.type];

  const enHtml = withRubric(escapeHtml(verse.english), rubric?.english, rubric?.color);
  const coHtml = escapeHtml(verse.coptic);
  const arHtml = withRubric(formatArabicDigits(escapeHtml(verse.arabic)), rubric?.arabic, rubric?.color);

  const styleCommon = `color:${color}; font-style:${italic ? 'italic' : 'normal'};`;

  return `<tr>
    <td class="verse-text col-en" style="${styleCommon} font-size:${fontSize}px;">${enHtml}</td>
    <td class="verse-text col-co" style="${styleCommon} font-size:${copticFontSize}px;">${coHtml}</td>
    <td class="verse-text col-ar" style="${styleCommon} font-size:${arabicFontSize}px;">${arHtml}</td>
  </tr>`;
}

function withRubric(text: string, label?: string, color?: string) {
  if (!text) return '';
  if (!label) return text;
  return `<span class="rubric" style="color:${color};">${label}</span><br/>${text}`;
}

function resolveVerseColor(verse: DocumentVerse, index: number, section: DocumentSection) {
  if (verse.type === 'comment') return { color: COLORS.comment, italic: true };
  if (verse.type === 'silentPrayer') return { color: COLORS.silent, italic: false };
  if (verse.type === 'refrain' || verse.type === 'refrainLabel') return { color: COLORS.refrain, italic: false };
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
