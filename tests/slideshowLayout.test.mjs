import assert from "node:assert/strict";
import test from "node:test";

import {
  createEstimatedTextLines,
  createSlideAnchor,
  findSlideIndexForAnchor,
  getAdjacentSlideIndexes,
  getItemSignature,
  getMeasurementBatch,
  getPageTurnForKey,
  getPageTurnForSwipe,
  getPageTurnForTap,
  getPageTurnForViewportTap,
  getSlideContentBudget,
  getSlidePadding,
  getSlideRenderLayers,
  getSlideshowChromeMetrics,
  getSlideshowLanguageLineHeight,
  getVerseLineSegmentHeight,
  getVisibleVerseLanguages,
  hashSlideshowText,
  joinRenderedLines,
  paginateItems,
} from "../src/components/chc/slideshowLayout.js";

const ALL_LANGUAGES = {
  english: true,
  coptic: true,
  copticRecitedPrayers: true,
  arabic: true,
};

function verseItem(overrides = {}) {
  return {
    id: "section-verse-0",
    sectionId: "section",
    type: "verse",
    hasSpeakerLabel: false,
    suppressSpeakerLabel: false,
    verse: {
      english: "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
      coptic: "ⲁ̅ ⲃ̅ ⲅ̅ ⲇ̅ ⲉ̅ ⲍ̅ ⲏ̅ ⲑ̅ ⲓ̅ ⲕ̅ ⲗ̅ ⲙ̅",
      arabic: "وَاحِدٌ اثنان ثلاثة أربعة خمسة ستة سبعة ثمانية تسعة عشرة",
      type: "priest",
    },
    ...overrides,
  };
}

function metricLines(prefix, count) {
  return Array.from({ length: count }, (_, index) => ({
    text: `${index === 0 ? "12 " : ""}${prefix}${index + 1}`,
    isParagraphEnd: index === count - 1,
  }));
}

function splitVerse(item, { availableHeight = 360, fontSize = 78, lineCount = 8 } = {}) {
  const metric = {
    english: { lines: metricLines("English", lineCount) },
    coptic: { lines: metricLines("ⲕⲟⲡⲧ", lineCount) },
    arabic: { lines: metricLines("عربي", lineCount) },
  };
  const slides = paginateItems(
    [item],
    { [item.id]: 9999 },
    { [item.id]: metric },
    availableHeight,
    fontSize,
    ALL_LANGUAGES,
    1024,
  );
  return { metric, slides, segments: slides.flat() };
}

test("content signatures invalidate equal-length replacements and title-language changes", () => {
  const first = verseItem();
  const second = verseItem({ verse: { ...first.verse, english: "Omega beta gamma delta epsilon zeta eta theta iota kappa lambda mu" } });
  assert.equal(first.verse.english.length, second.verse.english.length);
  assert.notEqual(getItemSignature(first), getItemSignature(second));

  const title = { id: "title", type: "title", title: { english: "Prayer", arabic: "صلاة" } };
  assert.notEqual(getItemSignature(title, "english:Prayer"), getItemSignature(title, "arabic:صلاة"));
  assert.notEqual(hashSlideshowText("same-A"), hashSlideshowText("same-B"));
});

test("responsive padding never creates a budget taller than the viewport", () => {
  [120, 240, 568, 900, 2160].forEach((height) => {
    const padding = getSlidePadding(height);
    const budget = getSlideContentBudget(height, padding);
    assert.ok(budget > 0);
    assert.ok(budget + padding.top + padding.bottom <= height);
  });
});

test("maximum-size language metrics leave room for Arabic and Coptic marks", () => {
  const item = verseItem();
  assert.equal(getSlideshowLanguageLineHeight("english", item, 78), 101);
  assert.equal(getSlideshowLanguageLineHeight("coptic", item, 78), 101);
  assert.equal(getSlideshowLanguageLineHeight("arabic", item, 78), 125);
  assert.deepEqual(getSlideshowChromeMetrics(78), {
    buttonFontSize: 38,
    buttonLineHeight: 48,
    speakerFontSize: 78,
    speakerLineHeight: 101,
    titleFontSize: 36,
    titleLineHeight: 45,
  });
});

test("explicit paragraph breaks survive measurement, joining, and page splitting", () => {
  const lines = createEstimatedTextLines("First paragraph\nSecond paragraph\n\nFourth paragraph", 80);
  assert.deepEqual(lines.map((line) => line.isParagraphEnd), [true, true, true, true]);
  assert.equal(joinRenderedLines(lines), "First paragraph\nSecond paragraph\n\nFourth paragraph");
});

test("a tall multilingual verse loses or duplicates no measured lines", () => {
  const item = verseItem({ hasSpeakerLabel: true });
  const { metric, segments } = splitVerse(item);
  assert.ok(segments.length > 2);

  ["english", "coptic", "arabic"].forEach((language) => {
    const rendered = segments.flatMap((segment) => segment.verse.slideshowForcedLines[language] || []);
    assert.deepEqual(rendered, metric[language].lines);
  });
});

test("every normal maximum-font verse segment fits its slide budget", () => {
  [320, 568, 900].forEach((viewportHeight) => {
    const padding = getSlidePadding(viewportHeight);
    const budget = getSlideContentBudget(viewportHeight, padding);
    const item = verseItem({ hasSpeakerLabel: true });
    const { segments } = splitVerse(item, { availableHeight: budget, fontSize: 78, lineCount: 12 });
    segments.forEach((segment) => {
      assert.ok(
        getVerseLineSegmentHeight({ item: segment }, 78, ALL_LANGUAGES) <= budget,
        `segment exceeded ${budget}px budget at ${viewportHeight}px viewport`,
      );
    });
  });
});

test("seasonal prefix appears once and Bible numbers stay on each language's first segment", () => {
  const prefix = "Watos";
  const item = verseItem({
    hasSpeakerLabel: true,
    verse: {
      ...verseItem().verse,
      bibleVerseNumber: "12",
      seasonalHoosVersePrefix: prefix,
      english: `${prefix} ${verseItem().verse.english}`,
      arabic: `${prefix} ${verseItem().verse.arabic}`,
    },
  });
  const { segments } = splitVerse(item, { availableHeight: 380 });
  assert.equal(segments.filter((segment) => segment.verse.slideshowSeasonalPrefixVisible).length, 1);
  assert.equal(segments.filter((segment) => segment.verse.english.startsWith(prefix)).length, 1);

  ["english", "coptic", "arabic"].forEach((language) => {
    assert.equal(
      segments.filter((segment) => segment.verse.slideshowBibleNumberLanguages.includes(language)).length,
      1,
    );
  });
});

test("seasonal decorations split safely on a short max-font landscape slide", () => {
  const item = verseItem({
    hasSpeakerLabel: true,
    verse: {
      ...verseItem().verse,
      seasonalHoosVersePrefix: "Watos",
      english: `Watos ${verseItem().verse.english}`,
      arabic: `Watos ${verseItem().verse.arabic}`,
    },
  });
  const viewportHeight = 320;
  const budget = getSlideContentBudget(viewportHeight, getSlidePadding(viewportHeight));
  const { segments } = splitVerse(item, { availableHeight: budget, fontSize: 78, lineCount: 8 });
  segments.forEach((segment) => {
    assert.ok(getVerseLineSegmentHeight({ item: segment }, 78, ALL_LANGUAGES) <= budget);
  });
  assert.equal(segments.filter((segment) => segment.verse.slideshowSeasonalPrefixVisible).length, 1);
});

test("pagination starts a tall verse fresh instead of leaving a one-line orphan", () => {
  const title = { id: "compact-title", sectionId: "compact", type: "title", isCollapsed: true, title: { english: "" } };
  const item = verseItem();
  const metric = {
    english: { lines: metricLines("English", 8) },
    coptic: { lines: metricLines("ⲕⲟⲡⲧ", 8) },
    arabic: { lines: metricLines("عربي", 8) },
  };
  const slides = paginateItems(
    [title, item],
    { [title.id]: 210, [item.id]: 9999 },
    { [item.id]: metric },
    360,
    78,
    ALL_LANGUAGES,
    1024,
  );
  assert.deepEqual(slides[0].map((entry) => entry.id), [title.id]);
  assert.equal(slides[1][0].sourceItemId, item.id);
});

test("line anchors follow the same content when page capacity changes", () => {
  const item = verseItem();
  const before = splitVerse(item, { availableHeight: 320, lineCount: 15 }).slides;
  const anchor = createSlideAnchor(before[Math.min(2, before.length - 1)]);
  const after = splitVerse(item, { availableHeight: 520, lineCount: 15 }).slides;
  const resolved = findSlideIndexForAnchor(after, anchor);
  assert.ok(resolved >= 0);
  const range = after[resolved][0].slideshowLineRanges.english;
  assert.ok(anchor.offsets.english >= range.start && anchor.offsets.english < range.end);
});

test("measurement prioritizes the reader's current row instead of restarting at the top", () => {
  const items = Array.from({ length: 100 }, (_, index) => ({ id: `row-${index}`, sectionId: `section-${index}` }));
  const batch = getMeasurementBatch(items, {}, 8, { sourceItemId: "row-80" }, null);
  assert.equal(batch[0].id, "row-80");
  assert.ok(batch.every((item) => Math.abs(Number(item.id.slice(4)) - 80) <= 4));
});

test("speaker-only visible columns remain in the aligned layout", () => {
  const item = verseItem({
    hasSpeakerLabel: true,
    verse: { ...verseItem().verse, english: "", arabic: "" },
  });
  assert.deepEqual(getVisibleVerseLanguages(item, ALL_LANGUAGES), ["english", "coptic", "arabic"]);
});

test("tap, keyboard, clicker, and adjacent-page controls are deterministic", () => {
  assert.equal(getPageTurnForTap(10, 100), "previous");
  assert.equal(getPageTurnForTap(90, 100), "next");
  assert.equal(getPageTurnForViewportTap(510, 320, 400), "previous");
  assert.equal(getPageTurnForViewportTap(690, 320, 400), "next");
  assert.equal(getPageTurnForViewportTap(0, 320, 400), null);
  assert.equal(getPageTurnForSwipe(-36), "next");
  assert.equal(getPageTurnForSwipe(36), "previous");
  assert.equal(getPageTurnForSwipe(-20), null);
  assert.equal(getPageTurnForKey("PageDown"), "next");
  assert.equal(getPageTurnForKey(" "), "next");
  assert.equal(getPageTurnForKey("ArrowUp"), "previous");
  assert.equal(getPageTurnForKey("Home"), "first");
  assert.equal(getPageTurnForKey("End"), "last");
  assert.equal(getPageTurnForKey("Escape"), null);
  assert.deepEqual(getAdjacentSlideIndexes(4, 10), [3, 4, 5]);
  assert.deepEqual(getAdjacentSlideIndexes(0, 1), [0]);
});

test("the visible native slide stays in flex flow while neighbors preload as overlays", () => {
  assert.deepEqual(getSlideRenderLayers(4, 10), [
    { index: 4, inFlow: true },
    { index: 3, inFlow: false },
    { index: 5, inFlow: false },
  ]);
  assert.deepEqual(getSlideRenderLayers(0, 1), [
    { index: 0, inFlow: true },
  ]);
});

test("a maximum-font decoration page cannot trap forward navigation", () => {
  const decorationPage = [{
    id: "offering-row",
    sourceItemId: "offering-row",
    sectionId: "offering-of-the-lamb",
    slideshowLineRanges: {},
    slideshowSegmentIndex: 0,
  }];
  const firstTextPage = [{
    id: "offering-row-segment-1",
    sourceItemId: "offering-row",
    sectionId: "offering-of-the-lamb",
    slideshowLineRanges: { english: { start: 0, end: 1 } },
    slideshowSegmentIndex: 1,
  }];
  const slides = [decorationPage, firstTextPage];

  assert.equal(findSlideIndexForAnchor(slides, createSlideAnchor(decorationPage)), 0);
  assert.equal(findSlideIndexForAnchor(slides, createSlideAnchor(firstTextPage)), 1);
});

test("every continuation-page anchor resolves to that page, not the previous segment", () => {
  const slides = [0, 3, 6, 9].map((start, segmentIndex) => [{
    id: `long-row-segment-${segmentIndex}`,
    sourceItemId: "long-row",
    sectionId: "offering-of-the-lamb",
    slideshowLineRanges: { english: { start, end: start + 3 } },
    slideshowSegmentIndex: segmentIndex,
  }]);

  slides.forEach((slide, index) => {
    assert.equal(findSlideIndexForAnchor(slides, createSlideAnchor(slide)), index);
  });
});

test("all generated slides round-trip through anchors across sizes and languages", () => {
  const languageSets = [
    { english: true, coptic: false, copticRecitedPrayers: true, arabic: false },
    { english: false, coptic: true, copticRecitedPrayers: true, arabic: false },
    { english: false, coptic: false, copticRecitedPrayers: true, arabic: true },
    ALL_LANGUAGES,
  ];
  let checkedSlides = 0;

  for (const fontSize of [14, 24, 40, 58, 78]) {
    for (const availableHeight of [160, 240, 320, 480, 720]) {
      for (const visibleLanguages of languageSets) {
        for (const hasSpeakerLabel of [false, true]) {
          const item = verseItem({ hasSpeakerLabel });
          const lines = 24;
          const metric = {
            english: { lines: metricLines("English", lines) },
            coptic: { lines: metricLines("ⲕⲟⲡⲧ", lines) },
            arabic: { lines: metricLines("عربي", lines) },
          };
          const slides = paginateItems(
            [item],
            { [item.id]: 99999 },
            { [item.id]: metric },
            availableHeight,
            fontSize,
            visibleLanguages,
            1024,
          );

          slides.forEach((slide, index) => {
            assert.equal(
              findSlideIndexForAnchor(slides, createSlideAnchor(slide)),
              index,
              `anchor mismatch at font=${fontSize}, height=${availableHeight}, speaker=${hasSpeakerLabel}, slide=${index}`,
            );
            checkedSlides += 1;
          });
        }
      }
    }
  }

  assert.ok(checkedSlides > 1000, `expected broad coverage, checked ${checkedSlides} slides`);
});

test("anchors remain monotonic and on-source across broad repagination changes", () => {
  const heights = [180, 260, 360, 540];
  const languageSets = [
    { english: true, coptic: false, copticRecitedPrayers: true, arabic: false },
    ALL_LANGUAGES,
  ];
  let checkedMoves = 0;

  for (const fontSize of [14, 40, 78]) {
    for (const visibleLanguages of languageSets) {
      for (const hasSpeakerLabel of [false, true]) {
        const item = verseItem({ hasSpeakerLabel });
        const metric = {
          english: { lines: metricLines("English", 30) },
          coptic: { lines: metricLines("ⲕⲟⲡⲧ", 30) },
          arabic: { lines: metricLines("عربي", 30) },
        };
        const paginateAt = (availableHeight) => paginateItems(
          [item],
          { [item.id]: 99999 },
          { [item.id]: metric },
          availableHeight,
          fontSize,
          visibleLanguages,
          1024,
        );

        for (const beforeHeight of heights) {
          const before = paginateAt(beforeHeight);
          for (const afterHeight of heights) {
            const after = paginateAt(afterHeight);
            const previousResolvedIndexByLanguage = new Map();
            before.forEach((slide) => {
              const anchor = createSlideAnchor(slide);
              const resolvedIndex = findSlideIndexForAnchor(after, anchor);
              assert.ok(resolvedIndex >= 0);
              const previousResolvedIndex = previousResolvedIndexByLanguage.get(anchor.primaryLanguage) ?? -1;
              assert.ok(
                resolvedIndex >= previousResolvedIndex,
                `anchor moved backward within ${anchor.primaryLanguage}: font=${fontSize}, ${beforeHeight}->${afterHeight}`,
              );
              previousResolvedIndexByLanguage.set(anchor.primaryLanguage, resolvedIndex);
              const resolvedItem = after[resolvedIndex].find(
                (entry) => (entry.sourceItemId || entry.id) === anchor.sourceItemId,
              );
              assert.ok(resolvedItem);

              const anchoredLanguages = Object.entries(anchor.offsets);
              // Independently paginated language columns can acquire
              // different page boundaries after a resize. The first visible
              // language is the stable reading-position anchor; remaining
              // columns are tie-breakers.
              if (anchoredLanguages.length) {
                const range = resolvedItem.slideshowLineRanges[anchor.primaryLanguage];
                const offset = anchor.offsets[anchor.primaryLanguage];
                assert.ok(
                  range && offset >= range.start && offset < range.end,
                  `lost primary line: font=${fontSize}, ${beforeHeight}->${afterHeight}`,
                );
              }
              checkedMoves += 1;
            });
          }
        }
      }
    }
  }

  assert.ok(checkedMoves > 1000, `expected broad repagination coverage, checked ${checkedMoves} moves`);
});

test("viewport tap direction remains correct across inset surface sizes", () => {
  for (const width of [240, 320, 768, 1400]) {
    for (const left of [0, 24, 180, 420]) {
      assert.equal(getPageTurnForViewportTap(left + width * 0.25, left, width), "previous");
      assert.equal(getPageTurnForViewportTap(left + width * 0.75, left, width), "next");
    }
  }
});
