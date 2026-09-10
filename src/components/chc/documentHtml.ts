import { COLORS, SPACING } from '../../constants/theme';
import type { AppLanguage as AppTitleLanguage } from '../../utils/preferencesStorage';
import { computeGlobalSuppressSpeakerLabelFlags, resolveVerseRubricType } from '../../utils/verseRubric';

export interface DocumentVerse {
  english: string;
  coptic: string;
  arabic: string;
  type: string;
  prayerType?: string | null;
  /** The speaker role from person_type alone, independent of `type` — see resolveVerseRubricType. Preserves "who said this" even when `type` collapses to silentPrayer/recitedPrayer/refrain. */
  personRole?: string | null;
  /** Antiphonary only: "adam" | "vatos" — which tune this verse is chanted in. */
  tune?: string | null;
  /** This verse's own condition only passes when Bishop Present is on/off respectively — evaluated both ways at hydration time so toggling Bishop Present never needs a re-fetch. */
  bishopOnly?: boolean;
  priestOnly?: boolean;
  /** Same dual-evaluation, but for the in-document "Coptic Gospel Rite" toggle — only set on verses spliced in from GOSPEL_RITE. */
  copticGospelRiteOnly?: boolean;
  nonCopticGospelRiteOnly?: boolean;
  /** Readings only: "chapter:verse" gold badge prefixed before this verse's text in every visible language column. */
  bibleVerseNumber?: string;
  /** Pre-Refrain lines only — forces italic on top of whatever color/role the verse naturally resolves to, without changing that role. */
  italic?: boolean;
  /** Forces this verse to render white and excludes it from the alternating parity count in both renderers — used for hymns like vocKyrieEleison that sit outside the enclosing section's alternating cadence. */
  forceWhiteText?: boolean;
  /** prayer_type "Invincible Coptic" (hymnLibrary sets this alongside prayerType): this Coptic renders whatever the Coptic language toggles say, and — when the verse carries no translation of its own — spans the row instead of taking a column. */
  invincibleCoptic?: boolean;
}

export interface DocumentSection {
  id: string;
  title: { english: string; arabic: string };
  verses: DocumentVerse[];
  alternateEvery?: number | null;
  forceWhiteVerses?: boolean;
  /** "Reverse Alternating": same cadence as Single Alternating, but starts on the blue verse instead of white. */
  reverseAlternating?: boolean;
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
  /** A Hyperlink placeholder: unlike a Subdocument (a modal over this document) it LEAVES this document for another service entirely, so it carries no prefetched content — only the key naming its destination. */
  isHyperlinkButton?: boolean;
  hyperlinkKey?: string;
  /** Prefetched during the parent document's own hydration, so opening the button's modal is a local render, never a fresh fetch. */
  subdocumentSections?: DocumentSection[];
  /** Set on the first section spliced in from a GOSPEL_RITE inline import — renders the "Coptic Gospel Rite" toggle button immediately before it. */
  startsGospelRiteToggle?: boolean;
  /** Same Bishop Present dual-evaluation as DocumentVerse, applied to the section's own placement condition. */
  bishopOnly?: boolean;
  priestOnly?: boolean;
  /** Same dual-evaluation, but for the in-document "Coptic Gospel Rite" toggle — only set on sections spliced in from GOSPEL_RITE. */
  copticGospelRiteOnly?: boolean;
  nonCopticGospelRiteOnly?: boolean;
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
  verseId?: string | null;
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
    appLanguage = 'en',
    selectText = false,
    displayComments = false,
    displaySilentPrayers = false,
    bishopPresent = false,
    copticRecitedPrayers = true,
    copticGospelRite = false,
    suppressAllSpeakerLabels = false,
  }: {
    copticFontDataUri: string;
    fontSize: number;
    visibleColumns?: VisibleColumns;
    /** Drives ALL titles (section titles + Subdocument/Antiphonary open-button labels) — falls back to whichever language has text when the selected one is missing for a given section. Independent of visibleColumns, which governs verse body text only. */
    appLanguage?: AppTitleLanguage;
    selectText?: boolean;
    displayComments?: boolean;
    displaySilentPrayers?: boolean;
    bishopPresent?: boolean;
    copticRecitedPrayers?: boolean;
    copticGospelRite?: boolean;
    /** Forces every verse's person-type indicator hidden, regardless of the normal per-document rules — the Agpeya's own top-level documents (see ServiceDocument.tsx). */
    suppressAllSpeakerLabels?: boolean;
  },
) {
  const sectionTitleFontSize = Math.max(Math.round(fontSize * 0.5), 14);
  const sectionTitleLineHeight = Math.max(Math.round(fontSize * 0.62), 18);
  const openButtonFontSize = Math.max(Math.round(sectionTitleFontSize * 1.3), 18);
  const openButtonLineHeight = Math.max(Math.round(sectionTitleLineHeight * 1.3), 24);
  const copticFontSize = Math.round(fontSize * 1.25);
  const arabicFontSize = Math.round(fontSize * 1.15);
  const verseLineHeight = Math.round(fontSize * 1.3);
  const arabicVerseLineHeight = Math.round(fontSize * 1.6);
  const effectiveSelectText = Boolean(selectText);

  const visibleSections = sections.filter((section) => {
    if (!displaySilentPrayers && section.titlePrayerType === 'Silent Prayer') return false;
    if (section.bishopOnly && !bishopPresent) return false;
    if (section.priestOnly && bishopPresent) return false;
    if (section.copticGospelRiteOnly && !copticGospelRite) return false;
    if (section.nonCopticGospelRiteOnly && copticGospelRite) return false;
    return true;
  });
  // Speaker-label suppression is a whole-document decision (see
  // computeGlobalSuppressSpeakerLabelFlags) — computed once, up front, over
  // exactly what's displayed, then looked up per verse during rendering.
  const displayFilterOpts = { displayComments, displaySilentPrayers, bishopPresent, copticGospelRite };
  const displayedSectionsForSuppress = visibleSections.map((section) => ({
    ...section,
    verses: getDisplayedVerseEntries(section, displayFilterOpts).map(({ verse }) => verse),
  }));
  const suppressMap = computeGlobalSuppressSpeakerLabelFlags(displayedSectionsForSuppress, bishopPresent, suppressAllSpeakerLabels);
  const htmlSections = visibleSections
    .map((section) =>
      renderSection(section, {
        fontSize,
        visibleColumns,
        appLanguage,
        displayComments,
        displaySilentPrayers,
        bishopPresent,
        copticRecitedPrayers,
        copticGospelRite,
        suppressMap,
      }),
    )
    .join('');

  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
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
        overscroll-behavior-x: none;
        overflow-x: hidden;
        touch-action: pan-y;
        -webkit-user-select: ${effectiveSelectText ? 'text' : 'none'};
        user-select: ${effectiveSelectText ? 'text' : 'none'};
      }
      ${
        effectiveSelectText
          ? ''
          : `body, body * {
        -webkit-touch-callout: none !important;
        -webkit-user-select: none !important;
        user-select: none !important;
      }`
      }
      .document {
        box-sizing: border-box;
        padding: ${SPACING.md}px 0 0;
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
        position: relative;
      }
      .title-row.has-collapse-button {
        grid-template-columns: 1fr;
      }
      .title-text-group {
        display: grid;
        width: 100%;
      }
      .collapse-button {
        align-items: center;
        background: transparent;
        border: 0;
        cursor: pointer;
        display: flex;
        height: 40px;
        justify-content: center;
        left: 0;
        padding: 0;
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
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
      body.selecting-english .cell:not([data-language="english"]),
      body.selecting-english .cell:not([data-language="english"]) *,
      body.selecting-english .title-cell:not([data-language="english"]),
      body.selecting-english .title-cell:not([data-language="english"]) *,
      body.selecting-coptic .cell:not([data-language="coptic"]),
      body.selecting-coptic .cell:not([data-language="coptic"]) *,
      body.selecting-coptic .title-cell:not([data-language="coptic"]),
      body.selecting-coptic .title-cell:not([data-language="coptic"]) *,
      body.selecting-arabic .cell:not([data-language="arabic"]),
      body.selecting-arabic .cell:not([data-language="arabic"]) *,
      body.selecting-arabic .title-cell:not([data-language="arabic"]),
      body.selecting-arabic .title-cell:not([data-language="arabic"]) * {
        -webkit-user-select: none !important;
        user-select: none !important;
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
        // font-family: "Arial", sans-serif !important;
        font-family: Georgia, serif !important;
        font-size: ${arabicFontSize}px;
        line-height: ${arabicVerseLineHeight}px;
      }
      .centered { text-align: center; }
      .speaker-label.priest { color: ${COLORS.priest}; }
      .speaker-label.bishop { color: ${COLORS.bishop}; }
      .speaker-label.people { color: ${COLORS.people}; }
      .speaker-label.deacon, .speaker-label.reader { color: ${COLORS.deacon}; }
      .speaker-label.refrain { color: ${COLORS.refrain}; font-style: italic;}
      .bible-verse-number { color: ${COLORS.gold}; font-weight: 700; }
      .bible-verse-number-gap {
        display: inline-block;
        width: 0.25em;
      }
      .metropolitan { color: ${COLORS.metropolitanBrackets}; }
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
      .section-title.silent-prayer {
        color: ${COLORS.silentTitle};
        font-style: italic;
      }
      .open-button {
        align-items: center;
        background: ${COLORS.subdocSoft};
        border: 1px solid ${COLORS.subdocLine};
        border-radius: 12px;
        color: ${COLORS.subdoc};
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: ${SPACING.sm}px;
        font-family: Georgia, serif;
        font-size: ${openButtonFontSize}px;
        font-weight: 800;
        min-height: 168px;
        justify-content: center;
        margin: 0 auto;
        max-width: 420px;
        padding: ${SPACING.lg}px ${SPACING.md}px;
        width: 84%;
      }
      .open-button .arabic {
        direction: rtl;
        font-family: "Arial", sans-serif;
        font-size: ${openButtonFontSize}px;
        line-height: ${openButtonLineHeight}px;
      }
      .hyperlink-button {
        align-items: center;
        background: ${COLORS.linkSoft};
        border: 1px solid ${COLORS.linkLine};
        border-radius: 12px;
        color: ${COLORS.link};
        cursor: pointer;
        display: flex;
        font-family: Georgia, serif;
        font-size: ${Math.max(Math.round(sectionTitleFontSize * 1.1), 16)}px;
        font-weight: 800;
        gap: ${SPACING.md}px;
        justify-content: center;
        margin: ${SPACING.md}px auto;
        max-width: 420px;
        min-height: 72px;
        padding: ${SPACING.md}px ${SPACING.lg}px;
        width: 84%;
      }
      .hyperlink-button .hyperlink-label {
        text-align: center;
      }
      .hyperlink-button .hyperlink-label.arabic {
        direction: rtl;
        font-family: "Arial", sans-serif;
      }
      .hyperlink-button .hyperlink-arrow {
        align-items: center;
        border: 1.5px solid ${COLORS.link};
        border-radius: 999px;
        display: inline-flex;
        flex-shrink: 0;
        font-family: -apple-system, "Segoe UI", sans-serif;
        font-size: 16px;
        height: 28px;
        justify-content: center;
        line-height: 1;
        width: 28px;
      }
      .gospel-rite-toggle-row {
        align-items: center;
        display: flex;
        justify-content: center;
        margin: 0 0 ${SPACING.lg}px;
      }
      .gospel-rite-toggle {
        align-items: center;
        background: ${COLORS.surface};
        border: 1px solid ${COLORS.gold};
        border-radius: 999px;
        color: ${COLORS.white};
        cursor: pointer;
        display: flex;
        font-family: Georgia, serif;
        font-size: ${sectionTitleFontSize}px;
        font-weight: 700;
        gap: ${SPACING.sm}px;
        padding: ${SPACING.sm}px ${SPACING.lg}px;
      }
      .gospel-rite-toggle.is-on {
        background: ${COLORS.gold};
        color: ${COLORS.black};
      }
      .gospel-rite-toggle-dot {
        background: currentColor;
        border-radius: 999px;
        height: 10px;
        width: 10px;
        opacity: 0.4;
      }
      .gospel-rite-toggle.is-on .gospel-rite-toggle-dot {
        opacity: 1;
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
      // Takes either one section id or, for a settings-change restore, an
      // ordered list of fallbacks (see sectionRestoreCandidates): the
      // section the reader was on may be exactly the one the changed setting
      // just hid, so scroll to the first candidate that still rendered and
      // leave the page at the top only if none of them did.
      window.scrollToSection = function (sectionId) {
        var candidates = Array.isArray(sectionId) ? sectionId : [sectionId];
        for (var i = 0; i < candidates.length; i += 1) {
          var element = document.getElementById(candidates[i]);
          if (element) {
            var top = element.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0);
            window.scrollTo({ top: Math.max(top - 1, 0), behavior: 'auto' });
            return true;
          }
        }
        return false;
      };
      window.scrollToVerse = function (verseId) {
        var element = document.querySelector('[data-verse-id="' + verseId + '"]');
        if (!element) return false;
        var top = element.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0);
        window.scrollTo({ top: Math.max(top - 1, 0), behavior: 'auto' });
        return true;
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
      (function () {
        var languages = ['english', 'coptic', 'arabic'];
        var selectingLanguage = null;
        var selectTextEnabled = ${JSON.stringify(effectiveSelectText)};
        if (!selectTextEnabled) {
          var clearDisabledSelection = function () {
            var selection = window.getSelection && window.getSelection();
            if (selection && selection.rangeCount) selection.removeAllRanges();
          };
          document.addEventListener('selectstart', function (event) {
            event.preventDefault();
            clearDisabledSelection();
          }, true);
          document.addEventListener('selectionchange', clearDisabledSelection, true);
          document.addEventListener('copy', function (event) {
            event.preventDefault();
            if (event.clipboardData) event.clipboardData.setData('text/plain', '');
            clearDisabledSelection();
          }, true);
          return;
        }
        function closestLanguageCell(node) {
          var element = node && node.nodeType === 1 ? node : node && node.parentElement;
          return element && element.closest ? element.closest('.cell[data-language], .title-cell[data-language]') : null;
        }
        function setSelectingLanguage(language) {
          languages.forEach(function (item) { document.body.classList.remove('selecting-' + item); });
          selectingLanguage = languages.indexOf(language) >= 0 ? language : null;
          if (selectingLanguage) document.body.classList.add('selecting-' + selectingLanguage);
        }
        function inferLanguage(node) {
          var cell = closestLanguageCell(node);
          return cell ? cell.getAttribute('data-language') : null;
        }
        function onSelectionStart(event) {
          setSelectingLanguage(inferLanguage(event.target));
        }
        function hasSelection() {
          var selection = window.getSelection && window.getSelection();
          return Boolean(selection && selection.rangeCount && !selection.isCollapsed);
        }
        function normalizeSelectionText(text) {
          return String(text || '')
            .replace(/[ \\t\\f\\v]+/g, ' ')
            .replace(/ *\\n */g, '\\n')
            .replace(/\\n{3,}/g, '\\n\\n')
            .trim();
        }
        function fragmentText(fragment) {
          var container = document.createElement('div');
          container.appendChild(fragment);
          Array.prototype.slice.call(container.querySelectorAll('.bible-verse-number')).forEach(function (numberNode) {
            var numberText = normalizeSelectionText(numberNode.textContent || '');
            numberNode.textContent = numberText ? numberText + ' ' : '';
          });
          Array.prototype.slice.call(container.querySelectorAll('br')).forEach(function (br) {
            br.parentNode.replaceChild(document.createTextNode('\\n'), br);
          });
          return normalizeSelectionText(container.textContent || '');
        }
        function rangeIntersectsNode(range, node) {
          try {
            return range.intersectsNode(node);
          } catch (error) {
            return false;
          }
        }
        function fullTextForNode(node) {
          var nodeRange = document.createRange();
          nodeRange.selectNodeContents(node);
          return fragmentText(nodeRange.cloneContents());
        }
        // Copy is grouped by hymn, then by language within it: every language
        // of one section, then the next section. It used to collect a single
        // language across the WHOLE document, so selecting one hymn gave you
        // its English followed by the next hymn's English, never its own
        // Coptic and Arabic.
        //
        // Rows are the unit, not cells. The layout is row-major (each
        // .verse-row holds one cell per language side by side), so a drag down
        // the English column ends inside the last row's English cell — the
        // Coptic and Arabic cells of that row sit after the range end and
        // clipping them would silently drop the hymn's last line in every
        // other language. Taking each touched row's cells in full keeps the
        // languages the same length as each other.
        function selectedTextBySection(selection) {
          if (!selection || !selection.rangeCount) return '';
          var range = selection.getRangeAt(0);
          var blocks = [];
          Array.prototype.slice.call(document.querySelectorAll('.section')).forEach(function (section) {
            if (!rangeIntersectsNode(range, section)) return;
            var rows = Array.prototype.slice
              .call(section.querySelectorAll('.title-row, .verse-row'))
              .filter(function (row) { return rangeIntersectsNode(range, row); });
            if (!rows.length) return;
            var perLanguage = [];
            languages.forEach(function (language) {
              var lines = [];
              rows.forEach(function (row) {
                var cell = row.querySelector('.cell[data-language="' + language + '"], .title-cell[data-language="' + language + '"]');
                if (!cell) return;
                var text = fullTextForNode(cell);
                if (text) lines.push(text);
              });
              if (lines.length) perLanguage.push(lines.join('\\n'));
            });
            if (perLanguage.length) blocks.push(perLanguage.join('\\n\\n'));
          });
          return blocks.join('\\n\\n');
        }
        document.addEventListener('pointerdown', onSelectionStart, true);
        document.addEventListener('mousedown', onSelectionStart, true);
        document.addEventListener('touchstart', onSelectionStart, true);
        document.addEventListener('selectionchange', function () {
          var selection = window.getSelection && window.getSelection();
          if (!selection || !selection.rangeCount || selection.isCollapsed) {
            setSelectingLanguage(null);
            return;
          }
          if (!selectingLanguage) {
            setSelectingLanguage(inferLanguage(selection.anchorNode) || inferLanguage(selection.focusNode));
          }
        });
        document.addEventListener('copy', function (event) {
          var selection = window.getSelection && window.getSelection();
          var text = selectedTextBySection(selection);
          if (!text || !event.clipboardData) return;
          event.clipboardData.setData('text/plain', text);
          event.preventDefault();
        });
      })();
      (function () {
        // Reports whichever section AND verse currently straddle a fixed
        // "reading line" near the top of the viewport, so the host app
        // always knows where the user actually is — used to keep the
        // content selector scrolled to the right spot, to jump back to the
        // same place after a settings change forces this document to
        // reload, and to re-anchor scroll position (at verse granularity)
        // after a rotation/resize reflows the layout without reloading.
        var sections = Array.prototype.slice.call(document.querySelectorAll('.section[data-section-id]'));
        var verseRows = Array.prototype.slice.call(document.querySelectorAll('.verse-row[data-verse-id]'));
        var lastReportedSection = null;
        var lastReportedVerse = null;
        var pending = false;
        function findCurrent(list, threshold) {
          if (!list.length) return null;
          var current = list[0];
          for (var i = 0; i < list.length; i += 1) {
            if (list[i].getBoundingClientRect().top <= threshold) {
              current = list[i];
            } else {
              break;
            }
          }
          return current;
        }
        function reportCurrentSection() {
          pending = false;
          var threshold = 96;
          var currentSection = findCurrent(sections, threshold);
          var currentVerse = findCurrent(verseRows, threshold);
          var sectionId = currentSection && currentSection.getAttribute('data-section-id');
          var verseId = currentVerse && currentVerse.getAttribute('data-verse-id');
          if (sectionId && (sectionId !== lastReportedSection || verseId !== lastReportedVerse)) {
            lastReportedSection = sectionId;
            lastReportedVerse = verseId;
            postAction('currentSection', { sectionId: sectionId, verseId: verseId || null });
          }
        }
        function scheduleReport() {
          if (pending) return;
          pending = true;
          requestAnimationFrame(reportCurrentSection);
        }
        window.addEventListener('scroll', scheduleReport, { passive: true });
        scheduleReport();
      })();
      (function () {
        var startX = null, startY = null, fired = false, lastPostAt = 0;
        function getSelectorEdge() {
          return Math.min(240, Math.max(128, window.innerWidth * 0.18));
        }
        function preventEvent(event) {
          if (event && event.cancelable && event.preventDefault) event.preventDefault();
        }
        function postEdgeAction(type) {
          var now = Date.now();
          if (now - lastPostAt < 350) return;
          lastPostAt = now;
          postAction(type);
        }
        function onStart(x, y) { startX = x; startY = y; fired = false; }
        function onMove(x, y, event) {
          if (startX === null || fired) return;
          var dx = x - startX, dy = y - startY;
          var absDx = Math.abs(dx), absDy = Math.abs(dy);
          var selectorEdge = Math.min(240, Math.max(128, window.innerWidth * 0.18));
          var startedInLeftEdge = startX < 56;
          var startedInRightEdge = startX > window.innerWidth - selectorEdge;
          if (absDx > 12 && absDx > absDy * 1.2) preventEvent(event);
          if (absDy >= absDx * 0.6) return;
          if (startedInLeftEdge && dx > 60) {
            fired = true;
            preventEvent(event);
            postEdgeAction('swipeBack');
            return;
          }
          if (startedInRightEdge && dx < -36) {
            fired = true;
            preventEvent(event);
            postEdgeAction('openSelector');
          }
        }
        function onEnd(x, y, event) {
          onMove(x, y, event);
          onCancel();
        }
        function onCancel() { startX = startY = null; }
        function isEdgeStart(x) {
          var selectorEdge = getSelectorEdge();
          return x < 56 || x > window.innerWidth - selectorEdge;
        }
        document.addEventListener('pointerdown', function (e) { if (isEdgeStart(e.clientX)) onStart(e.clientX, e.clientY); });
        document.addEventListener('pointermove', function (e) { onMove(e.clientX, e.clientY, e); });
        document.addEventListener('pointerup', function (e) { onEnd(e.clientX, e.clientY); });
        document.addEventListener('pointercancel', onCancel);
        document.addEventListener('touchstart', function (e) { var t = e.touches[0]; if (isEdgeStart(t.clientX)) onStart(t.clientX, t.clientY); }, { passive: true });
        document.addEventListener('touchmove', function (e) { var t = e.touches[0]; onMove(t.clientX, t.clientY, e); }, { passive: false });
        document.addEventListener('touchend', function (e) { var t = e.changedTouches[0]; onEnd(t.clientX, t.clientY, e); }, { passive: false });
        document.addEventListener('touchcancel', onCancel);
      })();
    </script>
  </body>
</html>`;
}

/** The verse/original-index pairs that will actually render for this section, given the current display preferences — shared by the global suppress-flag pass and the real render pass so they never disagree about what's displayed. */
function getDisplayedVerseEntries(
  section: DocumentSection,
  {
    displayComments,
    displaySilentPrayers,
    bishopPresent,
    copticGospelRite = false,
  }: { displayComments: boolean; displaySilentPrayers: boolean; bishopPresent: boolean; copticGospelRite?: boolean },
): { verse: DocumentVerse; index: number }[] {
  return section.verses
    .map((verse, index) => ({ verse, index }))
    .filter(({ verse }) => !(verse.bishopOnly && !bishopPresent) && !(verse.priestOnly && bishopPresent))
    .filter(
      ({ verse }) =>
        !(verse.copticGospelRiteOnly && !copticGospelRite) && !(verse.nonCopticGospelRiteOnly && copticGospelRite),
    )
    .filter(({ verse, index }) => {
      // A row explicitly marked both Comment and Silent Prayer (type
      // 'silentComment') needs BOTH toggles on — it's not "a comment" or "a
      // silent prayer" alone, it's both at once.
      if (verse.type === 'silentComment') return displayComments && displaySilentPrayers;
      if (verse.type === 'silentPrayer') return displaySilentPrayers;
      if (verse.type === 'comment') {
        // A comment always renders (subject to displayComments) *except*
        // when it sits inside a silent prayer — there its visibility is tied
        // to displaySilentPrayers too, same as the silent prayer around it.
        if (isWithinSilentPrayer(section, index)) return displayComments && displaySilentPrayers;
        return displayComments;
      }
      return true;
    });
}

function renderSection(
  section: DocumentSection,
  opts: {
    fontSize: number;
    visibleColumns: VisibleColumns;
    appLanguage: AppTitleLanguage;
    displayComments: boolean;
    displaySilentPrayers: boolean;
    bishopPresent: boolean;
    copticRecitedPrayers: boolean;
    copticGospelRite: boolean;
    suppressMap: Map<DocumentVerse, boolean>;
  },
) {
  const { appLanguage, displayComments, displaySilentPrayers, bishopPresent, copticGospelRite, suppressMap } = opts;
  const toggleHtml = section.startsGospelRiteToggle ? renderGospelRiteToggle(copticGospelRite, section.id) : '';

  if (section.isHyperlinkButton) {
    return toggleHtml + renderHyperlinkButtonSection(section, appLanguage);
  }

  if (section.isSubdocumentButton || section.isAntiphonaryButton) {
    return toggleHtml + renderDocumentButtonSection(section, appLanguage);
  }

  const isCollapsed = Boolean(section.collapsible && section.defaultCollapsed);
  const titleHtml = renderSectionTitle(section, appLanguage, isCollapsed);

  const versesHtml = getDisplayedVerseEntries(section, { displayComments, displaySilentPrayers, bishopPresent, copticGospelRite })
    .map(({ verse, index }) => renderVerse(verse, index, section, suppressMap.get(verse) ?? false, opts))
    .join('');

  return `
    ${toggleHtml}
    <section class="section ${isCollapsed ? 'collapsed' : ''}" id="${escapeAttribute(section.id)}" data-section-id="${escapeAttribute(section.id)}">
      ${titleHtml}
      <div class="section-content">${versesHtml}</div>
    </section>
  `;
}

/**
 * The "Coptic Gospel Rite" toggle button always rendered immediately before
 * GOSPEL_RITE's spliced-in content (see startsGospelRiteToggle). Tapping it
 * posts `toggleCopticGospelRite`, which the host app answers by flipping the
 * CopticGospelRite condition flag — this regenerates the WebView's whole
 * HTML (its content depends on the toggle), which reloads the view and
 * resets scroll to the top, so the button's own section id rides along in
 * the payload for the host app to scroll back to once the reload settles.
 */
function renderGospelRiteToggle(isOn: boolean, sectionId: string) {
  const onclick = `postAction('toggleCopticGospelRite', ${JSON.stringify({ sectionId })})`;
  return `
    <div class="gospel-rite-toggle-row">
      <button class="gospel-rite-toggle${isOn ? ' is-on' : ''}" onclick="${escapeAttribute(onclick)}">
        <span class="gospel-rite-toggle-dot"></span>
        <span>Coptic Gospel Rite</span>
      </button>
    </div>
  `;
}

/** A section titled Silent Prayer overall, or a comment directly adjacent to explicit silentPrayer/silentComment verses, counts as "within" the silent prayer for visibility purposes. */
function isWithinSilentPrayer(section: DocumentSection, index: number): boolean {
  if (section.titlePrayerType === 'Silent Prayer') return true;
  const verses = section.verses;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (verses[i].type === 'comment') continue;
    return verses[i].type === 'silentPrayer' || verses[i].type === 'silentComment';
  }
  for (let i = index + 1; i < verses.length; i += 1) {
    if (verses[i].type === 'comment') continue;
    return verses[i].type === 'silentPrayer' || verses[i].type === 'silentComment';
  }
  return false;
}

/**
 * A Subdocument or Antiphonary placeholder renders as a full-width card
 * button instead of hymn text. Tapping it posts a message to the host app
 * (`openSubdocument`/`openAntiphonary`) which opens the nested document in a
 * full-screen modal.
 */
function renderDocumentButtonSection(section: DocumentSection, appLanguage: AppTitleLanguage) {
  const action = section.isAntiphonaryButton ? 'openAntiphonary' : 'openSubdocument';
  const titleEn = section.title?.english || section.subdocumentKey || 'Open';
  const titleAr = section.title?.arabic || '';
  const showArabic = appLanguage === 'ar' ? Boolean(titleAr) : !titleEn && Boolean(titleAr);
  const onclick = `postAction(${JSON.stringify(action)}, { sectionId: ${JSON.stringify(section.id)} })`;

  return `
    <section class="section" id="${escapeAttribute(section.id)}" data-section-id="${escapeAttribute(section.id)}">
      <button class="open-button" onclick="${escapeAttribute(onclick)}">
        ${!showArabic ? `<span>${escapeHtml(titleEn || titleAr)}</span>` : ''}
        ${showArabic ? `<span class="arabic">${escapeHtml(titleAr)}</span>` : ''}
      </button>
    </section>
  `;
}

/**
 * A Hyperlink placeholder renders as a green bar with an arrow badge —
 * deliberately unlike the tall gold Subdocument card, because it does
 * something different: tapping it leaves this document for another service
 * rather than opening a modal over it. Green is reserved for that "you are
 * about to go somewhere else" meaning, and the shorter bar keeps it reading as
 * a transition at the end of a service rather than as content of its own.
 */
function renderHyperlinkButtonSection(section: DocumentSection, appLanguage: AppTitleLanguage) {
  const titleEn = section.title?.english || section.hyperlinkKey || 'Continue';
  const titleAr = section.title?.arabic || '';
  const showArabic = appLanguage === 'ar' ? Boolean(titleAr) : !titleEn && Boolean(titleAr);
  const label = showArabic ? titleAr : titleEn || titleAr;
  const onclick = `postAction('openHyperlink', { sectionId: ${JSON.stringify(section.id)} })`;

  return `
    <section class="section" id="${escapeAttribute(section.id)}" data-section-id="${escapeAttribute(section.id)}">
      <button class="hyperlink-button" onclick="${escapeAttribute(onclick)}">
        <span class="hyperlink-label${showArabic ? ' arabic' : ''}">${escapeHtml(label)}</span>
        <span class="hyperlink-arrow" aria-hidden="true">&#8594;</span>
      </button>
    </section>
  `;
}

function renderSectionTitle(section: DocumentSection, appLanguage: AppTitleLanguage, isCollapsed: boolean) {
  const titleEn = section.title?.english || '';
  const titleAr = section.title?.arabic || '';
  if (!titleEn && !titleAr) return '';

  // A title always shows exactly one language, driven by the App Language
  // setting — falling back to whichever language actually has text for this
  // specific section if the selected one doesn't (e.g. Arabic selected but
  // this hymn has no Arabic title).
  const showArabic = appLanguage === 'ar' ? Boolean(titleAr) : !titleEn && Boolean(titleAr);
  const languages: { align: string; className: string; text: string }[] = showArabic
    ? [{ align: 'center', className: 'arabic', text: formatArabicDigits(titleAr) }]
    : [{ align: 'center', className: 'english', text: titleEn || titleAr }];

  // A hymn whose own title row declares "Silent Prayer" reads visually
  // distinct from a normal title — dimmer/italic — since none of its
  // content is meant to be spoken aloud.
  const isSilentPrayerHymn = section.titlePrayerType === 'Silent Prayer';

  const gridTemplateColumns = `repeat(${Math.max(languages.length, 1)}, minmax(0, 1fr))`;
  const titleCells = languages
    .map(
      (language) => `
        <div class="title-cell" data-language="${escapeAttribute(language.className)}">
          <p class="section-title ${language.className}${isSilentPrayerHymn ? ' silent-prayer' : ''}" style="text-align: ${language.align};">${escapeHtml(language.text)}</p>
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
  const { color, italic } = resolveVerseColor(verse, index, section, bishopPresent);
  const rubric = suppressSpeakerLabel ? undefined : RUBRIC[resolveVerseRubricType(verse, bishopPresent)];
  const isCentered = verse.type === 'refrainLabel' || verse.type === 'readingReference';
  // "Invincible Coptic" only means "this Coptic must always render" -- some
  // rows tagged this way still carry a real English/Arabic translation. Those
  // lay out in the normal columns, Coptic above Coptic, with any speaker
  // label in its normal per-language spot, same as everywhere else -- never
  // centered just because the row happens to be Invincible Coptic. Only when
  // there is no translation to justify against does the Coptic center, and
  // then it takes the whole row rather than a column (copticStandsAlone).
  const hasTranslationText = Boolean((verse.english || '').trim()) || Boolean((verse.arabic || '').trim());
  const isInvincibleCoptic = verse.prayerType === 'Invincible Coptic' || Boolean(verse.invincibleCoptic);
  const isCopticCentered = isCentered || (isInvincibleCoptic && !hasTranslationText);
  // "Coptic Recited Prayers" hides just this verse's Coptic text when the
  // verse is a Recited Prayer or Silent Prayer (spoken/prayed silently, both
  // conventionally read from Coptic-transliterated-into-English/Arabic
  // rather than the Coptic script itself) — combined with the verse-by-verse
  // column collapse below, that verse's Coptic column disappears for that
  // row only, filling the freed width into whatever columns remain.
  // Invincible means invincible: this Coptic survives BOTH Coptic toggles —
  // the language column and Coptic Recited Prayers. That is the whole point
  // of the flag and what the slideshow renderer has always done (forceCoptic
  // in VerseBlock); the reader instead dropped these lines outright with
  // Coptic switched off, which is the one state they exist to survive.
  const copticHiddenByToggle =
    (verse.type === 'recitedPrayer' || verse.type === 'silentPrayer' || verse.type === 'silentComment') &&
    !copticRecitedPrayers &&
    !isInvincibleCoptic;
  const copticText = copticHiddenByToggle ? '' : formatCopticNumbers(verse.coptic || '');

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
    // That "keep it if there's a speaker label" exception only makes sense
    // for English/Arabic, where the label is real, distinguishing text.
    // RUBRIC's coptic field is always a non-empty BLANK_COPTIC_LABEL filler
    // (pure vertical-alignment spacing for when Coptic *is* shown alongside
    // it) — never a reason on its own to keep the column, or every verse
    // with a speaker label but no actual Coptic text in the DB (common in
    // e.g. gospel_rite's Reader-labeled verses) would reserve a blank
    // column. So Coptic collapses whenever it's hidden by the toggle above
    // OR simply has no text, full stop; English/Arabic keep the older
    // label-justifies-the-column behavior.
  ].filter((language) => {
    if (language.key === 'coptic') {
      if (copticHiddenByToggle) return false;
      return (visibleColumns.coptic || isInvincibleCoptic) && Boolean(language.text.trim());
    }
    return visibleColumns[language.key] && (Boolean(language.text.trim()) || Boolean(language.speakerLabel));
  });

  // An Invincible Coptic line carrying no translation of its own isn't a
  // Coptic *column* — there is nothing in the other columns for it to sit
  // beside and be read against. Giving it one anyway wedged it into a third
  // (or a half) of the row and wrapped it in there, reading as text pushed
  // off to one side rather than a line of its own. It spans the whole row
  // instead, centered on the row rather than on a cell. The speaker labels
  // are genuinely per-language, so they keep the grid row above it — which
  // is where this line already sat, just narrower.
  const copticStandsAlone =
    isInvincibleCoptic && !hasTranslationText && languages.some((language) => language.key === 'coptic');
  const columnLanguages = copticStandsAlone ? languages.filter((language) => language.key !== 'coptic') : languages;
  const gridTemplateColumns = `repeat(${Math.max(columnLanguages.length, 1)}, minmax(0, 1fr))`;
  const textStyle = `color:${color}; font-style:${italic ? 'italic' : 'normal'};`;

  const renderCell = (language: (typeof languages)[number], spansRow: boolean) => {
    const verseNumberText = verse.bibleVerseNumber
      ? language.key === 'arabic'
        ? formatArabicDigits(verse.bibleVerseNumber)
        : language.key === 'coptic'
          ? formatCopticNumbers(verse.bibleVerseNumber)
          : verse.bibleVerseNumber
      : '';
    const centered = language.key === 'coptic' ? isCopticCentered : isCentered;
    // A Coptic speaker label is always BLANK_COPTIC_LABEL — pure spacing, so
    // the Coptic starts on the same line as the text beside it. Spanning the
    // row it has already been placed below that line, so the filler would
    // only open a blank gap above it.
    const speakerLabel = spansRow ? '' : language.speakerLabel;
    return `
        <div class="cell" data-language="${escapeAttribute(language.key)}"${spansRow ? ' style="grid-column: 1 / -1;"' : ''}>
          <p class="verse-text ${language.className} ${centered ? 'centered' : ''}" style="${textStyle}">${
            speakerLabel ? `<span class="speaker-label ${language.speakerClass}">${escapeHtml(speakerLabel)}</span><br/>` : ''
          }${verseNumberText ? `<span class="bible-verse-number" data-copy-text="${escapeAttribute(verseNumberText)}">${escapeHtml(verseNumberText)}</span><span class="bible-verse-number-gap"></span>` : ''}${highlightMetropolitanBrackets(language.text)}</p>
        </div>
      `;
  };

  // The spanning cell has to come last in source order, or grid auto-placement
  // pushes whatever follows it onto a row of its own.
  const cells =
    columnLanguages.map((language) => renderCell(language, false)).join('') +
    (copticStandsAlone ? renderCell(languages.find((language) => language.key === 'coptic')!, true) : '');

  const tuneAttribute = verse.tune ? ` data-tune="${escapeAttribute(verse.tune)}"` : '';
  const verseId = `${section.id}::v${index}`;

  return `<div class="verse-row" data-verse-id="${escapeAttribute(verseId)}"${tuneAttribute} style="grid-template-columns: ${gridTemplateColumns};">${cells}</div>`;
}

/** Verse types that never take part in Single/Double/Quadruple Alternating — kept in sync with resolveVerseColor's early returns below. */
const NON_ALTERNATING_TYPES = new Set(['comment', 'silentComment', 'silentPrayer', 'refrain', 'refrainLabel', 'readingReference']);

/**
 * The alternating color parity only ticks for verses that are actually
 * rendered as alternating participants — Refrain/Comment/etc. rows
 * (frequently conditional, e.g. Kiahk-only refrains) don't consume a
 * parity slot, so the sequence seen by the alternation is "verse 1 / verse
 * 2 / verse 3..." regardless of what non-participant rows are interleaved.
 */
function getEffectiveAlternatingIndex(verses: DocumentVerse[], index: number, bishopPresent: boolean): number {
  let count = -1;
  for (let i = 0; i <= index; i += 1) {
    if ((verses[i].bishopOnly && !bishopPresent) || (verses[i].priestOnly && bishopPresent)) continue;
    // A "White"/"Blue" prayer_type forces that exact color on this one verse
    // — it never consumes a parity slot, so the verses around it alternate
    // exactly as if it weren't there at all (see resolveVerseColorBase).
    if (verses[i].prayerType === 'White' || verses[i].prayerType === 'Blue' || verses[i].forceWhiteText) continue;
    if (!NON_ALTERNATING_TYPES.has(verses[i].type)) count += 1;
  }
  return count;
}

function resolveVerseColor(verse: DocumentVerse, index: number, section: DocumentSection, bishopPresent: boolean) {
  const resolved = resolveVerseColorBase(verse, index, section, bishopPresent);
  // Pre-Refrain lines keep whatever role/color they'd naturally get — this
  // only ever adds italic on top, never changes the color.
  return verse.italic ? { ...resolved, italic: true } : resolved;
}

function resolveVerseColorBase(verse: DocumentVerse, index: number, section: DocumentSection, bishopPresent: boolean) {
  if (verse.type === 'comment' || verse.type === 'silentComment') return { color: COLORS.comment, italic: true };
  if (verse.type === 'silentPrayer') return { color: COLORS.silent, italic: false };
  if (verse.type === 'refrain' || verse.type === 'refrainLabel') return { color: COLORS.refrain, italic: true };
  if (verse.type === 'readingReference') return { color: COLORS.comment, italic: false };
  // "White"/"Blue" prayer_type forces that alternating color directly,
  // bypassing the normal alternation computation for this verse entirely —
  // getEffectiveAlternatingIndex above excludes it from the count so
  // surrounding verses keep alternating exactly as if it weren't there.
  if (verse.prayerType === 'White' || verse.forceWhiteText) return { color: COLORS.white, italic: false };
  if (verse.prayerType === 'Blue') return { color: COLORS.rowBlue, italic: false };
  if (section.forceWhiteVerses || !section.alternateEvery) return { color: COLORS.white, italic: false };

  const effectiveIndex = getEffectiveAlternatingIndex(section.verses, index, bishopPresent);
  let colorIndex = Math.floor(effectiveIndex / section.alternateEvery) % 2;
  if (section.reverseAlternating) colorIndex = colorIndex === 0 ? 1 : 0;
  return { color: colorIndex === 0 ? COLORS.white : COLORS.rowBlue, italic: false };
}

const EASTERN_ARABIC_DIGITS: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩',
};

function formatArabicDigits(text: string) {
  return String(text || '').replace(/\d/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit);
}

const COPTIC_DIGITS: Record<number, string> = { 1: 'ⲁ̅', 2: 'ⲃ̅', 3: 'ⲅ̅', 4: 'ⲇ̅', 5: 'ⲉ̅', 6: 'Ⲋ', 7: 'ⲍ̅', 8: 'ⲏ̅', 9: 'ⲑ̅' };
const COPTIC_TENS: Record<number, string> = { 1: 'ⲓ̅', 2: 'ⲕ̅', 3: 'ⲗ̅', 4: 'ⲙ̅', 5: 'ⲛ̅', 6: 'ⲝ̅', 7: 'ⲟ̅', 8: 'ⲡ̅', 9: 'ϥ̅' };
const COPTIC_HUNDREDS: Record<number, string> = { 1: 'ⲣ̅', 2: 'ⲥ̅', 3: 'ⲧ̅', 4: 'ⲩ̅', 5: 'ⲫ̅', 6: 'ⲭ̅', 7: 'ⲯ̅', 8: 'ⲱ̅', 9: 'ϣ̅' };

function formatCopticNumber(value: number): string {
  if (!Number.isInteger(value) || value <= 0 || value > 999) return String(value);
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const ones = value % 10;
  return `${COPTIC_HUNDREDS[hundreds] || ''}${COPTIC_TENS[tens] || ''}${COPTIC_DIGITS[ones] || ''}`;
}

function formatCopticNumbers(text: string) {
  return String(text || '').replace(/\d+/g, (value) => formatCopticNumber(Number(value)));
}

function escapeHtml(text: string) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

// A parenthetical naming a Metropolitan — "(Metropolitan)", "(the
// metropolitan)", "(ⲙ̀ⲙⲏⲧⲣⲟⲡⲟⲗⲓⲧⲏⲥ)", "(والمطران)" — reads visually distinct
// from the surrounding text, in every language. Matches the innermost
// bracket pair containing the keyword (never spans into an adjacent,
// unrelated bracket group like "(bishop) ... (metropolitan)").
const METROPOLITAN_BRACKET_PATTERN = /\(([^()]*(?:metropolitan|ⲙⲏⲧⲣⲟⲡⲟⲗⲓⲧ|مطران)[^()]*)\)/giu;

function highlightMetropolitanBrackets(text: string): string {
  const raw = String(text || '');
  if (!raw) return '';
  METROPOLITAN_BRACKET_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let html = '';
  let match: RegExpExecArray | null;
  while ((match = METROPOLITAN_BRACKET_PATTERN.exec(raw))) {
    html += escapeHtml(raw.slice(lastIndex, match.index));
    html += `<span class="metropolitan">${escapeHtml(match[0])}</span>`;
    lastIndex = match.index + match[0].length;
  }
  html += escapeHtml(raw.slice(lastIndex));
  return html;
}

function escapeAttribute(text: string) {
  return String(text || '').replace(/"/g, '&quot;');
}
