import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SPACING } from "../../constants/theme";
import { formatEnglishDisplayText } from "../../utils/displayText";
import VerseBlock from "./VerseBlock";

export default function SlideshowContainer({
  sections,
  visibleLanguages,
  fontSize,
  theme,
  tableWidth,
  titleHelpers,
  selectedSectionId,
  refreshKey,
  onCurrentSectionChange,
  onOpenSelector,
  viewportHeightOverride,
  onToggleCollapse,
}) {
  const safeAreaInsets = useSafeAreaInsets();
  const [viewportHeight, setViewportHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [measuredHeights, setMeasuredHeights] = useState({});
  const [measuredLanguageHeights, setMeasuredLanguageHeights] = useState({});
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const measurementSignatureRef = useRef("");
  const lastAppliedSelectedSectionId = useRef(null);
  const pendingHeightsRef = useRef({});
  const pendingLanguageHeightsRef = useRef({});
  const pendingMeasurementFrameRef = useRef(null);

  const items = useMemo(() => flattenSections(sections), [sections]);
  const itemsSignature = useMemo(
    () => items.map(getItemSignature).join("|"),
    [items],
  );
  const slideTableWidth = Math.max(viewportWidth || tableWidth || 1, 1);
  const slideColumnWidth =
    slideTableWidth / Math.max(getVisibleLanguageCount(visibleLanguages), 1);
  const measuredKey = useMemo(
    () =>
      [
        fontSize,
        slideTableWidth,
        visibleLanguages.english,
        visibleLanguages.coptic,
        visibleLanguages.copticRecitedPrayers,
        visibleLanguages.arabic,
        Math.round(viewportHeight || 0),
        Math.round(viewportWidth || 0),
        Math.round(viewportHeightOverride || 0),
        Math.round(safeAreaInsets.top || 0),
        Math.round(safeAreaInsets.bottom || 0),
        itemsSignature,
      ].join(":"),
    [
      fontSize,
      itemsSignature,
      safeAreaInsets.bottom,
      safeAreaInsets.top,
      slideTableWidth,
      viewportHeight,
      viewportHeightOverride,
      viewportWidth,
      visibleLanguages,
    ],
  );
  measurementSignatureRef.current = measuredKey;

  useLayoutEffect(() => {
    measurementSignatureRef.current = measuredKey;
    pendingHeightsRef.current = {};
    pendingLanguageHeightsRef.current = {};
    if (pendingMeasurementFrameRef.current) {
      cancelMeasurementFrame(pendingMeasurementFrameRef.current);
      pendingMeasurementFrameRef.current = null;
    }
    setMeasuredHeights({});
    setMeasuredLanguageHeights({});
    setCurrentSlideIndex(0);
    lastAppliedSelectedSectionId.current = null;
  }, [measuredKey, refreshKey]);

  useEffect(
    () => () => {
      if (pendingMeasurementFrameRef.current) {
        cancelMeasurementFrame(pendingMeasurementFrameRef.current);
        pendingMeasurementFrameRef.current = null;
      }
    },
    [],
  );

  const flushPendingMeasurements = useCallback(() => {
    pendingMeasurementFrameRef.current = null;

    const pendingHeights = pendingHeightsRef.current;
    const pendingLanguageHeights = pendingLanguageHeightsRef.current;
    pendingHeightsRef.current = {};
    pendingLanguageHeightsRef.current = {};

    if (Object.keys(pendingHeights).length) {
      setMeasuredHeights((current) => {
        let didChange = false;
        const next = { ...current };

        Object.entries(pendingHeights).forEach(([id, height]) => {
          if (next[id] !== height) {
            next[id] = height;
            didChange = true;
          }
        });

        return didChange ? next : current;
      });
    }

    if (Object.keys(pendingLanguageHeights).length) {
      setMeasuredLanguageHeights((current) => {
        let didChange = false;
        const next = { ...current };

        Object.entries(pendingLanguageHeights).forEach(([id, metrics]) => {
          const currentItem = current[id] || {};
          const nextItem = { ...currentItem };

          Object.entries(metrics).forEach(([language, metric]) => {
            const currentMetric = currentItem[language] || {};

            if (
              currentMetric.height !== metric.height ||
              currentMetric.lineSignature !== metric.lineSignature
            ) {
              nextItem[language] = metric;
              didChange = true;
            }
          });

          if (didChange) {
            next[id] = nextItem;
          }
        });

        return didChange ? next : current;
      });
    }
  }, []);

  const scheduleMeasurementFlush = useCallback(() => {
    if (pendingMeasurementFrameRef.current) {
      return;
    }

    pendingMeasurementFrameRef.current = requestMeasurementFrame(flushPendingMeasurements);
  }, [flushPendingMeasurements]);

  const queueMeasuredHeight = useCallback(
    (itemId, height, signature) => {
      if (signature !== measurementSignatureRef.current) {
        return;
      }

      pendingHeightsRef.current[itemId] = height;
      scheduleMeasurementFlush();
    },
    [scheduleMeasurementFlush],
  );

  const queueMeasuredLanguage = useCallback(
    (itemId, language, metric, signature) => {
      if (signature !== measurementSignatureRef.current) {
        return;
      }

      const existingMetric =
        pendingLanguageHeightsRef.current[itemId]?.[language] ||
        measuredLanguageHeights[itemId]?.[language] ||
        {};
      const normalizedMetric = normalizeLanguageMetric({
        ...existingMetric,
        ...metric,
      });
      pendingLanguageHeightsRef.current[itemId] = {
        ...(pendingLanguageHeightsRef.current[itemId] || {}),
        [language]: normalizedMetric,
      };
      scheduleMeasurementFlush();
    },
    [measuredLanguageHeights, scheduleMeasurementFlush],
  );

  const slides = useMemo(() => {
    const measuredViewportHeight =
      viewportHeight && viewportHeightOverride
        ? Math.min(viewportHeight, viewportHeightOverride)
        : viewportHeight || viewportHeightOverride;
    const slidePadding = getSlidePadding(safeAreaInsets);
    const effectiveViewportHeight =
      measuredViewportHeight - slidePadding.top - slidePadding.bottom;

    if (!effectiveViewportHeight) {
      return [items.slice(0, 1)];
    }

    const effectiveHeights = {};
    items.forEach((item) => {
      effectiveHeights[item.id] =
        measuredHeights[item.id] ??
        estimateItemHeight(item, fontSize, visibleLanguages, slideTableWidth);
    });

    return paginateItems(
      items,
      effectiveHeights,
      measuredLanguageHeights,
      Math.max(effectiveViewportHeight - 8, 120),
      fontSize,
      visibleLanguages,
      slideTableWidth,
    );
  }, [
    fontSize,
    items,
    measuredHeights,
    measuredLanguageHeights,
    safeAreaInsets,
    slideTableWidth,
    viewportHeight,
    viewportHeightOverride,
    visibleLanguages,
  ]);
  const slidePadding = useMemo(() => getSlidePadding(safeAreaInsets), [safeAreaInsets]);
  const isMeasurementComplete = useMemo(
    () => Boolean(viewportHeight || viewportHeightOverride) &&
      items.every((item) => typeof measuredHeights[item.id] === "number"),
    [items, measuredHeights, viewportHeight, viewportHeightOverride],
  );

  useEffect(() => {
    setCurrentSlideIndex((current) =>
      Math.min(current, Math.max(slides.length - 1, 0)),
    );
  }, [slides.length]);

  useEffect(() => {
    if (
      !selectedSectionId ||
      lastAppliedSelectedSectionId.current === selectedSectionId
    ) {
      return;
    }

    const nextSlideIndex = slides.findIndex((slide) =>
      slide.some((item) => item.id === `${selectedSectionId}-title`),
    );

    if (nextSlideIndex >= 0) {
      setCurrentSlideIndex(nextSlideIndex);
      lastAppliedSelectedSectionId.current = selectedSectionId;
    }
  }, [selectedSectionId, slides]);

  useEffect(() => {
    const currentSectionId = findSlideSectionId(slides[currentSlideIndex]);

    if (currentSectionId) {
      onCurrentSectionChange?.(currentSectionId);
    }
  }, [currentSlideIndex, onCurrentSectionChange, slides]);

  const goToPreviousSlide = useCallback(() => {
    setCurrentSlideIndex((current) => Math.max(current - 1, 0));
  }, []);

  const goToNextSlide = useCallback(() => {
    setCurrentSlideIndex((current) => Math.min(current + 1, Math.max(slides.length - 1, 0)));
  }, [slides.length]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function" ||
      typeof window.removeEventListener !== "function"
    ) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousSlide();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextSlide();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNextSlide, goToPreviousSlide]);

  return (
    <View
      style={styles.container}
      onLayout={(event) => {
        setViewportHeight(event.nativeEvent.layout.height);
        setViewportWidth(event.nativeEvent.layout.width);
      }}
    >
      {!isMeasurementComplete ? (
        <View pointerEvents="none" style={styles.measurementLayer}>
          {items.map((item) => (
            <SlideItem
              key={item.id}
              item={item}
              visibleLanguages={visibleLanguages}
              fontSize={fontSize}
              theme={theme}
              columnWidth={slideColumnWidth}
              tableWidth={slideTableWidth}
              titleHelpers={titleHelpers}
              measurementSignature={measuredKey}
              onMeasured={(height, signature) =>
                queueMeasuredHeight(item.id, height, signature)
              }
              onLanguageMeasured={(language, metric, signature) =>
                queueMeasuredLanguage(item.id, language, metric, signature)
              }
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </View>
      ) : null}

      <SlideView
        items={slides[currentSlideIndex] || []}
        visibleLanguages={visibleLanguages}
        fontSize={fontSize}
        theme={theme}
        columnWidth={slideColumnWidth}
        tableWidth={slideTableWidth}
        titleHelpers={titleHelpers}
        slidePadding={slidePadding}
        onToggleCollapse={onToggleCollapse}
      />

      <NavigationOverlay
        onPrevious={goToPreviousSlide}
        onNext={goToNextSlide}
        onOpenSelector={onOpenSelector}
        topReserved={
          (slides[currentSlideIndex] || [])[0]?.type === "title" && (slides[currentSlideIndex] || [])[0]?.collapsible
            ? slidePadding.top + TITLE_ROW_TOUCH_RESERVE
            : 0
        }
      />
    </View>
  );
}

export function SlideView({
  items,
  visibleLanguages,
  fontSize,
  theme,
  columnWidth,
  tableWidth,
  titleHelpers,
  slidePadding,
  onToggleCollapse,
}) {
  return (
    <View
      style={[
        styles.slide,
        {
          paddingBottom: slidePadding?.bottom || 0,
          paddingTop: slidePadding?.top || 0,
          width: "100%",
        },
      ]}
    >
      {items.map((item) => (
        <SlideItem
          key={item.slideId || item.id}
          item={item}
          visibleLanguages={visibleLanguages}
          fontSize={fontSize}
          theme={theme}
          columnWidth={columnWidth}
          tableWidth={tableWidth}
          titleHelpers={titleHelpers}
          onToggleCollapse={onToggleCollapse}
        />
      ))}
    </View>
  );
}

// Height reserved at the top of the slide for the title row (and its
// collapse button, when present) so the full-screen swipe/tap navigation
// layer doesn't sit on top of and swallow taps meant for the button —
// NavigationOverlay is a sibling rendered after SlideView, so without this
// gap its Pressables would always win the touch over anything SlideView
// renders underneath them.
const TITLE_ROW_TOUCH_RESERVE = 64;

export function NavigationOverlay({
  onPrevious,
  onNext,
  onOpenSelector,
  topReserved = 0,
}) {
  const { width: screenWidth } = useWindowDimensions();
  const selectorEdgeWidth = Math.min(240, Math.max(128, (screenWidth || 0) * 0.18));
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          Math.abs(gestureState.dx) > 18 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 18 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2,
        onPanResponderRelease: (_, gestureState) => {
          if (
            Boolean(onOpenSelector) &&
            gestureState.x0 > Math.max((screenWidth || 0) - selectorEdgeWidth, 0) &&
            gestureState.dx < -36
          ) {
            onOpenSelector?.();
            return;
          }

          if (gestureState.dx < -60) {
            onNext?.();
            return;
          }

          if (gestureState.dx > 60) {
            onPrevious?.();
          }
        },
      }),
    [onNext, onOpenSelector, onPrevious, screenWidth, selectorEdgeWidth],
  );

  return (
    <View
      style={[styles.navigationLayer, { top: topReserved }]}
      pointerEvents="auto"
      {...panResponder.panHandlers}
    >
      <Pressable
        accessibilityLabel="Previous slide"
        onPress={onPrevious}
        style={styles.tapZone}
      />
      <Pressable
        accessibilityLabel="Next slide"
        onPress={onNext}
        style={styles.tapZone}
      />
    </View>
  );
}

const COLLAPSE_BUTTON_SIZE = 40;
const COLLAPSE_BUTTON_CIRCLE = 22;

/** Gold outlined circle with a minus bar always, plus a vertical bar (making a plus) only when collapsed — matches the old app's collapse-button-icon ::before/::after CSS bars. */
function CollapseButton({ collapsed, onPress }) {
  return (
    <Pressable
      accessibilityLabel={collapsed ? "Expand section" : "Collapse section"}
      onPress={onPress}
      style={styles.collapseButton}
      hitSlop={8}
    >
      <View style={[styles.collapseButtonCircle, { borderColor: "#C9A227" }]}>
        <View style={[styles.collapseBar, styles.collapseBarHorizontal, { backgroundColor: "#C9A227" }]} />
        {collapsed ? (
          <View style={[styles.collapseBar, styles.collapseBarVertical, { backgroundColor: "#C9A227" }]} />
        ) : null}
      </View>
    </Pressable>
  );
}

function SlideItem({
  item,
  visibleLanguages,
  fontSize,
  theme,
  columnWidth,
  tableWidth,
  titleHelpers,
  onMeasured,
  onLanguageMeasured,
  measurementSignature,
  onToggleCollapse,
}) {
  if (item.type === "title") {
    const hasButton = Boolean(item.collapsible && onToggleCollapse);
    const titleTableWidth = hasButton ? Math.max(tableWidth - COLLAPSE_BUTTON_SIZE, 1) : tableWidth;
    const titleLanguages = buildTitleLanguages(
      item.title,
      visibleLanguages,
      titleHelpers,
    );
    const titleColumnWidth = titleTableWidth / Math.max(titleLanguages.length, 1);

    return (
      <View
        style={styles.titleRow}
        onLayout={(event) =>
          onMeasured?.(event.nativeEvent.layout.height, measurementSignature)
        }
      >
        <View style={[styles.titleTable, { width: titleTableWidth }]}>
          {titleLanguages.map(
            (language) => (
              <View
                key={language.key}
                style={[
                  styles.titleCell,
                  {
                    flexBasis: titleColumnWidth,
                    maxWidth: titleColumnWidth,
                  },
                ]}
              >
                {language.text ? (
                  <Text
                    style={[
                      styles.sectionTitle,
                      language.key === "arabic" && styles.sectionTitleArabic,
                      {
                        color: theme.colors.gold,
                        fontSize: Math.max(Math.round(fontSize * 0.5), 14),
                        lineHeight: Math.max(Math.round(fontSize * 0.62), 18),
                        textAlign: language.align,
                      },
                    ]}
                  >
                    {language.text}
                  </Text>
                ) : null}
              </View>
            ),
          )}
        </View>
        {hasButton ? (
          <CollapseButton
            collapsed={Boolean(item.currentlyCollapsed)}
            onPress={() => onToggleCollapse(item.sectionId)}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View
      onLayout={(event) =>
        onMeasured?.(event.nativeEvent.layout.height, measurementSignature)
      }
    >
      <VerseBlock
        verse={item.verse}
        index={item.verseIndex}
        visibleLanguages={visibleLanguages}
        fontSize={fontSize}
        theme={theme}
        columnWidth={columnWidth}
        tableWidth={tableWidth}
        isRecitedPrayer={Boolean(item.isRecitedPrayer)}
        isReading={Boolean(item.isReading)}
        forceWhiteText={Boolean(item.forceWhiteVerses || item.verse?.forceWhiteText)}
        colorIndex={item.colorIndex}
        suppressSpeakerLabel={Boolean(item.suppressSpeakerLabel)}
        onLanguageLayout={(language, metric) =>
          onLanguageMeasured?.(language, metric, measurementSignature)
        }
      />
    </View>
  );
}

function flattenSections(sections) {
  return sections.flatMap((section, sectionIndex) => {
    const verses = section.verses || [];

    return [
      {
        id: `${section.id}-title`,
        // A Minimizable/Minimized hymn doesn't get its own slide break in
        // the slideshow — it just doesn't force a fresh slide the way a
        // normal section title does, matching how it reads as a minor/compact
        // addendum. This is separate from collapsible/currentlyCollapsed
        // below, which control the gold circle minus/plus button.
        isCollapsed: Boolean(section.collapsible),
        sectionId: section.id,
        type: "title",
        title: section.title,
        collapsible: Boolean(section.collapsible),
        currentlyCollapsed: Boolean(section.currentlyCollapsed),
      },
      ...verses.map((verse, verseIndex) => ({
        id: `${section.id}-${verseIndex}`,
        sectionId: section.id,
        type: "verse",
        verse,
        colorIndex: getVerseColorIndex(section, verseIndex),
        suppressSpeakerLabel:
          Boolean(verse.suppressSpeakerLabel) ||
          shouldSuppressSpeakerLabel(verses, verseIndex),
        // Recited Prayer is a per-verse type (a verse's own effective type
        // after inheritance — see resolveEffectiveVerseType), not a
        // whole-section flag.
        isRecitedPrayer: verse.type === "recitedPrayer",
        isReading: Boolean(section.isReading),
        forceWhiteVerses: Boolean(section.forceWhiteVerses),
        verseIndex: sectionIndex + verseIndex,
      })),
    ];
  });
}

function getVerseColorIndex(section, index) {
  const title = typeof section.title === "string" ? section.title : section.title?.english || "";
  const effectiveIndex = getEffectiveAlternatingVerseIndex(section, index);

  if (section.alternateEvery !== undefined) {
    if (!section.alternateEvery) return 0;
    const colorIndex = Math.floor(effectiveIndex / section.alternateEvery);
    return section.reverseAlternating ? colorIndex + 1 : colorIndex;
  }

  if (/^o daughter of david$/i.test(title)) {
    return Math.floor(effectiveIndex / 4);
  }

  const shouldUsePairing =
    section.isPsali ||
    /psali|aripsaleen/i.test(title) ||
    isPsaliLikeTwoVerseSectionTitle(title) ||
    (section.verses || []).some((verse) => Boolean(getSpeakerRole(verse.type)));

  if (!shouldUsePairing) {
    return effectiveIndex;
  }

  if (/conclusion of the (adam|watos) psali/i.test(title)) {
    return effectiveIndex;
  }

  if (getSpeakerRole(section.verses?.[0]?.type) === "priest") {
    return effectiveIndex <= 2 ? 0 : 1 + Math.floor((effectiveIndex - 3) / 2);
  }

  return Math.floor(effectiveIndex / 2);
}

function getEffectiveAlternatingVerseIndex(section, index) {
  return (section.verses || [])
    .slice(0, index + 1)
    .filter((verse) =>
      verse.type !== "refrainLabel" &&
      verse.type !== "refrain" &&
      verse.type !== "comment" &&
      !verse.forceWhiteText
    )
    .length - 1;
}

function isPsaliLikeTwoVerseSectionTitle(title) {
  return /^(agios o theos|the lord said to moses|let us all praise along with david|koiahk praise for the holy trinity|god eternal|(alternate:\s*)?bless the god of israel|the (first|second|third|fourth|fifth|sixth|seventh) explanation)$/i
    .test(String(title || "").trim());
}

function shouldSuppressSpeakerLabel(verses = [], index = 0) {
  const currentType = getSpeakerType(verses[index]);

  if (!currentType) {
    return false;
  }

  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const previousVerse = verses[previousIndex];
    const previousType = getSpeakerType(previousVerse);

    if (previousType) {
      return previousType === currentType;
    }

    if (
      String(previousVerse?.english || "").trim() ||
      String(previousVerse?.coptic || "").trim() ||
      String(previousVerse?.arabic || "").trim()
    ) {
      return false;
    }
  }

  return false;
}

function getSpeakerType(verse) {
  return getSpeakerRole(verse?.type);
}

function getSpeakerRole(type) {
  const normalizedType = String(type || "").toLowerCase();

  if (normalizedType.startsWith("priest")) return "priest";
  if (normalizedType.startsWith("people")) return "people";
  if (normalizedType.startsWith("deacon")) return "deacon";
  if (normalizedType.startsWith("reader")) return "reader";

  return "";
}

function findSlideSectionId(slide = []) {
  return slide.find((item) => item.sectionId)?.sectionId;
}

function getItemSignature(item) {
  if (item.type === "title") {
    const title = typeof item.title === "string"
      ? item.title
      : [item.title?.english, item.title?.arabic].filter(Boolean).join("/");

    return `${item.id}:title:${title.length}:${item.isCollapsed ? "collapsed" : "open"}`;
  }

  const verse = item.verse || {};

  return [
    item.id,
    "verse",
    verse.type || "",
    String(verse.english || "").length,
    String(verse.coptic || "").length,
    String(verse.arabic || "").length,
    verse.seasonalHoosVersePrefix || "",
    item.suppressSpeakerLabel ? "speaker-hidden" : "speaker-visible",
  ].join(":");
}

function buildTitleLanguages(title, visibleLanguages, titleHelpers) {
  const titleParts = titleHelpers.getTitleParts(title);
  const languages = [];
  const showEnglish = titleHelpers.shouldShowEnglishTitle();
  const showArabic = titleHelpers.shouldShowArabicTitle(title);

  if (showEnglish) {
    languages.push({
      align: showArabic ? "left" : "center",
      key: "english",
      text: formatEnglishDisplayText(titleHelpers.getTitleText(title)),
    });
  }

  if (showArabic) {
    languages.push({
      align: showEnglish ? "right" : "center",
      key: "arabic",
      text: formatArabicNumbers(titleParts.arabic || ""),
    });
  }

  return languages.length
    ? languages
    : [{
        align: "center",
        key: "english",
        text: formatEnglishDisplayText(titleParts.english || ""),
      }];
}

function formatArabicNumbers(text) {
  return String(text || "").replace(/\d/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit);
}

const EASTERN_ARABIC_DIGITS = {
  0: "٠",
  1: "١",
  2: "٢",
  3: "٣",
  4: "٤",
  5: "٥",
  6: "٦",
  7: "٧",
  8: "٨",
  9: "٩",
};

function paginateItems(
  items,
  heights,
  languageHeights,
  availableHeight,
  fontSize,
  visibleLanguages,
  tableWidth,
) {
  const slides = [];
  let currentSlide = [];
  let currentHeight = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.type === "title" && currentSlide.length && !item.isCollapsed) {
      slides.push(currentSlide);
      currentSlide = [];
      currentHeight = 0;
    }

    const itemHeight = Math.ceil((heights[item.id] || 0) + 2);
    const followingMinimumHeight =
      item.type === "title"
        ? getMinimumFollowingVerseHeight(items[index + 1], languageHeights, fontSize)
        : 0;
    const requiredHeight = itemHeight + followingMinimumHeight;

    const currentSlideHasVerse = currentSlide.some((slideItem) => slideItem.type === "verse");
    const canSplitTallVerseAfterTitle =
      item.type === "verse" &&
      itemHeight > availableHeight &&
      !currentSlideHasVerse;

    if (
      currentSlide.length &&
      currentHeight + Math.max(itemHeight, requiredHeight) > availableHeight &&
      !canSplitTallVerseAfterTitle
    ) {
      slides.push(currentSlide);
      currentSlide = [];
      currentHeight = 0;
    }

    if (
      item.type === "verse" &&
      itemHeight > availableHeight
    ) {
      const languageMetric = hasMeasuredVerseLines(languageHeights[item.id])
        ? languageHeights[item.id]
        : createEstimatedVerseMetric(item, fontSize, visibleLanguages, tableWidth);

      if (!hasMeasuredVerseLines(languageMetric)) {
        currentSlide.push(item);
        currentHeight += itemHeight;
        continue;
      }

      const result = appendTallVerseSegments({
        item,
        languageMetric,
        slides,
        currentSlide,
        currentHeight,
        availableHeight,
        fontSize,
      });
      currentSlide = result.currentSlide;
      currentHeight = result.currentHeight;
      continue;
    }

    currentSlide.push(item);
    currentHeight += itemHeight;
  }

  if (currentSlide.length) {
    slides.push(currentSlide);
  }

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
}) {
  const state = createVerseLineState(languageMetric, fontSize, item);
  let segmentIndex = 0;

  while (hasRemainingVerseLines(state)) {
    const remainingHeight = availableHeight - currentHeight;
    const capacityItem =
      segmentIndex > 0 ? { ...item, suppressSpeakerLabel: true } : item;
    let lineCapacities = getLineCapacitiesForHeight(
      state,
      remainingHeight,
      fontSize,
      capacityItem,
    );

    if (!hasPositiveLineCapacity(lineCapacities) && currentSlide.length) {
      slides.push(currentSlide);
      currentSlide = [];
      currentHeight = 0;
      continue;
    }

    if (!hasPositiveLineCapacity(lineCapacities)) {
      lineCapacities = getMinimumLineCapacities(state);
    }

    const segment = createVerseLineSegment(item, state, lineCapacities, segmentIndex);
    const segmentHeight = getVerseLineSegmentHeight(segment, fontSize);

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

function hasMeasuredVerseLines(metric = {}) {
  return ["english", "coptic", "arabic"].some(
    (language) => Array.isArray(metric[language]?.lines) && metric[language].lines.length,
  );
}

function createVerseLineState(languageMetric = {}, fontSize, item = {}) {
  const languages = ["english", "coptic", "arabic"]
    .map((language) => ({
      language,
      lineHeight: getLanguageLineHeight(language, fontSize),
      lines: getMetricLinesForLanguage(languageMetric[language]?.lines || [], language, item),
      offset: 0,
    }))
    .filter((entry) => entry.lines.length);

  return { languages };
}

function hasRemainingVerseLines(state) {
  return state.languages.some((entry) => entry.offset < entry.lines.length);
}

function getLineCapacitiesForHeight(state, height, fontSize, item) {
  const usableHeight = height - getVerseVerticalPadding(item);

  if (usableHeight <= 0) {
    return {};
  }

  return state.languages
    .filter((entry) => entry.offset < entry.lines.length)
    .reduce((capacities, entry) => {
      capacities[entry.language] = Math.max(
        0,
        Math.floor(
          (usableHeight - getLanguageExtraTopPadding(entry.language, item, fontSize)) /
            entry.lineHeight,
        ),
      );

      return capacities;
    }, {});
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

function createVerseLineSegment(item, state, lineCapacities, segmentIndex) {
  const languageKeys = state.languages.map((entry) => entry.language);
  const verse = {
    ...item.verse,
    arabic: "",
    coptic: "",
    english: "",
    slideshowLanguageKeys: languageKeys,
  };
  const lineCounts = {};

  state.languages.forEach((entry) => {
    const remainingCount = entry.lines.length - entry.offset;
    const takeCount = Math.min(lineCapacities[entry.language] || 0, remainingCount);
    const lines = entry.lines.slice(entry.offset, entry.offset + takeCount);

    verse[entry.language] = joinRenderedLines(lines);
    lineCounts[entry.language] = lines.length;
    entry.offset += takeCount;
  });

  return {
    item: {
      ...item,
      id: segmentIndex ? `${item.id}-segment-${segmentIndex}` : item.id,
      slideId: `${item.id}-segment-${segmentIndex}`,
      suppressSpeakerLabel: Boolean(item.suppressSpeakerLabel) || segmentIndex > 0,
      verse,
      slideshowLineCounts: lineCounts,
    },
  };
}

function joinRenderedLines(lines) {
  return lines
    .map((line) => line.text || "")
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function getVerseLineSegmentHeight(segment, fontSize) {
  const counts = segment.item.slideshowLineCounts || {};
  const languageHeights = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([language, count]) =>
      count * getLanguageLineHeight(language, fontSize) +
      getLanguageExtraTopPadding(language, segment.item, fontSize) +
      getVerseVerticalPadding(segment.item),
    );

  return languageHeights.length ? Math.max(...languageHeights) : 0;
}

function getMinimumFollowingVerseHeight(item, languageHeights, fontSize) {
  if (item?.type !== "verse" || !hasMeasuredVerseLines(languageHeights[item.id])) {
    return 0;
  }

  const state = createVerseLineState(languageHeights[item.id] || {}, fontSize, item);
  const minimumLineHeight = Math.max(
    0,
    Math.max(
      ...state.languages.map(
        (entry) =>
          entry.lineHeight +
          getLanguageExtraTopPadding(entry.language, item, fontSize) +
          getVerseVerticalPadding(item),
      ),
    ),
  );

  return minimumLineHeight;
}

function estimateItemHeight(item, fontSize, visibleLanguages, tableWidth) {
  if (item.type === "title") {
    return Math.max(Math.round(fontSize * 0.8), 20) + SPACING.sm * 2;
  }

  const layout = getVerseLanguageLayout(item, visibleLanguages, tableWidth);
  const languageHeights = layout.languages
    .map((language) => {
      const text = item.verse?.[language];

      if (!String(text || "").trim()) {
        return 0;
      }

      return estimateLanguageLineCount(
        text,
        language,
        fontSize,
        layout.rowColumnWidth,
        item,
      ) *
        getLanguageLineHeight(language, fontSize) +
        getLanguageExtraTopPadding(language, item, fontSize) +
        getVerseVerticalPadding(item);
    })
    .filter(Boolean);

  return languageHeights.length ? Math.max(...languageHeights) : getVerseVerticalPadding(item);
}

function createEstimatedVerseMetric(item, fontSize, visibleLanguages, tableWidth) {
  const layout = getVerseLanguageLayout(item, visibleLanguages, tableWidth);

  return layout.languages.reduce((metric, language) => {
    const text = item.verse?.[language];

    if (!String(text || "").trim()) {
      return metric;
    }

    const lines = createEstimatedTextLines(
      text,
      getEstimatedLineLength(language, fontSize, layout.rowColumnWidth, item),
    );

    return {
      ...metric,
      [language]: {
        height: lines.length * getLanguageLineHeight(language, fontSize),
        lines,
        lineSignature: lines.map((line) => line.text).join("\n"),
      },
    };
  }, {});
}

function getVerseLanguageLayout(item, visibleLanguages = {}, tableWidth = 0) {
  const languages = getVisibleVerseLanguages(item, visibleLanguages);
  const rowColumnWidth =
    (tableWidth || 0) / Math.max(languages.length, 1);

  return {
    languages,
    rowColumnWidth: Math.max(rowColumnWidth, 1),
  };
}

function getVisibleVerseLanguages(item, visibleLanguages = {}) {
  const verse = item.verse || {};

  if (verse.invincibleCoptic) {
    return String(verse.coptic || "").trim() ? ["coptic"] : [];
  }

  return ["english", "coptic", "arabic"].filter((language) => {
    if (!String(verse[language] || "").trim()) {
      return false;
    }

    if (language === "english" || language === "arabic") {
      return Boolean(visibleLanguages[language]);
    }

    return (
      visibleLanguages.coptic ||
      verse.forceCopticVisible
    ) &&
      (
        !item.isRecitedPrayer ||
        visibleLanguages.copticRecitedPrayers ||
        verse.forceCopticVisible
      );
  });
}

function getVisibleLanguageCount(visibleLanguages = {}) {
  return ["english", "coptic", "arabic"].filter((language) => visibleLanguages[language]).length || 1;
}

function createEstimatedTextLines(text, maxLineLength) {
  return String(text || "")
    .split(/\n+/)
    .flatMap((line) => splitEstimatedLine(line, maxLineLength))
    .filter((line) => line.text.trim());
}

function splitEstimatedLine(line, maxLineLength) {
  const words = String(line || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;

    if (current && next.length > maxLineLength) {
      lines.push({ text: current });
      current = word;
      return;
    }

    current = next;
  });

  if (current) {
    lines.push({ text: current });
  }

  return lines.length ? lines : [{ text: String(line || "") }];
}

function estimateLanguageLineCount(text, language, fontSize, rowColumnWidth, item) {
  return Math.max(
    1,
    String(text || "")
      .split(/\n+/)
      .reduce(
        (count, line) =>
          count + Math.max(
            1,
            Math.ceil(
              String(line || "").length /
              getEstimatedLineLength(language, fontSize, rowColumnWidth, item),
            ),
          ),
        0,
      ),
  );
}

function getEstimatedLineLength(language, fontSize, rowColumnWidth, item) {
  const horizontalPadding = SPACING.xs * 2;
  const availableWidth = Math.max((rowColumnWidth || 0) - horizontalPadding, 40);
  const languageFontSize = getLanguageFontSize(language, item, fontSize);
  const characterWidthFactor =
    language === "coptic"
      ? 0.72
      : language === "arabic"
        ? 0.62
        : 0.56;
  const estimatedLength = Math.floor(
    availableWidth / Math.max(languageFontSize * characterWidthFactor, 1),
  );

  return Math.min(Math.max(estimatedLength, 8), 80);
}

function getLanguageFontSize(language, item, fontSize) {
  if (["refrainLabel", "readingReference"].includes(item.verse?.type)) {
    return Math.max(Math.round(fontSize * 0.5), 11);
  }

  if (language === "coptic") {
    return Math.round(fontSize * 1.25);
  }

  if (language === "arabic") {
    return Math.round(fontSize * 1.15);
  }

  return fontSize;
}

function normalizeLanguageMetric(metric) {
  if (!metric.lines) {
    return metric;
  }

  const lines = metric.lines.map((line) => ({
    text: line.text || "",
  }));

  return {
    ...metric,
    lines,
    lineSignature: lines.map((line) => line.text).join("\n"),
  };
}

function getLanguageLineHeight(language, fontSize) {
  if (language === "coptic") {
    return Math.round(Math.round(fontSize * 1.25) * 1);
  }

  return Math.round(fontSize * 1.25);
}

function getVerseVerticalPadding(item = {}) {
  return item.verse?.seasonalHoosVersePrefix ? 4 : SPACING.sm * 2;
}

function getLanguageExtraTopPadding(language, item, fontSize) {
  if (language === "coptic" && hasSeasonalPrefixLine(item?.verse)) {
    return getSeasonalPrefixLineHeight(getLanguageFontSize(language, item, fontSize));
  }

  if (
    language !== "coptic" ||
    item.suppressSpeakerLabel ||
    !getSpeakerRole(item.verse?.type)
  ) {
    return 0;
  }

  return SPACING.sm + getLanguageLineHeight(language, fontSize);
}

function getMetricLinesForLanguage(lines, language, item = {}) {
  if (language !== "coptic" || !hasSeasonalPrefixLine(item?.verse)) {
    return lines;
  }

  const prefix = String(item?.verse?.seasonalHoosVersePrefix || "").trim();

  if (!prefix) {
    return lines;
  }

  return lines.filter((line, index) =>
    index !== 0 || String(line?.text || "").trim() !== prefix,
  );
}

function hasSeasonalPrefixLine(verse = {}) {
  const prefix = String(verse.seasonalHoosVersePrefix || "").trim();

  if (!prefix) {
    return false;
  }

  return ["english", "arabic"].some((language) =>
    String(verse[language] || "").trimStart().startsWith(prefix),
  );
}

function getSeasonalPrefixLineHeight(fontSize) {
  const prefixFontSize = Math.max(Math.round((fontSize || 0) * 0.5), 8);

  return Math.max(Math.round(prefixFontSize * 1.1), 9);
}

function getSlidePadding(safeAreaInsets = {}) {
  return {
    bottom: Math.max(safeAreaInsets.bottom || 0, SPACING.xl),
    top: Math.max(safeAreaInsets.top || 0, SPACING.xl),
  };
}

function requestMeasurementFrame(callback) {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }

  return setTimeout(callback, 16);
}

function cancelMeasurementFrame(frameId) {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(frameId);
    return;
  }

  clearTimeout(frameId);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: "100%",
    overflow: "hidden",
    width: "100%",
  },
  measurementLayer: {
    left: 0,
    opacity: 0,
    position: "absolute",
    top: 0,
    width: "100%",
  },
  navigationLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    elevation: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    zIndex: 10,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
  },
  collapseButton: {
    alignItems: "center",
    height: COLLAPSE_BUTTON_SIZE,
    justifyContent: "center",
    width: COLLAPSE_BUTTON_SIZE,
    zIndex: 20,
  },
  collapseButtonCircle: {
    alignItems: "center",
    borderRadius: COLLAPSE_BUTTON_CIRCLE / 2,
    borderWidth: 1.5,
    height: COLLAPSE_BUTTON_CIRCLE,
    justifyContent: "center",
    width: COLLAPSE_BUTTON_CIRCLE,
  },
  collapseBar: {
    position: "absolute",
  },
  collapseBarHorizontal: {
    borderRadius: 1,
    height: 1.5,
    width: 12,
  },
  collapseBarVertical: {
    borderRadius: 1,
    height: 12,
    width: 1.5,
  },
  sectionTitle: {
    flexShrink: 1,
    fontFamily: "Georgia",
    fontWeight: "700",
    letterSpacing: 0,
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  sectionTitleArabic: {
    fontFamily: "Arial",
    textAlign: "right",
    writingDirection: "rtl",
  },
  slide: {
    flex: 1,
    overflow: "hidden",
  },
  tapZone: {
    backgroundColor: "transparent",
    borderWidth: 0,
    flex: 1,
    ...Platform.select({
      web: {
        cursor: "pointer",
        outlineStyle: "none",
        outlineWidth: 0,
        WebkitTapHighlightColor: "transparent",
      },
      default: {},
    }),
  },
  titleTable: {
    flexDirection: "row",
    flexShrink: 0,
  },
  titleCell: {
    flexShrink: 1,
    paddingHorizontal: SPACING.xs,
  },
});
