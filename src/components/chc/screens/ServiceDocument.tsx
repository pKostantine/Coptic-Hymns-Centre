import { useEffect, useMemo, useRef, useState } from 'react';
import { Href, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { PanResponder, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '../ui/AppHeader';
import ContentSelectorDrawer from '../ui/ContentSelectorDrawer';
import DocumentSurface from '../DocumentSurface';
import { DocumentAction, DocumentSection, DocumentWebViewHandle } from '../DocumentWebView';
import { AntiphonaryModal, SubdocumentModal } from './DocumentModal';
import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { useCalendar } from '../../../context/CalendarContext';
import { useBrowserFullscreen } from '../../../utils/useBrowserFullscreen';
import { hydrateSupabaseServiceHymn } from '../../../utils/hymnLibrary';
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
  const { isFullscreen, toggle: toggleFullscreen } = useBrowserFullscreen();
  const { width: screenWidth } = useWindowDimensions();
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
    hydrateSupabaseServiceHymn(
      schema,
      table,
      effectiveDate,
      { BishopPresent: true, CopticGospelRite: copticGospelRite, ...extraContext },
      isVespersService ? vespersEffectiveDate : undefined,
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
  }, [schema, table, effectiveDate, vespersEffectiveDate, isVespersService, copticGospelRite, extraContext]);

  // The scrolling WebView reader has no equivalent "seed the initial prop"
  // option (scrollToSection is imperative and needs the WebView mounted
  // first), so it still restores via an effect once a freshly (re)hydrated
  // document is ready.
  useEffect(() => {
    if (!sections || hasRestoredScrollPositionRef.current || preferences.slideshowMode) return;
    hasRestoredScrollPositionRef.current = true;

    const lastSectionId = getLastDocumentPosition(documentPositionKey);
    if (!lastSectionId || !sections.some((s) => s.id === lastSectionId)) return;
    documentRef.current?.scrollToSection(lastSectionId);
  }, [sections, documentPositionKey, preferences.slideshowMode]);

  const handleAction = (action: DocumentAction) => {
    if (action.type === 'toggleCopticGospelRite') {
      setCopticGospelRite((current) => !current);
      return;
    }

    if (!sections) return;

    if (action.type === 'currentSection') {
      if (action.sectionId) {
        setCurrentSectionId(action.sectionId);
        setLastDocumentPosition(documentPositionKey, action.sectionId);
      }
      return;
    }

    const triggerSection = sections.find((s) => s.id === action.sectionId);
    if (!triggerSection?.subdocumentSections) return;

    if (action.type === 'openAntiphonary') {
      setAntiphonarySections(triggerSection.subdocumentSections);
      return;
    }

    if (action.type === 'openSubdocument') {
      setSubdocumentModal({ title: triggerSection.title, sections: triggerSection.subdocumentSections });
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
      edges={['left', 'right', 'bottom']}
      style={styles.safeArea}
      {...(isMobileDocument ? gesturePanResponder.panHandlers : {})}
    >
      <Head>
        <title>{`CHC ${title}`}</title>
      </Head>
      {!isMobileDocument ? (
        <AppHeader
          title={{ english: title, arabic }}
          canGoBack
          onBack={() => goBack(router, backHref)}
          rightLeadingIcon={isFullscreen ? 'close-fullscreen' : 'open-in-full'}
          onRightLeadingPress={toggleFullscreen}
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
        <View style={styles.center}>
          <Text style={styles.loading}>Loading…</Text>
        </View>
      ) : (
        <>
          <DocumentSurface
            ref={documentRef}
            sections={sections}
            preferences={preferences}
            onAction={handleAction}
            selectedSectionId={selectedSlideSectionId}
            onCurrentSectionChange={(id) => {
              setCurrentSectionId(id);
              setLastDocumentPosition(documentPositionKey, id);
            }}
            onOpenSelector={() => setSelectorOpen(true)}
            copticGospelRite={copticGospelRite}
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
            onOpenCalendar={() => router.push('/calendar')}
            onOpenSettings={() => router.push('/settings')}
            bishopPresent={preferences.bishopPresent}
            onToggleBishopPresent={toggleBishopPresent}
            displaySilentPrayers={preferences.displaySilentPrayers}
          />
          <SubdocumentModal
            visible={Boolean(subdocumentModal)}
            title={subdocumentModal?.title ?? null}
            sections={subdocumentModal?.sections ?? null}
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
