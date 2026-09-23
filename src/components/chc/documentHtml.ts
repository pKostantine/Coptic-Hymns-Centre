import { COLORS, SPACING } from '../../constants/theme';
import type { AppLanguage as AppTitleLanguage } from '../../utils/preferencesStorage';
import { getAlternatingVerseColorIndex } from '../../utils/versePresentation';
import { computeGlobalSuppressSpeakerLabelFlags, resolveVerseRubricType, shouldUsePeopleLineColor } from '../../utils/verseRubric';
import { DOCUMENT_CONTROL_METRICS, getDocumentChromeMetrics } from './documentPresentationMetrics';
import type {
  SermonHighlightAnchor,
  SermonHighlightColor,
} from '../../types/sermonPlanner';

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
  /** Keeps authored Western digits in Coptic text when a source requires them. */
  preserveCopticDigits?: boolean;
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
  /** Groups hydrated sections that came from one inline source, such as the Sermon Planner's Synaxarium. */
  sourceGroupKey?: string;
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
  collapsed?: boolean;
  anchors?: SermonHighlightAnchor[];
  color?: SermonHighlightColor;
  highlightId?: string;
  /** Native WebView stylus gesture state, used to suspend edge navigation. */
  active?: boolean;
  /** "contentHeight" only: how tall the laid-out document is, for anything embedding it at its natural size. */
  height?: number;
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
 * Applies the reader's remembered open/closed choices over each section's own
 * database default. Sections that aren't collapsible, or that the reader has
 * never touched, are passed through untouched (same object), so a document
 * nobody has collapsed anything in keeps its original array entries.
 */
export function withRememberedCollapse(
  sections: DocumentSection[],
  collapsedSectionIds: Record<string, boolean>,
): DocumentSection[] {
  return sections.map((section) => {
    const remembered = collapsedSectionIds[section.id];
    return section.collapsible && remembered !== undefined
      ? { ...section, defaultCollapsed: remembered }
      : section;
  });
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
    appLanguage = 'en',
    selectText = false,
    displayComments = false,
    displaySilentPrayers = false,
    bishopPresent = false,
    copticRecitedPrayers = true,
    copticGospelRite = false,
    suppressAllSpeakerLabels = false,
    bottomContentInset = 0,
    sermonPlannerMode = false,
    nativeSwipeNavigation = false,
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
    /** Extra bottom clearance for app-level floating chrome, in CSS pixels. */
    bottomContentInset?: number;
    /** Adds persistent range highlighting and Pencil-aware annotation controls. */
    sermonPlannerMode?: boolean;
    /** Native touch edge navigation only; no swipe-to-exit on any website. */
    nativeSwipeNavigation?: boolean;
  },
) {
  const {
    buttonFontSize: openButtonFontSize,
    buttonLineHeight: openButtonLineHeight,
    hyperlinkFontSize,
    hyperlinkLineHeight,
    titleFontSize: sectionTitleFontSize,
    titleLineHeight: sectionTitleLineHeight,
  } = getDocumentChromeMetrics(fontSize);
  const copticFontSize = Math.round(fontSize * 1.25);
  const arabicFontSize = Math.round(fontSize * 1.15);
  const verseLineHeight = Math.round(fontSize * 1.3);
  const arabicVerseLineHeight = Math.round(fontSize * 1.6);
  const effectiveSelectText = Boolean(selectText || sermonPlannerMode);

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
        suppressAllSpeakerLabels,
        sermonPlannerMode,
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
        -webkit-text-size-adjust: none;
        text-size-adjust: none;
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
        padding: ${SPACING.md}px 0 ${Math.max(0, Math.round(bottomContentInset))}px;
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
      .title-row.has-collapse-button .title-text-group {
        margin-inline: ${DOCUMENT_CONTROL_METRICS.collapseButtonSize}px;
        width: calc(100% - ${DOCUMENT_CONTROL_METRICS.collapseButtonSize * 2}px);
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
      .selection-excluded::selection,
      .selection-excluded *::selection {
        background: transparent;
        color: currentColor;
      }
      .selection-excluded::-moz-selection,
      .selection-excluded *::-moz-selection {
        background: transparent;
        color: currentColor;
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
        font-family: Arial, sans-serif !important;
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
      ${sermonPlannerMode ? sermonPlannerStyles() : ''}
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
        border-radius: ${DOCUMENT_CONTROL_METRICS.openButtonBorderRadius}px;
        color: ${COLORS.subdoc};
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: ${SPACING.sm}px;
        font-family: Georgia, serif;
        font-size: ${openButtonFontSize}px;
        font-weight: 800;
        min-height: ${DOCUMENT_CONTROL_METRICS.openButtonMinHeight}px;
        justify-content: center;
        margin: 0 auto;
        max-width: ${DOCUMENT_CONTROL_METRICS.openButtonMaxWidth}px;
        padding: ${SPACING.lg}px ${SPACING.md}px;
        width: ${DOCUMENT_CONTROL_METRICS.controlWidthPercent}%;
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
        border-radius: ${DOCUMENT_CONTROL_METRICS.hyperlinkBorderRadius}px;
        color: ${COLORS.link};
        cursor: pointer;
        display: flex;
        font-family: Georgia, serif;
        font-size: ${hyperlinkFontSize}px;
        font-weight: 800;
        gap: ${SPACING.md}px;
        justify-content: center;
        margin: ${SPACING.md}px auto;
        max-width: ${DOCUMENT_CONTROL_METRICS.hyperlinkMaxWidth}px;
        min-height: ${DOCUMENT_CONTROL_METRICS.hyperlinkMinHeight}px;
        padding: ${SPACING.md}px ${SPACING.lg}px;
        width: ${DOCUMENT_CONTROL_METRICS.controlWidthPercent}%;
      }
      .hyperlink-button .hyperlink-label {
        font-size: ${hyperlinkFontSize}px;
        line-height: ${hyperlinkLineHeight}px;
        text-align: center;
      }
      .hyperlink-button .hyperlink-label.arabic {
        direction: rtl;
        font-family: "Arial", sans-serif;
        font-size: ${hyperlinkFontSize}px;
        line-height: ${hyperlinkLineHeight}px;
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
        line-height: ${sectionTitleLineHeight}px;
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
      // How tall the document actually is. Anything embedding this at its
      // natural size rather than in a full screen — the saint picker's hymn
      // preview — has no other way to know: the content is laid out in here.
      // Reported once the fonts and layout have settled, and again whenever
      // the width changes and the columns reflow.
      var lastReportedContentHeight = -1;
      function reportContentHeight() {
        var body = document.body;
        var html = document.documentElement;
        var height = Math.max(
          body ? body.scrollHeight : 0,
          html ? html.scrollHeight : 0,
        );
        if (Math.abs(height - lastReportedContentHeight) <= 1) return;
        lastReportedContentHeight = height;
        postAction('contentHeight', {
          height: height,
        });
      }
      window.addEventListener('load', function () {
        reportContentHeight();
        setTimeout(reportContentHeight, 120);
      });
      window.addEventListener('resize', reportContentHeight);
      window.scrollToSection = function (sectionId, edge) {
        var candidates = Array.isArray(sectionId) ? sectionId : [sectionId];
        for (var i = 0; i < candidates.length; i += 1) {
          var candidate = candidates[i];
          var id = typeof candidate === 'string' ? candidate : candidate && candidate.sectionId;
          var targetEdge = typeof candidate === 'string' ? edge : candidate && candidate.edge;
          var element = id && document.getElementById(id);
          if (element) {
            var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
            // If a calendar/content change removed the original hymn, show
            // the END of its closest surviving predecessor, not its title.
            // For a surviving hymn every settings change uses its START.
            var target = targetEdge === 'end'
              ? element.getBoundingClientRect().bottom + scrollY - window.innerHeight + 16
              : element.getBoundingClientRect().top + scrollY - 1;
            var maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            window.scrollTo({ top: Math.min(Math.max(target, 0), maxScroll), behavior: 'auto' });
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
        postAction('toggleCollapse', { sectionId: section.getAttribute('data-section-id'), collapsed: collapsed });
      });
      (function () {
        var languages = ['english', 'coptic', 'arabic'];
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
        function inferLanguage(node) {
          var cell = closestLanguageCell(node);
          return cell ? cell.getAttribute('data-language') : null;
        }
        function closestSection(node) {
          var element = node && node.nodeType === 1 ? node : node && node.parentElement;
          return element && element.closest ? element.closest('.section') : null;
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
        function selectedTextForNode(range, node) {
          if (!rangeIntersectsNode(range, node)) return '';
          var clippedRange = document.createRange();
          clippedRange.selectNodeContents(node);
          if (node.contains(range.startContainer)) {
            clippedRange.setStart(range.startContainer, range.startOffset);
          }
          if (node.contains(range.endContainer)) {
            clippedRange.setEnd(range.endContainer, range.endOffset);
          }
          return fragmentText(clippedRange.cloneContents());
        }
        function compareSelectionEndpoints(left, right) {
          if (left.sectionIndex !== right.sectionIndex) return left.sectionIndex - right.sectionIndex;
          return left.languageIndex - right.languageIndex;
        }
        // The visible document is row-major in the DOM (English, Coptic and
        // Arabic for one verse, followed by the next verse), but selection
        // should read section-major and language-major: all English in a
        // hymn, then all Coptic, then all Arabic. The language containing the
        // cursor endpoint is the boundary, so languages beyond it are never
        // silently included.
        function buildSelectionPlan(selection) {
          if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
          var range = selection.getRangeAt(0);
          var sections = Array.prototype.slice.call(document.querySelectorAll('.section'));
          var anchorSection = closestSection(selection.anchorNode) || closestSection(range.startContainer);
          var focusSection = closestSection(selection.focusNode) || closestSection(range.endContainer);
          var anchorLanguage = inferLanguage(selection.anchorNode) || inferLanguage(range.startContainer);
          var focusLanguage = inferLanguage(selection.focusNode) || inferLanguage(range.endContainer);
          var anchor = {
            sectionIndex: sections.indexOf(anchorSection),
            languageIndex: languages.indexOf(anchorLanguage),
          };
          var focus = {
            sectionIndex: sections.indexOf(focusSection),
            languageIndex: languages.indexOf(focusLanguage),
          };
          if (anchor.sectionIndex < 0 || focus.sectionIndex < 0 || anchor.languageIndex < 0 || focus.languageIndex < 0) {
            return null;
          }
          var first = anchor;
          var last = focus;
          if (compareSelectionEndpoints(first, last) > 0) {
            first = focus;
            last = anchor;
          }
          var languageIndexesBySection = {};
          for (var sectionIndex = first.sectionIndex; sectionIndex <= last.sectionIndex; sectionIndex += 1) {
            var firstLanguageIndex = sectionIndex === first.sectionIndex ? first.languageIndex : 0;
            var lastLanguageIndex = sectionIndex === last.sectionIndex ? last.languageIndex : languages.length - 1;
            languageIndexesBySection[sectionIndex] = [];
            for (var languageIndex = firstLanguageIndex; languageIndex <= lastLanguageIndex; languageIndex += 1) {
              languageIndexesBySection[sectionIndex].push(languageIndex);
            }
          }
          return {
            range: range,
            sections: sections,
            languageIndexesBySection: languageIndexesBySection,
          };
        }
        function clearSelectionPreview() {
          Array.prototype.slice.call(document.querySelectorAll('.selection-excluded')).forEach(function (cell) {
            cell.classList.remove('selection-excluded');
          });
        }
        function updateSelectionPreview(plan) {
          clearSelectionPreview();
          if (!plan) return;
          plan.sections.forEach(function (section, sectionIndex) {
            var includedIndexes = plan.languageIndexesBySection[sectionIndex];
            if (!includedIndexes) return;
            Array.prototype.slice.call(section.querySelectorAll('.cell[data-language], .title-cell[data-language]')).forEach(function (cell) {
              var languageIndex = languages.indexOf(cell.getAttribute('data-language'));
              if (includedIndexes.indexOf(languageIndex) < 0) cell.classList.add('selection-excluded');
            });
          });
        }
        // Copy is grouped by hymn and then language. Each participating cell
        // is clipped to the actual Range, preserving partial-word and partial-
        // verse selections instead of expanding every touched row.
        function selectedTextBySection(selection) {
          var plan = buildSelectionPlan(selection);
          if (!plan) return '';
          var range = plan.range;
          var blocks = [];
          plan.sections.forEach(function (section, sectionIndex) {
            var includedIndexes = plan.languageIndexesBySection[sectionIndex];
            if (!includedIndexes || !rangeIntersectsNode(range, section)) return;
            var rows = Array.prototype.slice
              .call(section.querySelectorAll('.title-row, .verse-row'))
              .filter(function (row) { return rangeIntersectsNode(range, row); });
            if (!rows.length) return;
            var perLanguage = [];
            includedIndexes.forEach(function (languageIndex) {
              var language = languages[languageIndex];
              var lines = [];
              rows.forEach(function (row) {
                var cell = row.querySelector('.cell[data-language="' + language + '"], .title-cell[data-language="' + language + '"]');
                if (!cell) return;
                var text = selectedTextForNode(range, cell);
                if (text) lines.push(text);
              });
              if (lines.length) perLanguage.push(lines.join('\\n'));
            });
            if (perLanguage.length) blocks.push(perLanguage.join('\\n\\n'));
          });
          return blocks.join('\\n\\n');
        }
        document.addEventListener('selectionchange', function () {
          var selection = window.getSelection && window.getSelection();
          updateSelectionPreview(buildSelectionPlan(selection));
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
        if (!${JSON.stringify(nativeSwipeNavigation)}) return;
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
          if (window.__sermonPencilActive || window.__sermonPenPointerActive) { onCancel(); return; }
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
        document.addEventListener('pointerdown', function (e) {
          if (e.pointerType === 'pen') { window.__sermonPenPointerActive = true; onCancel(); return; }
          if (isEdgeStart(e.clientX)) onStart(e.clientX, e.clientY);
        });
        document.addEventListener('pointermove', function (e) { if (e.pointerType !== 'pen' && !window.__sermonPencilActive) onMove(e.clientX, e.clientY, e); });
        document.addEventListener('pointerup', function (e) {
          if (e.pointerType === 'pen') { window.__sermonPenPointerActive = false; onCancel(); return; }
          onEnd(e.clientX, e.clientY);
        });
        document.addEventListener('pointercancel', function () { window.__sermonPenPointerActive = false; onCancel(); });
        document.addEventListener('touchstart', function (e) { var t = e.touches[0]; if (t && t.touchType !== 'stylus' && !window.__sermonPenPointerActive && !window.__sermonPencilActive && isEdgeStart(t.clientX)) onStart(t.clientX, t.clientY); }, { passive: true });
        document.addEventListener('touchmove', function (e) { var t = e.touches[0]; if (t && t.touchType !== 'stylus' && !window.__sermonPenPointerActive && !window.__sermonPencilActive) onMove(t.clientX, t.clientY, e); }, { passive: false });
        document.addEventListener('touchend', function (e) { var t = e.changedTouches[0]; onEnd(t.clientX, t.clientY, e); }, { passive: false });
        document.addEventListener('touchcancel', onCancel);
      })();
      ${sermonPlannerMode ? sermonPlannerScript() : ''}
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
    suppressAllSpeakerLabels: boolean;
    sermonPlannerMode: boolean;
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
    suppressAllSpeakerLabels,
    sermonPlannerMode,
  }: {
    fontSize: number;
    visibleColumns: VisibleColumns;
    bishopPresent: boolean;
    copticRecitedPrayers: boolean;
    suppressAllSpeakerLabels: boolean;
    sermonPlannerMode: boolean;
  },
) {
  const { color, italic } = resolveVerseColor(verse, index, section, bishopPresent, suppressAllSpeakerLabels);
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
  const copticText = copticHiddenByToggle
    ? ''
    : formatCopticNumbers(verse.coptic || '', verse.preserveCopticDigits);

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
    const verseId = `${section.id}::v${index}`;
    const bodyText = highlightMetropolitanBrackets(language.text);
    const renderedBody = sermonPlannerMode
      ? `<span class="sermon-annotatable-text" data-sermon-section-id="${escapeAttribute(section.id)}" data-sermon-verse-id="${escapeAttribute(verseId)}" data-sermon-language="${escapeAttribute(language.key)}">${bodyText}</span>`
      : bodyText;
    return `
        <div class="cell" data-language="${escapeAttribute(language.key)}"${spansRow ? ' style="grid-column: 1 / -1;"' : ''}>
          <p class="verse-text ${language.className} ${centered ? 'centered' : ''}" style="${textStyle}">${
            speakerLabel ? `<span class="speaker-label ${language.speakerClass}">${escapeHtml(speakerLabel)}</span><br/>` : ''
          }${verseNumberText ? `<span class="bible-verse-number" data-copy-text="${escapeAttribute(verseNumberText)}">${escapeHtml(verseNumberText)}</span><span class="bible-verse-number-gap"></span>` : ''}${renderedBody}</p>
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

function sermonPlannerStyles() {
  return `
      .sermon-annotatable-text {
        -webkit-user-select: text;
        user-select: text;
      }
      mark.sermon-highlight {
        border-radius: 3px;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
        color: inherit;
        cursor: pointer;
        padding: 0 0.05em;
      }
      mark.sermon-highlight[data-sermon-color="gold"] { background: rgba(235, 190, 52, 0.46); }
      mark.sermon-highlight[data-sermon-color="rose"] { background: rgba(232, 91, 120, 0.42); }
      mark.sermon-highlight[data-sermon-color="blue"] { background: rgba(75, 154, 219, 0.46); }
      mark.sermon-highlight[data-sermon-color="green"] { background: rgba(74, 173, 116, 0.44); }
      mark.sermon-highlight.sermon-highlight-pulse { animation: sermon-highlight-pulse 900ms ease-out; }
      @keyframes sermon-highlight-pulse {
        0%, 100% { outline: 0 solid rgba(235, 190, 52, 0); }
        35% { outline: 5px solid rgba(235, 190, 52, 0.42); }
      }
      #sermon-highlight-tools {
        align-items: center;
        background: #151719;
        border: 1px solid rgba(235, 190, 52, 0.5);
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.48);
        display: none;
        gap: 8px;
        padding: 8px 10px;
        position: fixed;
        transform: translate(-50%, -100%);
        z-index: 2147483647;
      }
      #sermon-highlight-tools.is-visible { display: flex; }
      .sermon-color-button {
        border: 2px solid rgba(255, 255, 255, 0.72);
        border-radius: 999px;
        height: 28px;
        padding: 0;
        width: 28px;
      }
      .sermon-color-button[data-color="gold"] { background: #d7ad2c; }
      .sermon-color-button[data-color="rose"] { background: #d65b75; }
      .sermon-color-button[data-color="blue"] { background: #4c9ad8; }
      .sermon-color-button[data-color="green"] { background: #4aaa73; }
  `;
}

function sermonPlannerScript() {
  return `
      (function () {
        var currentHighlights = [];
        var annotationSelector = '.sermon-annotatable-text[data-sermon-verse-id][data-sermon-language]';
        var palette = document.createElement('div');
        palette.id = 'sermon-highlight-tools';
        palette.setAttribute('role', 'toolbar');
        palette.setAttribute('aria-label', 'Highlight selected text');
        ['gold', 'rose', 'blue', 'green'].forEach(function (color) {
          var button = document.createElement('button');
          button.className = 'sermon-color-button';
          button.type = 'button';
          button.setAttribute('data-color', color);
          button.setAttribute('aria-label', 'Highlight ' + color);
          palette.appendChild(button);
        });
        document.body.appendChild(palette);

        function closestRoot(node) {
          var element = node && node.nodeType === 1 ? node : node && node.parentElement;
          return element && element.closest ? element.closest(annotationSelector) : null;
        }

        function unwrapHighlights() {
          Array.prototype.slice.call(document.querySelectorAll('mark.sermon-highlight')).forEach(function (mark) {
            var parent = mark.parentNode;
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
            parent.normalize();
          });
        }

        function boundaryForOffset(root, requestedOffset) {
          var offset = Math.max(0, Math.min(Number(requestedOffset) || 0, root.textContent.length));
          var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          var consumed = 0;
          var node;
          while ((node = walker.nextNode())) {
            var next = consumed + node.nodeValue.length;
            if (offset <= next) return { node: node, offset: offset - consumed };
            consumed = next;
          }
          return { node: root, offset: root.childNodes.length };
        }

        function resolveOffsets(root, highlight) {
          var text = root.textContent || '';
          var start = Math.max(0, Math.min(Number(highlight.startOffset) || 0, text.length));
          var end = Math.max(start, Math.min(Number(highlight.endOffset) || start, text.length));
          var quote = String(highlight.quote || '');
          if (quote && text.slice(start, end) !== quote) {
            var nearbyStart = Math.max(0, start - 80);
            var nearby = text.slice(nearbyStart, Math.min(text.length, end + 80));
            var nearbyIndex = nearby.indexOf(quote);
            if (nearbyIndex >= 0) {
              start = nearbyStart + nearbyIndex;
              end = start + quote.length;
            } else {
              var firstIndex = text.indexOf(quote);
              if (firstIndex >= 0 && text.indexOf(quote, firstIndex + 1) < 0) {
                start = firstIndex;
                end = firstIndex + quote.length;
              }
            }
          }
          return { start: start, end: end };
        }

        function applyHighlights() {
          unwrapHighlights();
          var ordered = currentHighlights.slice().sort(function (a, b) {
            return Number(b.startOffset) - Number(a.startOffset);
          });
          ordered.forEach(function (highlight) {
            var selector = annotationSelector
              + '[data-sermon-verse-id="' + CSS.escape(String(highlight.verseId || '')) + '"]'
              + '[data-sermon-language="' + CSS.escape(String(highlight.language || '')) + '"]';
            var root = document.querySelector(selector);
            if (!root) return;
            var offsets = resolveOffsets(root, highlight);
            if (offsets.end <= offsets.start) return;
            var start = boundaryForOffset(root, offsets.start);
            var end = boundaryForOffset(root, offsets.end);
            var range = document.createRange();
            try {
              range.setStart(start.node, start.offset);
              range.setEnd(end.node, end.offset);
              var mark = document.createElement('mark');
              mark.className = 'sermon-highlight';
              mark.setAttribute('data-sermon-highlight-id', String(highlight.id));
              mark.setAttribute('data-sermon-color', String(highlight.color || 'gold'));
              mark.appendChild(range.extractContents());
              range.insertNode(mark);
            } catch (error) {
              // A stale anchor should never make the document unreadable.
            }
          });
        }

        window.setSermonHighlights = function (highlights) {
          currentHighlights = Array.isArray(highlights) ? highlights : [];
          applyHighlights();
        };

        window.scrollToSermonHighlight = function (highlightId) {
          var mark = document.querySelector('mark[data-sermon-highlight-id="' + CSS.escape(String(highlightId || '')) + '"]');
          if (!mark) return false;
          mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
          mark.classList.remove('sermon-highlight-pulse');
          void mark.offsetWidth;
          mark.classList.add('sermon-highlight-pulse');
          return true;
        };

        function offsetInRoot(root, node, offset) {
          var range = document.createRange();
          range.selectNodeContents(root);
          try {
            range.setEnd(node, offset);
            return range.toString().length;
          } catch (error) {
            return 0;
          }
        }

        // Intl.Segmenter respects punctuation and multilingual word boundaries
        // (English contractions, Arabic and Coptic); the Unicode fallback
        // handles older embedded WebViews.
        function expandToWholeWords(text, start, end) {
          var segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
            ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
          if (segmenter) {
            var segments = Array.from(segmenter.segment(text));
            segments.forEach(function (part) {
              if (!part.isWordLike) return;
              var wordStart = part.index, wordEnd = part.index + part.segment.length;
              if (wordStart < start && start < wordEnd) start = wordStart;
              if (wordStart < end && end < wordEnd) end = wordEnd;
            });
          } else {
            var wordChar = function (char) { return /[\\p{L}\\p{M}\\p{N}_]/u.test(char); };
            while (start > 0 && wordChar(text.charAt(start)) && wordChar(text.charAt(start - 1))) start -= 1;
            while (end < text.length && wordChar(text.charAt(end - 1)) && wordChar(text.charAt(end))) end += 1;
          }
          return { start: start, end: end };
        }

        function anchorsFromSelection(selection) {
          if (!selection || !selection.rangeCount || selection.isCollapsed) return [];
          var range = selection.getRangeAt(0);
          var anchors = [];
          Array.prototype.slice.call(document.querySelectorAll(annotationSelector)).forEach(function (root) {
            try {
              if (!range.intersectsNode(root)) return;
            } catch (error) {
              return;
            }
            var clipped = document.createRange();
            clipped.selectNodeContents(root);
            if (root.contains(range.startContainer)) clipped.setStart(range.startContainer, range.startOffset);
            if (root.contains(range.endContainer)) clipped.setEnd(range.endContainer, range.endOffset);
            var startOffset = offsetInRoot(root, clipped.startContainer, clipped.startOffset);
            var endOffset = offsetInRoot(root, clipped.endContainer, clipped.endOffset);
            var fullText = root.textContent || '';
            while (startOffset < endOffset && /\\s/.test(fullText.charAt(startOffset))) startOffset += 1;
            while (endOffset > startOffset && /\\s/.test(fullText.charAt(endOffset - 1))) endOffset -= 1;
            if (endOffset <= startOffset) return;
            var expanded = expandToWholeWords(fullText, startOffset, endOffset);
            startOffset = expanded.start;
            endOffset = expanded.end;
            var overlaps = currentHighlights.some(function (highlight) {
              return highlight.verseId === root.getAttribute('data-sermon-verse-id')
                && highlight.language === root.getAttribute('data-sermon-language')
                && startOffset < Number(highlight.endOffset)
                && endOffset > Number(highlight.startOffset);
            });
            if (overlaps) return;
            anchors.push({
              sectionId: root.getAttribute('data-sermon-section-id'),
              verseId: root.getAttribute('data-sermon-verse-id'),
              language: root.getAttribute('data-sermon-language'),
              startOffset: startOffset,
              endOffset: endOffset,
              quote: fullText.slice(startOffset, endOffset),
            });
          });
          return anchors;
        }

        function showExpandedSelection(selection, anchors) {
          if (!selection || !anchors.length) return;
          var first = anchors[0], last = anchors[anchors.length - 1];
          var startRoot = document.querySelector(annotationSelector
            + '[data-sermon-verse-id="' + CSS.escape(first.verseId) + '"]'
            + '[data-sermon-language="' + CSS.escape(first.language) + '"]');
          var endRoot = document.querySelector(annotationSelector
            + '[data-sermon-verse-id="' + CSS.escape(last.verseId) + '"]'
            + '[data-sermon-language="' + CSS.escape(last.language) + '"]');
          if (!startRoot || !endRoot) return;
          var start = boundaryForOffset(startRoot, first.startOffset);
          var end = boundaryForOffset(endRoot, last.endOffset);
          var range = document.createRange();
          try {
            range.setStart(start.node, start.offset);
            range.setEnd(end.node, end.offset);
            selection.removeAllRanges();
            selection.addRange(range);
          } catch (error) {
            // Keep the user's original selection when the DOM changed mid-drag.
          }
        }

        function hidePalette() {
          palette.classList.remove('is-visible');
        }

        function showPaletteForSelection() {
          var selection = window.getSelection && window.getSelection();
          var anchors = anchorsFromSelection(selection);
          if (!anchors.length) {
            hidePalette();
            return;
          }
          showExpandedSelection(selection, anchors);
          var rect = selection.getRangeAt(0).getBoundingClientRect();
          var x = Math.max(78, Math.min(window.innerWidth - 78, rect.left + rect.width / 2));
          var y = Math.max(60, rect.top - 8);
          palette.style.left = x + 'px';
          palette.style.top = y + 'px';
          palette.classList.add('is-visible');
        }

        function commitSelection(color) {
          var selection = window.getSelection && window.getSelection();
          var anchors = anchorsFromSelection(selection);
          if (anchors.length) postAction('createSermonHighlights', { anchors: anchors, color: color || 'gold' });
          if (selection) selection.removeAllRanges();
          hidePalette();
        }

        palette.addEventListener('pointerdown', function (event) { event.preventDefault(); });
        palette.addEventListener('click', function (event) {
          var button = event.target.closest('[data-color]');
          if (button) commitSelection(button.getAttribute('data-color'));
        });

        document.addEventListener('click', function (event) {
          var mark = event.target.closest('mark[data-sermon-highlight-id]');
          if (!mark) return;
          postAction('openSermonNote', { highlightId: mark.getAttribute('data-sermon-highlight-id') });
        });
        document.addEventListener('selectionchange', function () {
          var selection = window.getSelection && window.getSelection();
          if (!selection || selection.isCollapsed) hidePalette();
        });
        document.addEventListener('pointerup', function (event) {
          if (event.pointerType !== 'pen') setTimeout(showPaletteForSelection, 0);
        });
        document.addEventListener('touchend', function () { setTimeout(showPaletteForSelection, 80); }, { passive: true });
        document.addEventListener('keyup', function () { setTimeout(showPaletteForSelection, 0); });

        function caretAtPoint(x, y) {
          if (document.caretPositionFromPoint) {
            var position = document.caretPositionFromPoint(x, y);
            return position ? { node: position.offsetNode, offset: position.offset } : null;
          }
          if (document.caretRangeFromPoint) {
            var range = document.caretRangeFromPoint(x, y);
            return range ? { node: range.startContainer, offset: range.startOffset } : null;
          }
          return null;
        }

        var pencilStart = null;
        window.__sermonPencilActive = false;
        function stopPencil() {
          if (!pencilStart && !window.__sermonPencilActive) return;
          pencilStart = null;
          window.__sermonPencilActive = false;
          postAction('sermonPencilGesture', { active: false });
        }
        function startPencil(x, y, event) {
          var caret = caretAtPoint(x, y);
          var root = caret && closestRoot(caret.node);
          if (!caret || !root) return false;
          pencilStart = { node: caret.node, offset: caret.offset, root: root };
          window.__sermonPencilActive = true;
          postAction('sermonPencilGesture', { active: true });
          if (event && event.cancelable) event.preventDefault();
          return true;
        }
        function movePencil(x, y, event) {
          if (!pencilStart) return;
          var caret = caretAtPoint(x, y);
          if (!caret || closestRoot(caret.node) !== pencilStart.root) return;
          if (event && event.cancelable) event.preventDefault();
          var selection = window.getSelection && window.getSelection();
          if (!selection) return;
          var range = document.createRange();
          range.setStart(pencilStart.node, pencilStart.offset);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          if (selection.extend) selection.extend(caret.node, caret.offset);
          showExpandedSelection(selection, anchorsFromSelection(selection));
        }
        function endPencil(x, y, event) {
          if (!pencilStart) return;
          movePencil(x, y, event);
          commitSelection('gold');
          stopPencil();
        }

        document.addEventListener('pointerdown', function (event) {
          if (event.pointerType === 'pen') startPencil(event.clientX, event.clientY, event);
        }, { passive: false });
        document.addEventListener('pointermove', function (event) {
          if (event.pointerType === 'pen') movePencil(event.clientX, event.clientY, event);
        }, { passive: false });
        document.addEventListener('pointerup', function (event) {
          if (event.pointerType === 'pen') endPencil(event.clientX, event.clientY, event);
        }, { passive: false });
        document.addEventListener('pointercancel', stopPencil);

        document.addEventListener('touchstart', function (event) {
          var touch = event.touches && event.touches[0];
          if (touch && touch.touchType === 'stylus') startPencil(touch.clientX, touch.clientY, event);
        }, { passive: false });
        document.addEventListener('touchmove', function (event) {
          var touch = event.touches && event.touches[0];
          if (touch && touch.touchType === 'stylus') movePencil(touch.clientX, touch.clientY, event);
        }, { passive: false });
        document.addEventListener('touchend', function (event) {
          var touch = event.changedTouches && event.changedTouches[0];
          if (touch && touch.touchType === 'stylus') endPencil(touch.clientX, touch.clientY, event);
        }, { passive: false });
        document.addEventListener('touchcancel', stopPencil);
      })();
  `;
}

function resolveVerseColor(verse: DocumentVerse, index: number, section: DocumentSection, bishopPresent: boolean, allSpeakerLabelsSuppressed: boolean) {
  const resolved = resolveVerseColorBase(verse, index, section, bishopPresent, allSpeakerLabelsSuppressed);
  // Pre-Refrain lines keep whatever role/color they'd naturally get — this
  // only ever adds italic on top, never changes the color.
  return verse.italic ? { ...resolved, italic: true } : resolved;
}

function resolveVerseColorBase(verse: DocumentVerse, index: number, section: DocumentSection, bishopPresent: boolean, allSpeakerLabelsSuppressed: boolean) {
  if (verse.type === 'comment' || verse.type === 'silentComment') return { color: COLORS.comment, italic: true };
  if (verse.type === 'silentPrayer') return { color: COLORS.silent, italic: false };
  if (verse.type === 'refrain' || verse.type === 'refrainLabel') return { color: COLORS.refrain, italic: true };
  if (verse.type === 'readingReference') return { color: COLORS.comment, italic: false };
  // "White"/"Blue" prayer_type forces that alternating color directly,
  // bypassing the normal alternation computation for this verse entirely —
  // the shared alternating-index helper excludes it from the count so
  // surrounding verses keep alternating exactly as if it weren't there.
  if (verse.prayerType === 'White' || verse.forceWhiteText) return { color: COLORS.white, italic: false };
  if (verse.prayerType === 'Blue') return { color: COLORS.rowBlue, italic: false };
  // The People's own responses inside the Agpeya's Litanies — see
  // shouldUsePeopleLineColor for both gates (the book's hide-every-speaker
  // state, and the hymn being a Litanies one).
  //
  // A lighter orange than COLORS.people, which is what the "People:" rubric
  // itself is drawn in: that label is two words and carries the saturated
  // orange fine, but a whole verse in it is punishing to read.
  //
  // Colour and not italic, deliberately: two of the three columns are Coptic
  // and Arabic, and neither has a real italic face here, so italic would be
  // synthesised by slanting the glyphs — which looks broken in Coptic and
  // pulls apart the joined letterforms in Arabic.
  //
  // Sits below the explicit "White"/"Blue" prayer_type overrides, which are
  // authored per line and still win, and above the default alternation, which
  // is the plain white/blue this replaces.
  if (shouldUsePeopleLineColor(section, verse, bishopPresent, allSpeakerLabelsSuppressed)) {
    return { color: COLORS.peopleLight, italic: false };
  }
  if (section.forceWhiteVerses || !section.alternateEvery) return { color: COLORS.white, italic: false };

  const colorIndex = getAlternatingVerseColorIndex(section, index, bishopPresent);
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

function formatCopticNumbers(text: string, preserveDigits = false) {
  if (preserveDigits) return String(text || '');
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
