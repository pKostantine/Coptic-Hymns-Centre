import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { PanResponder, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import ContentSelectorDrawer from '@/components/chc/ui/ContentSelectorDrawer';
import LoadingScreen from '@/components/chc/ui/LoadingScreen';
import DocumentSurface from '@/components/chc/DocumentSurface';
import { DocumentSection, DocumentWebViewHandle } from '@/components/chc/DocumentWebView';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useCalendar } from '@/context/CalendarContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { getReadingsForDate } from '@/utils/readingsService';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';
import { goBack } from '@/utils/navigation';

const isMobileDocument = Platform.OS !== 'web';

/** Daily Readings screen — resolves calendar.reading_rules for the current effective date and renders the result through the exact same DocumentSurface/ContentSelectorDrawer pipeline as every other service document, so slideshow mode, font size, bookmarking, and gesture nav all work identically. */
export default function LectionaryDocument() {
  const router = useRouter();
  const { preferences, isBookmarked, toggleBookmark, toggleBishopPresent } = useReadingPreferences();
  const { effectiveDate } = useCalendar();
  const { isFullscreen, toggle: toggleFullscreen, shouldShow: shouldShowFullscreen } = useBrowserFullscreen();
  const { width: screenWidth } = useWindowDimensions();
  const bookmarkId = `lectionary:${effectiveDate.toISOString().slice(0, 10)}`;

  const [sections, setSections] = useState<DocumentSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  const documentRef = useRef<DocumentWebViewHandle>(null);

  useEffect(() => {
    let cancelled = false;
    setSections(null);
    setError(null);
    getReadingsForDate(effectiveDate)
      .then((result) => {
        if (!cancelled) setSections(result.sections);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load today’s readings.');
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveDate]);

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
            goBack(router, '/');
          }
        },
      }),
    [router, selectorSwipeStartX],
  );

  return (
    <SafeAreaView style={styles.safeArea} {...(isMobileDocument ? gesturePanResponder.panHandlers : {})}>
      <Head>
        <title>CHC Daily Readings</title>
      </Head>
      {!isMobileDocument ? (
        <AppHeader
          title={{ english: 'Daily Readings', arabic: 'قراءات اليوم' }}
          canGoBack
          onBack={() => goBack(router, '/')}
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
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.loading}>No readings are recorded for this day.</Text>
        </View>
      ) : (
        <>
          <DocumentSurface
            ref={documentRef}
            sections={sections}
            preferences={preferences}
            onCurrentSectionChange={setCurrentSectionId}
            onOpenSelector={() => setSelectorOpen(true)}
          />
          <ContentSelectorDrawer
            visible={selectorOpen}
            sections={sections}
            currentSectionId={currentSectionId}
            onClose={() => setSelectorOpen(false)}
            onSelectSection={(id) => documentRef.current?.scrollToSection(id)}
            bookmarked={isBookmarked(bookmarkId)}
            onToggleBookmark={() => toggleBookmark(bookmarkId)}
            onOpenSettings={() => router.push('/settings')}
            bishopPresent={preferences.bishopPresent}
            onToggleBishopPresent={toggleBishopPresent}
            displaySilentPrayers={preferences.displaySilentPrayers}
            appLanguage={preferences.appLanguage}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  loading: { fontFamily: TYPOGRAPHY.body, color: COLORS.muted, fontSize: 17, textAlign: 'center' },
  error: { fontFamily: TYPOGRAPHY.body, color: COLORS.priest, fontSize: 17, textAlign: 'center' },
});
