import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { Animated, Easing, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import Icon from '@/components/chc/ui/Icon';
import LoadingScreen from '@/components/chc/ui/LoadingScreen';
import BibleWebView, { BibleWebViewHandle } from '@/components/chc/BibleWebView';
import { BibleDisplayVerse, BibleLanguageKey, buildBibleChapterHtml } from '@/components/chc/bibleDocumentHtml';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { MOBILE_WEB_BREAKPOINT } from '@/utils/useIsMobileWeb';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import {
  BibleBook,
  getBibleBook,
  getBibleChapterKeys,
  getDisplayedChapterVerses,
  getDisplayedPsalmPreface,
  PsalmNumbering,
} from '@/utils/bibleService';
import { useCopticFontDataUri } from '@/utils/useCopticFontDataUri';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';
import { fontScaleToPx } from '@/utils/preferencesStorage';
import { MODAL_SUPPORTED_ORIENTATIONS } from '@/utils/modalOrientations';
import { goBack } from '@/utils/navigation';

const LANGUAGE_OPTIONS: { key: BibleLanguageKey; label: string }[] = [
  { key: 'english', label: 'English' },
  { key: 'coptic', label: 'Coptic' },
  { key: 'arabic', label: 'Arabic' },
];

function getAvailableLanguages(verses: BibleDisplayVerse[]): BibleLanguageKey[] {
  const hasCoptic = verses.some((verse) => verse.coptic);
  return hasCoptic ? ['english', 'coptic', 'arabic'] : ['english', 'arabic'];
}

function normalizeInitialLanguages(visibleLanguages: { english: boolean; coptic: boolean; arabic: boolean }) {
  return {
    arabic: Boolean(visibleLanguages.arabic),
    coptic: Boolean(visibleLanguages.coptic),
    english: visibleLanguages.english !== false,
  };
}

export default function BibleChapterDocument() {
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Width-aware, not just Platform.OS -- a narrow mobile-web browser should
  // get the same headerless, gesture-nav UI as the native app, same as
  // ServiceDocument.tsx/lectionary/index.tsx.
  const isMobileDocument = Platform.OS !== 'web' || screenWidth < MOBILE_WEB_BREAKPOINT;
  const selectorPanelWidth = isMobileDocument ? Math.round(screenWidth * 0.7) : Math.round(screenWidth * 0.5);
  const { bookKey, chapter, title, psalmNumbering: psalmNumberingParam } = useLocalSearchParams<{
    bookKey: string;
    chapter: string;
    title?: string;
    psalmNumbering?: PsalmNumbering;
  }>();
  const psalmNumbering: PsalmNumbering = psalmNumberingParam === 'masoretic' ? 'masoretic' : 'septuagint';
  const { preferences, isBookmarked, toggleBookmark } = useReadingPreferences();
  const { isFullscreen, toggle: toggleFullscreen, shouldShow: shouldShowFullscreen } = useBrowserFullscreen();
  const copticFontDataUri = useCopticFontDataUri();
  const bibleWebViewRef = useRef<BibleWebViewHandle>(null);

  const [book, setBook] = useState<BibleBook | null>(null);
  const [verses, setVerses] = useState<BibleDisplayVerse[] | null>(null);
  const [chapterKeys, setChapterKeys] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectorSlide] = useState(() => new Animated.Value(1));
  const [enabledLanguages, setEnabledLanguages] = useState(() => normalizeInitialLanguages(preferences.visibleLanguages));

  useEffect(() => {
    setEnabledLanguages(normalizeInitialLanguages(preferences.visibleLanguages));
  }, [preferences.visibleLanguages]);

  useEffect(() => {
    Animated.timing(selectorSlide, {
      toValue: isSelectorOpen ? 0 : 1,
      duration: 220,
      easing: isSelectorOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isSelectorOpen, selectorSlide]);

  useEffect(() => {
    if (!bookKey) return;
    getBibleBook(bookKey).then(setBook).catch((err) => setError(err.message));
    getBibleChapterKeys(bookKey, psalmNumbering).then(setChapterKeys).catch((err) => setError(err.message));
  }, [bookKey, psalmNumbering]);

  useEffect(() => {
    if (!bookKey || !chapter) return;
    setVerses(null);
    getDisplayedChapterVerses(bookKey, Number(chapter), psalmNumbering)
      .then(setVerses)
      .catch((err) => setError(err.message));
  }, [bookKey, chapter, psalmNumbering]);

  const availableLanguages = useMemo(() => getAvailableLanguages(verses || []), [verses]);
  const visibleLanguageKeys = availableLanguages.filter((language) => enabledLanguages[language]);
  const effectiveLanguageKeys = visibleLanguageKeys.length ? visibleLanguageKeys : [availableLanguages[0] || 'english'];
  const fontSize = fontScaleToPx(preferences.fontScale);
  const preface = book?.bookKey === 'psalms' ? getDisplayedPsalmPreface() : null;

  const chapterIndex = chapterKeys ? chapterKeys.indexOf(Number(chapter)) : -1;
  const previousChapter = chapterIndex > 0 ? chapterKeys![chapterIndex - 1] : null;
  const nextChapter = chapterIndex >= 0 && chapterKeys && chapterIndex < chapterKeys.length - 1 ? chapterKeys[chapterIndex + 1] : null;

  const chapterHtml = useMemo(() => {
    if (!verses || !copticFontDataUri) return null;
    return buildBibleChapterHtml({
      verses,
      languageKeys: effectiveLanguageKeys,
      fontSize,
      copticFontDataUri,
      selectText: preferences.selectText,
      isSlideshow: preferences.slideshowMode,
      preface,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verses, effectiveLanguageKeys.join(','), fontSize, copticFontDataUri, preferences.selectText, preferences.slideshowMode]);

  const bookmarkId = `bible:${book?.testament || ''}:${bookKey}:${chapter}`;
  const bookmarked = isBookmarked(bookmarkId);

  const goToChapter = useCallback(
    (targetChapter: number | null) => {
      if (!targetChapter) return;
      setIsSelectorOpen(false);
      router.setParams({ chapter: String(targetChapter) });
    },
    [router],
  );

  function selectVerse(verse: number) {
    setIsSelectorOpen(false);
    bibleWebViewRef.current?.selectVerse(verse);
  }

  function toggleLanguage(language: BibleLanguageKey) {
    setEnabledLanguages((current) => {
      const next = { ...current, [language]: !current[language] };
      const activeCount = availableLanguages.filter((item) => next[item]).length;
      return activeCount ? next : current;
    });
  }

  const goBackALevel = useCallback(() => {
    goBack(router, bookKey ? { pathname: '/bible/[bookKey]', params: { bookKey, title } } : '/bible');
  }, [router, bookKey, title]);

  const gesturePanResponder = useMemo(() => {
    const selectorEdgeWidth = Math.min(240, Math.max(128, screenWidth * 0.18));
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2;
        if (!isHorizontal) return false;
        const isBackSwipe = gestureState.x0 < 56 && gestureState.dx > 24;
        const isSelectorSwipe = !isSelectorOpen && gestureState.x0 > screenWidth - selectorEdgeWidth && gestureState.dx < -24;
        return isBackSwipe || isSelectorSwipe;
      },
      onPanResponderRelease: (_, gestureState) => {
        const selectorEdge = Math.min(240, Math.max(128, screenWidth * 0.18));
        if (gestureState.x0 < 56 && gestureState.dx > 60) {
          goBackALevel();
        } else if (!isSelectorOpen && gestureState.x0 > screenWidth - selectorEdge && gestureState.dx < -36) {
          setIsSelectorOpen(true);
        }
      },
    });
  }, [goBackALevel, screenWidth, isSelectorOpen]);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea} {...(isMobileDocument ? gesturePanResponder.panHandlers : {})}>
      <Head>
        <title>{`CHC ${title || bookKey || 'Bible'} ${chapter}`}</title>
      </Head>
      {/* Unlike every other document screen, the Bible reader's header is
          NEVER hidden -- not even natively -- because it's the only place
          showing the user which book/chapter they're actually reading. */}
      <AppHeader
        title={{ english: `${title || bookKey || ''} ${chapter}`, arabic: `الإصحاح ${chapter}` }}
        canGoBack
        onBack={goBackALevel}
        rightIcon="list-outline"
        rightAccessibilityLabel="Open verse selector"
        onRightPress={() => setIsSelectorOpen(true)}
        rightLeadingIcon={shouldShowFullscreen ? (isFullscreen ? 'close-fullscreen' : 'open-in-full') : undefined}
        onRightLeadingPress={shouldShowFullscreen ? toggleFullscreen : undefined}
      />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : !chapterHtml ? (
        <LoadingScreen />
      ) : (
        <View style={styles.verseScreen}>
          <BibleWebView
            ref={bibleWebViewRef}
            html={chapterHtml}
            scrollEnabled={!preferences.slideshowMode}
            onAction={(action) => {
              if (action.type === 'openSelector') setIsSelectorOpen(true);
              else if (action.type === 'previousLevel') goBackALevel();
            }}
          />

          <Modal
            animationType="none"
            transparent
            visible={isSelectorOpen}
            onRequestClose={() => setIsSelectorOpen(false)}
            supportedOrientations={MODAL_SUPPORTED_ORIENTATIONS}
          >
            <View style={styles.selectorOverlay}>
              <Pressable accessibilityLabel="Close verse selector" style={styles.selectorBackdrop} onPress={() => setIsSelectorOpen(false)} />
              <Animated.View style={[styles.selectorPanel, { width: selectorPanelWidth, paddingTop: insets.top, transform: [{ translateX: selectorSlide.interpolate({ inputRange: [0, 1], outputRange: [0, selectorPanelWidth] }) }] }]}>
                <View style={styles.selectorHeader}>
                  {preferences.appLanguage === 'ar' ? (
                    <Text style={[styles.selectorHeaderTitle, styles.selectorHeaderArabic]}>الآيات</Text>
                  ) : (
                    <Text style={styles.selectorHeaderTitle}>Verses</Text>
                  )}
                </View>

                <View style={styles.chapterNavRow}>
                  <ChapterNavButton disabled={!previousChapter} icon="chevron-back" label="Previous" onPress={() => goToChapter(previousChapter)} />
                  <ChapterNavButton disabled={!nextChapter} icon="chevron-forward" label="Next" onPress={() => goToChapter(nextChapter)} />
                </View>

                <View style={styles.selectorLanguageBar}>
                  {LANGUAGE_OPTIONS.filter((option) => availableLanguages.includes(option.key)).map((option) => (
                    <Pressable
                      key={option.key}
                      style={[
                        styles.languageButton,
                        { backgroundColor: enabledLanguages[option.key] ? COLORS.gold : COLORS.surface, borderColor: enabledLanguages[option.key] ? COLORS.gold : COLORS.border },
                      ]}
                      onPress={() => toggleLanguage(option.key)}
                    >
                      <Text style={[styles.languageText, { color: enabledLanguages[option.key] ? COLORS.black : COLORS.white }]}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>

                <ScrollView style={styles.selectorList}>
                  {(verses || []).map((verse) => (
                    <Pressable key={`selector-${verse.verseNumber}`} style={styles.selectorItem} onPress={() => selectVerse(verse.verseNumber)}>
                      <Text style={styles.selectorVerseNumber}>{verse.verseNumber}</Text>
                      <Text numberOfLines={1} style={styles.selectorVersePreview}>
                        {verse[(['english', 'coptic', 'arabic'] as BibleLanguageKey[]).find((l) => availableLanguages.includes(l) && enabledLanguages[l]) || availableLanguages[0]]}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <View style={styles.selectorActionRow}>
                  <Pressable accessibilityLabel="Bookmark chapter" style={styles.selectorIconButton} onPress={() => toggleBookmark(bookmarkId)}>
                    <Icon name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={25} color={COLORS.gold} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Open Bible settings"
                    style={styles.selectorIconButton}
                    onPress={() => {
                      setIsSelectorOpen(false);
                      router.push('/settings');
                    }}
                  >
                    <Icon name="settings-outline" size={25} color={COLORS.gold} />
                  </Pressable>
                </View>
              </Animated.View>
            </View>
          </Modal>
        </View>
      )}
    </SafeAreaView>
  );
}

function ChapterNavButton({ disabled, icon, label, onPress }: { disabled: boolean; icon: 'chevron-back' | 'chevron-forward'; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={`${label} chapter`}
      disabled={disabled}
      style={[styles.chapterNavButton, disabled && styles.chapterNavButtonDisabled]}
      onPress={onPress}
    >
      <Icon name={icon} size={20} color={disabled ? '#6E6E6E' : COLORS.gold} />
      <Text style={[styles.chapterNavText, { color: disabled ? '#6E6E6E' : COLORS.white }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { fontFamily: TYPOGRAPHY.body, color: COLORS.muted, fontSize: 17 },
  error: { fontFamily: TYPOGRAPHY.body, color: COLORS.priest, fontSize: 17 },
  verseScreen: { flex: 1 },
  selectorOverlay: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  selectorBackdrop: { flex: 1 },
  // Visual language matched to ContentSelectorDrawer (the normal document
  // reader's content selector) — same panel background/border, header
  // pattern (back button left, centered bilingual title), and card-style
  // list items, per the request to make the two selectors feel consistent.
  selectorPanel: {
    backgroundColor: '#050505',
    borderColor: 'rgba(201, 162, 39, 0.35)',
    borderLeftWidth: 1,
    paddingHorizontal: SPACING.md,
  },
  selectorHeader: {
    alignItems: 'center',
    backgroundColor: '#111111',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201, 162, 39, 0.28)',
    flexDirection: 'row',
    justifyContent: 'center',
    marginHorizontal: -SPACING.md,
    minHeight: 62,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  selectorHeaderTitle: { color: COLORS.gold, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '800' },
  selectorHeaderArabic: { fontFamily: 'Arial', textAlign: 'right', writingDirection: 'rtl' },
  chapterNavRow: { borderBottomColor: 'rgba(201, 162, 39, 0.18)', borderBottomWidth: 1, flexDirection: 'row', gap: SPACING.sm, paddingVertical: SPACING.sm },
  chapterNavButton: {
    alignItems: 'center',
    borderColor: 'rgba(201, 162, 39, 0.42)',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    justifyContent: 'center',
    minHeight: 42,
  },
  chapterNavButtonDisabled: { borderColor: 'rgba(110, 110, 110, 0.4)', opacity: 0.72 },
  chapterNavText: { fontFamily: TYPOGRAPHY.title, fontSize: 13, fontWeight: '800' },
  selectorLanguageBar: { borderBottomColor: 'rgba(201, 162, 39, 0.18)', borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, paddingVertical: SPACING.sm },
  languageButton: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  languageText: { fontFamily: TYPOGRAPHY.title, fontSize: 13, fontWeight: '700' },
  selectorList: { flex: 1, paddingTop: SPACING.md },
  selectorItem: {
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#262626',
    flexDirection: 'row',
    gap: SPACING.sm,
    minHeight: 56,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  selectorVerseNumber: { color: COLORS.gold, fontFamily: TYPOGRAPHY.title, fontSize: 15, fontWeight: '800', minWidth: 28 },
  selectorVersePreview: { flex: 1, fontFamily: 'Georgia', fontSize: 13, lineHeight: 18, color: COLORS.white },
  selectorActionRow: {
    alignItems: 'center',
    backgroundColor: '#101010',
    borderColor: 'rgba(201, 162, 39, 0.32)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: -SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
  selectorIconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(201, 162, 39, 0.06)',
    borderColor: 'rgba(201, 162, 39, 0.24)',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
});
