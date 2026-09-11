import { COLORS } from '../../constants/theme';
import { formatEnglishDisplayText } from '../../utils/displayText';

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
  preface = null,
  initialVerse = null,
}: {
  verses: BibleDisplayVerse[];
  languageKeys: BibleLanguageKey[];
  fontSize: number;
  copticFontDataUri: string;
  selectText?: boolean;
  isSlideshow?: boolean;
  preface?: BiblePreface | null;
  /** Verse to land on when the chapter opens (a search hit or a deep link), instead of the top. */
  initialVerse?: string | number | null;
}) {
  const safeFontSize = Math.max(12, Number(fontSize) || 18);
  const effectiveSelectText = Boolean(selectText) && !isSlideshow;
  const effectiveLanguages: BibleLanguageKey[] = languageKeys.length ? languageKeys : ['english'];
  const columnTemplate = `repeat(${Math.max(effectiveLanguages.length, 1)}, minmax(0, 1fr))`;
  const firstCopticVerse = verses.find((verse) => !verse.isPsalmIntroduction && String(verse.coptic || '').trim());
  const arabicVerseLineHeight = Math.round(fontSize * 1.6);

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
          return [
            `<div class="cell ${language}${isPsalmIntroduction ? ' psalm-introduction' : ''}" data-language="${language}" dir="${isArabicLanguage(language) ? 'rtl' : 'ltr'}">`,
            verseNumberHtml,
            `<span class="verse-text">${escapeHtml(formatVerseText(text, language, verse === firstCopticVerse))}</span>`,
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
    <button class="tap-zone next" aria-label="Next page"></button>`
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
      }
      html, body {
        margin: 0;
        min-height: 100%;
        background: #000;
        color: var(--text-color);
        font-family: Georgia, 'Times New Roman', serif;
        -webkit-text-size-adjust: 100%;
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
        padding: 14px 14px calc(28px + env(safe-area-inset-bottom));
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
        line-height: 1.25;
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
        overflow: hidden;
        position: relative;
        touch-action: manipulation;
        width: 100vw;
      }
      .slideshow-pages {
        box-sizing: border-box;
        display: flex;
        flex-direction: row;
        height: 100vh;
        transition: none;
        will-change: transform;
        width: max-content;
      }
      .slide-page {
        box-sizing: border-box;
        flex: 0 0 100vw;
        height: 100vh;
        overflow: hidden;
        padding: calc(18px + env(safe-area-inset-top)) 18px calc(22px + env(safe-area-inset-bottom));
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
      .slide-page .verse-row { border-bottom: 0; }
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
    </style>
  </head>
  <body class="${isSlideshow ? 'slideshow' : 'scroll'}">
    ${bodyContent}
    <script>
      (function () {
        var sourceDocument = document.getElementById('source-document');
        var pager = document.getElementById('pager');
        var pages = document.getElementById('pages');
        var currentPage = 0;
        var pageCount = 1;
        var pageWidth = 1;
        var isSlideshow = ${JSON.stringify(Boolean(isSlideshow))};
        var selectTextEnabled = ${JSON.stringify(effectiveSelectText)};
        var initialVerse = ${JSON.stringify(initialVerse === null || initialVerse === undefined ? '' : String(initialVerse))};
        var selectableLanguages = ${JSON.stringify(effectiveLanguages)};
        var selectingLanguage = null;
        var richCopyColors = {
          background: ${JSON.stringify(COLORS.black)},
          text: ${JSON.stringify(COLORS.white)},
          gold: ${JSON.stringify(COLORS.gold)},
          lxxAddition: ${JSON.stringify(COLORS.priest)},
          psalmIntroduction: ${JSON.stringify(COLORS.refrain)}
        };
        var startX = 0;
        var startY = 0;

        function post(message) {
          var payload = JSON.stringify(message);
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(payload);
          } else if (window.parent && window.parent !== window) {
            window.parent.postMessage(payload, '*');
          }
        }

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

        function fragmentText(fragment) {
          var container = document.createElement('div');
          container.appendChild(fragment);
          Array.prototype.slice.call(container.querySelectorAll('.verse-number')).forEach(function (numberNode) {
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

        function clippedRangeForNode(range, node) {
          if (!rangeIntersectsNode(range, node)) return '';
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

        function clippedTextForNode(range, node) {
          var clipped = clippedRangeForNode(range, node);
          return clipped ? fragmentText(clipped.cloneContents()) : '';
        }

        function styleString(styles) {
          return Object.keys(styles)
            .filter(function (key) { return styles[key] !== null && styles[key] !== undefined && styles[key] !== ''; })
            .map(function (key) { return key + ':' + styles[key]; })
            .join(';');
        }

        function inlineRichCopyStyles(container) {
          Array.prototype.slice.call(container.querySelectorAll('.verse-number')).forEach(function (numberNode) {
            var numberText = normalizeSelectionText(numberNode.textContent || '');
            numberNode.textContent = numberText ? numberText + ' ' : '';
            numberNode.setAttribute('style', styleString({
              'background': richCopyColors.background,
              'background-color': richCopyColors.background,
              'color': numberNode.classList.contains('lxx-addition') ? richCopyColors.lxxAddition : richCopyColors.gold,
              'font-weight': '700',
              'white-space': 'nowrap'
            }));
          });
          Array.prototype.slice.call(container.querySelectorAll('.verse-text')).forEach(function (textNode) {
            textNode.setAttribute('style', styleString({
              'background': richCopyColors.background,
              'background-color': richCopyColors.background,
              'color': 'inherit',
              'font-style': 'inherit',
              'white-space': 'pre-wrap'
            }));
          });
          Array.prototype.slice.call(container.querySelectorAll('*')).forEach(function (element) {
            element.removeAttribute('class');
            element.removeAttribute('data-language');
            element.removeAttribute('data-copy-text');
          });
        }

        function fragmentHtml(fragment, sourceNode) {
          var block = document.createElement('div');
          var computed = window.getComputedStyle ? window.getComputedStyle(sourceNode) : null;
          var isIntroduction = sourceNode.classList && sourceNode.classList.contains('psalm-introduction');
          var direction = sourceNode.getAttribute('dir') || (computed ? computed.direction : 'ltr') || 'ltr';
          block.setAttribute('style', styleString({
            'background': richCopyColors.background,
            'background-color': richCopyColors.background,
            'color': isIntroduction ? richCopyColors.psalmIntroduction : richCopyColors.text,
            'font-family': computed ? computed.fontFamily : "Georgia, 'Times New Roman', serif",
            'font-size': computed ? computed.fontSize : '${safeFontSize}px',
            'font-style': isIntroduction ? 'italic' : (computed ? computed.fontStyle : 'normal'),
            'font-weight': computed ? computed.fontWeight : '400',
            'line-height': computed ? computed.lineHeight : '1.25',
            'direction': direction,
            'text-align': direction === 'rtl' ? 'right' : 'left',
            'margin': '0 0 8px 0',
            'padding': '0'
          }));
          block.appendChild(fragment);
          inlineRichCopyStyles(block);
          return block.innerHTML.trim() ? block.outerHTML : '';
        }

        function clippedHtmlForNode(range, node) {
          var clipped = clippedRangeForNode(range, node);
          return clipped ? fragmentHtml(clipped.cloneContents(), node) : '';
        }

        function selectedTextForLanguage(selection, language) {
          if (!selection || !selection.rangeCount || !language) return '';
          var range = selection.getRangeAt(0);
          var nodes = Array.prototype.slice.call(document.querySelectorAll('.cell[data-language="' + language + '"]'));
          return nodes
            .map(function (node) { return clippedTextForNode(range, node); })
            .filter(Boolean)
            .join('\\n');
        }

        function selectedHtmlForLanguage(selection, language) {
          if (!selection || !selection.rangeCount || !language) return '';
          var range = selection.getRangeAt(0);
          var nodes = Array.prototype.slice.call(document.querySelectorAll('.cell[data-language="' + language + '"]'));
          var body = nodes
            .map(function (node) { return clippedHtmlForNode(range, node); })
            .filter(Boolean)
            .join('');
          if (!body) return '';
          return [
            '<meta charset="utf-8">',
            '<div style="' + styleString({
              'background': richCopyColors.background,
              'background-color': richCopyColors.background,
              'color': richCopyColors.text,
              'padding': '8px',
              'margin': '0'
            }) + '">',
            body,
            '</div>'
          ].join('');
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
          var language = selectingLanguage || (selection && (inferLanguage(selection.anchorNode) || inferLanguage(selection.focusNode)));
          var text = selectedTextForLanguage(selection, language);
          if (!text || !event.clipboardData) return;
          event.clipboardData.setData('text/plain', text);
          var html = selectedHtmlForLanguage(selection, language);
          if (html) event.clipboardData.setData('text/html', html);
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

        function getRowTextEntries(sourceRow) {
          return Array.prototype.slice.call(sourceRow.querySelectorAll('.verse-text')).map(function (textNode) {
            var text = (textNode.innerText || textNode.textContent || '').replace(/\\s+/g, ' ').trim();
            var hasWordSeparators = /\\s/.test(text);
            return {
              offset: 0,
              separator: hasWordSeparators ? ' ' : '',
              tokens: hasWordSeparators ? text.split(/\\s+/).filter(Boolean) : text.split(''),
            };
          });
        }

        function hasRemainingRowText(entries) {
          return entries.some(function (entry) { return entry.offset < entry.tokens.length; });
        }

        function getMaxRemainingRowTokens(entries) {
          return entries.reduce(function (max, entry) { return Math.max(max, entry.tokens.length - entry.offset); }, 0);
        }

        function cloneSegmentRow(sourceRow, entries, takeCount, includeVerseNumbers) {
          var rowClone = sourceRow.cloneNode(true);
          var textNodes = Array.prototype.slice.call(rowClone.querySelectorAll('.verse-text'));
          stripIds(rowClone);
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
          pages.style.transform = 'translate3d(' + -currentPage * pageWidth + 'px, 0, 0)';
        }

        function paginate(preferredVerse) {
          if (!isSlideshow || !sourceDocument || !pages || !pager) return;
          var rows = Array.prototype.slice.call(sourceDocument.querySelectorAll('.verse-row'));
          var previousVerse = preferredVerse || getCurrentVerse();
          var page = null;

          pages.style.visibility = 'hidden';
          pages.innerHTML = '';
          pageWidth = Math.max(pager.clientWidth || window.innerWidth || 1, 1);

          rows.forEach(function (row) {
            if (!page) page = createPage();
            var clone = row.cloneNode(true);
            stripIds(clone);
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
          if (previousVerse) {
            selectVerse(previousVerse);
          } else {
            applyPage();
          }
        }

        function getCurrentVerse() {
          var page = getCurrentPageNode();
          var row = page ? page.querySelector('[data-verse]') : null;
          return row ? row.getAttribute('data-verse') : '';
        }

        function pageForVerse(verse) {
          if (!pages) return -1;
          return Array.prototype.slice.call(pages.children || []).findIndex(function (page) {
            return Boolean(page.querySelector('[data-verse="' + String(verse).replace(/"/g, '\\\\22 ') + '"]'));
          });
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
            var targetPage = pageForVerse(verse);
            if (targetPage >= 0) {
              currentPage = targetPage;
              applyPage();
            }
            return;
          }
          if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }

        window.selectBibleVerse = selectVerse;
        var previousButton = document.querySelector('.tap-zone.previous');
        var nextButton = document.querySelector('.tap-zone.next');
        if (previousButton) previousButton.addEventListener('click', previousPage);
        if (nextButton) nextButton.addEventListener('click', nextPage);

        document.addEventListener('keydown', function (event) {
          if (event.key === 'ArrowLeft') previousPage();
          if (event.key === 'ArrowRight') nextPage();
        });
        document.addEventListener('touchstart', function (event) {
          var touch = event.touches && event.touches[0];
          if (!touch) return;
          startX = touch.clientX;
          startY = touch.clientY;
        }, { passive: true });
        document.addEventListener('touchend', function (event) {
          var touch = event.changedTouches && event.changedTouches[0];
          if (!touch) return;
          var dx = touch.clientX - startX;
          var dy = touch.clientY - startY;
          if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
          if (startX < Math.min(96, Math.max(56, window.innerWidth * 0.16)) && dx > 60) {
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
            paginate(initialVerse);
            setTimeout(function () { paginate(getCurrentVerse()); }, 80);
            setTimeout(function () {
              paginate(getCurrentVerse());
              if (initialVerse) highlightVerse(initialVerse);
            }, 240);
          });
          window.addEventListener('resize', function () { paginate(getCurrentVerse()); });
        } else if (initialVerse) {
          requestAnimationFrame(function () {
            var target = document.querySelector('[data-verse="' + String(initialVerse).replace(/"/g, '\\\\22 ') + '"]');
            if (target) target.scrollIntoView({ block: 'start' });
            highlightVerse(initialVerse);
          });
        }
      })();
    </script>
  </body>
</html>`;
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
  return text
    .replace(COPTIC_CHARACTER_GLOBAL_PATTERN, (ch) => COPTIC_TO_LOWER[ch] ?? ch.toLocaleLowerCase())
    .replace(/ⲋ/g, 'Ⲋ');
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

function formatCopticNumbers(text: string): string {
  return String(text || '').replace(/\d+/g, (value) => formatCopticNumber(Number(value)));
}

const GREEK_NUMERAL_SIGN = 'ʹ';
const GREEK_THOUSANDS_SIGN = '͵';
const GREEK_DIGITS: Record<number, string> = { 1: 'Α', 2: 'Β', 3: 'Γ', 4: 'Δ', 5: 'Ε', 6: 'Ϛ', 7: 'Ζ', 8: 'Η', 9: 'Θ' };
const GREEK_TENS: Record<number, string> = { 1: 'Ι', 2: 'Κ', 3: 'Λ', 4: 'Μ', 5: 'Ν', 6: 'Ξ', 7: 'Ο', 8: 'Π', 9: 'Ϟ' };
const GREEK_HUNDREDS: Record<number, string> = { 1: 'Ρ', 2: 'Σ', 3: 'Τ', 4: 'Υ', 5: 'Φ', 6: 'Χ', 7: 'Ψ', 8: 'Ω', 9: 'Ϡ' };

function formatGreekNumber(value: number): string {
  if (!Number.isInteger(value) || value <= 0 || value > 9999) return String(value);
  const thousands = Math.floor(value / 1000);
  const remainder = value % 1000;
  const numeral = `${thousands ? `${GREEK_THOUSANDS_SIGN}${formatGreekNumberUnderThousand(thousands)}` : ''}${formatGreekNumberUnderThousand(remainder)}`;
  return numeral ? `${numeral}${GREEK_NUMERAL_SIGN}` : String(value);
}

function formatGreekNumberUnderThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const ones = value % 10;
  return `${GREEK_HUNDREDS[hundreds] || ''}${GREEK_TENS[tens] || ''}${GREEK_DIGITS[ones] || ''}`;
}

function getLanguageFontSize(fontSize: number, language: BibleLanguageKey) {
  if (language === 'coptic') return Math.round(fontSize * 1.25);
  if (isArabicLanguage(language)) return Math.round(fontSize * 1.15);
  return fontSize;
}

function getLanguageLineHeight(fontSize: number, language: BibleLanguageKey) {
  if (language === 'coptic') return Math.round(getLanguageFontSize(fontSize, language));
  return Math.round(fontSize * 1.25);
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
