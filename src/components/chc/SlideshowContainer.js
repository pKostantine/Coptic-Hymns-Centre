import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { COLORS, SPACING } from "../../constants/theme";
import { formatEnglishDisplayText } from "../../utils/displayText";
import { computeGlobalSuppressSpeakerLabelFlags, resolveRubricKey, shouldUsePeopleLineColor } from "../../utils/verseRubric";
import VerseBlock from "./VerseBlock";
import { sectionRestoreCandidates } from "../../utils/sectionRestore";
import {
  createSlideAnchor,
  estimateItemHeight,
  findSlideIndexForAnchor,
  getAdjacentSlideIndexes,
  getItemSignature,
  getMeasurementBatch,
  getPageTurnForKey,
  getPageTurnForTap,
  getPageTurnForViewportTap,
  getSlideContentBudget,
  getSlideKey,
  getSlidePadding,
  getSlideshowChromeMetrics,
  normalizeLanguageMetric,
  paginateItems,
} from "./slideshowLayout";

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
  bishopPresent,
  onAction,
  copticGospelRite,
  suppressAllSpeakerLabels,
  keyboardNavigationEnabled = true,
}) {
  const [viewportHeight, setViewportHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [measuredHeights, setMeasuredHeights] = useState({});
  const [measuredLanguageHeights, setMeasuredLanguageHeights] = useState({});
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  // Unlike a numeric page index, this survives front-to-back measurement and
  // repagination. An anchor identifies the source row plus its line offset,
  // so the reader never jumps to unrelated content while estimates settle.
  const [currentAnchor, setCurrentAnchor] = useState(null);
  const measurementSignatureRef = useRef("");
  const lastAppliedSelectedSectionId = useRef(null);
  const pendingHeightsRef = useRef({});
  const pendingLanguageHeightsRef = useRef({});
  const pendingMeasurementFrameRef = useRef(null);
  // Whatever section (hymn) the user is actually looking at right now, kept
  // up to date by the onCurrentSectionChange effect below. A settings change
  // (font size, a language toggle, minimizing a hymn, Bishop Present, ...)
  // forces a full repagination — without remembering this, the reset effect
  // below used to always snap back to slide 0, sending the user back to the
  // very start of the document every time they changed anything. Restoring
  // always lands on the START of that hymn (its title's own slide), never
  // partway through it — deliberately less precise than tracking the exact
  // verse, matching scroll mode's own settings-change behavior.
  const preservedSectionIdRef = useRef(null);
  const pendingRestoreSectionIdRef = useRef(null);
  // Every section id in document order as of the LAST pagination, and the
  // walk-back chain derived from it when a change invalidates one. A settings
  // change can remove the very hymn being restored to -- turning Silent
  // Prayers off while reading one, or the only language it has text in -- and
  // by then it is already gone from `sections`, so the order it used to sit
  // in has to have been captured before the change to know what came just
  // before it.
  const sectionIdOrderRef = useRef([]);
  const pendingRestoreCandidatesRef = useRef([]);
  // Tracks what every item's own height was last measured against, so a
  // change that only touches a handful of items (minimizing one hymn, which
  // just removes that section's verse items -- see buildSlideshowSections in
  // DocumentSurface.tsx) can keep every OTHER item's already-known height
  // instead of wiping the whole document's measurements and re-rendering
  // everything off-screen from scratch just because one thing changed.
  const lastGlobalMeasurementKeyRef = useRef(null);
  const lastItemSignaturesRef = useRef(new Map());

  const items = useMemo(
    () => flattenSections(sections, bishopPresent, suppressAllSpeakerLabels),
    [sections, bishopPresent, suppressAllSpeakerLabels],
  );
  const itemSignatures = useMemo(
    () => new Map(items.map((item) => [
      item.id,
      getItemSignature(item, getDisplayedItemTitle(item, visibleLanguages, titleHelpers)),
    ])),
    [items, titleHelpers, visibleLanguages],
  );
  const itemsSignature = useMemo(
    () => items.map((item) => itemSignatures.get(item.id)).join("|"),
    [itemSignatures, items],
  );
  const slideTableWidth = Math.max(viewportWidth || tableWidth || 1, 1);
  const slideColumnWidth =
    slideTableWidth / Math.max(getVisibleLanguageCount(visibleLanguages), 1);
  // Everything that affects EVERY item's height at once -- as opposed to
  // itemsSignature, where a single item changing (e.g. minimizing one hymn)
  // only ever affects that one item and whatever it contained.
  const globalMeasurementKey = useMemo(
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
        refreshKey,
      ].join(":"),
    [
      fontSize,
      refreshKey,
      slideTableWidth,
      viewportHeight,
      viewportHeightOverride,
      viewportWidth,
      visibleLanguages,
    ],
  );
  const measuredKey = `${globalMeasurementKey}:${itemsSignature}`;
  useLayoutEffect(() => {
    measurementSignatureRef.current = measuredKey;
    pendingHeightsRef.current = {};
    pendingLanguageHeightsRef.current = {};
    if (pendingMeasurementFrameRef.current) {
      cancelMeasurementFrame(pendingMeasurementFrameRef.current);
      pendingMeasurementFrameRef.current = null;
    }
    pendingRestoreSectionIdRef.current = preservedSectionIdRef.current;
    pendingRestoreCandidatesRef.current = sectionRestoreCandidates(
      sectionIdOrderRef.current,
      preservedSectionIdRef.current,
    );
    sectionIdOrderRef.current = getSectionIdOrder(items);

    const newSignatures = itemSignatures;
    // Nothing that affects every item's height changed -- only the item set
    // itself did (most commonly: minimizing/expanding one hymn, which just
    // adds or removes that section's verse items). Keep every item whose own
    // signature is unchanged rather than wiping the whole document, so only
    // the handful of items that actually differ need to remeasure.
    const onlyItemsChanged = lastGlobalMeasurementKeyRef.current === globalMeasurementKey;
    const keepUnchanged = (current) => {
      if (!onlyItemsChanged) return {};
      const next = {};
      items.forEach((item) => {
        if (current[item.id] != null && lastItemSignaturesRef.current.get(item.id) === newSignatures.get(item.id)) {
          next[item.id] = current[item.id];
        }
      });
      return next;
    };

    setMeasuredHeights(keepUnchanged);
    setMeasuredLanguageHeights(keepUnchanged);
    lastGlobalMeasurementKeyRef.current = globalMeasurementKey;
    lastItemSignaturesRef.current = newSignatures;
  }, [globalMeasurementKey, itemSignatures, items, measuredKey, refreshKey]);

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
            // A reported metric can be partial (a height without a fresh
            // lineSignature, say), so it layers over whatever is already
            // known for this language rather than replacing it. This merge
            // used to happen back in queueMeasuredLanguage, which forced that
            // callback to close over measuredLanguageHeights and take a new
            // identity after every flush; doing it here reads the committed
            // state straight from the updater instead.
            const mergedMetric = normalizeLanguageMetric({ ...currentMetric, ...metric });

            if (
              currentMetric.height !== mergedMetric.height ||
              currentMetric.lineSignature !== mergedMetric.lineSignature
            ) {
              nextItem[language] = mergedMetric;
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

      // Accumulates only against what this frame has already queued --
      // merging against committed state is flushPendingMeasurements' job now.
      const existingMetric = pendingLanguageHeightsRef.current[itemId]?.[language] || {};
      pendingLanguageHeightsRef.current[itemId] = {
        ...(pendingLanguageHeightsRef.current[itemId] || {}),
        [language]: { ...existingMetric, ...metric },
      };
      scheduleMeasurementFlush();
    },
    [scheduleMeasurementFlush],
  );

  const slides = useMemo(() => {
    const measuredViewportHeight =
      viewportHeight && viewportHeightOverride
        ? Math.min(viewportHeight, viewportHeightOverride)
        : viewportHeight || viewportHeightOverride;

    if (!measuredViewportHeight) {
      return dropEmptySlides([items.slice(0, 1)]);
    }

    const effectiveHeights = {};
    items.forEach((item) => {
      effectiveHeights[item.id] =
        measuredHeights[item.id] ??
        estimateItemHeight(item, fontSize, visibleLanguages, slideTableWidth);
    });

    const budget = getSlideContentBudget(
      measuredViewportHeight,
      getSlidePadding(measuredViewportHeight),
    );
    const paginated = paginateItems(
      items,
      effectiveHeights,
      measuredLanguageHeights,
      budget,
      fontSize,
      visibleLanguages,
      slideTableWidth,
    );

    return dropEmptySlides(paginated);
  }, [
    fontSize,
    items,
    measuredHeights,
    measuredLanguageHeights,
    slideTableWidth,
    viewportHeight,
    viewportHeightOverride,
    visibleLanguages,
  ]);
  const measuredViewportHeight =
    viewportHeight && viewportHeightOverride
      ? Math.min(viewportHeight, viewportHeightOverride)
      : viewportHeight || viewportHeightOverride;
  const slidePadding = useMemo(
    () => getSlidePadding(measuredViewportHeight),
    [measuredViewportHeight],
  );
  // The next bounded batch of items still missing a real measured height.
  // Mounting EVERY unmeasured item in one commit is what made this slow:
  // anything that changes globalMeasurementKey (font size, a language
  // toggle, a rotation, or entering Slideshow Mode at all) wipes every
  // cached height, so the measurement layer would try to mount every verse
  // in the document at once -- thousands of views in a single synchronous
  // commit, which is the freeze. Capping each commit lets the batch measure,
  // land its heights, advance the filter, and mount the next batch on a
  // later frame, so the UI stays responsive the whole way through.
  // Pagination keeps falling back to estimateItemHeight for anything not yet
  // measured. The current anchor is measured first after a jump or resize;
  // the remaining document then settles in bounded batches.
  const measurementBatch = useMemo(() => {
    if (!(viewportHeight || viewportHeightOverride)) return [];
    return getMeasurementBatch(
      items,
      measuredHeights,
      MEASUREMENT_BATCH_SIZE,
      currentAnchor,
      selectedSectionId || currentAnchor?.sectionId,
    );
  }, [currentAnchor, items, measuredHeights, selectedSectionId, viewportHeight, viewportHeightOverride]);
  // An empty batch means nothing is left unmeasured, so this stays equivalent
  // to the old items.every(...) check without rescanning the whole document
  // on every render.
  const isMeasurementComplete = useMemo(
    () => Boolean(viewportHeight || viewportHeightOverride) && measurementBatch.length === 0,
    [measurementBatch, viewportHeight, viewportHeightOverride],
  );

  const resolvedSlideIndex = useMemo(() => {
    const anchoredIndex = findSlideIndexForAnchor(slides, currentAnchor);
    if (anchoredIndex >= 0) return anchoredIndex;
    return Math.min(currentSlideIndex, Math.max(slides.length - 1, 0));
  }, [currentAnchor, currentSlideIndex, slides]);

  useEffect(() => {
    // A fresh, explicit content-selector pick always wins over (and cancels)
    // whatever the reset effect above was hoping to auto-restore — otherwise
    // the reporting effect below would keep comparing the user's brand-new
    // position against that now-irrelevant stale target and refuse to report
    // it. Runs as its own effect, keyed only on selectedSectionId, so it
    // fires (and clears the stale target) in the same commit as — but before
    // — the jump effect right below, which shares this same trigger.
    if (selectedSectionId && lastAppliedSelectedSectionId.current !== selectedSectionId) {
      pendingRestoreSectionIdRef.current = null;
    }
  }, [selectedSectionId]);

  useEffect(() => {
    const hasFreshExplicitSelection = Boolean(
      selectedSectionId && lastAppliedSelectedSectionId.current !== selectedSectionId,
    );
    const anchoredIndex = findSlideIndexForAnchor(slides, currentAnchor);

    // Measurement, a resize, or a font/language change can rebuild every
    // page. If the precise row/line anchor survived, it is strictly better
    // than the old section-level fallback and requires no state update.
    if (!hasFreshExplicitSelection && anchoredIndex >= 0) {
      pendingRestoreSectionIdRef.current = null;
      pendingRestoreCandidatesRef.current = [];
      return;
    }

    const requestedSectionId = hasFreshExplicitSelection
      ? selectedSectionId
      : pendingRestoreSectionIdRef.current;

    if (!requestedSectionId) return;

    const findSlideFor = (sectionId) =>
      slides.findIndex((slide) => slide.some((item) => item.sectionId === sectionId));

    let targetSectionId = requestedSectionId;
    let nextSlideIndex = findSlideFor(requestedSectionId);

    // The hymn being restored to may be exactly what the change just removed,
    // in which case there is no slide to land on and the reader would be left
    // at slide 0 -- the top of the document. Walk back through the hymns that
    // came before it and take the nearest one that survived. An explicit
    // content-selector pick never needs this: it can only name something
    // currently on the list.
    if (nextSlideIndex < 0 && !hasFreshExplicitSelection) {
      const candidates = pendingRestoreCandidatesRef.current;
      for (let i = 0; i < candidates.length; i += 1) {
        const candidateSlideIndex = findSlideFor(candidates[i]);
        if (candidateSlideIndex >= 0) {
          targetSectionId = candidates[i];
          nextSlideIndex = candidateSlideIndex;
          break;
        }
      }
    }

    if (nextSlideIndex >= 0) {
      setCurrentSlideIndex(nextSlideIndex);
      setCurrentAnchor(createSlideAnchor(slides[nextSlideIndex]));
      if (hasFreshExplicitSelection) {
        lastAppliedSelectedSectionId.current = targetSectionId;
      }
    }

    // Only the auto-restore path (no explicit selectedSectionId) clears here;
    // an explicit pick already cleared it above, and re-clearing here would
    // happen too early — before setCurrentSlideIndex's update has actually
    // landed — letting the reporting effect below see a still-stale slide
    // with nothing left to compare it against.
    if (!hasFreshExplicitSelection) {
      pendingRestoreSectionIdRef.current = null;
      pendingRestoreCandidatesRef.current = [];
    }
  }, [currentAnchor, selectedSectionId, slides]);

  useEffect(() => {
    // A transient viewport collapse -- the container's own height briefly
    // reporting 0, e.g. for a single frame during a screen-transition
    // animation while navigating away -- makes the `slides` memo above fall
    // back to a single-item "slide 0" that has nothing to do with where the
    // user actually is. Reporting (and persisting) that would silently
    // overwrite the real remembered position right as the user leaves.
    if (!(viewportHeight || viewportHeightOverride)) return;

    const currentSlide = slides[resolvedSlideIndex];
    const currentSectionId = findSlideSectionId(currentSlide);
    if (!currentSectionId) return;

    // A section-level fallback may still be pending when the exact anchored
    // row was filtered out (for example, after collapsing its section). Do
    // not persist an intermediate slide while that fallback is resolving.
    if (pendingRestoreSectionIdRef.current && pendingRestoreSectionIdRef.current !== currentSectionId) {
      return;
    }

    // The pending restore (if any) has now been confirmed reached — clear it
    // so it doesn't keep gating every future report once selectedSectionId
    // stops changing (it never resets back to undefined on its own).
    pendingRestoreSectionIdRef.current = null;
    preservedSectionIdRef.current = currentSectionId;
    onCurrentSectionChange?.(currentSectionId);
  }, [onCurrentSectionChange, resolvedSlideIndex, slides, viewportHeight, viewportHeightOverride]);

  const goToSlide = useCallback((requestedIndex) => {
    const nextIndex = Math.min(Math.max(requestedIndex, 0), Math.max(slides.length - 1, 0));
    setCurrentSlideIndex(nextIndex);
    setCurrentAnchor(createSlideAnchor(slides[nextIndex]));
  }, [slides]);

  const goToPreviousSlide = useCallback(() => {
    goToSlide(resolvedSlideIndex - 1);
  }, [goToSlide, resolvedSlideIndex]);

  const goToNextSlide = useCallback(() => {
    goToSlide(resolvedSlideIndex + 1);
  }, [goToSlide, resolvedSlideIndex]);

  useEffect(() => {
    if (
      !keyboardNavigationEnabled ||
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function" ||
      typeof window.removeEventListener !== "function"
    ) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isEditableKeyboardTarget(event.target)) return;
      const pageTurn = getPageTurnForKey(event.key);
      if (!pageTurn) return;
      event.preventDefault();
      if (pageTurn === "previous") goToPreviousSlide();
      if (pageTurn === "next") goToNextSlide();
      if (pageTurn === "first") goToSlide(0);
      if (pageTurn === "last") goToSlide(slides.length - 1);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNextSlide, goToPreviousSlide, goToSlide, keyboardNavigationEnabled, slides.length]);

  return (
    <View
      style={[styles.container, DISABLED_SELECTION_STYLE]}
      onLayout={(event) => {
        setViewportHeight(event.nativeEvent.layout.height);
        setViewportWidth(event.nativeEvent.layout.width);
      }}
    >
      {!isMeasurementComplete ? (
        <View pointerEvents="none" style={[styles.measurementLayer, DISABLED_SELECTION_STYLE]}>
          {/* Only items missing a cached height mount here, a bounded batch
              at a time (see measurementBatch above) -- most of the time
              (e.g. minimizing one hymn) that's a small handful of items
              anyway; see the reset effect above, which preserves cached
              heights for every item whose own signature didn't change.
              MeasurementItem wraps SlideItem so each item gets a stable pair
              of measurement callbacks: passing inline arrows here gave every
              item new props on every render, which defeated SlideItem's memo
              and re-rendered the whole batch on each flush. */}
          {measurementBatch.map((item) => (
            <MeasurementItem
              key={item.id}
              item={item}
              visibleLanguages={visibleLanguages}
              fontSize={fontSize}
              theme={theme}
              columnWidth={slideColumnWidth}
              tableWidth={slideTableWidth}
              titleHelpers={titleHelpers}
              measurementSignature={measuredKey}
              onQueueHeight={queueMeasuredHeight}
              onQueueLanguage={queueMeasuredLanguage}
              onToggleCollapse={onToggleCollapse}
              copticGospelRite={copticGospelRite}
            />
          ))}
        </View>
      ) : null}

      <NavigationSurface
        width={viewportWidth || slideTableWidth}
        onPrevious={goToPreviousSlide}
        onNext={goToNextSlide}
        onOpenSelector={onOpenSelector}
      >
        <SlideDeck
          slides={slides}
          currentIndex={resolvedSlideIndex}
          visibleLanguages={visibleLanguages}
          fontSize={fontSize}
          theme={theme}
          columnWidth={slideColumnWidth}
          tableWidth={slideTableWidth}
          titleHelpers={titleHelpers}
          slidePadding={slidePadding}
          onToggleCollapse={onToggleCollapse}
          onAction={onAction}
          copticGospelRite={copticGospelRite}
        />
      </NavigationSurface>

      <Text
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Slide ${resolvedSlideIndex + 1} of ${Math.max(slides.length, 1)}`}
        style={styles.screenReaderStatus}
      >
        {`Slide ${resolvedSlideIndex + 1} of ${Math.max(slides.length, 1)}`}
      </Text>
    </View>
  );
}

const SlideDeck = memo(function SlideDeck({ slides, currentIndex, ...slideProps }) {
  const mountedIndexes = getAdjacentSlideIndexes(currentIndex, slides.length);

  return (
    <View style={styles.slideDeck}>
      {mountedIndexes.map((index) => {
        const isCurrent = index === currentIndex;
        return (
          <View
            key={getSlideKey(slides[index], index)}
            accessibilityElementsHidden={!isCurrent}
            importantForAccessibility={isCurrent ? "yes" : "no-hide-descendants"}
            pointerEvents={isCurrent ? "auto" : "none"}
            style={[styles.slideLayer, !isCurrent && styles.preloadedSlide]}
          >
            <SlideView items={slides[index] || []} {...slideProps} />
          </View>
        );
      })}
    </View>
  );
});

export const SlideView = memo(function SlideView({
  items,
  visibleLanguages,
  fontSize,
  theme,
  columnWidth,
  tableWidth,
  titleHelpers,
  slidePadding,
  onToggleCollapse,
  onAction,
  copticGospelRite,
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
          onAction={onAction}
          copticGospelRite={copticGospelRite}
        />
      ))}
    </View>
  );
});

export function NavigationSurface({
  children,
  width,
  onPrevious,
  onNext,
  onOpenSelector,
}) {
  const { width: windowWidth } = useWindowDimensions();
  // The slideshow does not always occupy the whole browser window (drawers,
  // modals, and split layouts can all inset it). Comparing a page-level tap
  // against windowWidth made every tap in an inset/narrow surface look like
  // it happened on the left half. At very large font sizes there is also no
  // blank background to tap, so the fallback locationX can belong to a child
  // Text node instead of this surface. Cache the surface's actual viewport
  // bounds and normalize every page/client coordinate into them first.
  const fallbackSurfaceWidth = Math.max(width || windowWidth || 1, 1);
  const surfaceRef = useRef(null);
  const [surfaceBounds, setSurfaceBounds] = useState({
    left: 0,
    width: fallbackSurfaceWidth,
  });

  const measureSurface = useCallback((layoutWidth) => {
    const safeLayoutWidth = Number.isFinite(layoutWidth) && layoutWidth > 0
      ? layoutWidth
      : fallbackSurfaceWidth;
    setSurfaceBounds((current) => current.width === safeLayoutWidth
      ? current
      : { ...current, width: safeLayoutWidth });

    surfaceRef.current?.measureInWindow?.((left, _top, measuredWidth) => {
      setSurfaceBounds((current) => {
        const next = {
          left: Number.isFinite(left) ? left : current.left,
          width: Number.isFinite(measuredWidth) && measuredWidth > 0
            ? measuredWidth
            : safeLayoutWidth,
        };
        return next.left === current.left && next.width === current.width
          ? current
          : next;
      });
    });
  }, [fallbackSurfaceWidth]);

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
          const selectorEdgeWidth = Math.min(
            240,
            Math.max(96, surfaceBounds.width * 0.18),
          );
          const localStartX = gestureState.x0 - surfaceBounds.left;
          if (
            Boolean(onOpenSelector) &&
            localStartX > Math.max(surfaceBounds.width - selectorEdgeWidth, 0) &&
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
    [onNext, onOpenSelector, onPrevious, surfaceBounds],
  );

  return (
    <Pressable
      ref={surfaceRef}
      accessible={false}
      tabIndex={-1}
      style={styles.navigationSurface}
      onLayout={(event) => measureSurface(event.nativeEvent.layout.width)}
      onPress={(event) => {
        const nativeEvent = event.nativeEvent || {};
        let turn = null;

        // React Native Web exposes the real DOM currentTarget. clientX and
        // getBoundingClientRect use the same coordinate space, so this path
        // stays correct even when the slideshow is inset or the tapped child
        // is a full-size Text node.
        const targetRect = event.currentTarget?.getBoundingClientRect?.();
        if (
          targetRect &&
          targetRect.width > 0 &&
          Number.isFinite(nativeEvent.clientX)
        ) {
          turn = getPageTurnForTap(
            nativeEvent.clientX - targetRect.left,
            targetRect.width,
          );
        }

        if (!turn) {
          const touch = nativeEvent.changedTouches?.[0] || nativeEvent.touches?.[0];
          const pageX = Number.isFinite(touch?.pageX)
            ? touch.pageX
            : nativeEvent.pageX;

          if (Number.isFinite(pageX)) {
            turn = getPageTurnForViewportTap(
              pageX,
              surfaceBounds.left,
              surfaceBounds.width,
            );
          } else {
            // Last-resort support for platforms which provide only a local
            // coordinate. This is safe when the Pressable itself is the
            // native responder, while the viewport/page paths above cover
            // nested text targets.
            turn = getPageTurnForTap(
              nativeEvent.locationX,
              surfaceBounds.width || fallbackSurfaceWidth,
            );
          }
        }

        if (turn === "previous") onPrevious?.();
        if (turn === "next") onNext?.();
      }}
      {...panResponder.panHandlers}
    >
      {children}
    </Pressable>
  );
}

// How many unmeasured items may mount in the off-screen measurement layer in
// a single commit. Large enough that a typical hymn measures in one or two
// frames, small enough that no commit ever mounts a whole liturgy at once.
const MEASUREMENT_BATCH_SIZE = 48;
const COLLAPSE_BUTTON_SIZE = 40;
const COLLAPSE_BUTTON_CIRCLE = 22;
const DISABLED_SELECTION_STYLE = Platform.OS === "web"
  ? {
      WebkitTouchCallout: "none",
      WebkitUserSelect: "none",
      userSelect: "none",
    }
  : null;

/** Gold outlined circle with a minus bar always, plus a vertical bar (making a plus) only when collapsed — matches the old app's collapse-button-icon ::before/::after CSS bars. */
function CollapseButton({ collapsed, onPress }) {
  return (
    <Pressable
      accessibilityLabel={collapsed ? "Expand section" : "Collapse section"}
      accessibilityRole="button"
      onPress={(event) => {
        event.stopPropagation?.();
        onPress?.();
      }}
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

// Memoized so measurement flushes and adjacent-page preloading do not
// re-render every verse whose item reference is unchanged.
const SlideItem = memo(function SlideItem({
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
  onAction,
  copticGospelRite,
}) {
  const chrome = getSlideshowChromeMetrics(fontSize);

  if (item.type === "gospelRiteToggle") {
    return (
      <View
        style={styles.gospelRiteToggleRow}
        onLayout={(event) => onMeasured?.(event.nativeEvent.layout.height, measurementSignature)}
      >
        <Pressable
          style={[styles.gospelRiteToggle, copticGospelRite && styles.gospelRiteToggleOn]}
          accessibilityRole="switch"
          accessibilityState={{ checked: Boolean(copticGospelRite) }}
          onPress={(event) => {
            event.stopPropagation?.();
            onAction?.({ type: "toggleCopticGospelRite", sectionId: item.sectionId });
          }}
        >
          <View style={[styles.gospelRiteToggleDot, copticGospelRite && styles.gospelRiteToggleDotOn]} />
          <Text
            selectable={false}
            style={[
              styles.gospelRiteToggleText,
              {
                color: copticGospelRite ? COLORS.black : theme.colors.text,
                fontSize: chrome.buttonFontSize,
                lineHeight: chrome.buttonLineHeight,
              },
            ]}
          >
            Coptic Gospel Rite
          </Text>
        </Pressable>
      </View>
    );
  }

  if (item.type === "button") {
    const label = titleHelpers.shouldShowEnglishTitle(item.title) ? titleHelpers.getTitleText(item.title) : "";
    const arabicLabel =
      titleHelpers.shouldShowArabicTitle(item.title) ? item.title?.arabic || "" : "";

    return (
      <View
        style={styles.openButtonRow}
        onLayout={(event) => onMeasured?.(event.nativeEvent.layout.height, measurementSignature)}
      >
        <Pressable
          accessibilityRole="button"
          style={[styles.openButton, item.isHyperlink && styles.hyperlinkButton]}
          onPress={(event) => {
            event.stopPropagation?.();
            onAction?.({ type: item.buttonAction, sectionId: item.sectionId });
          }}
        >
          {label ? (
            <Text
              selectable={false}
              style={[
                styles.openButtonText,
                {
                  color: item.isHyperlink ? COLORS.link : COLORS.subdoc,
                  fontSize: chrome.buttonFontSize,
                  lineHeight: chrome.buttonLineHeight,
                },
              ]}
            >
              {label}
            </Text>
          ) : null}
          {arabicLabel ? (
            <Text
              selectable={false}
              style={[
                styles.openButtonText,
                styles.openButtonTextArabic,
                {
                  color: item.isHyperlink ? COLORS.link : COLORS.subdoc,
                  fontSize: chrome.buttonFontSize,
                  lineHeight: chrome.buttonLineHeight,
                },
              ]}
            >
              {arabicLabel}
            </Text>
          ) : null}
          {item.isHyperlink ? (
            <View style={styles.hyperlinkArrow}>
              <Text selectable={false} style={styles.hyperlinkArrowGlyph}>→</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    );
  }

  if (item.type === "title") {
    const hasButton = Boolean(item.collapsible && onToggleCollapse);
    const titleInset = hasButton ? COLLAPSE_BUTTON_SIZE : 0;
    const titleTableWidth = Math.max(tableWidth - titleInset * 2, 1);
    const titleLanguages = buildTitleLanguages(
      item.title,
      visibleLanguages,
      titleHelpers,
    );
    const titleColumnWidth = titleTableWidth / Math.max(titleLanguages.length, 1);
    // A hymn whose own title row declares "Silent Prayer" reads visually
    // distinct — dimmer/italic — since none of its content is spoken aloud.
    const isSilentPrayerHymn = item.titlePrayerType === "Silent Prayer";

    return (
      <View
        style={styles.titleRow}
        onLayout={(event) => {
          onMeasured?.(event.nativeEvent.layout.height, measurementSignature);
        }}
      >
        <View style={[styles.titleTable, { marginHorizontal: titleInset, width: titleTableWidth }]}>
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
                    selectable={false}
                    style={[
                      styles.sectionTitle,
                      language.key === "arabic" && styles.sectionTitleArabic,
                      {
                        color: isSilentPrayerHymn ? COLORS.silentTitle : theme.colors.gold,
                        fontStyle: isSilentPrayerHymn ? "italic" : "normal",
                        fontSize: chrome.titleFontSize,
                        lineHeight: chrome.titleLineHeight,
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
        usePeopleLineColor={Boolean(item.usePeopleLineColor)}
        selectableText={false}
        bishopPresent={item.bishopPresent}
        onLanguageLayout={(language, metric) =>
          onLanguageMeasured?.(language, metric, measurementSignature)
        }
      />
    </View>
  );
});

/**
 * Wraps SlideItem for the off-screen measurement layer so each measured item
 * gets ONE stable pair of callbacks for as long as it stays mounted.
 *
 * The measurement layer previously passed inline arrows
 * (`onMeasured={(h, sig) => queueMeasuredHeight(item.id, h, sig)}`), which
 * built new function identities on every render and so defeated SlideItem's
 * memo entirely: every flush of measured heights re-rendered every item in
 * the layer, not just the ones whose measurements had actually landed.
 * Binding item.id here instead keeps SlideItem's own props referentially
 * stable, so a flush only re-renders what genuinely changed.
 */
const MeasurementItem = memo(function MeasurementItem({
  item,
  onQueueHeight,
  onQueueLanguage,
  ...slideItemProps
}) {
  const itemId = item.id;

  const handleMeasured = useCallback(
    (height, signature) => onQueueHeight(itemId, height, signature),
    [itemId, onQueueHeight],
  );

  const handleLanguageMeasured = useCallback(
    (language, metric, signature) => onQueueLanguage(itemId, language, metric, signature),
    [itemId, onQueueLanguage],
  );

  return (
    <SlideItem
      {...slideItemProps}
      item={item}
      onMeasured={handleMeasured}
      onLanguageMeasured={handleLanguageMeasured}
    />
  );
});

// Speaker-label suppression is a whole-document decision, not a per-hymn
// one — computeGlobalSuppressSpeakerLabelFlags is the exact same function
// documentHtml.ts uses, so the two renderers can never diverge on "does this
// verse show its Priest:/Deacon:/etc. indicator". `sections` here is already
// the pre-filtered, displayed-only view (see DocumentSurface's
// buildSlideshowSections), so it can be passed straight through.
function flattenSections(sections, bishopPresent, suppressAllSpeakerLabels) {
  const suppressMap = computeGlobalSuppressSpeakerLabelFlags(sections, bishopPresent, suppressAllSpeakerLabels);

  return sections.flatMap((section, sectionIndex) => {
    if (section.isSubdocumentButton || section.isAntiphonaryButton || section.isHyperlinkButton) {
      return [
        {
          id: `${section.id}-button`,
          sectionId: section.id,
          type: "button",
          title: section.title,
          // A Hyperlink leaves the document entirely rather than opening a
          // modal over it, so it gets its own action and green treatment.
          isHyperlink: Boolean(section.isHyperlinkButton),
          buttonAction: section.isHyperlinkButton
            ? "openHyperlink"
            : section.isAntiphonaryButton
              ? "openAntiphonary"
              : "openSubdocument",
        },
      ];
    }

    if (section.startsGospelRiteToggle) {
      // Never forces its own page break (unlike a real button) — it's meant
      // to sit right alongside whatever title it was spliced after (see
      // pushWholeTableInlineSections in hymnLibrary.js), not interrupt the
      // flow the way opening a subdocument does.
      return [
        {
          id: `${section.id}-gospel-rite-toggle`,
          sectionId: section.id,
          type: "gospelRiteToggle",
        },
      ];
    }

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
        titlePrayerType: section.titlePrayerType || null,
        collapsible: Boolean(section.collapsible),
        currentlyCollapsed: Boolean(section.currentlyCollapsed),
      },
      ...verses.map((verse, verseIndex) => ({
        id: `${section.id}-${verseIndex}`,
        sectionId: section.id,
        type: "verse",
        verse,
        colorIndex: getVerseColorIndex(section, verseIndex, bishopPresent),
        suppressSpeakerLabel: Boolean(verse.suppressSpeakerLabel) || Boolean(suppressMap.get(verse)),
        hasSpeakerLabel: Boolean(getSpeakerRole(verse.personRole || verse.type, bishopPresent)),
        // Computed here rather than in VerseBlock because the decision needs
        // the section (its title) as well as the verse — see
        // shouldUsePeopleLineColor, the one definition the WebView renderer
        // uses too.
        usePeopleLineColor: shouldUsePeopleLineColor(section, verse, bishopPresent, suppressAllSpeakerLabels),
        bishopPresent,
        // Recited Prayer is a per-verse type (a verse's own effective type
        // after inheritance — see resolveEffectiveVerseType), not a
        // whole-section flag. Silent Prayer/silent Comment verses are
        // grouped in here too — despite the prop name, this really means
        // "Coptic is gated by the Coptic Recited Prayers toggle", which
        // applies to both Recited and Silent Prayer content alike.
        isRecitedPrayer:
          verse.type === "recitedPrayer" || verse.type === "silentPrayer" || verse.type === "silentComment",
        isReading: Boolean(section.isReading),
        forceWhiteVerses: Boolean(section.forceWhiteVerses),
        verseIndex: sectionIndex + verseIndex,
      })),
    ];
  });
}

function getVerseColorIndex(section, index, bishopPresent) {
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
    (section.verses || []).some((verse) => Boolean(getSpeakerRole(verse.personRole || verse.type, bishopPresent)));

  if (!shouldUsePairing) {
    return effectiveIndex;
  }

  if (/conclusion of the (adam|watos) psali/i.test(title)) {
    return effectiveIndex;
  }

  if (getSpeakerRole(section.verses?.[0]?.personRole || section.verses?.[0]?.type, bishopPresent) === "priest") {
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
      verse.type !== "silentComment" &&
      !verse.forceWhiteText &&
      // A "White"/"Blue" prayer_type forces that exact color on this one
      // verse — it never consumes a parity slot, so verses around it
      // alternate exactly as if it weren't there at all (see rowTextColor
      // in VerseBlock.js).
      verse.prayerType !== "White" &&
      verse.prayerType !== "Blue"
    )
    .length - 1;
}

function isPsaliLikeTwoVerseSectionTitle(title) {
  return /^(agios o theos|the lord said to moses|let us all praise along with david|koiahk praise for the holy trinity|god eternal|(alternate:\s*)?bless the god of israel|the (first|second|third|fourth|fifth|sixth|seventh) explanation)$/i
    .test(String(title || "").trim());
}

// Used only by the psali/pairing color-alternation heuristic in
// getVerseColorIndex above — actual speaker-label suppression is
// computeGlobalSuppressSpeakerLabelFlags from utils/verseRubric.js (shared
// with the WebView reader), not this. Resolves "bishopOrPriest" via the same
// shared resolveRubricKey so this heuristic doesn't diverge either.
function getSpeakerRole(type, bishopPresent) {
  const resolved = resolveRubricKey(type, bishopPresent);
  if (resolved === "priest" || resolved === "bishop" || resolved === "people" || resolved === "deacon" || resolved === "reader") {
    return resolved === "bishop" ? "priest" : resolved;
  }
  return "";
}

function findSlideSectionId(slide = []) {
  return slide.find((item) => item.sectionId)?.sectionId;
}

/** Every section id present, in document order and without repeats — the order a walk-back restore searches (see sectionRestoreCandidates). */
function getSectionIdOrder(items = []) {
  const order = [];
  const seen = new Set();

  items.forEach((item) => {
    if (!item.sectionId || seen.has(item.sectionId)) return;
    seen.add(item.sectionId);
    order.push(item.sectionId);
  });

  return order;
}

function getDisplayedItemTitle(item, visibleLanguages, titleHelpers) {
  if (item.type !== "title" && item.type !== "button") return "";
  return buildTitleLanguages(item.title, visibleLanguages, titleHelpers)
    .map((language) => `${language.key}:${language.text}`)
    .join("|");
}

function buildTitleLanguages(title, visibleLanguages, titleHelpers) {
  const titleParts = titleHelpers.getTitleParts(title);
  const languages = [];
  const showEnglish = titleHelpers.shouldShowEnglishTitle(title);
  const showArabic = titleHelpers.shouldShowArabicTitle(title);

  if (showEnglish) {
    languages.push({
      align: "center",
      key: "english",
      text: formatEnglishDisplayText(titleHelpers.getTitleText(title)),
    });
  }

  if (showArabic) {
    languages.push({
      align: "center",
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

// A minimized/collapsed section (verses emptied but the title kept, so the
// user can still see and re-expand it) or a section whose only verses were
// comments/silent-prayer lines hidden by the current display settings can
// end up contributing a slide with nothing actually visible on it — no
// title text, no verse text, not even a Subdocument/Antiphonary button.
// Rather than show that as a blank page in the middle of swiping, such
// slides are dropped entirely.
function slideHasVisibleContent(slide = []) {
  return slide.some((item) => {
    if (item.type === "button" || item.type === "gospelRiteToggle") {
      return true;
    }

    if (item.type === "title") {
      const title = item.title || {};
      return Boolean(String(title.english || "").trim() || String(title.arabic || "").trim());
    }

    if (item.type === "verse") {
      const verse = item.verse || {};
      return Boolean(
        String(verse.english || "").trim() ||
          String(verse.coptic || "").trim() ||
          String(verse.arabic || "").trim() ||
          (item.hasSpeakerLabel && !item.suppressSpeakerLabel) ||
          verse.slideshowSeasonalPrefixVisible,
      );
    }

    return false;
  });
}

function dropEmptySlides(slides) {
  const withContent = slides.filter(slideHasVisibleContent);
  // Never drop down to zero slides — an entirely contentless document still
  // needs somewhere for the slideshow to land.
  return withContent.length ? withContent : slides;
}

function getVisibleLanguageCount(visibleLanguages = {}) {
  return ["english", "coptic", "arabic"].filter((language) => visibleLanguages[language]).length || 1;
}

function isEditableKeyboardTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tagName = String(target.tagName || "").toLowerCase();
  return target.isContentEditable || ["button", "input", "select", "textarea", "a"].includes(tagName);
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
  navigationSurface: {
    backgroundColor: "transparent",
    flex: 1,
    width: "100%",
    ...Platform.select({
      web: {
        cursor: "default",
        outlineStyle: "none",
        outlineWidth: 0,
        WebkitTapHighlightColor: "transparent",
      },
      default: {},
    }),
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    position: "relative",
  },
  collapseButton: {
    alignItems: "center",
    height: COLLAPSE_BUTTON_SIZE,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    top: "50%",
    transform: [{ translateY: -COLLAPSE_BUTTON_SIZE / 2 }],
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
  openButtonRow: {
    alignItems: "center",
    flexShrink: 0,
    paddingVertical: SPACING.md,
  },
  openButton: {
    alignItems: "center",
    backgroundColor: COLORS.subdocSoft,
    borderColor: COLORS.subdocLine,
    borderRadius: 8,
    borderWidth: 1,
    gap: SPACING.xs,
    justifyContent: "center",
    maxWidth: 520,
    minHeight: 96,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    width: "84%",
  },
  // Shorter and green rather than tall and gold: a Hyperlink is a transition
  // out of this service, not a document to open on top of it.
  hyperlinkButton: {
    backgroundColor: COLORS.linkSoft,
    borderColor: COLORS.linkLine,
    minHeight: 72,
  },
  hyperlinkArrow: {
    alignItems: "center",
    borderColor: COLORS.link,
    borderRadius: 999,
    borderWidth: 1.5,
    height: 28,
    justifyContent: "center",
    marginTop: SPACING.xs,
    width: 28,
  },
  hyperlinkArrowGlyph: {
    color: COLORS.link,
    fontSize: 16,
    lineHeight: 18,
  },
  openButtonText: {
    fontFamily: "Georgia",
    fontWeight: "800",
    textAlign: "center",
  },
  openButtonTextArabic: {
    fontFamily: "Arial",
    textAlign: "center",
    writingDirection: "rtl",
  },
  // Mirrors documentHtml.ts's .gospel-rite-toggle* CSS classes (the same
  // toggle in scroll mode) — pill button, gold border/dot when off, filled
  // gold with a black dot when on.
  gospelRiteToggleRow: {
    alignItems: "center",
    flexShrink: 0,
    paddingVertical: SPACING.sm,
  },
  gospelRiteToggle: {
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderColor: COLORS.gold,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  gospelRiteToggleOn: {
    backgroundColor: COLORS.gold,
  },
  gospelRiteToggleDot: {
    backgroundColor: COLORS.white,
    borderRadius: 999,
    height: 10,
    opacity: 0.4,
    width: 10,
  },
  gospelRiteToggleDotOn: {
    backgroundColor: COLORS.black,
    opacity: 1,
  },
  gospelRiteToggleText: {
    fontFamily: "Georgia",
    fontWeight: "700",
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
  slideDeck: {
    flex: 1,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  slideLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  preloadedSlide: {
    opacity: 0,
  },
  screenReaderStatus: {
    height: 1,
    left: -10000,
    overflow: "hidden",
    position: "absolute",
    top: 0,
    width: 1,
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
