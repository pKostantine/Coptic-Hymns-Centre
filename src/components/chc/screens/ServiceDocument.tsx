import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Href, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { PanResponder, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '../ui/AppHeader';
import ContentSelectorDrawer from '../ui/ContentSelectorDrawer';
import LoadingScreen from '../ui/LoadingScreen';
import DocumentSurface from '../DocumentSurface';
import { DocumentAction, DocumentSection, DocumentWebViewHandle } from '../DocumentWebView';
import { AntiphonaryModal, SubdocumentModal } from './DocumentModal';
import { bookmarkKeyFor, HYPERLINK_TARGETS } from '../../../constants/manifest';
import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { useCalendar } from '../../../context/CalendarContext';
import { useBrowserFullscreen } from '../../../utils/useBrowserFullscreen';
import { hydrateSupabaseServiceHymn } from '../../../utils/hymnLibrary';
import { getEpistleConditionFlags } from '../../../utils/readingsService';
import { getLastDocumentPosition, setLastDocumentPosition } from '../../../utils/lastDocumentPosition';
import { goBack } from '../../../utils/navigation';
import { MOBILE_WEB_BREAKPOINT } from '../../../utils/useIsMobileWeb';

interface ServiceDocumentProps {
  schema: string;
  table: string;
  title: string;
  arabic: string;
  /** Extra condition flags forced true for this entry point (e.g. Vespers/Matins on the shared raising_of_incense document). */
  extraContext?: Record<string, boolean>;
  /** Manifest id of the menu entry this document was opened from. Only needed where several entries open the SAME schema/table (Vespers vs Matins), so a bookmark can record which one it was made in — see bookmarkKeyFor. */
  entryId?: string;
  /** Where "back" should land when there's no navigation history to pop (direct deep link, page reload). */
  backHref: Href;
}

interface SubdocumentModalTarget {
  title: { english: string; arabic: string };
  sections: DocumentSection[];
  subdocumentKey?: string;
  collapseMemoryScope: string;
  /** Id of the section holding the open-button this subdocument was reached through — where the reader is put back when it closes. */
  triggerSectionId?: string;
}

interface AntiphonaryModalTarget {
  sections: DocumentSection[];
  collapseMemoryScope: string;
}

/**
 * Generic document reader — ported from HymnDisplayScreen.js. Web ALWAYS
 * keeps the Header (fullscreen toggle + content-list icon), on every device
 * width -- unlike the native app, which shows no header at all and is
 * gesture-only navigation (right-edge swipe-left opens the Content
 * selector, left-edge swipe-right goes back). This is a deliberate
 * difference, not a gap to close: the header is web's only affordance for
 * "how do I get back/open the content list" since a phone browser has no
 * native swipe-back gesture of its own to conflict with. The swipe gestures
 * themselves are still enabled on narrow web (isCompactViewport) since they
 * don't remove anything the header already provides.
 */
export default function ServiceDocument({ schema, table, title, arabic, extraContext, entryId, backHref }: ServiceDocumentProps) {
  const router = useRouter();
  const { preferences, isBookmarked, toggleBookmark, toggleBishopPresent, toggleCopticGospelRite } = useReadingPreferences();
  const { effectiveDate, vespersEffectiveDate } = useCalendar();
  // Saturday-evening Vespers Praises and Vespers still chant in Saturday's
  // (Vatos) weekday tune even after the liturgical day rolls to Sunday for
  // every other service — see CalendarContext's vespersEffectiveDate.
  const isVespersService =
    (schema === 'psalmody' && table === 'vespers_praises') ||
    (schema === 'liturgy' && table === 'raising_of_incense' && extraContext?.Vespers === true) ||
    (schema === 'liturgy' && table === 'lectionary_vespers');
  const { isFullscreen, toggle: toggleFullscreen, shouldShow: shouldShowFullscreen } = useBrowserFullscreen();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isMobileDocument = Platform.OS !== 'web';
  const isCompactViewport = isMobileDocument || screenWidth < MOBILE_WEB_BREAKPOINT;
  // Qualified by the entry point only where the document is reachable from
  // more than one, so bookmarks for every other document keep their existing
  // ids. Without this, a bookmark made in Vespers and one made in Matins were
  // the same id, and the bookmarks list labelled both with whichever entry it
  // had indexed last.
  // Memoized rather than called bare: bookmarkId feeds memoized values below,
  // and the React Compiler cannot see through a plain call here, so it bails
  // out of preserving those memos entirely.
  const bookmarkId = useMemo(() => bookmarkKeyFor(schema, table, entryId), [schema, table, entryId]);
  // Navigating to Settings and back unmounts this screen (React Navigation
  // doesn't keep off-screen web routes mounted), which would otherwise wipe
  // currentSectionId/selectedSlideSectionId right when "bring me back to
  // where I was" matters most — so the last-known position for this exact
  // document is also kept in a plain module-level store that survives the
  // remount, keyed on whichever forced condition flags select this entry
  // point (e.g. Vespers vs. Matins both open raising_of_incense).
  const documentPositionKey = `${bookmarkId}:${JSON.stringify(extraContext || {})}`;

  // Settings that are really condition flags, raised alongside the date's own.
  //
  // Hand-picked saint hymns ride in under their full child token
  // (`StMark:VOC`); the bare `StMark` is never raised, which is what keeps one
  // chosen hymn from pulling in the saint's whole set while the calendar
  // raising `StMark` on his feast still satisfies all of them (see
  // isConditionAtomSatisfied in conditionEngine.js). Monastery is the one
  // gating the Prayer of the Veil.
  const userConditionFlags = useMemo(
    () => ({
      ...Object.fromEntries((preferences.selectedSaintHymns || []).map((token) => [token, true])),
      Monastery: Boolean(preferences.inMonastery),
    }),
    [preferences.selectedSaintHymns, preferences.inMonastery],
  );

  const [sections, setSections] = useState<DocumentSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // In-document toggle button state, rendered wherever GOSPEL_RITE is spliced in.
  const copticGospelRite = preferences.copticGospelRite;
  const [selectorOpen, setSelectorOpen] = useState(false);
  // Seeded from the same module-level store selectedSlideSectionId is (see
  // below): changing a setting can unmount this screen and mount it again,
  // and starting back at null would leave the content selector with nothing
  // highlighted and nowhere to scroll to until the reader got around to
  // reporting its restored position.
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(
    () => getLastDocumentPosition(documentPositionKey) ?? null,
  );
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
  const [antiphonaryModal, setAntiphonaryModal] = useState<AntiphonaryModalTarget | null>(null);
  const documentRef = useRef<DocumentWebViewHandle>(null);
  const hasRestoredScrollPositionRef = useRef(false);
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
  // ?sub=SUBDOCUMENT_KEY in the URL (written by bookmarks.tsx when navigating
  // to a saved subdocument bookmark) — fire once when sections first load.
  const { sub: initialSubdocumentKey, viaHyperlink } = useLocalSearchParams<{ sub?: string; viaHyperlink?: string }>();
  // Set by openHyperlink on the document it jumps TO. A hyperlink replaces the
  // source document rather than stacking on top of it, so there is no longer a
  // meaningful entry to pop back to — going back should leave via this
  // document's own parent (Vespers -> Raising of Incense), not via whatever
  // happened to precede the document that linked here.
  const arrivedViaHyperlink = viaHyperlink === '1';
  const leaveDocument = useCallback(() => {
    if (arrivedViaHyperlink) {
      router.replace(backHref);
      return;
    }
    goBack(router, backHref);
  }, [arrivedViaHyperlink, router, backHref]);
  const initialSubOpenedRef = useRef(false);

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
    // the persisted copticGospelRite preference isn't a dep below either.
    //
    // liturgy_of_the_word is the one document that references the readings
    // schema's Pauline/Catholic Epistle inline splices — those need today's
    // PaulineEpistleRomans/CatholicEpistle1Peter-style condition flags (see
    // getEpistleConditionFlags) to pick the right introduction line, resolved
    // here and merged into extraContext before hydrating.
    const needsEpistleFlags =
      (schema === 'liturgy' && table === 'liturgy_of_the_word') ||
      (schema === 'liturgy' && table === 'lectionary_liturgy');
    const epistleFlagsPromise = needsEpistleFlags ? getEpistleConditionFlags(effectiveDate) : Promise.resolve({});

    epistleFlagsPromise
      .then((epistleFlags) =>
        hydrateSupabaseServiceHymn(
          schema,
          table,
          effectiveDate,
          { BishopPresent: true, CopticGospelRite: false, ...epistleFlags, ...userConditionFlags, ...extraContext },
          isVespersService ? vespersEffectiveDate : undefined,
        ),
      )
      .then((result) => {
        if (!cancelled) {
          const newSections = result as DocumentSection[];
          setSections(newSections);
          // If a subdocument is open, refresh its sections from the new hydration
          // so date/settings changes update the subdocument content without closing it.
          setSubdocumentModal((current) => {
            if (!current?.subdocumentKey) return current;
            const trigger = newSections.find((s) => s.subdocumentKey === current.subdocumentKey && s.subdocumentSections);
            return trigger ? { ...current, sections: trigger.subdocumentSections! } : current;
          });
          // The Antiphonary is the most date-dependent subdocument there is
          // (its whole content is the day's commemoration), and it stays open
          // across a re-hydration now like every other modal, so it has to be
          // refreshed the same way rather than left showing the old day.
          setAntiphonaryModal((current) => {
            if (!current) return current;
            const trigger = newSections.find((s) => s.isAntiphonaryButton && s.subdocumentSections);
            return trigger ? { ...current, sections: trigger.subdocumentSections! } : current;
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load this service.');
      });

    return () => {
      cancelled = true;
    };
  }, [schema, table, effectiveDate, vespersEffectiveDate, isVespersService, extraContext, userConditionFlags]);

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

  useEffect(() => {
    if (!sections || !initialSubdocumentKey || initialSubOpenedRef.current) return;
    initialSubOpenedRef.current = true;
    const triggerSection = sections.find((s) => s.subdocumentKey === initialSubdocumentKey);
    if (triggerSection?.subdocumentSections) {
      setSubdocumentModal({
        title: triggerSection.title,
        sections: triggerSection.subdocumentSections,
        subdocumentKey: triggerSection.subdocumentKey,
        collapseMemoryScope: `${documentPositionKey}:sub:${triggerSection.id}`,
        triggerSectionId: triggerSection.id,
      });
    }
  }, [sections, initialSubdocumentKey, documentPositionKey]);

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

  // A Hyperlink teleports to another service rather than opening anything over
  // this one, so it navigates away exactly like Settings/Calendar do -- leaving
  // this screen mounted behind the destination, which is what navigateAway's
  // guard is for. Reached from both the document button and the content
  // selector's own hyperlink row.
  const openHyperlink = (hyperlinkKey?: string | null, options?: { fromSelector?: boolean }) => {
    const destination = hyperlinkKey ? HYPERLINK_TARGETS[hyperlinkKey] : undefined;
    if (!destination) return;
    // isCoveredByModal counts the content selector as covering this screen,
    // which is right for anything the DOCUMENT initiates while it sits behind
    // something -- but the selector's own hyperlink row IS that something, so
    // gating it on the same flag made the row permanently dead. From the
    // selector, only a subdocument/Antiphonary modal genuinely blocks.
    const blocked = options?.fromSelector
      ? Boolean(subdocumentModal) || Boolean(antiphonaryModal)
      : isCoveredByModal;
    if (blocked) return;
    // replace, not push: a Hyperlink teleports between services rather than
    // opening one over another, so the source document should not stay on the
    // stack holding its hydrated sections in memory.
    navigatingAwayRef.current = true;
    setTimeout(() => {
      navigatingAwayRef.current = false;
    }, 3000);
    router.replace({ pathname: destination.href, params: { viaHyperlink: '1' } } as never);
  };

  const handleAction = (action: DocumentAction) => {
    if (action.type === 'toggleCopticGospelRite') {
      // The toggle button lives inside the first Gospel Rite section. Pre-set
      // the preserved section to the always-visible section immediately before
      // the entire gospel rite block so the WebView's handleLoad/handleLoadEnd
      // (which fires after the HTML rebuild) scrolls there instead of the top.
      // Find the toggle button's section in the NEW state (after the flip) —
      // both variants are in the raw array; only the one matching the new state
      // will exist in the rebuilt HTML, so that's the one to scroll to.
      const newState = !copticGospelRite;
      const newToggleSection = sections?.find(
        (s) => s.startsGospelRiteToggle && (newState ? s.copticGospelRiteOnly : s.nonCopticGospelRiteOnly),
      );
      let targetSectionId: string | null = newToggleSection?.id ?? action.sectionId ?? currentSectionId ?? null;
      if (targetSectionId) documentRef.current?.setPreservedSection(targetSectionId);
      if (preferences.slideshowMode && targetSectionId) {
        setSelectedSlideSectionId(targetSectionId);
      }
      toggleCopticGospelRite();
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

    if (action.type === 'openSelector') {
      if (!isCoveredByModal) setSelectorOpen(true);
      return;
    }

    if (action.type === 'swipeBack') {
      if (!isCoveredByModal) leaveDocument();
      return;
    }

    // Checked before the subdocumentSections guard below: a Hyperlink section
    // deliberately carries no prefetched content, so that guard would drop it.
    if (action.type === 'openHyperlink') {
      openHyperlink(sections.find((s) => s.id === action.sectionId)?.hyperlinkKey);
      return;
    }

    const triggerSection = sections.find((s) => s.id === action.sectionId);
    if (!triggerSection?.subdocumentSections) return;

    if (action.type === 'openAntiphonary') {
      setAntiphonaryModal({
        sections: triggerSection.subdocumentSections,
        collapseMemoryScope: `${documentPositionKey}:sub:${triggerSection.id}`,
      });
      return;
    }

    if (action.type === 'openSubdocument') {
      setSubdocumentModal({
        title: triggerSection.title,
        sections: triggerSection.subdocumentSections,
        subdocumentKey: triggerSection.subdocumentKey,
        collapseMemoryScope: `${documentPositionKey}:sub:${triggerSection.id}`,
        triggerSectionId: triggerSection.id,
      });
    }
  };

  // Opening a subdocument from a bookmark deep link (?sub=...) never scrolled
  // this document anywhere -- the reader had tapped nothing here, so closing
  // the subdocument dropped them at the top of a service they never chose to
  // be at the top of. Land them on the button they came through instead, so
  // "Vespers - Doxologies" closes back onto the Doxologies button. Opening the
  // subdocument by tapping that button is the same jump, just already true.
  const closeSubdocument = () => {
    const triggerSectionId = subdocumentModal?.triggerSectionId;
    setSubdocumentModal(null);
    if (!triggerSectionId) return;

    setCurrentSectionId(triggerSectionId);
    setLastDocumentPosition(documentPositionKey, triggerSectionId);
    if (preferences.slideshowMode) {
      setSelectedSlideSectionId(triggerSectionId);
      return;
    }
    // Guarded the same way every other programmatic jump here is: the reader
    // reports its own position continuously, and a report still in flight
    // from before this jump would otherwise overwrite it.
    pendingScrollRestoreSectionIdRef.current = triggerSectionId;
    setTimeout(() => {
      if (pendingScrollRestoreSectionIdRef.current === triggerSectionId) {
        pendingScrollRestoreSectionIdRef.current = null;
      }
    }, 2000);
    documentRef.current?.setPreservedSection(triggerSectionId);
    documentRef.current?.scrollToSection(triggerSectionId);
  };

  const selectorEdgeWidth = Math.min(240, Math.max(128, screenWidth * 0.18));
  const selectorSwipeStartX = Math.max(screenWidth - selectorEdgeWidth, 0);

  // A subdocument/Antiphonary modal (or the content selector) stacks visually
  // on top of this screen but never unmounts it -- so without this guard, a
  // left-edge swipe made while e.g. Doxologies is open can ALSO be seen by
  // this responder (native Modal presentation isn't a guaranteed touch
  // barrier against a screen's own JS PanResponder on every platform) and
  // fire goBack on the document underneath, popping the whole document out
  // from under the subdocument instead of just closing the subdocument.
  // DocumentModal.tsx's own closeSwipePanResponder already correctly scopes
  // itself to close only the topmost modal; this ensures the document
  // BEHIND it never competes for the same gesture while anything covers it.
  const isCoveredByModal = Boolean(subdocumentModal) || Boolean(antiphonaryModal) || selectorOpen;

  const gesturePanResponder = useMemo(
    () => {
      const shouldHandleEdgeSwipe = (gestureState: { x0: number; dx: number; dy: number }) => {
        if (isCoveredByModal) return false;
        const startsInRightEdge = gestureState.x0 >= selectorSwipeStartX;
        const startsInLeftEdge = gestureState.x0 < 56;
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        return (startsInRightEdge || startsInLeftEdge) && isHorizontal && Math.abs(gestureState.dx) > 18;
      };

      return PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gestureState) => shouldHandleEdgeSwipe(gestureState),
        onMoveShouldSetPanResponder: (_, gestureState) => shouldHandleEdgeSwipe(gestureState),
        onPanResponderRelease: (_, gestureState) => {
          if (isCoveredByModal) return;
          if (gestureState.x0 >= selectorSwipeStartX && gestureState.dx <= -36) {
            setSelectorOpen(true);
            return;
          }
          if (gestureState.x0 < 56 && gestureState.dx > 60) {
            leaveDocument();
          }
        },
      });
    },
    [selectorSwipeStartX, isCoveredByModal, leaveDocument],
  );

  return (
    <SafeAreaView
      edges={Platform.OS === 'web' ? ['left', 'right', 'bottom'] : undefined}
      style={styles.safeArea}
      {...(isCompactViewport ? gesturePanResponder.panHandlers : {})}
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
          onBack={() => leaveDocument()}
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
          <View style={styles.documentFrame}>
          <DocumentSurface
            ref={documentRef}
            sections={sections}
            preferences={preferences}
            collapseMemoryScope={documentPositionKey}
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
            suppressAllSpeakerLabels={schema === 'agpeya'}
            initialScrollSectionId={currentSectionId ?? getLastDocumentPosition(documentPositionKey)}
            onCollapseToggle={setSelectedSlideSectionId}
            keyboardNavigationEnabled={!isCoveredByModal}
          />
          </View>
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
            onOpenHyperlink={(hyperlinkKey) => openHyperlink(hyperlinkKey, { fromSelector: true })}
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
        </>
      )}
      {/* Deliberately outside the branch above. Changing the date clears
          `sections` while this document re-hydrates, and these modals used to
          go with it -- taking their own state along, including which overlay
          screen was open. So picking a date in the calendar destroyed the
          calendar and dropped the reader back into the subdocument. They hold
          their own prefetched sections and never needed the parent's, so they
          now ride out the reload (still showing content, not a spinner) and
          are refreshed in place by the hydration effect above. */}
      <SubdocumentModal
        visible={Boolean(subdocumentModal)}
        title={subdocumentModal?.title ?? null}
        sections={subdocumentModal?.sections ?? null}
        subdocumentKey={subdocumentModal?.subdocumentKey}
        collapseMemoryScope={subdocumentModal?.collapseMemoryScope ?? `${documentPositionKey}:sub:unknown`}
        parentBookmarkId={bookmarkId}
        onClose={closeSubdocument}
      />
      <AntiphonaryModal
        visible={Boolean(antiphonaryModal)}
        sections={antiphonaryModal?.sections ?? null}
        collapseMemoryScope={antiphonaryModal?.collapseMemoryScope ?? `${documentPositionKey}:sub:antiphonary`}
        onClose={() => setAntiphonaryModal(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  documentFrame: { flex: 1, position: 'relative' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  loading: { fontFamily: TYPOGRAPHY.body, color: COLORS.muted, fontSize: 17 },
  error: { fontFamily: TYPOGRAPHY.body, color: COLORS.priest, fontSize: 17, textAlign: 'center' },
});
