import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import AppHeader from '@/components/chc/ui/AppHeader';
import HymnCard from '@/components/chc/ui/HymnCard';
import LoadingScreen from '@/components/chc/ui/LoadingScreen';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { getBibleBooks, getBibleChapterDisplayLabel, getBibleChapterKeys, getBibleSpecialChapterTitle, isEstherAdditionChapter, PsalmNumbering } from '@/utils/bibleService';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';
import { goBack } from '@/utils/navigation';

const CHIP_SIZE = 58;

const PSALM_NUMBERING_OPTIONS: { key: PsalmNumbering; label: string; arabic: string }[] = [
  { key: 'septuagint', label: 'Septuagint', arabic: 'السبعيني' },
  { key: 'masoretic', label: 'Masoretic', arabic: 'العبري' },
];

export default function BibleNestedList() {
  const router = useRouter();
  const { bookKey, title, arabic } = useLocalSearchParams<{ bookKey: string; title?: string; arabic?: string }>();
  const { isFullscreen, toggle: toggleFullscreen, shouldShow: shouldShowFullscreen } = useBrowserFullscreen();
  const { preferences } = useReadingPreferences();
  const showEnglish = preferences.appLanguage === 'en';
  const showArabic = preferences.appLanguage === 'ar';
  const testament = bookKey === 'OT' || bookKey === 'NT' ? bookKey : null;
  const isPsalms = bookKey === 'psalms';
  const isEsther = bookKey === 'esther';
  const [books, setBooks] = useState<Awaited<ReturnType<typeof getBibleBooks>> | null>(null);
  const [chapters, setChapters] = useState<number[] | null>(null);
  const [psalmNumbering, setPsalmNumbering] = useState<PsalmNumbering>('septuagint');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookKey) return;
    setBooks(null);
    setError(null);

    if (testament) {
      getBibleBooks()
        .then((allBooks) => setBooks(allBooks.filter((book) => book.testament === testament).sort((a, b) => a.bookOrder - b.bookOrder)))
        .catch((err) => setError(err.message));
    }
  }, [bookKey, testament]);

  useEffect(() => {
    if (!bookKey || testament) return;
    setChapters(null);
    setError(null);
    getBibleChapterKeys(bookKey, psalmNumbering)
      .then(setChapters)
      .catch((err) => setError(err.message));
  }, [bookKey, testament, psalmNumbering]);

  return (
    <View style={styles.screen}>
      <Head>
        <title>{`CHC ${title || bookKey || 'Bible'}`}</title>
      </Head>
      <AppHeader
        title={{ english: title || bookKey || '', arabic: arabic || '' }}
        canGoBack
        onBack={() => goBack(router, '/bible')}
        visibleLanguages={{ english: showEnglish, arabic: showArabic }}
        rightLeadingIcon={shouldShowFullscreen ? (isFullscreen ? 'close-fullscreen' : 'open-in-full') : undefined}
        onRightLeadingPress={shouldShowFullscreen ? toggleFullscreen : undefined}
      />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : testament ? (
        !books ? (
          <LoadingScreen />
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {books.map((book) => (
              <HymnCard
                key={book.bookKey}
                title={book.titleEnglish}
                arabic={book.titleArabic}
                showEnglish={showEnglish}
                showArabic={showArabic}
                onPress={() =>
                  router.push({
                    pathname: '/bible/[bookKey]',
                    params: { bookKey: book.bookKey, title: book.titleEnglish, arabic: book.titleArabic },
                  })
                }
              />
            ))}
          </ScrollView>
        )
      ) : !chapters ? (
        <LoadingScreen />
      ) : (
        <ScrollView contentContainerStyle={styles.chapterContent}>
          {isPsalms ? (
            <View style={styles.psalmNumberingDeck}>
              {PSALM_NUMBERING_OPTIONS.map((option) => {
                const isSelected = psalmNumbering === option.key;
                const label = showArabic ? option.arabic : option.label;
                return (
                  <Pressable
                    key={option.key}
                    accessibilityLabel={label}
                    style={[
                      styles.psalmNumberingButton,
                      { backgroundColor: isSelected ? COLORS.gold : COLORS.surface, borderColor: isSelected ? COLORS.gold : COLORS.border },
                    ]}
                    onPress={() => setPsalmNumbering(option.key)}
                  >
                    <Text style={[styles.psalmNumberingText, showArabic && styles.psalmNumberingArabic, { color: isSelected ? COLORS.black : COLORS.white }]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {isEsther ? (
            <View style={styles.estherDisclaimer}>
              {showArabic ? (
                <Text style={[styles.estherDisclaimerText, styles.estherDisclaimerArabic]}>
                  الأصحاحات والآيات الملوَّنة باللون الأحمر لا تَرِد إلا في مخطوطات الترجمة السبعينية اليونانية، وتظهر فيها كإضافة إلى سفر أستير.
                </Text>
              ) : (
                <Text style={styles.estherDisclaimerText}>
                  Chapters and verses coloured red occur only in the Greek Septuagint (LXX) manuscripts and appear there as an addition to the Book of Esther.
                </Text>
              )}
            </View>
          ) : null}
          <View style={styles.grid}>
            {chapters.map((chapterNumber) => {
              const isSpecialChapter = Boolean(getBibleSpecialChapterTitle(bookKey, chapterNumber));
              const isLxxAdditionChapter = isEstherAdditionChapter(bookKey, chapterNumber);
              const chapterLabel = getBibleChapterDisplayLabel(bookKey, chapterNumber, preferences.appLanguage);

              return (
                <Pressable
                  key={chapterNumber}
                  accessibilityLabel={chapterLabel}
                  style={({ pressed }) => [
                    styles.chip,
                    isSpecialChapter && styles.namedChip,
                    isLxxAdditionChapter && styles.lxxAdditionChip,
                    pressed && styles.chipPressed,
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: '/bible/[bookKey]/[chapter]',
                      params: {
                        bookKey: bookKey!,
                        chapter: String(chapterNumber),
                        title: title || bookKey || '',
                        arabic: arabic || '',
                        psalmNumbering: isPsalms ? psalmNumbering : undefined,
                      },
                    })
                  }
                >
                  <Text
                    numberOfLines={isSpecialChapter ? 2 : 1}
                    style={[
                      styles.chipText,
                      isSpecialChapter && styles.namedChipText,
                      isSpecialChapter && showArabic && styles.namedChipArabic,
                      isLxxAdditionChapter && styles.lxxAdditionChipText,
                    ]}
                  >
                    {chapterLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  loading: { fontFamily: TYPOGRAPHY.body, color: COLORS.muted, fontSize: 17 },
  error: { fontFamily: TYPOGRAPHY.body, color: COLORS.priest, fontSize: 17, textAlign: 'center' },
  list: { padding: SPACING.md, paddingBottom: SPACING.xl },
  chapterContent: { padding: SPACING.md, paddingBottom: SPACING.xl },
  psalmNumberingDeck: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  psalmNumberingButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  psalmNumberingText: { fontFamily: TYPOGRAPHY.title, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  psalmNumberingArabic: { fontFamily: 'Arial', fontSize: 14, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  estherDisclaimer: {
    backgroundColor: 'rgba(214, 69, 69, 0.08)',
    borderColor: 'rgba(214, 69, 69, 0.42)',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  estherDisclaimerText: {
    color: COLORS.priest,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  estherDisclaimerArabic: {
    fontFamily: TYPOGRAPHY.arabic,
    fontSize: 15,
    lineHeight: 23,
    writingDirection: 'rtl',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    justifyContent: 'center',
  },
  chip: {
    width: CHIP_SIZE,
    height: CHIP_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.xs,
  },
  namedChip: {
    width: 206,
    height: CHIP_SIZE,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  chipPressed: {
    backgroundColor: COLORS.surfaceSoft,
    borderColor: COLORS.goldLine,
  },
  lxxAdditionChip: {
    borderColor: 'rgba(214, 69, 69, 0.72)',
  },
  chipText: {
    fontFamily: TYPOGRAPHY.title,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.gold,
    textAlign: 'center',
  },
  lxxAdditionChipText: {
    color: COLORS.priest,
  },
  namedChipText: {
    fontSize: 13,
    lineHeight: 16,
  },
  namedChipArabic: {
    fontFamily: TYPOGRAPHY.arabic,
    fontSize: 14,
    lineHeight: 19,
    writingDirection: 'rtl',
  },
});
