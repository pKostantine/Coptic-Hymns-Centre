import { useEffect, useMemo, useRef, useState } from 'react';
import { Href, Stack, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { PanResponder, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '../ui/AppHeader';
import ContentSelectorDrawer from '../ui/ContentSelectorDrawer';
import LoadingScreen from '../ui/LoadingScreen';
import DocumentSurface from '../DocumentSurface';
import { DocumentAction, DocumentSection, DocumentWebViewHandle } from '../DocumentWebView';
import { AntiphonaryModal, SubdocumentModal } from './DocumentModal';
import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { useCalendar } from '../../../context/CalendarContext';
import { useBrowserFullscreen } from '../../../utils/useBrowserFullscreen';
import { hydrateSupabaseServiceHymn } from '../../../utils/hymnLibrary';
import { getEpistleConditionFlags } from '../../../utils/readingsService';
import { getLastDocumentPosition, setLastDocumentPosition } from '../../../utils/lastDocumentPosition';
import { goBack } from '../../../utils/navigation';

interface ServiceDocumentProps {
  schema: string;
  table: string;
  title: string;
  arabic: string;
  /** Extra condition flags forced true for this entry point (e.g. Vespers/Matins on the shared raising_of_incense document). */
  extraContext?: Record<string, boolean>;
  /** Where "back" should land when there's no navigation history to pop (direct deep link, page reload). */
  backHref: Href;
}

interface SubdocumentModalTarget {
  title: { english: string; arabic: string };
  sections: DocumentSection[];
  subdocumentKey?: string;
}

const isMobileDocument = Platform.OS !== 'web';

/**
 * Generic document reader — ported from HymnDisplayScreen.js. On web it keeps
 * the Header (fullscreen toggle + content-list icon); on native there is no
 * header at all, matching the old app exactly — navigation is gesture-only
 * (right-edge swipe-left opens the Content selector, left-edge swipe-right
 * goes back).
 */
export default function ServiceDocument({ schema, table, title, arabic, extraContext, backHref }: ServiceDocumentProps) {
  const router = useRouter();
  const { preferences, isBookmarked, toggleBookmark, toggleBishopPresent } = useReadingPreferences();
  const { effectiveDate, vespersEffectiveDate } = useCalendar();
  // Saturday-evening Vespers Praises and Vespers still chant in Saturday's
  // (Vatos) weekday tune even after the liturgical day rolls to Sunday for
  // every other service — see CalendarContext's vespersEffectiveDate.
  const isVespersService =
    (schema === 'psalmody' && table === 'vespers_praises') ||
    (schema === 'liturgy' && table === 'raising_of_incense' && extraContext?.Vespers === true);
  const { isFullscreen, toggle: toggleFullscreen, shouldShow: shouldShowFullscreen } = useBrowserFullscreen();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const bookmarkId = `${schema}:${table}`;
  // Navigating to Settings and back unmounts this screen (React Navigation
  // doesn't keep off-screen web routes mounted), which would otherwise wipe
  // currentSectionId/selectedSlideSectionId right when "bring me back to
  // where I was" matters most — so the last-known position for this exact
  // document is also kept in a plain module-level store that survives the
  // remount, keyed on whichever forced condition flags select this entry
  // point (e.g. Vespers vs. Matins both open raising_of_incense).
  const documentPositionKey = `${bookmarkId}:${JSON.stringify(extraContext || {})}`;

  const [sections, setSections] = useState<DocumentSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // In-document toggle button (rendered wherever GOSPEL_RITE is spliced in) —
  // session-only, not a persisted reading preference like Bishop Present.
  const [copticGospelRite, setCopticGospelRite] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  // Verse-granular position within currentSectionId, reported by the WebView
  // reader's scroll-tracking script — used to re-anchor scroll position
  // after a rotation/window-resize reflows the layout (see the effect below).
  // Slideshow mode doesn't need this: SlideshowContainer already restores
  // its own verse-level position internally whenever it repaginates.
  const [currentVerseId, setCurrentVerseId] = useState<string | null>(null);
  // Seeded synchronously (not via an effect) from the module-level store: a
  // child effect inside SlideshowContainer reports "slide 0" the instant it
  // mounts, which — if this started out undefined and only got set a render
  // later by an effect here — would race ahead and persist that wrong "slide
  // 0" over the real remembered position before this ever got a chance to
  // apply it.
  const [selectedSlideSectionId, setSelectedSlideSectionId] = useState<string | undefined>(() =>
    getLastDocumentPosition(documentPositionKey),
  );
  const [subdocumentModal, setSubdocumentModal] = useState<SubdocumentModalTarget | null>(null);
  const [antiphonarySections, setAntiphonarySections] = useState<DocumentSection[] | null>(null);
  const documentRef = useRef<DocumentWebViewHandle>(null);
  const hasRestoredScrollPositionRef = useRef(false);
  // Set right before toggling copticGospelRite (see handleAction below) to
  // whichever section id the toggle button itself reported — consumed by
  // the re-anchor effect right after.
  const gospelRiteAnchorSectionIdRef = useRef<string | null>(null);
  // A freshly (re)mounted WebView's own scroll-tracking script starts
  // reporting "currentSection" as soon as content paints -- for the very
  // first frame or two that's just wherever it naturally loaded (the top),
  // not wherever an explicit scrollToSection restore is about to send it.
  // Whenever a restore is in flight (initial load, a mode switch, the
  // gospel-rite/dimension-change re-anchors), this holds the section it's
  // headed for; handleAction's 'currentSection' case ignores any report that
  // doesn't match it yet, so that premature "still at the top" reading can
  // never overwrite the real remembered position.
  const pendingScrollRestoreSectionIdRef = useRef<string | null>(null);
  // Navigating to Settings/Calendar keeps this screen mounted behind the new
  // one (see the module comment at the top of this file), and the layout
  // shift that transition causes is enough to make the still-live WebView's
  // reading-line tracker briefly misfire -- observed landing on the very
  // last section in the document, as if the reflow had collapsed its scroll
  // range out from under it. Set the moment either navigation is triggered;
  // cleared after a few seconds (long enough for the transition, and its
  // knock-on layout settling, to be over) rather than on any particular
  // "we're back and focused" event, since this screen has no such signal.
  const navigatingAwayRef = useRef(false);

  const bookmarked = isBookmarked(bookmarkId);

  useEffect(() => {
    let cancelled = false;
    setSections(null);
    setError(null);
    hasRestoredScrollPositionRef.current = false;

    // BishopPresent is always hydrated as if a bishop *could* be present —
    // hydrateWithFlags evaluates every condition both ways and tags the
    // result (verse.bishopOnly / verse.priestOnly), so the document already
    // contains both variants. Toggling the Bishop Present preference is then
    // a pure client-side re-render (DocumentSurface/documentHtml.ts filter by
    // it directly) and never needs to re-fetch — that's why it's fixed here
    // instead of reading preferences.bishopPresent, and not in the deps below.
    // CopticGospelRite gets the exact same treatment, but only for GOSPEL_RITE
    // splices specifically (see hydrateWholeTableInlineNested in
    // hymnLibrary.js) — the value passed here is irrelevant since that
    // function always hydrates both states itself, so it's fixed too and
    // copticGospelRite (session toggle state) isn't a dep below either.
    //
    // liturgy_of_the_word is the one document that references the readings
    // schema's Pauline/Catholic Epistle inline splices — those need today's
    // PaulineEpistleRomans/CatholicEpistle1Peter-style condition flags (see
    // getEpistleConditionFlags) to pick the right introduction line, resolved
    // here and merged into extraContext before hydrating.
    const needsEpistleFlags = schema === 'liturgy' && table === 'liturgy_of_the_word';
    const epistleFlagsPromise = needsEpistleFlags ? getEpistleConditionFlags(effectiveDate) : Promise.resolve({});

    epistleFlagsPromise
      .then((epistleFlags) =>
        hydrateSupabaseServiceHymn(
          schema,
          table,
          effectiveDate,
          { BishopPresent: true, CopticGospelRite: false, ...epistleFlags, ...extraContext },
          isVespersService ? vespersEffectiveDate : undefined,
        ),
      )
      .then((result) => {
        if (!cancelled) setSections(result as DocumentSection[]);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load this service.');
      });

    return () => {
      cancelled = true;
    };
  }, [schema, table, effectiveDate, vespersEffectiveDate, isVespersService, extraContext]);

  // The scrolling WebView reader has no equivalent "seed the initial prop"
  // option (scrollToSection is imperative and needs the WebView mounted
  // first), so it still restores via an effect once a freshly (re)hydrated
  // document is ready.
  // The actual scroll-on-first-load itself is handled declaratively by
  // DocumentWebView's own initialSectionId prop (see initialScrollSectionId
  // below) -- it waits for the WebView's real load-complete event rather
  // than guessing a timeout, which an imperative scrollToSection call fired
  // from here never could (this screen has no way to know when the WebView
  // has actually finished loading). This effect only needs to guard against
  // that same freshly-mounted WebView's own natural "just loaded, still at
  // the top" report racing ahead of initialSectionId's correction and
  // overwriting the store before it lands.
  useEffect(() => {
    if (!sections || hasRestoredScrollPositionRef.current || preferences.slideshowMode) return;
    hasRestoredScrollPositionRef.current = true;

    const lastSectionId = getLastDocumentPosition(documentPositionKey);
    if (!lastSectionId || !sections.some((s) => s.id === lastSectionId)) return;
    pendingScrollRestoreSectionIdRef.current = lastSectionId;
    const clearGuardTimeoutId = setTimeout(() => {
      if (pendingScrollRestoreSectionIdRef.current === lastSectionId) {
        pendingScrollRestoreSectionIdRef.current = null;
      }
    }, 2000);
    return () => clearTimeout(clearGuardTimeoutId);
  }, [sections, documentPositionKey, preferences.slideshowMode]);

  // Rotating the device (or, on web, resizing the window) reflows the
  // WebView's CSS layout at the new width without reloading it — the scroll
  // position (in pixels) stays put, but the content that used to be at that
  // pixel offset has usually moved, so the reader silently lands on the
  // wrong verse. Re-anchor to wherever the user actually was once the
  // reflow has had a moment to settle. Slideshow mode doesn't need this —
  // SlideshowContainer already restores its own verse-level position
  // whenever a dimension change forces it to repaginate.
  const dimensionKeyRef = useRef(`${screenWidth}x${screenHeight}`);
  useEffect(() => {
    const nextKey = `${screenWidth}x${screenHeight}`;
    if (dimensionKeyRef.current === nextKey) return;
    dimensionKeyRef.current = nextKey;
    if (preferences.slideshowMode) return;
    if (!currentVerseId && !currentSectionId) return;

    const timeoutId = setTimeout(() => {
      if (currentVerseId) documentRef.current?.scrollToVerse(currentVerseId);
      else if (currentSectionId) documentRef.current?.scrollToSection(currentSectionId);
    }, 260);
    return () => clearTimeout(timeoutId);
  }, [screenWidth, screenHeight, preferences.slideshowMode, currentVerseId, currentSectionId]);

  // Toggling "Coptic Gospel Rite" regenerates the WebView's whole HTML (its
  // content depends on the toggle), which reloads the view and resets
  // scroll to the top — re-anchor to the toggle button's own section (see
  // gospelRiteAnchorSectionIdRef, set in handleAction below) once the
  // reload has had a moment to settle, same pattern as the dimension-change
  // re-anchor above.
  useEffect(() => {
    const anchorId = gospelRiteAnchorSectionIdRef.current;
    if (!anchorId) return;
    gospelRiteAnchorSectionIdRef.current = null;
    if (preferences.slideshowMode) return;

    const timeoutId = setTimeout(() => {
      documentRef.current?.scrollToSection(anchorId);
    }, 260);
    return () => clearTimeout(timeoutId);
  }, [copticGospelRite, preferences.slideshowMode]);

  // Flipping the Slideshow Mode toggle unmounts one renderer and mounts the
  // other (DocumentSurface.tsx renders either SlideshowContainer or
  // DocumentWebView, never both) — neither one's internal "where was the
  // user" tracking survives that swap on its own. currentSectionId is kept
  // live by both renderers (handleAction's 'currentSection' case for scroll
  // mode, onCurrentSectionChange for slideshow below), so it's always
  // whatever hymn the user was just looking at regardless of which mode
  // reported it — jump the *other* mode there the moment the toggle flips.
  // Only reacts to an actual flip (this ref starts equal to the current
  // value, so it never fires on mount) — same "settings change -> start of
  // the hymn, not the exact spot" behavior as every other settings change,
  // just triggered by this one specific setting.
  const previousSlideshowModeRef = useRef(preferences.slideshowMode);
  useEffect(() => {
    if (previousSlideshowModeRef.current === preferences.slideshowMode) return;
    previousSlideshowModeRef.current = preferences.slideshowMode;
    if (!currentSectionId) return;

    if (preferences.slideshowMode) {
      setSelectedSlideSectionId(currentSectionId);
      return;
    }

    // Write the target synchronously, immediately, so the persisted store
    // already has the right answer no matter what happens next -- Settings
    // can be reached from a screen that stays mounted in the background
    // (this effect firing at all is proof of that), so a fresh WebView can
    // mount here before this screen is even navigated back to. The actual
    // scroll happens declaratively, via initialScrollSectionId seeding the
    // new WebView's initialSectionId prop below (see its own doc comment) --
    // that waits for the real load-complete event instead of guessing a
    // timeout. pendingScrollRestoreSectionIdRef blocks handleAction from
    // trusting anything else until this exact section is confirmed, so the
    // WebView's own natural "just loaded, still at the top" report can't
    // beat that correction and overwrite the store with a stray position
    // before this screen is even visible again.
    setLastDocumentPosition(documentPositionKey, currentSectionId);
    pendingScrollRestoreSectionIdRef.current = currentSectionId;
    // The target section might never actually get reported back (e.g. it
    // got hidden by some other setting in the meantime) -- don't leave the
    // guard blocking every future report forever if that happens.
    const clearGuardTimeoutId = setTimeout(() => {
      if (pendingScrollRestoreSectionIdRef.current === currentSectionId) {
        pendingScrollRestoreSectionIdRef.current = null;
      }
    }, 2000);
    return () => clearTimeout(clearGuardTimeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.slideshowMode]);

  // See navigatingAwayRef's declaration -- used for any navigation that
  // leaves this screen mounted behind the destination (Settings, Calendar).
  const navigateAway = (href: Href) => {
    navigatingAwayRef.current = true;
    setTimeout(() => {
      navigatingAwayRef.current = false;
    }, 3000);
    router.push(href);
  };

  const handleAction = (action: DocumentAction) => {
    if (action.type === 'toggleCopticGospelRite') {
      gospelRiteAnchorSectionIdRef.current = action.sectionId || currentSectionId;
      setCopticGospelRite((current) => !current);
      return;
    }

    if (!sections) return;

    if (action.type === 'currentSection') {
      // Opening the content-selector drawer (a Modal) sits on top of the
      // WebView without unmounting it, and the layout shift that causes
      // (e.g. the underlying page's scrollbar disappearing) is enough to
      // make its reading-line tracker briefly reassess and report some
      // unrelated section as "current" -- the user isn't actually scrolling
      // the document while a modal covers it, so nothing it reports during
      // that window reflects real reading position. Same idea for
      // navigatingAwayRef, covering the Settings/Calendar transition itself.
      if (selectorOpen || navigatingAwayRef.current) return;

      const pendingTarget = pendingScrollRestoreSectionIdRef.current;
      if (pendingTarget && action.sectionId !== pendingTarget) {
        // Still mid-restore and this isn't the target yet -- almost
        // certainly the WebView's own natural "just loaded, still at the
        // top" report racing the explicit scroll that's about to correct
        // it. Ignore it rather than let it clobber the real position.
        return;
      }
      pendingScrollRestoreSectionIdRef.current = null;
      if (action.sectionId) {
        setCurrentSectionId(action.sectionId);
        setLastDocumentPosition(documentPositionKey, action.sectionId);
      }
      setCurrentVerseId(action.verseId || null);
      return;
    }

    const triggerSection = sections.find((s) => s.id === action.sectionId);
    if (!triggerSection?.subdocumentSections) return;

    if (action.type === 'openAntiphonary') {
      setAntiphonarySections(triggerSection.subdocumentSections);
      return;
    }

    if (action.type === 'openSubdocument') {
      setSubdocumentModal({
        title: triggerSection.title,
        sections: triggerSection.subdocumentSections,
        subdocumentKey: triggerSection.subdocumentKey,
      });
    }
  };

  const selectorEdgeWidth = Math.min(240, Math.max(128, screenWidth * 0.18));
  const selectorSwipeStartX = Math.max(screenWidth - selectorEdgeWidth, 0);

  const gesturePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const startsInRightEdge = gestureState.x0 >= selectorSwipeStartX;
          const startsInLeftEdge = gestureState.x0 < 56;
          const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
          return (startsInRightEdge || startsInLeftEdge) && isHorizontal && Math.abs(gestureState.dx) > 18;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.x0 >= selectorSwipeStartX && gestureState.dx <= -36) {
            setSelectorOpen(true);
            return;
          }
          if (gestureState.x0 < 56 && gestureState.dx > 60) {
            goBack(router, backHref);
          }
        },
      }),
    [router, selectorSwipeStartX, backHref],
  );

  return (
    <SafeAreaView
      style={styles.safeArea}
      {...(isMobileDocument ? gesturePanResponder.panHandlers : {})}
    >
      {/* The native stack's own default edge-swipe-to-go-back gesture isn't
          scoped to whether a subdocument modal is currently covering this
          screen — swiping the left edge would pop this whole document out
          from underneath an open subdocument instead of just closing it.
          This screen already implements its own equivalent gesture above
          (gesturePanResponder), so the native one is both redundant and the
          source of that bug — disabled here in favor of it. */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Head>
        <title>{`CHC ${title}`}</title>
      </Head>
      {!isMobileDocument ? (
        <AppHeader
          title={{ english: title, arabic }}
          canGoBack
          onBack={() => goBack(router, backHref)}
          rightLeadingIcon={shouldShowFullscreen ? (isFullscreen ? 'close-fullscreen' : 'open-in-full') : undefined}
          onRightLeadingPress={shouldShowFullscreen ? toggleFullscreen : undefined}
          rightIcon="list-outline"
          rightAccessibilityLabel="Open content list"
          onRightPress={() => setSelectorOpen(true)}
        />
      ) : null}
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : !sections ? (
        <LoadingScreen />
      ) : (
        <>
          <DocumentSurface
            ref={documentRef}
            sections={sections}
            preferences={preferences}
            onAction={handleAction}
            selectedSectionId={selectedSlideSectionId}
            onCurrentSectionChange={(id) => {
              // Only SlideshowContainer ever calls this — a report arriving
              // while slideshowMode is actually false can only be a stale
              // callback from an instance that's already mid-unmount (e.g.
              // right as the mode toggle flips the other way), not a real
              // position update; trusting it would silently overwrite the
              // correct remembered position with garbage.
              if (!preferences.slideshowMode) return;
              setCurrentSectionId(id);
              setLastDocumentPosition(documentPositionKey, id);
            }}
            onOpenSelector={() => setSelectorOpen(true)}
            copticGospelRite={copticGospelRite}
            initialScrollSectionId={currentSectionId ?? getLastDocumentPosition(documentPositionKey)}
          />
          <ContentSelectorDrawer
            visible={selectorOpen}
            sections={sections}
            currentSectionId={currentSectionId}
            onClose={() => setSelectorOpen(false)}
            onSelectSection={(id) => {
              if (preferences.slideshowMode) {
                setSelectedSlideSectionId(id);
              } else {
                documentRef.current?.scrollToSection(id);
              }
            }}
            bookmarked={bookmarked}
            onToggleBookmark={() => toggleBookmark(bookmarkId)}
            onOpenCalendar={() => navigateAway('/calendar')}
            onOpenSettings={() => navigateAway('/settings')}
            bishopPresent={preferences.bishopPresent}
            onToggleBishopPresent={toggleBishopPresent}
            displaySilentPrayers={preferences.displaySilentPrayers}
            copticGospelRite={copticGospelRite}
            appLanguage={preferences.appLanguage}
          />
          <SubdocumentModal
            visible={Boolean(subdocumentModal)}
            title={subdocumentModal?.title ?? null}
            sections={subdocumentModal?.sections ?? null}
            subdocumentKey={subdocumentModal?.subdocumentKey}
            onClose={() => setSubdocumentModal(null)}
          />
          <AntiphonaryModal
            visible={Boolean(antiphonarySections)}
            sections={antiphonarySections}
            onClose={() => setAntiphonarySections(null)}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  loading: { fontFamily: TYPOGRAPHY.body, color: COLORS.muted, fontSize: 17 },
  error: { fontFamily: TYPOGRAPHY.body, color: COLORS.priest, fontSize: 17, textAlign: 'center' },
});
