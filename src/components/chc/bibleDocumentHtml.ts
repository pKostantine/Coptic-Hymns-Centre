import { COLORS } from '../../constants/theme';
import { formatCopticNumber, formatGreekNumber } from '../../utils/bibleNumerals';
import { formatEnglishDisplayText } from '../../utils/displayText';
import { textHighlightScript, textHighlightStyles } from './textHighlights';

export interface BibleDisplayVerse {
  verseNumber: number | string;
  english: string;
  englishNkjv: string;
  englishFromCoptic: string;
  coptic: string;
  greek: string;
  arabic: string;
  arabicFromCoptic: string;
  french: string;
  isLxxAddition?: boolean;
  isPsalmIntroduction?: boolean;
  /** Where the verse is stored (Septuagint numbering) — the id a highlight anchors to. */
  sourceChapter?: number;
  sourceVerse?: number | string;
}

export interface BiblePreface {
  english?: string;
  englishNkjv?: string;
  englishFromCoptic?: string;
  coptic?: string;
  greek?: string;
  arabic?: string;
  arabicFromCoptic?: string;
  french?: string;
}

export type BibleLanguageKey = 'english' | 'englishNkjv' | 'englishFromCoptic' | 'coptic' | 'greek' | 'arabic' | 'arabicFromCoptic' | 'french';

/**
 * Builds the Bible chapter reader HTML — ported from the old app's
 * buildBibleChapterHtml (BibleScreen.js), including its slideshow pagination
 * script (measures real overflow per page, splits an oversized verse across
 * pages word-by-word via binary search). Verse numbers render as a bold gold
 * badge before the text, distinct from documentHtml.ts's hymn rendering
 * (which has no per-verse numbering) — kept as a separate builder rather
 * than overloading the shared hymn renderer.
 */
export function buildBibleChapterHtml({
  verses,
  languageKeys,
  fontSize,
  copticFontDataUri,
  selectText = false,
  isSlideshow = false,
  nativeSwipeNavigation = false,
  preface = null,
  initialVerse = null,
  restoreVerse = null,
  readerId = '',
  bottomContentInset = 0,
  highlighting = false,
  highlightLabels = { copy: 'Copy', remove: 'Remove' },
  copyReference = null,
}: {
  verses: BibleDisplayVerse[];
  languageKeys: BibleLanguageKey[];
  fontSize: number;
  copticFontDataUri: string;
  selectText?: boolean;
  isSlideshow?: boolean;
  /** Browser and PWA readers must not swipe back out of a chapter. */
  nativeSwipeNavigation?: boolean;
  preface?: BiblePreface | null;
  /** Extra bottom clearance for app-level floating chrome, in CSS pixels. */
  bottomContentInset?: number;
  /** Verse to land on when the chapter opens (a search hit or a deep link), instead of the top. */
  initialVerse?: string | number | null;
  /** Current verse to retain across language/display changes; never highlighted as a deep link. */
  restoreVerse?: string | number | null;
  /** Identifies this HTML generation so stale iframe/WebView messages are ignored. */
  readerId?: string;
  /** Highlighting and its selection toolbar (colours, Copy) — the reading view only, not slideshow pages. */
  highlighting?: boolean;
  /** The toolbar's words, in the app's language. */
  highlightLabels?: { copy: string; remove: string };
  /** The chapter a copy is signed with ("Leviticus 2"), in each language a column can be. */
  copyReference?: Partial<Record<'english' | 'arabic' | 'coptic' | 'greek' | 'french', string>> | null;
}) {
  const safeFontSize = Math.max(12, Number(fontSize) || 18);
  const effectiveSelectText = Boolean(selectText) && !isSlideshow;
  const effectiveLanguages: BibleLanguageKey[] = languageKeys.length ? languageKeys : ['english'];
  const columnTemplate = `repeat(${Math.max(effectiveLanguages.length, 1)}, minmax(0, 1fr))`;
  const firstCopticVerse = verses.find((verse) => !verse.isPsalmIntroduction && String(verse.coptic || '').trim());
  const arabicVerseLineHeight = Math.round(fontSize * 1.6);
  const effectiveHighlighting = Boolean(highlighting) && !isSlideshow;

  const rowHtml = verses
    .map((verse) => {
      const isPsalmIntroduction = Boolean(verse.isPsalmIntroduction);
      const cellHtml = effectiveLanguages
        .map((language) => {
          const text = verse[language];
          const verseNumberText = isPsalmIntroduction ? '' : formatVerseNumber(verse.verseNumber, language);
          const verseNumberHtml = verseNumberText
            ? `<span class="verse-number${verse.isLxxAddition ? ' lxx-addition' : ''}" data-copy-text="${escapeHtml(verseNumberText)}">${escapeHtml(verseNumberText)}</span>`
            : '';
          if (!String(text || '').trim()) {
            return `<div class="cell placeholder ${language}" data-language="${language}"></div>`;
          }
          // A highlight anchors to where the verse is stored, "chapter:verse",
          // and to its column — so it lands on the same words in either Psalm
          // numbering and whichever columns are showing.
          const textClass = effectiveHighlighting ? 'verse-text sermon-annotatable-text' : 'verse-text';
          const annotation = effectiveHighlighting
            ? ` data-sermon-section-id="bible" data-sermon-verse-id="${escapeHtml(bibleHighlightVerseId(verse))}" data-sermon-language="${language}"`
            : '';
          return [
            `<div class="cell ${language}${isPsalmIntroduction ? ' psalm-introduction' : ''}" data-language="${language}" dir="${isArabicLanguage(language) ? 'rtl' : 'ltr'}">`,
            verseNumberHtml,
            `<span class="${textClass}"${annotation}>${escapeHtml(formatVerseText(text, language, verse === firstCopticVerse))}</span>`,
            '</div>',
          ].join('');
        })
        .join('');
      return `<section class="verse-row${isPsalmIntroduction ? ' psalm-introduction-row' : ''}" data-verse="${escapeHtml(String(verse.verseNumber))}">${cellHtml}</section>`;
    })
    .join('');

  const prefaceHtml = preface
    ? `<section class="verse-row preface-row">${effectiveLanguages
        .map((language) => {
          const text = preface[language];
          if (!String(text || '').trim()) {
            return `<div class="cell placeholder ${language}" data-language="${language}"></div>`;
          }
          return [
            `<div class="cell preface-cell ${language}" data-language="${language}" dir="${isArabicLanguage(language) ? 'rtl' : 'ltr'}">`,
            `<span class="verse-text">${escapeHtml(formatVerseText(text || '', language, false))}</span>`,
            '</div>',
          ].join('');
        })
        .join('')}</section>`
    : '';

  const chapterHtml = `${prefaceHtml}${rowHtml}`;
  const bodyContent = isSlideshow
    ? `
    <div id="pager" class="pager">
      <main id="pages" class="slideshow-pages"></main>
      <main id="source-document" class="slideshow-source">${chapterHtml}</main>
    </div>
    <button class="tap-zone previous" aria-label="Previous page"></button>
    <button class="tap-zone next" aria-label="Next page"></button>
    <div id="pager-status" class="screen-reader-status" aria-live="polite"></div>`
    : `<main class="chapter" id="chapter">${chapterHtml}</main>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
    <style>
      @font-face {
        font-family: 'CopticCHC';
        src: url('${copticFontDataUri}') format('truetype');
      }
      :root {
        color-scheme: dark;
        --text-color: ${COLORS.white};
        --border-color: ${COLORS.border};
        --gold: ${COLORS.gold};
        --lxx-addition: ${COLORS.priest};
        --psalm-introduction: ${COLORS.refrain};
        --preface-red: #d9534f;
        --font-size: ${safeFontSize}px;
        --verse-line-height: ${Math.round(safeFontSize * 1.3)}px;
      }
      html, body {
        margin: 0;
        min-height: 100%;
        background: #000;
        color: var(--text-color);
        font-family: Georgia, 'Times New Roman', serif;
        -webkit-text-size-adjust: none;
        text-size-adjust: none;
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
      body {
        overflow-x: hidden;
        overflow-y: ${isSlideshow ? 'hidden' : 'auto'};
      }
      .chapter {
        box-sizing: border-box;
        min-height: 100vh;
        padding: 14px 14px calc(28px + env(safe-area-inset-bottom) + ${Math.max(0, Math.round(bottomContentInset))}px);
      }
      .verse-row {
        box-sizing: border-box;
        display: grid;
        grid-template-columns: ${columnTemplate};
        gap: 16px;
        border-bottom: 1px solid var(--border-color);
        padding: 15px 0;
      }
      .verse-row.verse-target {
        background: rgba(212, 175, 55, 0.16);
        border-radius: 8px;
        box-shadow: 0 0 0 1px rgba(212, 175, 55, 0.45);
        transition: background-color 700ms ease, box-shadow 700ms ease;
      }
      .verse-row.verse-target.verse-target-fading {
        background: transparent;
        box-shadow: 0 0 0 1px transparent;
      }
      .cell {
        box-sizing: border-box;
        min-width: 0;
        overflow-wrap: anywhere;
        word-break: normal;
        color: var(--text-color);
        font-size: var(--font-size);
        line-height: var(--verse-line-height);
        text-align: justify;
        text-justify: inter-word;
      }
      body.selecting-english .cell:not([data-language="english"]),
      body.selecting-english .cell:not([data-language="english"]) *,
      body.selecting-englishNkjv .cell:not([data-language="englishNkjv"]),
      body.selecting-englishNkjv .cell:not([data-language="englishNkjv"]) *,
      body.selecting-englishFromCoptic .cell:not([data-language="englishFromCoptic"]),
      body.selecting-englishFromCoptic .cell:not([data-language="englishFromCoptic"]) *,
      body.selecting-coptic .cell:not([data-language="coptic"]),
      body.selecting-coptic .cell:not([data-language="coptic"]) *,
      body.selecting-greek .cell:not([data-language="greek"]),
      body.selecting-greek .cell:not([data-language="greek"]) *,
      body.selecting-arabic .cell:not([data-language="arabic"]),
      body.selecting-arabic .cell:not([data-language="arabic"]) *,
      body.selecting-arabicFromCoptic .cell:not([data-language="arabicFromCoptic"]),
      body.selecting-arabicFromCoptic .cell:not([data-language="arabicFromCoptic"]) *,
      body.selecting-french .cell:not([data-language="french"]),
      body.selecting-french .cell:not([data-language="french"]) * {
        -webkit-user-select: none !important;
        user-select: none !important;
      }
      .cell.coptic {
        font-family: CopticCHC, Georgia, serif;
        font-size: ${getLanguageFontSize(safeFontSize, 'coptic')}px;
        line-height: ${getLanguageLineHeight(safeFontSize, 'coptic')}px;
      }
      .cell.arabic,
      .cell.arabicFromCoptic {
        font-family: Arial, sans-serif;
        font-size: ${getLanguageFontSize(safeFontSize, 'arabic')}px;
        line-height: ${arabicVerseLineHeight}px;
        text-align: justify;
      }
      .cell.greek {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: ${getLanguageFontSize(safeFontSize, 'greek')}px;
        line-height: ${getLanguageLineHeight(safeFontSize, 'greek')}px;
      }
      .verse-number {
        display: inline-block;
        color: var(--gold);
        font-weight: 700;
        padding-inline-end: 0;
        white-space: nowrap;
      }
      .verse-number::after {
        content: '';
        display: inline-block;
        width: 0.5em;
      }
      .verse-number.lxx-addition {
        color: var(--lxx-addition);
      }
      .verse-text {
        white-space: pre-line;
      }
      .cell.psalm-introduction {
        color: var(--psalm-introduction);
        font-style: italic;
      }
      .preface-cell {
        color: var(--preface-red);
        font-style: italic;
      }
      .pager {
        background: #000;
        height: 100vh;
        height: 100dvh;
        overflow: hidden;
        position: relative;
        touch-action: manipulation;
        width: 100vw;
      }
      .slideshow-pages {
        box-sizing: border-box;
        height: 100vh;
        height: 100dvh;
        position: relative;
        transition: none;
        width: 100vw;
      }
      .slide-page {
        box-sizing: border-box;
        height: 100vh;
        height: 100dvh;
        left: 0;
        overflow: hidden;
        padding: calc(clamp(8px, 3vh, 24px) + env(safe-area-inset-top)) 18px calc(clamp(8px, 3vh, 24px) + env(safe-area-inset-bottom) + ${Math.max(0, Math.round(bottomContentInset))}px);
        position: absolute;
        top: 0;
        width: 100vw;
      }
      .slideshow-source {
        box-sizing: border-box;
        height: auto;
        left: -100000px;
        pointer-events: none;
        position: absolute;
        top: 0;
        visibility: hidden;
        width: 100vw;
      }
      .slide-page .cell { align-self: start; }
      .tap-zone {
        position: fixed;
        top: 0;
        bottom: 0;
        z-index: 20;
        width: 50vw;
        border: 0;
        margin: 0;
        padding: 0;
        background: transparent;
        cursor: pointer;
        opacity: 0;
        outline: none;
        appearance: none;
        -webkit-tap-highlight-color: transparent;
      }
      .tap-zone.previous { left: 0; }
      .tap-zone.next { right: 0; }
      .screen-reader-status {
        height: 1px;
        left: -10000px;
        overflow: hidden;
        position: fixed;
        top: 0;
        width: 1px;
      }
      ${effectiveHighlighting ? textHighlightStyles() : ''}
    </style>
  </head>
  <body class="${isSlideshow ? 'slideshow' : 'scroll'}">
    ${bodyContent}
    <script>
      (function () {
        var sourceDocument = document.getElementById('source-document');
        var pager = document.getElementById('pager');
        var pages = document.getElementById('pages');
        var pagerStatus = document.getElementById('pager-status');
        var currentPage = 0;
        var pageCount = 1;
        var isSlideshow = ${JSON.stringify(Boolean(isSlideshow))};
        var selectTextEnabled = ${JSON.stringify(effectiveSelectText)};
        var initialVerse = ${JSON.stringify(initialVerse === null || initialVerse === undefined ? '' : String(initialVerse))};
        var restoreVerse = ${JSON.stringify(restoreVerse === null || restoreVerse === undefined ? '' : String(restoreVerse))};
        var initialAnchorVerse = restoreVerse || initialVerse;
        var readerId = ${JSON.stringify(readerId)};
        var lastReportedVerse = '';
        function reportVerse(verse) {
          verse = String(verse || '');
          if (!verse || verse === lastReportedVerse) return;
          lastReportedVerse = verse;
          post({ type: 'currentVerse', verse: verse });
        }
        var selectableLanguages = ${JSON.stringify(effectiveLanguages)};
        var selectingLanguage = null;
        var copyReference = ${JSON.stringify(copyReference || null)};
        var richCopyColors = {
          background: ${JSON.stringify(COLORS.black)},
          text: ${JSON.stringify(COLORS.white)},
          gold: ${JSON.stringify(COLORS.gold)},
          lxxAddition: ${JSON.stringify(COLORS.priest)},
          psalmIntroduction: ${JSON.stringify(COLORS.refrain)}
        };
        var startX = 0;
        var startY = 0;
        var suppressClickUntil = 0;
        var resizeFrame = 0;
        var resizeTimer = 0;
        var pendingResizeAnchor = null;

        function post(message) {
          message.readerId = readerId;
          var payload = JSON.stringify(message);
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(payload);
          } else if (window.parent && window.parent !== window) {
            window.parent.postMessage(payload, '*');
          }
        }
        // The highlighting layer is its own script; it posts through this.
        window.__chcBiblePost = post;

        function closestLanguageCell(node) {
          var element = node && node.nodeType === 1 ? node : node && node.parentElement;
          return element && element.closest ? element.closest('.cell[data-language]') : null;
        }

        function setSelectingLanguage(language) {
          selectableLanguages.forEach(function (item) { document.body.classList.remove('selecting-' + item); });
          selectingLanguage = selectableLanguages.indexOf(language) >= 0 ? language : null;
          if (selectingLanguage) document.body.classList.add('selecting-' + selectingLanguage);
        }

        function inferLanguage(node) {
          var cell = closestLanguageCell(node);
          return cell ? cell.getAttribute('data-language') : null;
        }

        function onSelectionStart(event) {
          // A tap on the selection's toolbar keeps the column it's in.
          if (event.target && event.target.closest && event.target.closest('#sermon-highlight-tools')) return;
          setSelectingLanguage(inferLanguage(event.target));
        }

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
        } else {

        function normalizeSelectionText(text) {
          return String(text || '')
            .replace(/[ \\t\\f\\v]+/g, ' ')
            .replace(/ *\\n */g, '\\n')
            .replace(/\\n{3,}/g, '\\n\\n')
            .trim();
        }

        function rangeIntersectsNode(range, node) {
          try {
            return range.intersectsNode(node);
          } catch (error) {
            return false;
          }
        }

        function clippedRangeForNode(range, node) {
          if (!rangeIntersectsNode(range, node)) return null;
          var nodeRange = document.createRange();
          nodeRange.selectNodeContents(node);
          var clipped = range.cloneRange();
          if (clipped.compareBoundaryPoints(Range.START_TO_START, nodeRange) < 0) {
            clipped.setStart(nodeRange.startContainer, nodeRange.startOffset);
          }
          if (clipped.compareBoundaryPoints(Range.END_TO_END, nodeRange) > 0) {
            clipped.setEnd(nodeRange.endContainer, nodeRange.endOffset);
          }
          return clipped;
        }

        function styleString(styles) {
          return Object.keys(styles)
            .filter(function (key) { return styles[key] !== null && styles[key] !== undefined && styles[key] !== ''; })
            .map(function (key) { return key + ':' + styles[key]; })
            .join(';');
        }

        function escapeCopyHtml(text) {
          return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        }

        // The selected verses of the one column the selection is in: each
        // one's number as shown and the words selected from it.
        function selectedVerses(selection, language) {
          if (!selection || !selection.rangeCount || !language) return [];
          var range = selection.getRangeAt(0);
          if (range.collapsed) return [];
          var cells = document.querySelectorAll('.verse-row:not(.preface-row) .cell[data-language="' + language + '"]');
          return Array.prototype.slice.call(cells).map(function (cell) {
            var textNode = cell.querySelector('.verse-text');
            var clipped = textNode && clippedRangeForNode(range, textNode);
            var text = clipped ? normalizeSelectionText(clipped.toString()) : '';
            if (!text) return null;
            var numberNode = cell.querySelector('.verse-number');
            return {
              cell: cell,
              number: numberNode ? normalizeSelectionText(numberNode.textContent) : '',
              text: text,
              lxxAddition: Boolean(numberNode && numberNode.classList.contains('lxx-addition')),
              introduction: cell.classList.contains('psalm-introduction')
            };
          }).filter(Boolean);
        }

        // "- Leviticus 2", or "- Leviticus 2:1" for one verse — in the
        // column's own language and numerals (English for its three English
        // columns, Arabic for both Arabic ones).
        var COPY_REFERENCE_LANGUAGE = {
          english: 'english', englishNkjv: 'english', englishFromCoptic: 'english',
          arabic: 'arabic', arabicFromCoptic: 'arabic',
          coptic: 'coptic', greek: 'greek', french: 'french'
        };
        function copyReferenceText(language, verses) {
          if (!copyReference) return '';
          var chapter = copyReference[COPY_REFERENCE_LANGUAGE[language] || 'english'] || copyReference.english;
          if (!chapter) return '';
          return '- ' + chapter + (verses.length === 1 && verses[0].number ? ':' + verses[0].number : '');
        }

        // The rich copy looks like the reader: white words on black in the
        // column's own font, gold bold verse numbers — or, for one verse, a
        // gold bold reference instead. It is always the reader's base size,
        // though the reader enlarges Coptic and Arabic. Every run carries its
        // own background and font, since editors keep a run's styles but
        // drop a block's.
        // Lines are <br>s inside one block, which iOS and Android both turn
        // into single newlines for the plain text they derive from it.
        function copyHtml(verses, single, reference) {
          var cell = verses[0].cell;
          var computed = window.getComputedStyle ? window.getComputedStyle(cell) : null;
          var direction = cell.getAttribute('dir') || 'ltr';
          var font = {
            'font-family': computed ? computed.fontFamily : "Georgia, 'Times New Roman', serif",
            'font-size': '${safeFontSize}px'
          };
          function run(tag, text, styles) {
            var style = styleString(Object.assign({ 'background-color': richCopyColors.background }, font, styles));
            return '<' + tag + ' style="' + escapeCopyHtml(style) + '">' + escapeCopyHtml(text).replace(/\\n/g, '<br>') + '</' + tag + '>';
          }
          var lines = verses.map(function (verse) {
            var textStyles = verse.introduction
              ? { 'color': richCopyColors.psalmIntroduction, 'font-style': 'italic' }
              : { 'color': richCopyColors.text };
            if (single || !verse.number) return run('span', verse.text, textStyles);
            return run('b', verse.number, {
              'color': verse.lxxAddition ? richCopyColors.lxxAddition : richCopyColors.gold,
              'font-weight': '700'
            }) + run('span', ' ' + verse.text, textStyles);
          });
          if (reference) {
            lines.push(single
              ? run('b', reference, { 'color': richCopyColors.gold, 'font-weight': '700' })
              : run('span', reference, { 'color': richCopyColors.text }));
          }
          var block = styleString(Object.assign({
            'background': richCopyColors.background,
            'background-color': richCopyColors.background,
            'color': richCopyColors.text,
            'line-height': '${Math.round(safeFontSize * 1.3)}px',
            'direction': direction,
            'text-align': direction === 'rtl' ? 'right' : 'left',
            'padding': '8px',
            'margin': '0'
          }, font));
          return '<meta charset="utf-8"><div dir="' + direction + '" style="' + escapeCopyHtml(block) + '">' + lines.join('<br>') + '</div>';
        }

        // What Copy puts on the clipboard, as plain text and as rich text:
        // one verse is its words then "- Leviticus 2:1"; several are
        // "1 words" per line then "- Leviticus 2".
        function bibleCopyPayload(selection) {
          selection = selection || (window.getSelection && window.getSelection());
          var language = selectingLanguage || (selection && (inferLanguage(selection.anchorNode) || inferLanguage(selection.focusNode)));
          var verses = selectedVerses(selection, language);
          if (!verses.length) return null;
          var single = verses.length === 1;
          var reference = copyReferenceText(language, verses);
          var lines = verses.map(function (verse) {
            return single || !verse.number ? verse.text : verse.number + ' ' + verse.text;
          });
          if (reference) lines.push(reference);
          return { text: lines.join('\\n'), html: copyHtml(verses, single, reference) };
        }
        // The toolbar's Copy asks for the same payload.
        window.__chcBibleCopyPayload = bibleCopyPayload;

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
          var payload = bibleCopyPayload(window.getSelection && window.getSelection());
          if (!payload || !event.clipboardData) return;
          event.clipboardData.setData('text/plain', payload.text);
          event.clipboardData.setData('text/html', payload.html);
          event.preventDefault();
        });
        }

        function stripIds(node) {
          if (!node || node.nodeType !== 1) return;
          node.removeAttribute('id');
          Array.prototype.slice.call(node.children || []).forEach(stripIds);
        }

        function createPage() {
          var page = document.createElement('section');
          page.className = 'slide-page';
          pages.appendChild(page);
          return page;
        }

        function pageOverflows(page) {
          return page && page.scrollHeight > page.clientHeight + 1;
        }

        function pageHasContent(page) {
          return Boolean(page && page.children && page.children.length);
        }

        function getCurrentPageNode() {
          return (pages && pages.children[Math.min(Math.max(currentPage, 0), pageCount - 1)]) || null;
        }

        function splitGraphemes(text) {
          if (window.Intl && typeof window.Intl.Segmenter === 'function') {
            return Array.from(new window.Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), function (entry) {
              return entry.segment;
            });
          }
          return Array.from(text).reduce(function (graphemes, character) {
            if (/[̀-ͯ᪰-᫿︠-︯]/.test(character) && graphemes.length) {
              graphemes[graphemes.length - 1] += character;
            } else {
              graphemes.push(character);
            }
            return graphemes;
          }, []);
        }

        function getRowTextEntries(sourceRow) {
          return Array.prototype.slice.call(sourceRow.querySelectorAll('.verse-text')).map(function (textNode) {
            var text = (textNode.innerText || textNode.textContent || '').replace(/\\s+/g, ' ').trim();
            var hasWordSeparators = /\\s/.test(text);
            return {
              offset: 0,
              separator: hasWordSeparators ? ' ' : '',
              tokens: hasWordSeparators ? text.split(/\\s+/).filter(Boolean) : splitGraphemes(text),
            };
          });
        }

        function hasRemainingRowText(entries) {
          return entries.some(function (entry) { return entry.offset < entry.tokens.length; });
        }

        function getMaxRemainingRowTokens(entries) {
          return entries.reduce(function (max, entry) { return Math.max(max, entry.tokens.length - entry.offset); }, 0);
        }

        function getRowProgress(entries) {
          if (!entries.length) return 0;
          return entries.reduce(function (smallest, entry) {
            if (!entry.tokens.length) return smallest;
            return Math.min(smallest, entry.offset / entry.tokens.length);
          }, 1);
        }

        function cloneSegmentRow(sourceRow, entries, takeCount, includeVerseNumbers) {
          var rowClone = sourceRow.cloneNode(true);
          var textNodes = Array.prototype.slice.call(rowClone.querySelectorAll('.verse-text'));
          stripIds(rowClone);
          rowClone.setAttribute('data-segment-progress', String(getRowProgress(entries)));
          if (!includeVerseNumbers) {
            Array.prototype.slice.call(rowClone.querySelectorAll('.verse-number')).forEach(function (numberNode) {
              numberNode.remove();
            });
          }
          textNodes.forEach(function (textNode, index) {
            var entry = entries[index] || { offset: 0, separator: ' ', tokens: [] };
            var available = Math.max(entry.tokens.length - entry.offset, 0);
            var count = Math.min(takeCount, available);
            var text = entry.tokens.slice(entry.offset, entry.offset + count).join(entry.separator);
            textNode.textContent = text;
          });
          return rowClone;
        }

        function advanceRowEntries(entries, takeCount) {
          entries.forEach(function (entry) {
            var available = Math.max(entry.tokens.length - entry.offset, 0);
            entry.offset += Math.min(takeCount, available);
          });
        }

        function appendOversizedRow(sourceRow, pageState) {
          var entries = getRowTextEntries(sourceRow);
          var page = pageState.page;
          var includeVerseNumbers = true;

          if (!entries.length || !hasRemainingRowText(entries)) {
            var fallbackClone = sourceRow.cloneNode(true);
            stripIds(fallbackClone);
            page.appendChild(fallbackClone);
            pageState.page = page;
            return;
          }

          while (hasRemainingRowText(entries)) {
            if (!page) page = createPage();

            var maxTake = getMaxRemainingRowTokens(entries);
            var low = 1;
            var high = maxTake;
            var best = 0;

            while (low <= high) {
              var mid = Math.floor((low + high) / 2);
              var trialRow = cloneSegmentRow(sourceRow, entries, mid, includeVerseNumbers);
              page.appendChild(trialRow);
              if (pageOverflows(page)) {
                high = mid - 1;
              } else {
                best = mid;
                low = mid + 1;
              }
              page.removeChild(trialRow);
            }

            if (best < 1) {
              if (pageHasContent(page)) {
                page = createPage();
                continue;
              }
              best = 1;
            }

            page.appendChild(cloneSegmentRow(sourceRow, entries, best, includeVerseNumbers));
            advanceRowEntries(entries, best);
            includeVerseNumbers = false;

            if (hasRemainingRowText(entries)) page = createPage();
          }

          pageState.page = page;
        }

        function applyPage() {
          if (!isSlideshow || !pages) return;
          currentPage = Math.min(Math.max(currentPage, 0), pageCount - 1);
          Array.prototype.forEach.call(pages.children || [], function (page, index) {
            var isCurrent = index === currentPage;
            page.style.display = isCurrent ? 'block' : 'none';
            page.setAttribute('aria-hidden', isCurrent ? 'false' : 'true');
          });
          if (previousButton) {
            previousButton.disabled = currentPage <= 0;
            previousButton.setAttribute('aria-disabled', currentPage <= 0 ? 'true' : 'false');
          }
          if (nextButton) {
            nextButton.disabled = currentPage >= pageCount - 1;
            nextButton.setAttribute('aria-disabled', currentPage >= pageCount - 1 ? 'true' : 'false');
          }
          if (pagerStatus) pagerStatus.textContent = 'Slide ' + (currentPage + 1) + ' of ' + pageCount;
          var current = getCurrentAnchor();
          if (current) reportVerse(current.verse);
        }

        function paginate(preferredAnchor) {
          if (!isSlideshow || !sourceDocument || !pages || !pager) return;
          var rows = Array.prototype.slice.call(sourceDocument.querySelectorAll('.verse-row'));
          var previousAnchor = typeof preferredAnchor === 'string'
            ? { verse: preferredAnchor, progress: 0 }
            : preferredAnchor || getCurrentAnchor();
          var page = null;

          pages.style.visibility = 'hidden';
          pages.innerHTML = '';

          rows.forEach(function (row) {
            if (!page) page = createPage();
            var clone = row.cloneNode(true);
            stripIds(clone);
            clone.setAttribute('data-segment-progress', '0');
            page.appendChild(clone);
            if (!pageOverflows(page)) return;
            page.removeChild(clone);

            if (!pageHasContent(page)) {
              appendOversizedRow(row, { page: page });
              page = pages.children[pages.children.length - 1];
              return;
            }

            page = createPage();
            page.appendChild(clone);
            if (pageOverflows(page)) {
              page.removeChild(clone);
              var state = { page: page };
              appendOversizedRow(row, state);
              page = state.page;
            }
          });

          if (!pages.children.length) createPage();

          pageCount = Math.max(1, pages.children.length);
          pages.style.visibility = 'visible';
          if (previousAnchor && previousAnchor.verse) {
            selectAnchor(previousAnchor);
          } else {
            applyPage();
          }
        }

        function getCurrentAnchor() {
          var page = getCurrentPageNode();
          var row = page ? page.querySelector('[data-verse]') : null;
          return row
            ? {
                verse: row.getAttribute('data-verse') || '',
                progress: Number(row.getAttribute('data-segment-progress')) || 0
              }
            : null;
        }

        function getCurrentVerse() {
          var anchor = getCurrentAnchor();
          return anchor ? anchor.verse : '';
        }

        function pageForAnchor(anchor) {
          if (!pages || !anchor || !anchor.verse) return -1;
          var selector = '[data-verse="' + String(anchor.verse).replace(/"/g, '\\\\22 ') + '"]';
          var desiredProgress = Number(anchor.progress) || 0;
          var bestIndex = -1;
          var bestDistance = Infinity;
          Array.prototype.forEach.call(pages.children || [], function (page, index) {
            var row = page.querySelector(selector);
            if (!row) return;
            var progress = Number(row.getAttribute('data-segment-progress')) || 0;
            var distance = progress <= desiredProgress
              ? desiredProgress - progress
              : 1000 + progress - desiredProgress;
            if (distance < bestDistance) {
              bestDistance = distance;
              bestIndex = index;
            }
          });
          return bestIndex;
        }

        function selectAnchor(anchor) {
          var targetPage = pageForAnchor(anchor);
          if (targetPage >= 0) currentPage = targetPage;
          applyPage();
        }

        function previousPage() {
          if (!isSlideshow || currentPage <= 0) return;
          currentPage -= 1;
          applyPage();
        }

        function nextPage() {
          if (!isSlideshow || currentPage >= pageCount - 1) return;
          currentPage += 1;
          applyPage();
        }

        function selectVerse(verse) {
          var target = document.querySelector('[data-verse="' + String(verse).replace(/"/g, '\\\\22 ') + '"]');
          if (isSlideshow) {
            selectAnchor({ verse: String(verse), progress: 0 });
            return;
          }
          if (target) {
            target.scrollIntoView({ block: 'start', behavior: 'smooth' });
            reportVerse(verse);
          }
        }

        window.selectBibleVerse = selectVerse;
        var previousButton = document.querySelector('.tap-zone.previous');
        var nextButton = document.querySelector('.tap-zone.next');
        function handleTapPageTurn(callback) {
          return function (event) {
            if (Date.now() < suppressClickUntil) {
              event.preventDefault();
              return;
            }
            callback();
          };
        }
        if (previousButton) previousButton.addEventListener('click', handleTapPageTurn(previousPage));
        if (nextButton) nextButton.addEventListener('click', handleTapPageTurn(nextPage));

        function isEditableTarget(target) {
          if (!target || target.nodeType !== 1) return false;
          var tag = String(target.tagName || '').toLowerCase();
          return target.isContentEditable || ['a', 'button', 'input', 'select', 'textarea'].indexOf(tag) >= 0;
        }

        document.addEventListener('keydown', function (event) {
          if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) return;
          var previousKeys = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'];
          var nextKeys = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Spacebar', 'Enter'];
          if (previousKeys.indexOf(event.key) >= 0) {
            event.preventDefault();
            previousPage();
          } else if (nextKeys.indexOf(event.key) >= 0) {
            event.preventDefault();
            nextPage();
          } else if (event.key === 'Home') {
            event.preventDefault();
            currentPage = 0;
            applyPage();
          } else if (event.key === 'End') {
            event.preventDefault();
            currentPage = pageCount - 1;
            applyPage();
          }
        });
        document.addEventListener('touchstart', function (event) {
          var touch = event.touches && event.touches[0];
          if (!touch) return;
          startX = touch.clientX;
          startY = touch.clientY;
        }, { passive: true });
        document.addEventListener('touchend', function (event) {
          var touch = event.changedTouches && event.changedTouches[0];
          if (!touch || touch.touchType === 'stylus') return;
          var dx = touch.clientX - startX;
          var dy = touch.clientY - startY;
          if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
          // Mobile browsers synthesize a click after touchend. Without this,
          // one swipe advances here and then advances a second time through
          // the transparent tap-zone button underneath it.
          suppressClickUntil = Date.now() + 500;
          if (${JSON.stringify(nativeSwipeNavigation)} && startX < Math.min(96, Math.max(56, window.innerWidth * 0.16)) && dx > 60) {
            post({ type: 'previousLevel' });
            return;
          }
          if (startX > window.innerWidth - Math.min(96, Math.max(56, window.innerWidth * 0.16)) && dx < 0) {
            post({ type: 'openSelector' });
            return;
          }
          if (!isSlideshow) return;
          if (dx < 0) { nextPage(); } else { previousPage(); }
        }, { passive: true });

        // A verse arrived at from a search hit or a deep link is marked so the
        // reader can see which one of the chapter they were sent to; the mark
        // fades on its own rather than lingering over the reading.
        function highlightVerse(verse) {
          var rows = document.querySelectorAll('[data-verse="' + String(verse).replace(/"/g, '\\\\22 ') + '"]');
          if (!rows.length) return;
          Array.prototype.forEach.call(rows, function (row) { row.classList.add('verse-target'); });
          setTimeout(function () {
            Array.prototype.forEach.call(rows, function (row) { row.classList.add('verse-target-fading'); });
            setTimeout(function () {
              Array.prototype.forEach.call(rows, function (row) {
                row.classList.remove('verse-target');
                row.classList.remove('verse-target-fading');
              });
            }, 800);
          }, 2200);
        }

        if (isSlideshow) {
          requestAnimationFrame(function () {
            var initialPaginationDone = false;
            var finishInitialLayout = function () {
              if (initialPaginationDone) return;
              initialPaginationDone = true;
              paginate(initialAnchorVerse);
              if (initialVerse && !restoreVerse) highlightVerse(initialVerse);
            };
            if (document.fonts && document.fonts.ready) {
              document.fonts.ready.then(finishInitialLayout);
            }
            setTimeout(finishInitialLayout, 160);
          });
          window.addEventListener('resize', function () {
            pendingResizeAnchor = getCurrentAnchor() || pendingResizeAnchor;
            if (resizeFrame) cancelAnimationFrame(resizeFrame);
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
              resizeTimer = 0;
              resizeFrame = requestAnimationFrame(function () {
                resizeFrame = 0;
                var anchor = pendingResizeAnchor;
                pendingResizeAnchor = null;
                paginate(anchor);
              });
            }, 80);
          });
        } else {
          var rows = Array.prototype.slice.call(document.querySelectorAll('#source-document .verse-row[data-verse], .scroll-document .verse-row[data-verse], body.scroll .verse-row[data-verse]'));
          var scrollReportPending = false;
          function reportScrollVerse() {
            scrollReportPending = false;
            if (!rows.length) return;
            var current = rows[0];
            for (var i = 0; i < rows.length; i += 1) {
              if (rows[i].getBoundingClientRect().top <= 96) current = rows[i];
              else break;
            }
            reportVerse(current.getAttribute('data-verse'));
          }
          function scheduleScrollReport() {
            if (scrollReportPending) return;
            scrollReportPending = true;
            requestAnimationFrame(reportScrollVerse);
          }
          window.addEventListener('scroll', scheduleScrollReport, { passive: true });
          requestAnimationFrame(function () {
            if (initialAnchorVerse) {
              var target = document.querySelector('[data-verse="' + String(initialAnchorVerse).replace(/"/g, '\\\\22 ') + '"]');
              if (target) target.scrollIntoView({ block: 'start' });
              if (initialVerse && !restoreVerse) highlightVerse(initialVerse);
            }
            scheduleScrollReport();
          });
        }
      })();
    </script>
    ${effectiveHighlighting ? `<script>${textHighlightScript({
      emit: 'function (type, payload) { if (window.__chcBiblePost) window.__chcBiblePost(Object.assign({ type: type }, payload || {})); }',
      actions: {
        create: 'createBibleHighlights',
        pencil: 'biblePencilGesture',
        recolor: 'recolorBibleHighlight',
        remove: 'removeBibleHighlight',
        copy: 'copyBibleText',
      },
      tapToEdit: true,
      copy: true,
      copyPayload: 'window.__chcBibleCopyPayload',
      singleLanguage: true,
      labels: highlightLabels,
    })}</script>` : ''}
  </body>
</html>`;
}

/** "chapter:verse" where the verse is stored — see BibleDisplayVerse.sourceChapter. */
export function bibleHighlightVerseId(verse: Pick<BibleDisplayVerse, 'verseNumber' | 'sourceChapter' | 'sourceVerse'>): string {
  const verseNumber = String(verse.sourceVerse ?? verse.verseNumber);
  return verse.sourceChapter === undefined ? verseNumber : `${verse.sourceChapter}:${verseNumber}`;
}

const COPTIC_CHARACTER_PATTERN = /[Ϣ-ϯⲀ-⳿ⲭⲬϭϮ]/u;
const COPTIC_CHARACTER_GLOBAL_PATTERN = /[Ϣ-ϯⲀ-⳿ⲭⲬϭϮ]/gu;
const COPTIC_TO_LOWER: Record<string, string> = { Ⲭ: 'ⲭ', Ϭ: 'ϭ', Ϯ: 'ϯ' };
const COPTIC_TO_UPPER: Record<string, string> = { ⲭ: 'Ⲭ', ϭ: 'Ϭ', ϯ: 'Ϯ' };

function isArabicLanguage(language: BibleLanguageKey): boolean {
  return language === 'arabic' || language === 'arabicFromCoptic';
}

function formatVerseText(text: string, language: BibleLanguageKey, isFirstCopticVerse: boolean): string {
  if (isArabicLanguage(language)) return formatArabicDigits(text);
  if (language === 'greek') return String(text || '');
  if (language === 'coptic') {
    const normalized = lowercaseCopticCharacters(String(text || ''));
    const withCopticNumbers = formatCopticNumbers(normalized);
    return isFirstCopticVerse ? uppercaseFirstCopticCharacter(withCopticNumbers) : withCopticNumbers;
  }
  return formatEnglishDisplayText(text);
}

function lowercaseCopticCharacters(text: string): string {
  return text.replace(COPTIC_CHARACTER_GLOBAL_PATTERN, (ch) => COPTIC_TO_LOWER[ch] ?? ch.toLocaleLowerCase());
}

function uppercaseFirstCopticCharacter(text: string): string {
  const index = text.search(COPTIC_CHARACTER_PATTERN);
  if (index === -1) return text;
  const upper = COPTIC_TO_UPPER[text[index]] ?? text[index].toLocaleUpperCase();
  return text.slice(0, index) + upper + text.slice(index + 1);
}

function formatVerseNumber(verseNumber: number | string, language: BibleLanguageKey): string {
  const text = String(verseNumber);
  const numericValue = /^\d+$/.test(text) ? Number(text) : null;
  if (isArabicLanguage(language)) return formatArabicLetterSuffixes(formatArabicDigits(text));
  if (language === 'coptic') return numericValue === null ? text : formatCopticNumber(numericValue);
  if (language === 'greek') return numericValue === null ? text : formatGreekNumber(numericValue);
  return String(verseNumber);
}

const EASTERN_ARABIC_DIGITS: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩',
};

function formatArabicDigits(text: string) {
  return String(text || '').replace(/\d/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit);
}

const ARABIC_LETTER_SUFFIXES = ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'];

function formatArabicLetterSuffixes(text: string) {
  return String(text || '').replace(/[a-z]/gi, (letter) => {
    const index = letter.toLowerCase().charCodeAt(0) - 97;
    return ARABIC_LETTER_SUFFIXES[index] || letter;
  });
}

function formatCopticNumbers(text: string): string {
  return String(text || '').replace(/\d+/g, (value) => formatCopticNumber(Number(value)));
}

function getLanguageFontSize(fontSize: number, language: BibleLanguageKey) {
  if (language === 'coptic') return Math.round(fontSize * 1.25);
  if (isArabicLanguage(language)) return Math.round(fontSize * 1.15);
  return fontSize;
}

function getLanguageLineHeight(fontSize: number, language: BibleLanguageKey) {
  if (isArabicLanguage(language)) return Math.round(fontSize * 1.6);
  return Math.round(fontSize * 1.3);
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
