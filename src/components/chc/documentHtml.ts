import { COLORS, SPACING } from '../../constants/theme';

export interface DocumentVerse {
  english: string;
  coptic: string;
  arabic: string;
  type: string;
  prayerType?: string | null;
  /** Antiphonary only: "adam" | "vatos" — which tune this verse is chanted in. */
  tune?: string | null;
}

export interface DocumentSection {
  id: string;
  title: { english: string; arabic: string };
  verses: DocumentVerse[];
  alternateEvery?: number | null;
  forceWhiteVerses?: boolean;
  /** hymn_titles.prayer_type — "Silent Prayer" here means the whole hymn is a silent prayer. */
  titlePrayerType?: string | null;
  /** order table `minimization` column: null = normal, "Minimizable" = collapsible-but-open, "Minimized" = collapsible-and-closed. */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /** order table hymn_key this section was assembled from — used to exclude specific hymns (e.g. "ourFather") from the content selector. */
  hymnKey?: string;
  /** A Subdocument placeholder rendered as a button that opens the nested document in a full-screen modal, instead of being expanded inline. */
  isSubdocumentButton?: boolean;
  subdocumentKey?: string;
  subdocumentTarget?: { schema: string; table: string };
  /** The Antiphonary subdocument gets its own special button/modal (Adam/Vatos tune navigation) rather than the generic subdocument flow. */
  isAntiphonaryButton?: boolean;
  /** Prefetched during the parent document's own hydration, so opening the button's modal is a local render, never a fresh fetch. */
  subdocumentSections?: DocumentSection[];
}

export interface VisibleColumns {
  english: boolean;
  coptic: boolean;
  arabic: boolean;
}

/** A message posted from inside the generated HTML (via `postAction`) up to the host app. */
export interface DocumentAction {
  type: string;
  sectionId?: string;
}

const DEFAULT_VISIBLE_COLUMNS: VisibleColumns = { english: true, coptic: true, arabic: true };

// A non-breaking space, not an empty string: the Coptic column gets a blank
// placeholder label so its text still starts on the same line as the
// English/Arabic columns' label+<br/>+text layout, keeping all three columns
// vertically aligned.
const BLANK_COPTIC_LABEL = ' ';

const RUBRIC: Record<string, { color: string; english: string; arabic: string; coptic: string; class: string }> = {
  priest: { color: COLORS.priest, english: 'Priest:', arabic: 'الكاهن:', coptic: BLANK_COPTIC_LABEL, class: 'priest' },
  bishop: { color: COLORS.bishop, english: 'Bishop:', arabic: 'الأسقف:', coptic: BLANK_COPTIC_LABEL, class: 'bishop' },
  deacon: { color: COLORS.deacon, english: 'Deacon:', arabic: 'الشماس:', coptic: BLANK_COPTIC_LABEL, class: 'deacon' },
  reader: { color: COLORS.reader, english: 'Reader:', arabic: 'القارئ:', coptic: BLANK_COPTIC_LABEL, class: 'reader' },
  people: { color: COLORS.people, english: 'People:', arabic: 'الشعب:', coptic: BLANK_COPTIC_LABEL, class: 'people' },
  refrain: { color: COLORS.refrain, english: 'Refrain:', arabic: 'قرار:', coptic: BLANK_COPTIC_LABEL, class: 'refrain' },
};

/** "Bishop/Priest" resolves to "bishop" or "priest" at render time based on the Bishop Present toggle. */
function resolveRubricKey(verseType: string, bishopPresent: boolean) {
  if (verseType === 'bishopOrPriest') return bishopPresent ? 'bishop' : 'priest';
  return verseType;
}

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
    bishopPresent = false,
    copticRecitedPrayers = true,
  }: {
    copticFontDataUri: string;
    fontSize: number;
    visibleColumns?: VisibleColumns;
    selectText?: boolean;
    displayComments?: boolean;
    displaySilentPrayers?: boolean;
    bishopPresent?: boolean;
    copticRecitedPrayers?: boolean;
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
    .map((section) =>
      renderSection(section, { fontSize, visibleColumns, displayComments, displaySilentPrayers, bishopPresent, copticRecitedPrayers }),
    )
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
      .title-row.has-collapse-button {
        grid-template-columns: 1fr auto;
      }
      .title-text-group {
        display: grid;
      }
      .collapse-button {
        align-items: center;
        background: transparent;
        border: 0;
        cursor: pointer;
        display: flex;
        height: 40px;
        justify-content: center;
        padding: 0;
        width: 40px;
      }
      .collapse-button svg {
        display: block;
      }
      .collapse-button .collapse-plus-bar {
        display: none;
      }
      .collapse-button.is-collapsed .collapse-plus-bar {
        display: block;
      }
      .section.collapsed .section-content {
        display: none !important;
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
        font-family: "Arial", sans-serif !important;
        font-size: ${arabicFontSize}px;
        line-height: ${verseLineHeight}px;
      }
      .centered { text-align: center; }
      .speaker-label.priest { color: ${COLORS.priest}; }
      .speaker-label.bishop { color: ${COLORS.bishop}; }
      .speaker-label.people { color: ${COLORS.people}; }
      .speaker-label.deacon, .speaker-label.reader { color: ${COLORS.deacon}; }
      .speaker-label.refrain { color: ${COLORS.refrain}; font-style: italic;}
      .section-title {
        color: ${COLORS.gold};
        font-family: Georgia, serif;
        font-size: ${sectionTitleFontSize}px;
        font-weight: 700;
        line-height: ${sectionTitleLineHeight}px;
        margin: 0;
      }
      .section-title.arabic {
        font-family: "Arial", sans-serif;
        text-align: right;
      }
      .open-button {
        align-items: center;
        background: ${COLORS.surface};
        border: 1px solid ${COLORS.gold};
        border-radius: 8px;
        color: ${COLORS.white};
        display: flex;
        flex-direction: column;
        gap: ${SPACING.xs}px;
        font-family: Georgia, serif;
        font-size: ${sectionTitleFontSize}px;
        font-weight: 800;
        min-height: 120px;
        justify-content: center;
        margin: 0 auto;
        max-width: 320px;
        width: 72%;
      }
      .open-button .arabic {
        direction: rtl;
        font-family: "Arial", sans-serif;
        // font-size: ${sectionTitleFontSize}px;
        // line-height: ${sectionTitleLineHeight}px;
      }
    </style>
  </head>
  <body>
    <main class="document">${htmlSections}</main>
    <script>
      function postAction(type, payload) {
        var message = JSON.stringify(Object.assign({ type: type }, payload || {}));
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(message);
        } else if (window.parent) {
          window.parent.postMessage(message, '*');
        }
      }
      window.scrollToSection = function (sectionId) {
        var element = document.getElementById(sectionId);
        if (element) {
          var top = element.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0);
          window.scrollTo({ top: Math.max(top - 1, 0), behavior: 'auto' });
        }
      };
      window.scrollToTune = function (tune) {
        var element = document.querySelector('[data-tune="' + tune + '"]');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };
      document.addEventListener('click', function (event) {
        var button = event.target.closest('[data-collapse-button]');
        if (!button) return;
        var section = button.closest('.section');
        if (!section) return;
        var collapsed = section.classList.toggle('collapsed');
        button.classList.toggle('is-collapsed', collapsed);
        button.setAttribute('aria-label', collapsed ? 'Expand section' : 'Collapse section');
      });
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
    bishopPresent: boolean;
    copticRecitedPrayers: boolean;
  },
) {
  const { visibleColumns, displayComments, displaySilentPrayers, bishopPresent } = opts;

  if (section.isSubdocumentButton || section.isAntiphonaryButton) {
    return renderDocumentButtonSection(section, visibleColumns);
  }

  const isCollapsed = Boolean(section.collapsible && section.defaultCollapsed);
  const titleHtml = renderSectionTitle(section, visibleColumns, isCollapsed);

  // Speaker-label suppression (only the first verse of a consecutive same-speaker
  // run shows its "Priest:"/"Deacon:"/"Refrain:"/etc. label) is computed against
  // the full, unfiltered verse list — comments never break a speaker run,
  // whether or not they're currently visible — then verses are filtered for
  // display. Suppression compares *resolved* types so a "Bishop/Priest" verse
  // and a plain "Priest" verse are treated as the same speaker when the
  // Bishop Present toggle is off (both render as "Priest:").
  const suppressFlags = computeSuppressSpeakerLabelFlags(section.verses, bishopPresent);
  const versesHtml = section.verses
    .map((verse, index) => ({ verse, index }))
    .filter(({ verse }) => displayComments || verse.type !== 'comment')
    .filter(({ verse, index }) => {
      // A comment always renders (subject to displayComments above) *except*
      // when it sits inside a silent prayer — there its visibility is tied
      // to displaySilentPrayers too, same as the silent prayer around it.
      if (verse.type === 'comment' && isWithinSilentPrayer(section, index)) return displaySilentPrayers;
      return displaySilentPrayers || verse.type !== 'silentPrayer';
    })
    .map(({ verse, index }) => renderVerse(verse, index, section, suppressFlags[index], opts))
    .join('');

  return `
    <section class="section ${isCollapsed ? 'collapsed' : ''}" id="${escapeAttribute(section.id)}" data-section-id="${escapeAttribute(section.id)}">
      ${titleHtml}
      <div class="section-content">${versesHtml}</div>
    </section>
  `;
}

/** A section titled Silent Prayer overall, or a comment directly adjacent to explicit silentPrayer verses, counts as "within" the silent prayer for visibility purposes. */
function isWithinSilentPrayer(section: DocumentSection, index: number): boolean {
  if (section.titlePrayerType === 'Silent Prayer') return true;
  const verses = section.verses;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (verses[i].type === 'comment') continue;
    return verses[i].type === 'silentPrayer';
  }
  for (let i = index + 1; i < verses.length; i += 1) {
    if (verses[i].type === 'comment') continue;
    return verses[i].type === 'silentPrayer';
  }
  return false;
}

/**
 * A Subdocument or Antiphonary placeholder renders as a full-width card
 * button instead of hymn text. Tapping it posts a message to the host app
 * (`openSubdocument`/`openAntiphonary`) which opens the nested document in a
 * full-screen modal.
 */
function renderDocumentButtonSection(section: DocumentSection, visibleColumns: VisibleColumns) {
  const action = section.isAntiphonaryButton ? 'openAntiphonary' : 'openSubdocument';
  const label = section.title?.english || section.subdocumentKey || 'Open';
  const arabicLabel = section.title?.arabic || '';
  const onclick = `postAction(${JSON.stringify(action)}, { sectionId: ${JSON.stringify(section.id)} })`;

  return `
    <section class="section" id="${escapeAttribute(section.id)}" data-section-id="${escapeAttribute(section.id)}">
      <button class="open-button" onclick="${escapeAttribute(onclick)}">
        ${visibleColumns.english ? `<span>${escapeHtml(label)}</span>` : ''}
        ${visibleColumns.arabic && arabicLabel ? `<span class="arabic">${escapeHtml(arabicLabel)}</span>` : ''}
      </button>
    </section>
  `;
}

/** A verse's speaker label is suppressed if the nearest preceding non-comment verse resolves to the same speaker/type. */
function computeSuppressSpeakerLabelFlags(verses: DocumentVerse[], bishopPresent: boolean): boolean[] {
  const resolvedTypes = verses.map((verse) => resolveRubricKey(verse.type, bishopPresent));
  return verses.map((verse, index) => {
    const resolved = resolvedTypes[index];
    if (!RUBRIC[resolved]) return false;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (verses[i].type === 'comment') continue;
      return resolvedTypes[i] === resolved;
    }
    return false;
  });
}

function renderSectionTitle(section: DocumentSection, visibleColumns: VisibleColumns, isCollapsed: boolean) {
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

  const collapseButtonHtml = section.collapsible
    ? `<button class="collapse-button${isCollapsed ? ' is-collapsed' : ''}" data-collapse-button="${escapeAttribute(section.id)}" aria-label="${isCollapsed ? 'Expand section' : 'Collapse section'}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="${COLORS.gold}" stroke-width="1.5" />
          <line x1="7" y1="12" x2="17" y2="12" stroke="${COLORS.gold}" stroke-width="1.5" stroke-linecap="round" />
          <line class="collapse-plus-bar" x1="12" y1="7" x2="12" y2="17" stroke="${COLORS.gold}" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>`
    : '';
  const titleRowClass = section.collapsible ? 'title-row has-collapse-button' : 'title-row';

  return `
    <div class="${titleRowClass}">
      <div class="title-text-group" style="grid-template-columns: ${gridTemplateColumns};">
        ${titleCells}
      </div>
      ${collapseButtonHtml}
    </div>
  `;
}

function renderVerse(
  verse: DocumentVerse,
  index: number,
  section: DocumentSection,
  suppressSpeakerLabel: boolean,
  {
    visibleColumns,
    bishopPresent,
    copticRecitedPrayers,
  }: { fontSize: number; visibleColumns: VisibleColumns; bishopPresent: boolean; copticRecitedPrayers: boolean },
) {
  const { color, italic } = resolveVerseColor(verse, index, section);
  const rubric = suppressSpeakerLabel ? undefined : RUBRIC[resolveRubricKey(verse.type, bishopPresent)];
  const isCentered = verse.type === 'refrainLabel' || verse.type === 'readingReference';
  // "Coptic Recited Prayers" hides just this verse's Coptic text when the
  // verse is a Recited Prayer — combined with the verse-by-verse column
  // collapse below, that verse's Coptic column disappears for that row only,
  // filling the freed width into whatever columns remain for that verse.
  const copticText = verse.type === 'recitedPrayer' && !copticRecitedPrayers ? '' : verse.coptic || '';

  const languages: { className: string; key: keyof VisibleColumns; text: string; speakerLabel?: string; speakerClass?: string }[] = [
    { className: 'english', key: 'english' as const, text: verse.english || '', speakerLabel: rubric?.english, speakerClass: rubric?.class },
    {
      className: 'coptic',
      key: 'coptic' as const,
      text: copticText,
      speakerLabel: rubric?.coptic,
      speakerClass: rubric?.class,
    },
    {
      className: 'arabic',
      key: 'arabic' as const,
      text: formatArabicDigits(verse.arabic || ''),
      speakerLabel: rubric?.arabic,
      speakerClass: rubric?.class,
    },
    // A language column collapses per verse (not per whole hymn) whenever
    // this specific verse has no text in it and no speaker label to show —
    // e.g. the Orthodox Creed's Recited Prayer verses lose their Coptic
    // column individually while its one Chanted Prayer verse keeps all three.
  ].filter((language) => visibleColumns[language.key] && (Boolean(language.text.trim()) || Boolean(language.speakerLabel)));

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

  const tuneAttribute = verse.tune ? ` data-tune="${escapeAttribute(verse.tune)}"` : '';

  return `<div class="verse-row" style="grid-template-columns: ${gridTemplateColumns};"${tuneAttribute}>${cells}</div>`;
}

/** Verse types that never take part in Single/Double/Quadruple Alternating — kept in sync with resolveVerseColor's early returns below. */
const NON_ALTERNATING_TYPES = new Set(['comment', 'silentPrayer', 'refrain', 'refrainLabel', 'readingReference']);

/**
 * The alternating color parity only ticks for verses that are actually
 * rendered as alternating participants — Refrain/Comment/etc. rows
 * (frequently conditional, e.g. Kiahk-only refrains) don't consume a
 * parity slot, so the sequence seen by the alternation is "verse 1 / verse
 * 2 / verse 3..." regardless of what non-participant rows are interleaved.
 */
function getEffectiveAlternatingIndex(verses: DocumentVerse[], index: number): number {
  let count = -1;
  for (let i = 0; i <= index; i += 1) {
    if (!NON_ALTERNATING_TYPES.has(verses[i].type)) count += 1;
  }
  return count;
}

function resolveVerseColor(verse: DocumentVerse, index: number, section: DocumentSection) {
  if (verse.type === 'comment') return { color: COLORS.comment, italic: true };
  if (verse.type === 'silentPrayer') return { color: COLORS.silent, italic: false };
  if (verse.type === 'refrain' || verse.type === 'refrainLabel') return { color: COLORS.refrain, italic: false };
  if (verse.type === 'readingReference') return { color: COLORS.gold, italic: false };
  if (section.forceWhiteVerses || !section.alternateEvery) return { color: COLORS.white, italic: false };

  const effectiveIndex = getEffectiveAlternatingIndex(section.verses, index);
  const colorIndex = Math.floor(effectiveIndex / section.alternateEvery) % 2;
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
