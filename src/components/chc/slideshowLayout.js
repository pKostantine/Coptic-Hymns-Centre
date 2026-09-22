/**
 * Pure slideshow layout and pagination helpers.
 *
 * Keeping this module free of React and platform imports makes the hardest
 * part of presentation mode deterministic and directly testable. The render
 * components consume these same metrics, so a line that pagination says fits
 * is rendered with the exact font and line-height assumptions used here.
 */

import { DOCUMENT_CONTROL_METRICS, getDocumentChromeMetrics } from "./documentPresentationMetrics.js";

const SPACING_XS = 4;
const SPACING_SM = 8;
const SPACING_XL = 32;
const MIN_USEFUL_FRAGMENT_LINES = 2;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getSlideshowChromeMetrics(fontSize) {
  const safeFontSize = Math.max(Number(fontSize) || 18, 1);
  const documentChrome = getDocumentChromeMetrics(safeFontSize);
  // Scroll mode renders speaker labels inside the normal language paragraph,
  // so the label inherits that language's full font size. Slideshow must use
  // the same metric instead of shrinking the speaker to a separate chrome
  // scale.
  const speakerFontSize = safeFontSize;

  return {
    ...documentChrome,
    speakerFontSize,
    speakerLineHeight: Math.max(Math.round(speakerFontSize * 1.3), 18),
  };
}

export function getSlideshowLanguageFontSize(language, item = {}, fontSize = 18) {
  if (language === "coptic") {
    return Math.round(fontSize * 1.25);
  }

  if (language === "arabic") {
    return Math.round(fontSize * 1.15);
  }

  return fontSize;
}

export function getSlideshowLanguageLineHeight(language, item = {}, fontSize = 18) {
  // These are the document reader's proven metrics. In particular, Arabic
  // needs substantially more leading for vowel marks than English/Coptic;
  // using 1.25 * the base size clipped Arabic at the largest setting.
  return language === "arabic"
    ? Math.round(fontSize * 1.6)
    : Math.round(fontSize * 1.3);
}

export function getSeasonalPrefixLineHeight(language, item = {}, fontSize = 18) {
  const prefixFontSize = getSlideshowLanguageFontSize(language, item, fontSize);
  return Math.max(Math.round(prefixFontSize * 1.25), 9);
}

export function hasSeasonalPrefixLine(verse = {}) {
  if (verse.slideshowSeasonalPrefixVisible === false) {
    return false;
  }

  const prefix = String(verse.seasonalHoosVersePrefix || "").trim();
  if (!prefix) return false;

  return ["english", "arabic"].some((language) =>
    String(verse[language] || "").trimStart().startsWith(prefix),
  );
}

export function getVerseVerticalPadding(item = {}) {
  return item.verse?.seasonalHoosVersePrefix ? 4 : SPACING_SM * 2;
}

export function getSpeakerRowHeight(item = {}, fontSize = 18, visibleLanguages = {}) {
  if (item.suppressSpeakerLabel || !item.hasSpeakerLabel) return 0;
  if (!visibleLanguages.english && !visibleLanguages.arabic) return 0;
  return Math.max(
    visibleLanguages.english ? getSlideshowLanguageLineHeight('english', item, fontSize) : 0,
    visibleLanguages.arabic ? getSlideshowLanguageLineHeight('arabic', item, fontSize) : 0,
  );
}

function getLanguagePrefixHeight(language, item, fontSize) {
  if (!hasSeasonalPrefixLine(item?.verse)) return 0;
  return getSeasonalPrefixLineHeight(language, item, fontSize);
}

function getVerseCommonHeight(item, fontSize, visibleLanguages) {
  return getVerseVerticalPadding(item) + getSpeakerRowHeight(item, fontSize, visibleLanguages);
}

/** Responsive breathing room which never crowds a short landscape viewport. */
export function getSlidePadding(viewportHeight = 0, bottomContentInset = 0) {
  if (!viewportHeight) return { bottom: SPACING_SM * 2, top: SPACING_SM * 2 };
  const edge = clamp(Math.floor(viewportHeight * 0.04), SPACING_SM, SPACING_XL);
  const requestedInset = Math.max(Number(bottomContentInset) || 0, 0);
  const boundedInset = Math.min(requestedInset, Math.max(viewportHeight - edge * 2 - 1, 0));
  return { bottom: edge + boundedInset, top: edge };
}

/** The content budget is always bounded by the real viewport. */
export function getSlideContentBudget(viewportHeight, padding = getSlidePadding(viewportHeight)) {
  const safeHeight = Math.max(Number(viewportHeight) || 0, 0);
  return Math.max(safeHeight - (padding.top || 0) - (padding.bottom || 0) - 2, 1);
}

/** FNV-1a keeps signatures compact while still hashing the actual content. */
export function hashSlideshowText(value) {
  const text = String(value ?? "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function getItemSignature(item, displayedTitle = "") {
  if (item.type === "title" || item.type === "button") {
    return [
      item.id,
      item.type,
      hashSlideshowText(displayedTitle),
      item.isCollapsed ? "collapsed" : "open",
      item.collapsible ? "collapsible" : "fixed",
    ].join(":");
  }

  if (item.type === "gospelRiteToggle") {
    return `${item.id}:gospelRiteToggle`;
  }

  const verse = item.verse || {};
  return [
    item.id,
    "verse",
    hashSlideshowText([
      verse.english,
      verse.coptic,
      verse.arabic,
      verse.type,
      verse.personRole,
      verse.prayerType,
      verse.bibleVerseNumber,
      verse.seasonalHoosVersePrefix,
      verse.preserveCopticDigits,
      verse.centeredAcrossPage,
      verse.invincibleCoptic,
      verse.forceCopticVisible,
      verse.italic,
      item.suppressSpeakerLabel,
      item.hasSpeakerLabel,
    ].join("\u241f")),
  ].join(":");
}

function hasVisibleTitleText(title) {
  return Boolean(title?.english || title?.arabic);
}

function buildPaginationUnits(items) {
  return items.map((item) => ({
    items: [item],
    breakBefore:
      (item.type === "title" && !item.isCollapsed && hasVisibleTitleText(item.title)) ||
      item.type === "button",
  }));
}

export function paginateItems(
  items,
  heights,
  languageHeights,
  availableHeight,
  fontSize,
  visibleLanguages,
  tableWidth,
) {
  const safeAvailableHeight = Math.max(Number(availableHeight) || 0, 1);
  const units = buildPaginationUnits(items);
  const slides = [];
  let currentSlide = [];
  let currentHeight = 0;

  const flushSlide = () => {
    if (currentSlide.length) slides.push(currentSlide);
    currentSlide = [];
    currentHeight = 0;
  };

  const placeVerse = (verseItem) => {
    const verseHeight = Math.ceil((heights[verseItem.id] ?? 0) + 2);

    if (currentHeight + verseHeight <= safeAvailableHeight) {
      currentSlide.push(verseItem);
      currentHeight += verseHeight;
      return;
    }

    if (currentSlide.length && verseHeight <= safeAvailableHeight) {
      flushSlide();
      currentSlide.push(verseItem);
      currentHeight += verseHeight;
      return;
    }

    const languageMetric = hasMeasuredVerseLines(languageHeights[verseItem.id])
      ? languageHeights[verseItem.id]
      : createEstimatedVerseMetric(verseItem, fontSize, visibleLanguages, tableWidth);

    if (!hasMeasuredVerseLines(languageMetric)) {
      if (currentSlide.length) flushSlide();
      currentSlide.push(verseItem);
      currentHeight += verseHeight;
      return;
    }

    const result = appendTallVerseSegments({
      item: verseItem,
      languageMetric,
      slides,
      currentSlide,
      currentHeight,
      availableHeight: safeAvailableHeight,
      fontSize,
      tableWidth,
      visibleLanguages,
    });
    currentSlide = result.currentSlide;
    currentHeight = result.currentHeight;
  };

  for (const unit of units) {
    if (currentSlide.length && unit.breakBefore) flushSlide();

    const item = unit.items[0];
    if (item.type === "verse") {
      placeVerse(item);
      continue;
    }

    const itemHeight = Math.ceil((heights[item.id] ?? 0) + 2);
    if (currentSlide.length && currentHeight + itemHeight > safeAvailableHeight) flushSlide();
    currentSlide.push(item);
    currentHeight += itemHeight;
  }

  flushSlide();
  return slides.length ? slides : [[]];
}

function appendTallVerseSegments({
  item,
  languageMetric,
  slides,
  currentSlide,
  currentHeight,
  availableHeight,
  fontSize,
  visibleLanguages,
}) {
  const state = createVerseLineState(languageMetric, fontSize, item);
  let segmentIndex = 0;

  while (hasRemainingVerseLines(state)) {
    const capacityItem = segmentIndex > 0
      ? createContinuationCapacityItem(item)
      : item;
    const remainingHeight = availableHeight - currentHeight;
    let lineCapacities = getIndependentLineCapacities(
      state,
      remainingHeight,
      fontSize,
      capacityItem,
      visibleLanguages,
    );

    if (currentSlide.length && shouldAvoidTinyFragment(
      state,
      lineCapacities,
      availableHeight,
      fontSize,
      capacityItem,
      visibleLanguages,
    )) {
      slides.push(currentSlide);
      currentSlide = [];
      currentHeight = 0;
      continue;
    }

    if (!hasPositiveLineCapacity(lineCapacities) && currentSlide.length) {
      slides.push(currentSlide);
      currentSlide = [];
      currentHeight = 0;
      continue;
    }

    if (!hasPositiveLineCapacity(lineCapacities)) {
      const decorationHeight = getVerseDecorationHeight(
        state,
        capacityItem,
        fontSize,
        visibleLanguages,
      );
      if (
        segmentIndex === 0 &&
        decorationHeight > getVerseVerticalPadding(capacityItem) &&
        decorationHeight <= availableHeight
      ) {
        currentSlide.push(createVerseDecorationSegment(item, state));
        slides.push(currentSlide);
        currentSlide = [];
        currentHeight = 0;
        segmentIndex += 1;
        continue;
      }
      lineCapacities = getMinimumLineCapacities(state);
    }

    const segment = createVerseLineSegment(item, state, lineCapacities, segmentIndex);
    const segmentHeight = getVerseLineSegmentHeight(
      segment,
      fontSize,
      visibleLanguages,
    );

    currentSlide.push(segment.item);
    currentHeight += segmentHeight;
    segmentIndex += 1;

    if (hasRemainingVerseLines(state)) {
      slides.push(currentSlide);
      currentSlide = [];
      currentHeight = 0;
    }
  }

  return { currentSlide, currentHeight };
}

function createContinuationCapacityItem(item) {
  return {
    ...item,
    suppressSpeakerLabel: true,
    verse: {
      ...item.verse,
      bibleVerseNumber: "",
      slideshowSeasonalPrefixVisible: false,
    },
  };
}

function shouldAvoidTinyFragment(
  state,
  currentCapacities,
  availableHeight,
  fontSize,
  item,
  visibleLanguages,
) {
  const remainingLineCount = state.languages.reduce(
    (largest, entry) => Math.max(largest, entry.lines.length - entry.offset),
    0,
  );
  const currentCapacity = Math.max(0, ...Object.values(currentCapacities));
  const freshCapacity = Math.max(
    0,
    ...Object.values(getIndependentLineCapacities(
      state,
      availableHeight,
      fontSize,
      item,
      visibleLanguages,
    )),
  );
  const desired = Math.min(MIN_USEFUL_FRAGMENT_LINES, remainingLineCount, freshCapacity);
  return desired > 0 && currentCapacity < desired;
}

export function hasMeasuredVerseLines(metric = {}) {
  return ["english", "coptic", "arabic"].some(
    (language) => Array.isArray(metric[language]?.lines) && metric[language].lines.length,
  );
}

function createVerseLineState(languageMetric = {}, fontSize, item = {}) {
  return {
    languages: ["english", "coptic", "arabic"]
      .map((language) => ({
        language,
        lineHeight: getSlideshowLanguageLineHeight(language, item, fontSize),
        lines: getMetricLinesForLanguage(languageMetric[language]?.lines || [], language, item),
        offset: 0,
      }))
      .filter((entry) => entry.lines.length),
  };
}

function hasRemainingVerseLines(state) {
  return state.languages.some((entry) => entry.offset < entry.lines.length);
}

function getIndependentLineCapacities(state, height, fontSize, item, visibleLanguages) {
  const usableHeight =
    height -
    getVerseCommonHeight(item, fontSize, visibleLanguages) -
    getMaxPrefixHeight(state, item, fontSize);
  if (usableHeight <= 0) return {};

  return state.languages
    .filter((entry) => entry.offset < entry.lines.length)
    .reduce((capacities, entry) => {
      capacities[entry.language] = Math.max(0, Math.floor(usableHeight / entry.lineHeight));
      return capacities;
    }, {});
}

function getMaxPrefixHeight(state, item, fontSize) {
  return Math.max(
    0,
    ...state.languages.map((entry) => getLanguagePrefixHeight(entry.language, item, fontSize)),
  );
}

function getVerseDecorationHeight(state, item, fontSize, visibleLanguages) {
  return getVerseCommonHeight(item, fontSize, visibleLanguages) +
    getMaxPrefixHeight(state, item, fontSize);
}

function hasPositiveLineCapacity(lineCapacities = {}) {
  return Object.values(lineCapacities).some((capacity) => capacity > 0);
}

function getMinimumLineCapacities(state) {
  return state.languages
    .filter((entry) => entry.offset < entry.lines.length)
    .reduce((capacities, entry) => {
      capacities[entry.language] = 1;
      return capacities;
    }, {});
}

export function createVerseLineSegment(item, state, lineCapacities, segmentIndex) {
  const originalLanguageKeys = state.languages.map((entry) => entry.language);
  const showSeasonalPrefix = segmentIndex === 0 && hasSeasonalPrefixLine(item.verse);
  const verse = {
    ...item.verse,
    arabic: "",
    coptic: "",
    english: "",
    bibleVerseNumber: item.verse?.bibleVerseNumber,
    slideshowSeasonalPrefixVisible: showSeasonalPrefix,
  };
  const lineCounts = {};
  const lineRanges = {};
  const forcedLines = {};
  const bibleNumberLanguages = [];
  const segmentEntries = [];

  state.languages.forEach((entry) => {
    const start = entry.offset;
    const remainingCount = entry.lines.length - start;
    const takeCount = Math.min(lineCapacities[entry.language] || 0, remainingCount);
    const lines = entry.lines.slice(start, start + takeCount);
    if (lines.length) segmentEntries.push({ entry, lines, start });
    entry.offset += takeCount;
  });

  segmentEntries.forEach(({ entry, lines, start }) => {
    const joinedBody = joinRenderedLines(lines);
    const beginsWithBibleNumber = Boolean(item.verse?.bibleVerseNumber) && start === 0;
    const body = beginsWithBibleNumber
      ? joinedBody.replace(/^\S+\s*/, "")
      : joinedBody;
    const prefix = String(item.verse?.seasonalHoosVersePrefix || "").trim();
    const originalText = String(item.verse?.[entry.language] || "").trimStart();
    const shouldPrependPrefix =
      showSeasonalPrefix &&
      (entry.language === "english" || entry.language === "arabic") &&
      prefix &&
      originalText.startsWith(prefix);

    verse[entry.language] = shouldPrependPrefix
      ? `${prefix}${body ? `\n${body}` : ""}`
      : body;
    lineCounts[entry.language] = lines.length;
    lineRanges[entry.language] = { start, end: start + lines.length };
    forcedLines[entry.language] = lines;
    if (beginsWithBibleNumber) bibleNumberLanguages.push(entry.language);
  });

  verse.slideshowLanguageKeys = originalLanguageKeys;
  verse.slideshowForcedLines = forcedLines;
  verse.slideshowBibleNumberLanguages = bibleNumberLanguages;
  const sourceItemId = item.sourceItemId || item.id;

  return {
    item: {
      ...item,
      id: segmentIndex ? `${sourceItemId}-segment-${segmentIndex}` : sourceItemId,
      slideId: `${sourceItemId}-segment-${segmentIndex}`,
      sourceItemId,
      suppressSpeakerLabel: Boolean(item.suppressSpeakerLabel) || segmentIndex > 0,
      verse,
      slideshowLineCounts: lineCounts,
      slideshowLineRanges: lineRanges,
      slideshowSegmentIndex: segmentIndex,
    },
  };
}

function createVerseDecorationSegment(item, state) {
  const prefix = String(item.verse?.seasonalHoosVersePrefix || "").trim();
  const verse = {
    ...item.verse,
    english: String(item.verse?.english || "").trimStart().startsWith(prefix) ? prefix : "",
    coptic: "",
    arabic: String(item.verse?.arabic || "").trimStart().startsWith(prefix) ? prefix : "",
    slideshowBibleNumberLanguages: [],
    slideshowForcedLines: Object.fromEntries(state.languages.map((entry) => [entry.language, []])),
    slideshowLanguageKeys: state.languages.map((entry) => entry.language),
    slideshowSeasonalPrefixVisible: Boolean(prefix),
  };
  const sourceItemId = item.sourceItemId || item.id;
  return {
    ...item,
    id: sourceItemId,
    slideId: `${sourceItemId}-segment-0`,
    sourceItemId,
    verse,
    slideshowLineCounts: {},
    slideshowLineRanges: {},
    slideshowSegmentIndex: 0,
  };
}

export function joinRenderedLines(lines) {
  return lines.reduce((text, line, index) => {
    const value = String(line?.text || "").trim();
    if (!index) return value;
    const previous = lines[index - 1];
    return `${text}${previous?.isParagraphEnd ? "\n" : " "}${value}`;
  }, "").trim();
}

export function getVerseLineSegmentHeight(segment, fontSize, visibleLanguages) {
  const counts = segment.item.slideshowLineCounts || {};
  const languageHeights = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([language, count]) => count * getSlideshowLanguageLineHeight(language, segment.item, fontSize));
  const prefixLanguages = segment.item.verse?.slideshowLanguageKeys || Object.keys(counts);
  const prefixHeight = Math.max(
    0,
    ...prefixLanguages.map((language) => getLanguagePrefixHeight(language, segment.item, fontSize)),
  );
  return getVerseCommonHeight(segment.item, fontSize, visibleLanguages) +
    prefixHeight +
    (languageHeights.length ? Math.max(...languageHeights) : 0);
}

export function estimateItemHeight(item, fontSize, visibleLanguages, tableWidth) {
  const chrome = getSlideshowChromeMetrics(fontSize);
  if (item.type === "title") return chrome.titleLineHeight + SPACING_SM * 2;
  if (item.type === "button") {
    const minimumHeight = item.isHyperlink
      ? DOCUMENT_CONTROL_METRICS.hyperlinkMinHeight
      : DOCUMENT_CONTROL_METRICS.openButtonMinHeight;
    return Math.max(minimumHeight, chrome.buttonLineHeight * 2 + SPACING_SM * 6);
  }
  if (item.type === "gospelRiteToggle") return chrome.buttonLineHeight + SPACING_SM * 4;

  const layout = getVerseLanguageLayout(item, visibleLanguages, tableWidth);
  const languageHeights = layout.languages
    .map((language) => {
      const text = item.verse?.[language];
      if (!String(text || "").trim()) return 0;
      return estimateLanguageLineCount(text, language, fontSize, layout.rowColumnWidth, item) *
        getSlideshowLanguageLineHeight(language, item, fontSize) +
        getLanguagePrefixHeight(language, item, fontSize);
    })
    .filter(Boolean);

  return getVerseCommonHeight(item, fontSize, visibleLanguages) +
    (languageHeights.length ? Math.max(...languageHeights) : 0);
}

export function createEstimatedVerseMetric(item, fontSize, visibleLanguages, tableWidth) {
  const layout = getVerseLanguageLayout(item, visibleLanguages, tableWidth);
  return layout.languages.reduce((metric, language) => {
    const text = item.verse?.[language];
    if (!String(text || "").trim()) return metric;
    const lines = createEstimatedTextLines(
      text,
      getEstimatedLineLength(language, fontSize, layout.rowColumnWidth, item),
    );
    return {
      ...metric,
      [language]: {
        height: lines.length * getSlideshowLanguageLineHeight(language, item, fontSize),
        lines,
        lineSignature: lines.map((line) => line.text).join("\n"),
      },
    };
  }, {});
}

function getVerseLanguageLayout(item, visibleLanguages = {}, tableWidth = 0) {
  const languages = getVisibleVerseLanguages(item, visibleLanguages);
  return {
    languages,
    rowColumnWidth: Math.max((tableWidth || 0) / Math.max(languages.length, 1), 1),
  };
}

export function getVisibleVerseLanguages(item, visibleLanguages = {}) {
  const verse = item.verse || {};
  const hasTranslationText = Boolean(
    (verse.english && verse.english.trim()) || (verse.arabic && verse.arabic.trim()),
  );
  if (verse.invincibleCoptic && !hasTranslationText) {
    return String(verse.coptic || "").trim() ? ["coptic"] : [];
  }

  return ["english", "coptic", "arabic"].filter((language) => {
    if (language === "english" || language === "arabic") {
      return Boolean(visibleLanguages[language]) &&
        (Boolean(String(verse[language] || "").trim()) || Boolean(item.hasSpeakerLabel));
    }

    const forceCoptic = verse.forceCopticVisible || verse.invincibleCoptic;
    return Boolean(String(verse.coptic || "").trim()) &&
      Boolean(visibleLanguages.coptic || forceCoptic) &&
      (!item.isRecitedPrayer || visibleLanguages.copticRecitedPrayers || forceCoptic);
  });
}

export function createEstimatedTextLines(text, maxLineLength) {
  const paragraphs = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  return paragraphs.flatMap((paragraph) => {
    const lines = splitEstimatedLine(paragraph, maxLineLength);
    return lines.map((line, index) => ({
      ...line,
      isParagraphEnd: index === lines.length - 1,
    }));
  });
}

function splitEstimatedLine(line, maxLineLength) {
  const words = String(line || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [{ text: "", isBlank: true }];
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxLineLength) {
      lines.push({ text: current });
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push({ text: current });
  return lines;
}

function estimateLanguageLineCount(text, language, fontSize, rowColumnWidth, item) {
  return Math.max(
    1,
    createEstimatedTextLines(
      text,
      getEstimatedLineLength(language, fontSize, rowColumnWidth, item),
    ).length,
  );
}

function getEstimatedLineLength(language, fontSize, rowColumnWidth, item) {
  const availableWidth = Math.max((rowColumnWidth || 0) - SPACING_XS * 2, 40);
  const languageFontSize = getSlideshowLanguageFontSize(language, item, fontSize);
  const characterWidthFactor = language === "coptic" ? 0.72 : language === "arabic" ? 0.62 : 0.56;
  return clamp(
    Math.floor(availableWidth / Math.max(languageFontSize * characterWidthFactor, 1)),
    8,
    80,
  );
}

export function normalizeLanguageMetric(metric) {
  if (!metric.lines) return metric;
  const lines = metric.lines.map((line) => ({
    text: line.text || "",
    isBlank: Boolean(line.isBlank),
    isParagraphEnd: Boolean(line.isParagraphEnd),
  }));
  return {
    ...metric,
    lines,
    lineSignature: lines.map((line) => `${line.text}${line.isParagraphEnd ? "¶" : ""}`).join("\n"),
  };
}

function getMetricLinesForLanguage(lines, language, item = {}) {
  if (language !== "coptic" || !hasSeasonalPrefixLine(item?.verse)) return lines;
  const prefix = String(item?.verse?.seasonalHoosVersePrefix || "").trim();
  if (!prefix) return lines;
  return lines.filter((line, index) => index !== 0 || String(line?.text || "").trim() !== prefix);
}

function getSourceItemId(item = {}) {
  return item.sourceItemId || item.id || "";
}

export function createSlideAnchor(slide = []) {
  const item = slide.find((candidate) => candidate && getSourceItemId(candidate));
  if (!item) return null;
  const offsets = Object.fromEntries(
    Object.entries(item.slideshowLineRanges || {}).map(([language, range]) => [language, range.start]),
  );
  const primaryLanguage = Object.keys(offsets)[0] || null;
  return {
    sourceItemId: getSourceItemId(item),
    sectionId: item.sectionId || null,
    segmentIndex: Number.isFinite(item.slideshowSegmentIndex)
      ? item.slideshowSegmentIndex
      : null,
    primaryLanguage,
    offsets,
  };
}

function getLineRangeDistance(range, offset) {
  if (!range) return 100000;
  if (offset >= range.start && offset < range.end) return 0;

  // Line ranges are half-open: [start, end). The first line of the next
  // segment therefore has offset === the previous segment's end. Giving
  // that boundary a distance of zero tied the two pages, and the resolver
  // always kept the earlier page. This was the common forward-navigation
  // failure for any long verse, at every font size.
  if (offset < range.start) return range.start - offset;
  return offset - range.end + 1;
}

function anchorDistance(item, anchor) {
  if (getSourceItemId(item) !== anchor.sourceItemId) return Number.POSITIVE_INFINITY;
  const ranges = item.slideshowLineRanges || {};
  const offsets = anchor.offsets || {};
  const languages = Object.keys(offsets);
  const rangeLanguages = Object.keys(ranges);

  // At the largest font sizes a speaker label or seasonal prefix can need a
  // decoration-only page immediately before the row's first text page. Both
  // pages intentionally share one sourceItemId, but only the text page has
  // line ranges. Treating the range-less decoration as a zero-distance match
  // for a text anchor made findSlideIndexForAnchor choose the earlier page,
  // so pressing Next appeared to do nothing and the reader became trapped.
  if (languages.length && !rangeLanguages.length) {
    return Number.POSITIVE_INFINITY;
  }

  if (!languages.length) {
    if (
      Number.isFinite(anchor.segmentIndex) &&
      Number.isFinite(item.slideshowSegmentIndex)
    ) {
      return Math.abs(anchor.segmentIndex - item.slideshowSegmentIndex);
    }
    return 0;
  }

  // Independent language columns do not always retain identical boundaries
  // after a resize. Preserve the first visible column exactly, then use the
  // remaining columns only as tie-breakers. Summing every language equally
  // could otherwise choose a compromise page containing none of the lines
  // that were actually at the top before repagination.
  const primaryLanguage = languages.includes(anchor.primaryLanguage)
    ? anchor.primaryLanguage
    : languages[0];
  const primaryDistance = getLineRangeDistance(
    ranges[primaryLanguage],
    offsets[primaryLanguage],
  );
  const secondaryDistance = languages
    .filter((language) => language !== primaryLanguage)
    .reduce(
      (total, language) => total + getLineRangeDistance(ranges[language], offsets[language]),
      0,
    );

  return primaryDistance * 1000000 + secondaryDistance;
}

export function findSlideIndexForAnchor(slides = [], anchor) {
  if (!anchor?.sourceItemId) return -1;
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  slides.forEach((slide, index) => {
    slide.forEach((item) => {
      const distance = anchorDistance(item, anchor);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
  });
  return bestIndex;
}

export function getSlideKey(slide = [], index = 0) {
  const first = slide[0];
  const last = slide[slide.length - 1];
  return `${first?.slideId || getSourceItemId(first) || "empty"}:${last?.slideId || getSourceItemId(last) || "empty"}:${index}`;
}

export function getAdjacentSlideIndexes(currentIndex, slideCount) {
  return [currentIndex - 1, currentIndex, currentIndex + 1]
    .filter((index) => index >= 0 && index < slideCount);
}

/**
 * The current slide must be the one layer that participates in flex layout.
 * Native Yoga does not let absolute children establish their parent's size,
 * so rendering every preloaded layer as an overlay can collapse the deck.
 */
export function getSlideRenderLayers(currentIndex, slideCount) {
  const indexes = getAdjacentSlideIndexes(currentIndex, slideCount);
  return [
    ...indexes
      .filter((index) => index === currentIndex)
      .map((index) => ({ index, inFlow: true })),
    ...indexes
      .filter((index) => index !== currentIndex)
      .map((index) => ({ index, inFlow: false })),
  ];
}

export function getMeasurementBatch(
  items,
  measuredHeights,
  limit,
  anchor,
  preferredSectionId,
  maxDistance = Number.POSITIVE_INFINITY,
) {
  const missing = items.filter((item) => typeof measuredHeights[item.id] !== "number");
  if (!Number.isFinite(maxDistance) && missing.length <= limit) return missing;
  const matchedIndex = items.findIndex((item) =>
    (anchor?.sourceItemId && getSourceItemId(item) === anchor.sourceItemId) ||
    (preferredSectionId && item.sectionId === preferredSectionId),
  );
  const preferredIndex = matchedIndex >= 0 ? matchedIndex : 0;

  const prioritized = [];
  const seen = new Set();
  const radiusLimit = Math.min(items.length - 1, Math.max(0, maxDistance));
  for (let radius = 0; radius <= radiusLimit && prioritized.length < limit; radius += 1) {
    [preferredIndex + radius, preferredIndex - radius].forEach((index) => {
      const item = items[index];
      if (!item || seen.has(item.id) || typeof measuredHeights[item.id] === "number") return;
      seen.add(item.id);
      prioritized.push(item);
    });
  }
  return prioritized.slice(0, limit);
}

export function getPageTurnForKey(key) {
  if (["ArrowRight", "ArrowDown", "PageDown", " ", "Spacebar", "Enter"].includes(key)) return "next";
  if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(key)) return "previous";
  if (key === "Home") return "first";
  if (key === "End") return "last";
  return null;
}

export const SLIDESHOW_SWIPE_ACTIVATION_DISTANCE = 36;

export function getPageTurnForSwipe(deltaX) {
  if (
    Number.isFinite(deltaX) &&
    Math.abs(deltaX) >= SLIDESHOW_SWIPE_ACTIVATION_DISTANCE
  ) {
    return deltaX < 0 ? "next" : "previous";
  }
  return null;
}

export function getPageTurnForTap(locationX, width) {
  if (!Number.isFinite(locationX) || !Number.isFinite(width) || width <= 0) return null;
  return locationX < width / 2 ? "previous" : "next";
}

/** Resolve a viewport/page coordinate against the slideshow's real bounds. */
export function getPageTurnForViewportTap(pageX, surfaceLeft, surfaceWidth) {
  if (
    !Number.isFinite(pageX) ||
    !Number.isFinite(surfaceLeft) ||
    !Number.isFinite(surfaceWidth) ||
    surfaceWidth <= 0 ||
    pageX < surfaceLeft ||
    pageX > surfaceLeft + surfaceWidth
  ) {
    return null;
  }
  return getPageTurnForTap(pageX - surfaceLeft, surfaceWidth);
}
