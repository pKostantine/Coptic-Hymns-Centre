import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
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
  getBibleChapterHeaderTitle,
  getBibleBook,
  getBibleChapterKeys,
  getBibleVerseDisplayLabel,
  getDisplayedChapterVerses,
  getDisplayedPsalmPreface,
  PsalmNumbering,
} from '@/utils/bibleService';
import { useCopticFontDataUri } from '@/utils/useCopticFontDataUri';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';
import { fontScaleToPx, type AppLanguage } from '@/utils/preferencesStorage';
import { MODAL_SUPPORTED_ORIENTATIONS } from '@/utils/modalOrientations';
import { goBack } from '@/utils/navigation';

type EnabledBibleLanguages = Record<BibleLanguageKey, boolean>;
type LoadedBibleVerses = { requestKey: string; verses: BibleDisplayVerse[] };

const LANGUAGE_OPTIONS: { key: BibleLanguageKey; label: { english: string; arabic: string } }[] = [
  { key: 'english', label: { english: 'English', arabic: 'الإنجليزية' } },
  { key: 'englishFromCoptic', label: { english: 'English (from Coptic)', arabic: 'الإنجليزية (من القبطية)' } },
  { key: 'coptic', label: { english: 'Coptic', arabic: 'القبطية' } },
  { key: 'greek', label: { english: 'Greek', arabic: 'اليونانية' } },
  { key: 'arabic', label: { english: 'Arabic', arabic: 'العربية' } },
  { key: 'arabicFromCoptic', label: { english: 'Arabic (from Coptic)', arabic: 'العربية (من القبطية)' } },
];

const PSALMS_BOOK_KEY = 'psalms';

const TESTAMENT_ROUTE_LABELS: Record<BibleBook['testament'], { title: string; arabic: string }> = {
  OT: { title: 'Old Testament', arabic: 'العهد القديم' },
  NT: { title: 'New Testament', arabic: 'العهد الجديد' },
};

const SELECTOR_TEXT: Record<AppLanguage, {
  verses: string;
  previous: string;
  previousChapter: string;
  next: string;
  nextChapter: string;
  openSelector: string;
  closeSelector: string;
  bookmarkChapter: string;
  openBibleSettings: string;
}> = {
  en: {
    verses: 'Verses',
    previous: 'Previous',
    previousChapter: 'Previous chapter',
    next: 'Next',
    nextChapter: 'Next chapter',
    openSelector: 'Open verse selector',
    closeSelector: 'Close verse selector',
    bookmarkChapter: 'Bookmark chapter',
    openBibleSettings: 'Open Bible settings',
  },
  ar: {
    verses: 'الآيات',
    previous: 'السابق',
    previousChapter: 'الإصحاح السابق',
    next: 'التالي',
    nextChapter: 'الإصحاح التالي',
    openSelector: 'فتح محدد الآيات',
    closeSelector: 'إغلاق محدد الآيات',
    bookmarkChapter: 'حفظ الإصحاح',
    openBibleSettings: 'فتح إعدادات الكتاب المقدس',
  },
};

function getAvailableLanguages(verses: BibleDisplayVerse[], bookKey: string | null | undefined): BibleLanguageKey[] {
  const isPsalms = bookKey === PSALMS_BOOK_KEY;
  const languages: BibleLanguageKey[] = ['english'];
  if (isPsalms && verses.some((verse) => String(verse.englishFromCoptic || '').trim())) languages.push('englishFromCoptic');
  if (verses.some((verse) => String(verse.coptic || '').trim())) languages.push('coptic');
  if (verses.some((verse) => String(verse.greek || '').trim())) languages.push('greek');
  languages.push('arabic');
  if (isPsalms && verses.some((verse) => String(verse.arabicFromCoptic || '').trim())) languages.push('arabicFromCoptic');
  return languages;
}

function isArabicBibleLanguage(language: BibleLanguageKey): boolean {
  return language === 'arabic' || language === 'arabicFromCoptic';
}

function getBibleLanguageLabel(language: BibleLanguageKey, appLanguage: AppLanguage): string {
  const option = LANGUAGE_OPTIONS.find((item) => item.key === language);
  return appLanguage === 'ar' ? option?.label.arabic || language : option?.label.english || language;
}

function getVersePreviewLanguage(
  verse: BibleDisplayVerse,
  appLanguage: AppLanguage,
  availableLanguages: BibleLanguageKey[],
  enabledLanguages: EnabledBibleLanguages,
): BibleLanguageKey {
  const primaryLanguages: BibleLanguageKey[] = appLanguage === 'ar'
    ? ['arabic', 'arabicFromCoptic', 'english', 'englishFromCoptic', 'coptic', 'greek']
    : ['english', 'englishFromCoptic', 'arabic', 'arabicFromCoptic', 'coptic', 'greek'];
  const orderedLanguages = [
    ...primaryLanguages,
    ...availableLanguages.filter((language) => !primaryLanguages.includes(language)),
  ];
  const enabledWithText = orderedLanguages.find((language) =>
    availableLanguages.includes(language) && enabledLanguages[language] && String(verse[language] || '').trim()
  );
  if (enabledWithText) return enabledWithText;

  const enabledFallback = orderedLanguages.find((language) => availableLanguages.includes(language) && enabledLanguages[language]);
  if (enabledFallback) return enabledFallback;

  return availableLanguages.find((language) => String(verse[language] || '').trim()) || availableLanguages[0] || 'english';
}

export default function BibleChapterDocument() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Width-aware, not just Platform.OS -- a narrow mobile-web browser should
  // get the same headerless, gesture-nav UI as the native app, same as
  // ServiceDocument.tsx/lectionary/index.tsx.
  const isMobileDocument = Platform.OS !== 'web' || screenWidth < MOBILE_WEB_BREAKPOINT;
  const selectorPanelWidth = isMobileDocument ? Math.round(screenWidth * 0.7) : Math.round(screenWidth * 0.5);
  const { bookKey, chapter, title, arabic, psalmNumbering: psalmNumberingParam } = useLocalSearchParams<{
    bookKey: string;
    chapter: string;
    title?: string;
    arabic?: string;
    psalmNumbering?: PsalmNumbering;
  }>();
  const psalmNumbering: PsalmNumbering = psalmNumberingParam === 'masoretic' ? 'masoretic' : 'septuagint';
  const { preferences, isBookmarked, toggleBookmark, setBibleVisibleLanguages } = useReadingPreferences();
  const { isFullscreen, toggle: toggleFullscreen, shouldShow: shouldShowFullscreen } = useBrowserFullscreen();
  const copticFontDataUri = useCopticFontDataUri();
  const bibleWebViewRef = useRef<BibleWebViewHandle>(null);

  const [book, setBook] = useState<BibleBook | null>(null);
  const [loadedVerses, setLoadedVerses] = useState<LoadedBibleVerses | null>(null);
  const [chapterKeys, setChapterKeys] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectorSlide] = useState(() => new Animated.Value(1));
  const enabledLanguages = preferences.bibleVisibleLanguages;

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
    let cancelled = false;
    const requestKey = `${bookKey}:${chapter}:${psalmNumbering}`;
    getDisplayedChapterVerses(bookKey, Number(chapter), psalmNumbering)
      .then((nextVerses) => {
        if (!cancelled) setLoadedVerses({ requestKey, verses: nextVerses });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [bookKey, chapter, psalmNumbering]);

  const verseRequestKey = bookKey && chapter ? `${bookKey}:${chapter}:${psalmNumbering}` : '';
  const verses = loadedVerses?.requestKey === verseRequestKey ? loadedVerses.verses : null;
  const availableLanguages = useMemo(() => getAvailableLanguages(verses || [], bookKey), [verses, bookKey]);
  const visibleLanguageKeys = useMemo(() => availableLanguages.filter((language) => enabledLanguages[language]), [availableLanguages, enabledLanguages]);
  const effectiveLanguageKeys = useMemo(
    () => (visibleLanguageKeys.length ? visibleLanguageKeys : [availableLanguages[0] || 'english']),
    [availableLanguages, visibleLanguageKeys],
  );
  const fontSize = fontScaleToPx(preferences.fontScale);
  const currentChapterNumber = Number(chapter);
  const headerTitleEnglish = getBibleChapterHeaderTitle(book, title, arabic, bookKey, currentChapterNumber, 'en');
  const headerTitleArabic = getBibleChapterHeaderTitle(book, title, arabic, bookKey, currentChapterNumber, 'ar');
  const preface = book?.bookKey === 'psalms' ? getDisplayedPsalmPreface() : null;
  const selectorText = SELECTOR_TEXT[preferences.appLanguage];
  const effectiveSelectText = preferences.selectText && !preferences.slideshowMode;

  const chapterIndex = chapterKeys ? chapterKeys.indexOf(currentChapterNumber) : -1;
  const previousChapter = chapterIndex > 0 ? chapterKeys![chapterIndex - 1] : null;
  const nextChapter = chapterIndex >= 0 && chapterKeys && chapterIndex < chapterKeys.length - 1 ? chapterKeys[chapterIndex + 1] : null;
  const chapterListLoaded = chapterKeys !== null;
  const chapterCount = chapterKeys?.length || 0;

  const chapterHtml = useMemo(() => {
    if (!verses || !copticFontDataUri) return null;
    return buildBibleChapterHtml({
      verses,
      languageKeys: effectiveLanguageKeys,
      fontSize,
      copticFontDataUri,
      selectText: effectiveSelectText,
      isSlideshow: preferences.slideshowMode,
      preface,
    });
  }, [verses, effectiveLanguageKeys, fontSize, copticFontDataUri, effectiveSelectText, preferences.slideshowMode, preface]);

  const bookmarkId = `bible:${book?.testament || ''}:${bookKey}:${chapter}`;
  const bookmarked = isBookmarked(bookmarkId);

  const goToChapter = useCallback(
    (targetChapter: number | null) => {
      if (targetChapter === null) return;
      setIsSelectorOpen(false);
      router.setParams({ chapter: String(targetChapter) });
    },
    [router],
  );

  function selectVerse(verse: number | string) {
    setIsSelectorOpen(false);
    bibleWebViewRef.current?.selectVerse(verse);
  }

  function toggleLanguage(language: BibleLanguageKey) {
    const next = { ...enabledLanguages, [language]: !enabledLanguages[language] };
    const activeCount = availableLanguages.filter((item) => next[item]).length;
    if (activeCount) setBibleVisibleLanguages(next);
  }

  const goBackALevel = useCallback(() => {
    const chapterGridFallback: Href = bookKey
      ? {
          pathname: '/bible/[bookKey]',
          params: { bookKey, title: book?.titleEnglish || title, arabic: book?.titleArabic || arabic },
        }
      : '/bible';
    const testamentFallback: Href = book?.testament
      ? {
          pathname: '/bible/[bookKey]',
          params: {
            bookKey: book.testament,
            title: TESTAMENT_ROUTE_LABELS[book.testament].title,
            arabic: TESTAMENT_ROUTE_LABELS[book.testament].arabic,
          },
        }
      : '/bible';

    const fallbackHref: Href = !chapterListLoaded ? '/bible' : chapterCount === 1 ? testamentFallback : chapterGridFallback;
    goBack(router, fallbackHref);
  }, [router, bookKey, title, arabic, book, chapterListLoaded, chapterCount]);

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
        <title>{`CHC ${headerTitleEnglish || 'Bible'}`}</title>
      </Head>
      {/* Unlike every other document screen, the Bible reader's header is
          NEVER hidden -- not even natively -- because it's the only place
          showing the user which book/chapter they're actually reading. */}
      <AppHeader
        title={{ english: headerTitleEnglish, arabic: headerTitleArabic }}
        canGoBack
        onBack={goBackALevel}
        rightIcon="list-outline"
        rightAccessibilityLabel={selectorText.openSelector}
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
            selectText={effectiveSelectText}
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
              <Pressable accessibilityLabel={selectorText.closeSelector} style={styles.selectorBackdrop} onPress={() => setIsSelectorOpen(false)} />
              <Animated.View style={[styles.selectorPanel, { width: selectorPanelWidth, paddingTop: insets.top, transform: [{ translateX: selectorSlide.interpolate({ inputRange: [0, 1], outputRange: [0, selectorPanelWidth] }) }] }]}>
                <View style={styles.selectorHeader}>
                  {preferences.appLanguage === 'ar' ? (
                    <Text style={[styles.selectorHeaderTitle, styles.selectorHeaderArabic]}>{selectorText.verses}</Text>
                  ) : (
                    <Text style={styles.selectorHeaderTitle}>{selectorText.verses}</Text>
                  )}
                </View>

                <View style={styles.chapterNavRow}>
                  <ChapterNavButton
                    accessibilityLabel={selectorText.previousChapter}
                    appLanguage={preferences.appLanguage}
                    disabled={previousChapter === null}
                    icon="chevron-back"
                    label={selectorText.previous}
                    onPress={() => goToChapter(previousChapter)}
                  />
                  <ChapterNavButton
                    accessibilityLabel={selectorText.nextChapter}
                    appLanguage={preferences.appLanguage}
                    disabled={nextChapter === null}
                    icon="chevron-forward"
                    label={selectorText.next}
                    onPress={() => goToChapter(nextChapter)}
                  />
                </View>

                <View style={styles.selectorLanguageBar}>
                  {LANGUAGE_OPTIONS.filter((option) => availableLanguages.includes(option.key)).map((option) => {
                    const languageLabel = getBibleLanguageLabel(option.key, preferences.appLanguage);
                    return (
                      <Pressable
                        accessibilityLabel={languageLabel}
                        key={option.key}
                        style={[
                          styles.languageButton,
                          { backgroundColor: enabledLanguages[option.key] ? COLORS.gold : COLORS.surface, borderColor: enabledLanguages[option.key] ? COLORS.gold : COLORS.border },
                        ]}
                        onPress={() => toggleLanguage(option.key)}
                      >
                        <Text style={[styles.languageText, preferences.appLanguage === 'ar' && styles.languageTextArabic, { color: enabledLanguages[option.key] ? COLORS.black : COLORS.white }]}>
                          {languageLabel}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <ScrollView style={styles.selectorList}>
                  {(verses || []).map((verse) => {
                    const previewLanguage = getVersePreviewLanguage(verse, preferences.appLanguage, availableLanguages, enabledLanguages);
                    const isPsalmIntroduction = Boolean(verse.isPsalmIntroduction);
                    return (
                      <Pressable key={`selector-${verse.verseNumber}`} style={styles.selectorItem} onPress={() => selectVerse(verse.verseNumber)}>
                        <Text
                          style={[
                            styles.selectorVerseNumber,
                            verse.isLxxAddition && styles.selectorVerseNumberLxx,
                            isPsalmIntroduction && styles.selectorVerseNumberIntro,
                          ]}
                        >
                          {isPsalmIntroduction ? '' : getBibleVerseDisplayLabel(verse.verseNumber, preferences.appLanguage)}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.selectorVersePreview,
                            isArabicBibleLanguage(previewLanguage) && styles.selectorVersePreviewArabic,
                            previewLanguage === 'coptic' && styles.selectorVersePreviewCoptic,
                            isPsalmIntroduction && styles.selectorVersePreviewIntro,
                          ]}
                        >
                          {verse[previewLanguage]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <View style={styles.selectorActionRow}>
                  <Pressable accessibilityLabel={selectorText.bookmarkChapter} style={styles.selectorIconButton} onPress={() => toggleBookmark(bookmarkId)}>
                    <Icon name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={25} color={COLORS.gold} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={selectorText.openBibleSettings}
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

function ChapterNavButton({
  accessibilityLabel,
  appLanguage,
  disabled,
  icon,
  label,
  onPress,
}: {
  accessibilityLabel: string;
  appLanguage: AppLanguage;
  disabled: boolean;
  icon: 'chevron-back' | 'chevron-forward';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      style={[styles.chapterNavButton, disabled && styles.chapterNavButtonDisabled]}
      onPress={onPress}
    >
      <Icon name={icon} size={20} color={disabled ? '#6E6E6E' : COLORS.gold} />
      <Text style={[styles.chapterNavText, appLanguage === 'ar' && styles.chapterNavTextArabic, { color: disabled ? '#6E6E6E' : COLORS.white }]}>{label}</Text>
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
  chapterNavTextArabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  selectorLanguageBar: { borderBottomColor: 'rgba(201, 162, 39, 0.18)', borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, paddingVertical: SPACING.sm },
  languageButton: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  languageText: { fontFamily: TYPOGRAPHY.title, fontSize: 13, fontWeight: '700' },
  languageTextArabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
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
  selectorVerseNumberLxx: { color: COLORS.priest },
  selectorVerseNumberIntro: { color: COLORS.refrain },
  selectorVersePreview: { flex: 1, fontFamily: 'Georgia', fontSize: 13, lineHeight: 18, color: COLORS.white },
  selectorVersePreviewArabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  selectorVersePreviewCoptic: { fontFamily: TYPOGRAPHY.coptic },
  selectorVersePreviewIntro: { color: COLORS.refrain, fontStyle: 'italic' },
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
