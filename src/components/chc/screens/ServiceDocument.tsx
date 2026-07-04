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
  const [sections, setSections] = useState<DocumentSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  const [selectedSlideSectionId, setSelectedSlideSectionId] = useState<string | undefined>();
  const [subdocumentModal, setSubdocumentModal] = useState<SubdocumentModalTarget | null>(null);
  const [antiphonarySections, setAntiphonarySections] = useState<DocumentSection[] | null>(null);
  const documentRef = useRef<DocumentWebViewHandle>(null);

  const bookmarkId = `${schema}:${table}`;
  const bookmarked = isBookmarked(bookmarkId);

  useEffect(() => {
    let cancelled = false;
    setSections(null);
    setError(null);

    hydrateSupabaseServiceHymn(
      schema,
      table,
      effectiveDate,
      { BishopPresent: preferences.bishopPresent, ...extraContext },
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
  }, [schema, table, effectiveDate, vespersEffectiveDate, isVespersService, preferences.bishopPresent, extraContext]);

  const handleAction = (action: DocumentAction) => {
    if (!sections) return;

    if (action.type === 'currentSection') {
      if (action.sectionId) setCurrentSectionId(action.sectionId);
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
          rightLeadingIconFamily="material"
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
            onCurrentSectionChange={setCurrentSectionId}
            onOpenSelector={() => setSelectorOpen(true)}
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
