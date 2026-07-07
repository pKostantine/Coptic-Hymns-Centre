import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import Icon from '@/components/chc/ui/Icon';
import BibleWebView, { BibleWebViewHandle } from '@/components/chc/BibleWebView';
import { BibleDisplayVerse, BibleLanguageKey, buildBibleChapterHtml } from '@/components/chc/bibleDocumentHtml';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
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
import { goBack } from '@/utils/navigation';

const MIN_FONT_SCALE = 1;
const MAX_FONT_SCALE = 10;
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

/** Bible-specific font sizing (screen/column-width driven) — ported from BibleScreen.js's getRenderedFontSize, distinct from hymns' flat fontScaleToPx. */
function getRenderedFontSize(fontScale: number, screenWidth: number, screenHeight: number, columnWidth: number) {
  const normalizedScale = Math.min(Math.max(fontScale || MIN_FONT_SCALE, MIN_FONT_SCALE), MAX_FONT_SCALE);
  const deviceBase = Math.min(screenWidth || 390, screenHeight || 844);
  const columnBase = columnWidth || screenWidth || 390;
  const minRenderedFontSize = clamp(Math.round(Math.min(deviceBase * 0.052, columnBase * 0.075)), 14, 30);
  const maxRenderedFontSize = clamp(Math.round(Math.min(deviceBase * 0.105, columnBase * 0.14)), 24, 72);
  const step = (maxRenderedFontSize - minRenderedFontSize) / (MAX_FONT_SCALE - MIN_FONT_SCALE);
  return Math.round(minRenderedFontSize + (normalizedScale - 1) * step);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function BibleChapterDocument() {
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
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
  const [enabledLanguages, setEnabledLanguages] = useState(() => normalizeInitialLanguages(preferences.visibleLanguages));

  useEffect(() => {
    setEnabledLanguages(normalizeInitialLanguages(preferences.visibleLanguages));
  }, [preferences.visibleLanguages]);

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
  const columnWidth = Math.max(
    (screenWidth - SPACING.md * 2 - SPACING.md * Math.max(effectiveLanguageKeys.length - 1, 0)) / Math.max(effectiveLanguageKeys.length, 1),
    1,
  );
  const fontSize = getRenderedFontSize(preferences.fontScale, screenWidth, screenHeight, columnWidth);
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

  const gesturePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.x0 < 56 && gestureState.dx > 24 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2,
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.x0 < 56 && gestureState.dx > 60) goBackALevel();
        },
      }),
    [goBackALevel],
  );

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea} {...gesturePanResponder.panHandlers}>
      <Head>
        <title>{`CHC ${title || bookKey || 'Bible'} ${chapter}`}</title>
      </Head>
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
        <View style={styles.center}>
          <Text style={styles.loading}>Loading…</Text>
        </View>
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

          <Modal animationType="none" transparent visible={isSelectorOpen} onRequestClose={() => setIsSelectorOpen(false)}>
            <View style={styles.selectorOverlay}>
              <Pressable accessibilityLabel="Close verse selector" style={styles.selectorBackdrop} onPress={() => setIsSelectorOpen(false)} />
              <View style={styles.selectorPanel}>
                <View style={styles.selectorHeader}>
                  <View style={styles.selectorHeaderTitleGroup}>
                    <Text style={styles.selectorHeaderTitle}>Verses</Text>
                    <Text style={[styles.selectorHeaderTitle, styles.selectorHeaderArabic]}>الآيات</Text>
                  </View>
                  <Pressable accessibilityLabel="Close verse selector" style={styles.selectorCloseButton} onPress={() => setIsSelectorOpen(false)}>
                    <Icon name="chevron-back" size={22} color={COLORS.gold} />
                  </Pressable>
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
                    <Icon name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={22} color={COLORS.gold} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Open Bible settings"
                    style={styles.selectorIconButton}
                    onPress={() => {
                      setIsSelectorOpen(false);
                      router.push('/settings');
                    }}
                  >
                    <Icon name="settings-outline" size={22} color={COLORS.gold} />
                  </Pressable>
                </View>
              </View>
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
  selectorPanel: {
    width: '75%',
    maxWidth: 340,
    backgroundColor: '#050505',
    borderLeftWidth: 1,
    borderColor: 'rgba(201, 162, 39, 0.35)',
  },
  selectorHeader: {
    alignItems: 'center',
    borderBottomColor: 'rgba(201, 162, 39, 0.28)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 54,
    paddingLeft: SPACING.md,
  },
  selectorHeaderTitleGroup: { flex: 1, flexDirection: 'row', gap: SPACING.sm },
  selectorHeaderTitle: { color: COLORS.white, flex: 1, fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '800' },
  selectorHeaderArabic: { fontFamily: 'Arial', textAlign: 'right', writingDirection: 'rtl' },
  selectorCloseButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  chapterNavRow: { borderBottomColor: 'rgba(201, 162, 39, 0.18)', borderBottomWidth: 1, flexDirection: 'row', gap: SPACING.sm, padding: SPACING.sm },
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
  selectorLanguageBar: { borderBottomColor: 'rgba(201, 162, 39, 0.18)', borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, padding: SPACING.sm },
  languageButton: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  languageText: { fontFamily: TYPOGRAPHY.title, fontSize: 13, fontWeight: '700' },
  selectorList: { flex: 1 },
  selectorItem: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    minHeight: 42,
    paddingHorizontal: SPACING.md,
  },
  selectorVerseNumber: { color: COLORS.gold, fontFamily: TYPOGRAPHY.title, fontSize: 15, fontWeight: '800', minWidth: 28 },
  selectorVersePreview: { flex: 1, fontFamily: 'Georgia', fontSize: 13, lineHeight: 18, color: COLORS.white },
  selectorActionRow: {
    backgroundColor: '#101010',
    borderTopColor: 'rgba(201, 162, 39, 0.32)',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  selectorIconButton: {
    alignItems: 'center',
    borderColor: 'rgba(201, 162, 39, 0.42)',
    borderRadius: 18,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
});
