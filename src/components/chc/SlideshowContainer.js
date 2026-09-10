import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { COLORS, SPACING } from "../../constants/theme";
import { formatEnglishDisplayText } from "../../utils/displayText";
import { computeGlobalSuppressSpeakerLabelFlags, resolveRubricKey } from "../../utils/verseRubric";
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
  bishopPresent,
  onAction,
  copticGospelRite,
  suppressAllSpeakerLabels,
}) {
  const [viewportHeight, setViewportHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [measuredHeights, setMeasuredHeights] = useState({});
  const [measuredLanguageHeights, setMeasuredLanguageHeights] = useState({});
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  // Collapsible title rows and Subdocument/Antiphonary open-buttons can land
  // anywhere within a slide (collapsible titles deliberately don't force a
  // fresh slide break — see flattenSections), so neither can rely on "the top
  // of the slide" the way the old topReserved gap assumed. Instead each one
  // reports its own y offset here, and a dedicated overlay (rendered after,
  // i.e. on top of, NavigationOverlay) places a real tappable control exactly
  // there — RN has no cross-subtree z-index, so "render on top" is the only
  // way for a control anywhere in the slide to ever receive a touch over the
  // full-screen swipe layer.
  const [collapsibleTitleLayouts, setCollapsibleTitleLayouts] = useState({});
  const [buttonLayouts, setButtonLayouts] = useState({});
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
  const itemsSignature = useMemo(
    () => items.map(getItemSignature).join("|"),
    [items],
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
  measurementSignatureRef.current = measuredKey;

  useLayoutEffect(() => {
    measurementSignatureRef.current = measuredKey;
    pendingHeightsRef.current = {};
    pendingLanguageHeightsRef.current = {};
    if (pendingMeasurementFrameRef.current) {
      cancelMeasurementFrame(pendingMeasurementFrameRef.current);
      pendingMeasurementFrameRef.current = null;
    }
    pendingRestoreSectionIdRef.current = preservedSectionIdRef.current;

    const newSignatures = new Map(items.map((item) => [item.id, getItemSignature(item)]));
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
    const slidePadding = getSlidePadding();
    const effectiveViewportHeight =
      measuredViewportHeight - slidePadding.top - slidePadding.bottom;

    if (!effectiveViewportHeight) {
      return dropEmptySlides([items.slice(0, 1)]);
    }

    const effectiveHeights = {};
    items.forEach((item) => {
      effectiveHeights[item.id] =
        measuredHeights[item.id] ??
        estimateItemHeight(item, fontSize, visibleLanguages, slideTableWidth);
    });

    const budget = Math.max(effectiveViewportHeight - 8, 120);
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
  const slidePadding = useMemo(() => getSlidePadding(), []);
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
  // measured, and items are scanned in document order, so slides settle
  // front-to-back -- where the reader already is.
  const measurementBatch = useMemo(() => {
    if (!(viewportHeight || viewportHeightOverride)) return [];
    const batch = [];
    for (let i = 0; i < items.length && batch.length < MEASUREMENT_BATCH_SIZE; i += 1) {
      if (typeof measuredHeights[items[i].id] !== "number") batch.push(items[i]);
    }
    return batch;
  }, [items, measuredHeights, viewportHeight, viewportHeightOverride]);
  // An empty batch means nothing is left unmeasured, so this stays equivalent
  // to the old items.every(...) check without rescanning the whole document
  // on every render.
  const isMeasurementComplete = useMemo(
    () => Boolean(viewportHeight || viewportHeightOverride) && measurementBatch.length === 0,
    [measurementBatch, viewportHeight, viewportHeightOverride],
  );

  useEffect(() => {
    setCurrentSlideIndex((current) =>
      Math.min(current, Math.max(slides.length - 1, 0)),
    );
  }, [slides.length]);

  useEffect(() => {
    // A fresh, explicit content-selector pick always wins over (and cancels)
    // whatever the reset effect above was hoping to auto-restore — otherwise
    // the reporting effect below would keep comparing the user's brand-new
    // position against that now-irrelevant stale target and refuse to report
    // it. Runs as its own effect, keyed only on selectedSectionId, so it
    // fires (and clears the stale target) in the same commit as — but before
    // — the jump effect right below, which shares this same trigger.
    if (selectedSectionId) {
      pendingRestoreSectionIdRef.current = null;
    }
  }, [selectedSectionId]);

  useEffect(() => {
    // An explicit content-selector jump (selectedSectionId) takes priority;
    // otherwise, if a settings/rotation/minimization change just forced a
    // repagination, jump back to the START of whatever hymn the user had
    // been reading (pendingRestoreSectionIdRef) — always its title's own
    // slide, never partway through it, matching scroll mode's own
    // settings-change behavior.
    const targetSectionId = selectedSectionId || pendingRestoreSectionIdRef.current;

    if (
      !targetSectionId ||
      lastAppliedSelectedSectionId.current === targetSectionId
    ) {
      return;
    }

    const nextSlideIndex = slides.findIndex((slide) =>
      slide.some((item) => item.sectionId === targetSectionId),
    );

    if (nextSlideIndex >= 0) {
      setCurrentSlideIndex(nextSlideIndex);
      lastAppliedSelectedSectionId.current = targetSectionId;
    }

    // Only the auto-restore path (no explicit selectedSectionId) clears here;
    // an explicit pick already cleared it above, and re-clearing here would
    // happen too early — before setCurrentSlideIndex's update has actually
    // landed — letting the reporting effect below see a still-stale slide
    // with nothing left to compare it against.
    if (!selectedSectionId) {
      pendingRestoreSectionIdRef.current = null;
    }
  }, [selectedSectionId, slides]);

  useEffect(() => {
    // A transient viewport collapse -- the container's own height briefly
    // reporting 0, e.g. for a single frame during a screen-transition
    // animation while navigating away -- makes the `slides` memo above fall
    // back to a single-item "slide 0" that has nothing to do with where the
    // user actually is. Reporting (and persisting) that would silently
    // overwrite the real remembered position right as the user leaves.
    if (!(viewportHeight || viewportHeightOverride)) return;

    const currentSlide = slides[currentSlideIndex];
    const currentSectionId = findSlideSectionId(currentSlide);
    if (!currentSectionId) return;

    // A measuredKey reset (settings change, minimization, rotation/resize,
    // or even just the surrounding layout shifting while navigating to
    // another screen) always snaps currentSlideIndex to 0 for a moment
    // before the jump effect above can correct it back to
    // pendingRestoreSectionIdRef.current. That transient "slide 0" is not
    // where the user actually is — reporting it here (and to the host app,
    // which persists it as "last known position") would overwrite the real
    // position with a reset artifact before the correction even gets a
    // chance to land.
    if (pendingRestoreSectionIdRef.current && pendingRestoreSectionIdRef.current !== currentSectionId) {
      return;
    }

    // The pending restore (if any) has now been confirmed reached — clear it
    // so it doesn't keep gating every future report once selectedSectionId
    // stops changing (it never resets back to undefined on its own).
    pendingRestoreSectionIdRef.current = null;
    preservedSectionIdRef.current = currentSectionId;
    onCurrentSectionChange?.(currentSectionId);
  }, [currentSlideIndex, onCurrentSectionChange, slides, viewportHeight, viewportHeightOverride]);

  const goToPreviousSlide = useCallback(() => {
    setCurrentSlideIndex((current) => Math.max(current - 1, 0));
  }, []);

  const goToNextSlide = useCallback(() => {
    setCurrentSlideIndex((current) => Math.min(current + 1, Math.max(slides.length - 1, 0)));
  }, [slides.length]);

  // Stable across renders (unlike an inline arrow function) so SlideView --
  // memoized below -- doesn't see a "changed" prop and re-render its entire
  // subtree just because a title/button landed at a new y offset on the
  // slide that's already on screen; that used to mean every slide
  // navigation actually rendered the new slide's content TWICE (once to
  // mount it, once more the instant its own layout callbacks fired back up
  // here), which is most of why paging felt slow.
  const handleTitleLayout = useCallback((sectionId, y, height) => {
    setCollapsibleTitleLayouts((current) =>
      current[sectionId]?.y === y && current[sectionId]?.height === height
        ? current
        : { ...current, [sectionId]: { y, height } }
    );
  }, []);

  const handleButtonLayout = useCallback((sectionId, y, height) => {
    setButtonLayouts((current) =>
      current[sectionId]?.y === y && current[sectionId]?.height === height
        ? current
        : { ...current, [sectionId]: { y, height } }
    );
  }, []);

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
        onAction={onAction}
        onTitleLayout={handleTitleLayout}
        onButtonLayout={handleButtonLayout}
        copticGospelRite={copticGospelRite}
      />

      <NavigationOverlay
        onPrevious={goToPreviousSlide}
        onNext={goToNextSlide}
        onOpenSelector={onOpenSelector}
      />

      {onAction
        ? (slides[currentSlideIndex] || [])
            .filter((item) => (item.type === "button" || item.type === "gospelRiteToggle") && buttonLayouts[item.sectionId])
            .map((item) => {
              const layout = buttonLayouts[item.sectionId];
              const action =
                item.type === "gospelRiteToggle"
                  ? { type: "toggleCopticGospelRite", sectionId: item.sectionId }
                  : { type: item.buttonAction, sectionId: item.sectionId };
              return (
                <Pressable
                  key={item.sectionId}
                  style={[styles.openButtonOverlay, { top: layout.y, height: layout.height }]}
                  onPress={() => onAction(action)}
                />
              );
            })
        : null}

      {onToggleCollapse
        ? (slides[currentSlideIndex] || [])
            .filter((item) => item.type === "title" && item.collapsible && collapsibleTitleLayouts[item.sectionId])
            .map((item) => {
              const layout = collapsibleTitleLayouts[item.sectionId];
              return (
                <View
                  key={item.sectionId}
                  pointerEvents="box-none"
                  style={[styles.collapseButtonOverlay, { top: layout.y, height: layout.height }]}
                >
                  <CollapseButton
                    collapsed={Boolean(item.currentlyCollapsed)}
                    onPress={() => onToggleCollapse(item.sectionId)}
                  />
                </View>
              );
            })
        : null}
    </View>
  );
}

// Memoized so a parent re-render that doesn't actually change any of these
// props (e.g. the title/button layout-overlay state settling right after
// this same slide's own content just mounted) skips re-rendering the whole
// slide a second time -- see handleTitleLayout/handleButtonLayout above.
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
  onTitleLayout,
  onButtonLayout,
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
          onTitleLayout={onTitleLayout}
          onButtonLayout={onButtonLayout}
          onAction={onAction}
          copticGospelRite={copticGospelRite}
        />
      ))}
    </View>
  );
});

export function NavigationOverlay({
  onPrevious,
  onNext,
  onOpenSelector,
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
      style={styles.navigationLayer}
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

// Memoized so, on the visible (non-measurement-layer) path, a re-render
// triggered by unrelated sibling state (e.g. an overlay's layout tracking
// settling) doesn't re-render every verse on the current slide -- `item`
// itself keeps the same reference across those renders since `slides`
// doesn't change from state that isn't its own useMemo dependency.
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
  onTitleLayout,
  onButtonLayout,
  onAction,
  copticGospelRite,
}) {
  if (item.type === "gospelRiteToggle") {
    return (
      <View
        style={styles.gospelRiteToggleRow}
        onLayout={(event) => {
          onMeasured?.(event.nativeEvent.layout.height, measurementSignature);
          onButtonLayout?.(item.sectionId, event.nativeEvent.layout.y, event.nativeEvent.layout.height);
        }}
      >
        {/* Same full-screen-swipe-layer problem as the Subdocument/Antiphonary
            open button below -- this Pressable is not actually reachable by
            touch on its own; the real tap target is the overlay rendered
            after NavigationOverlay, using the y/height reported above. */}
        <Pressable
          style={[styles.gospelRiteToggle, copticGospelRite && styles.gospelRiteToggleOn]}
          onPress={() => onAction?.({ type: "toggleCopticGospelRite", sectionId: item.sectionId })}
        >
          <View style={[styles.gospelRiteToggleDot, copticGospelRite && styles.gospelRiteToggleDotOn]} />
          <Text
            selectable={false}
            style={[
              styles.gospelRiteToggleText,
              { fontSize: Math.round(fontSize * 0.65), color: copticGospelRite ? COLORS.black : theme.colors.text },
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
        onLayout={(event) => {
          onMeasured?.(event.nativeEvent.layout.height, measurementSignature);
          onButtonLayout?.(item.sectionId, event.nativeEvent.layout.y, event.nativeEvent.layout.height);
        }}
      >
        <Pressable
          style={[styles.openButton, item.isHyperlink && styles.hyperlinkButton]}
          onPress={() => onAction?.({ type: item.buttonAction, sectionId: item.sectionId })}
        >
          {label ? (
            <Text
              selectable={false}
              style={[
                styles.openButtonText,
                { color: item.isHyperlink ? COLORS.link : theme.colors.text, fontSize: Math.round(fontSize * 0.65) },
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
                { color: item.isHyperlink ? COLORS.link : theme.colors.text, fontSize: Math.round(fontSize * 0.65) },
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
    const titleTableWidth = tableWidth;
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
          if (hasButton) {
            onTitleLayout?.(item.sectionId, event.nativeEvent.layout.y, event.nativeEvent.layout.height);
          }
        }}
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
                    selectable={false}
                    style={[
                      styles.sectionTitle,
                      language.key === "arabic" && styles.sectionTitleArabic,
                      {
                        color: isSilentPrayerHymn ? COLORS.silentTitle : theme.colors.gold,
                        fontStyle: isSilentPrayerHymn ? "italic" : "normal",
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
          // modal over it, so it gets its own action and its own (green)
          // treatment in SlideItem. The tap itself still rides the same
          // button overlay as the other two -- see NavigationOverlay.
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

function getItemSignature(item) {
  if (item.type === "title") {
    const title = typeof item.title === "string"
      ? item.title
      : [item.title?.english, item.title?.arabic].filter(Boolean).join("/");

    return `${item.id}:title:${title.length}:${item.isCollapsed ? "collapsed" : "open"}`;
  }

  if (item.type === "button") {
    const title = [item.title?.english, item.title?.arabic].filter(Boolean).join("/");
    return `${item.id}:button:${title.length}`;
  }

  if (item.type === "gospelRiteToggle") {
    // Its own height never depends on whether the toggle is currently on or
    // off (only its fill color does, which SlideItem re-renders from the
    // live copticGospelRite prop directly, not from a cached measurement) —
    // a fixed signature is enough to skip remeasuring it.
    return `${item.id}:gospelRiteToggle`;
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
          String(verse.arabic || "").trim(),
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

/** A section with no title text (e.g. a flat reading-citation splice, or a mid-hymn continuation chunk) has nothing to visually separate — forcing a fresh slide for it wastes the rest of the previous slide for no benefit, unlike a real titled hymn starting. */
function hasVisibleTitleText(title) {
  return Boolean(title?.english || title?.arabic);
}

/**
 * Keeps each rendered row as its own pagination unit, like the Bible pager.
 * Visible titles and standalone buttons still begin a fresh page, while
 * verses are passed to the same overflow and oversized-row logic as every
 * other row.
 */
function buildPaginationUnits(items) {
  return items.map((item) => ({
    items: [item],
    breakBefore:
      (item.type === "title" && !item.isCollapsed && hasVisibleTitleText(item.title)) ||
      item.type === "button",
  }));
}

function paginateItems(
  items,
  heights,
  languageHeights,
  availableHeight,
  fontSize,
  visibleLanguages,
  tableWidth,
) {
  const units = buildPaginationUnits(items);
  const slides = [];
  let currentSlide = [];
  let currentHeight = 0;

  const flushSlide = () => {
    if (currentSlide.length) slides.push(currentSlide);
    currentSlide = [];
    currentHeight = 0;
  };

  // A normal-document verse is one manually aligned data row, but each
  // language may consume a different number of its own lines. The segment
  // builder below advances those language cursors independently.
  const placeVerse = (verseItem) => {
    const verseHeight = Math.ceil((heights[verseItem.id] || 0) + 2);

    if (currentHeight + verseHeight <= availableHeight) {
      currentSlide.push(verseItem);
      currentHeight += verseHeight;
      return;
    }

    if (currentSlide.length && verseHeight <= availableHeight) {
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
      availableHeight,
      fontSize,
      tableWidth,
    });
    currentSlide = result.currentSlide;
    currentHeight = result.currentHeight;
  };

  for (const unit of units) {
    if (currentSlide.length && unit.breakBefore) {
      flushSlide();
    }

    const item = unit.items[0];
    if (item.type === "verse") {
      placeVerse(item);
      continue;
    }

    const itemHeight = Math.ceil((heights[item.id] || 0) + 2);
    if (currentSlide.length && currentHeight + itemHeight > availableHeight) {
      flushSlide();
    }
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
  tableWidth,
}) {
  const state = createVerseLineState(languageMetric, fontSize, item);
  let segmentIndex = 0;

  while (hasRemainingVerseLines(state)) {
    const remainingHeight = availableHeight - currentHeight;
    const capacityItem =
      segmentIndex > 0 ? { ...item, suppressSpeakerLabel: true } : item;
    let lineCapacities = getIndependentLineCapacities(state, remainingHeight, fontSize, capacityItem);

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

  return {
    languages,
  };
}

function hasRemainingVerseLines(state) {
  return state.languages.some((entry) => entry.offset < entry.lines.length);
}

function getIndependentLineCapacities(state, height, fontSize, item) {
  const usableHeight = height - getVerseVerticalPadding(item);

  if (usableHeight <= 0) {
    return {};
  }

  return state.languages
    .filter((entry) => entry.offset < entry.lines.length)
    .reduce((acc, entry) => {
      // Each column gets its own line budget. In particular, Arabic is never
      // assigned English's line count or token count; it advances only by the
      // Arabic lines that fit in this segment's remaining vertical space.
      const languageHeight = usableHeight - getLanguageExtraTopPadding(entry.language, item, fontSize);
      acc[entry.language] = Math.max(0, Math.floor(languageHeight / entry.lineHeight));

      return acc;
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
  const originalLanguageKeys = state.languages.map((entry) => entry.language);
  const verse = {
    ...item.verse,
    arabic: "",
    coptic: "",
    english: "",
  };
  const lineCounts = {};
  // The exact pre-measured lines handed to each language's render, keyed the
  // same way onLines/onTextLayout report them -- see VerseBlock.js's
  // forceLines plumbing (JustifiedVerseBody -> JustifiedText). Rendering
  // these directly, instead of joining them into one text blob and asking a
  // fresh JustifiedText/canvas pass to re-wrap it, is what keeps a split
  // segment's actual rendered line breaks identical to what pagination
  // measured and budgeted room for -- a shorter re-wrapped string can
  // legitimately break at different word boundaries than the original did,
  // which is what produces visibly wrong splits.
  const forcedLines = {};
  const segmentEntries = [];
  // A language can finish earlier than its siblings in a split verse. Keep
  // the original language set for every segment so the table columns do not
  // collapse or jump while the verse continues across slides.
  state.languages.forEach((entry) => {
    const remainingCount = entry.lines.length - entry.offset;
    const takeCount = Math.min(lineCapacities[entry.language] || 0, remainingCount);
    const lines = entry.lines.slice(entry.offset, entry.offset + takeCount);

    if (lines.length) {
      segmentEntries.push({ entry, lines });
    }

    entry.offset += takeCount;
  });

  segmentEntries.forEach(({ entry, lines }) => {
    verse[entry.language] = joinRenderedLines(lines);
    lineCounts[entry.language] = lines.length;
    forcedLines[entry.language] = lines;
  });

  verse.slideshowLanguageKeys = originalLanguageKeys;
  verse.slideshowForcedLines = forcedLines;

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
      getLanguageExtraTopPadding(language, segment.item, fontSize),
    );

  if (!languageHeights.length) {
    return getVerseVerticalPadding(segment.item);
  }

  return Math.max(...languageHeights) + getVerseVerticalPadding(segment.item);
}

function estimateItemHeight(item, fontSize, visibleLanguages, tableWidth) {
  if (item.type === "title") {
    return Math.max(Math.round(fontSize * 0.8), 20) + SPACING.sm * 2;
  }

  if (item.type === "button") {
    return 96 + SPACING.md * 2;
  }

  if (item.type === "gospelRiteToggle") {
    return Math.round(fontSize * 0.8) + SPACING.sm * 2 + SPACING.lg;
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
        getLanguageExtraTopPadding(language, item, fontSize);
    })
    .filter(Boolean);

  if (!languageHeights.length) {
    return getVerseVerticalPadding(item);
  }

  return Math.max(...languageHeights) + getVerseVerticalPadding(item);
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
  const rowColumnWidth = (tableWidth || 0) / Math.max(languages.length, 1);

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
  if (item.verse?.type === "refrainLabel") {
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
    !getSpeakerRole(item.verse?.personRole || item.verse?.type)
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

function getSlidePadding() {
  // SafeAreaView (in both ServiceDocument and DocumentModal) already handles
  // all edge insets before SlideshowContainer renders, so adding safeAreaInsets
  // here would double-count the notch/home-indicator on iOS. SPACING.xl gives
  // visual breathing room without consuming the already-excluded safe area.
  return { bottom: SPACING.xl, top: SPACING.xl };
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
  // Rendered as a sibling AFTER NavigationOverlay (higher in the stack), at
  // the exact y/height the title row reported via onTitleLayout, left-aligned
  // to match where the (otherwise untappable) inline button sits.
  collapseButtonOverlay: {
    alignItems: "center",
    justifyContent: "center",
    left: 0,
    position: "absolute",
    width: COLLAPSE_BUTTON_SIZE,
    zIndex: 30,
    elevation: 20,
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
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "#C9A227",
    borderRadius: 8,
    borderWidth: 1,
    gap: SPACING.xs,
    justifyContent: "center",
    maxWidth: 320,
    minHeight: 96,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    width: "72%",
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
  // Rendered as a sibling AFTER NavigationOverlay (same reasoning as
  // collapseButtonOverlay above) so the Subdocument/Antiphonary open-button
  // is actually tappable instead of losing every touch to the full-screen
  // swipe layer.
  openButtonOverlay: {
    left: 0,
    position: "absolute",
    width: "100%",
    zIndex: 30,
    elevation: 20,
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
