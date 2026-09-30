'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import BibleTestamentMenu from '@/components/chc/screens/BibleTestamentMenu';
import BookPage from '@/components/chc/screens/BookPage';
import LoadingScreen from '@/components/chc/ui/LoadingScreen';
import { TESTAMENTS } from '@/constants/bibleTestaments';
import { appText, tr } from '@/utils/appText';
import { getBookTheme } from '@/constants/bookTheme';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { getBibleBook, getBibleChapterDisplayLabel, getBibleChapterKeys, getBibleSpecialChapterTitle, getCachedBibleChapterKeys, isBibleLxxAdditionChapter, PsalmNumbering, type BibleBook } from '@/utils/bibleService';
import { goBack } from '@/utils/navigation';

const CHIP_SIZE = 58;

type LoadedBibleChapters = { requestKey: string; chapters: number[] };
type BibleLoadError = { requestKey: string; message: string };

const PSALM_NUMBERING_OPTIONS: { key: PsalmNumbering; label: string; arabic: string; french?: string }[] = [
  { key: 'septuagint', label: 'Septuagint', arabic: 'السبعيني', french: 'Septante' },
  { key: 'masoretic', label: 'Masoretic', arabic: 'العبري', french: 'Massorétique' },
];

/** `/bible/OT` and `/bible/NT` list a testament's books; any other key is a book, and lists its chapters. */
export default function BibleNestedList() {
  const { bookKey } = useLocalSearchParams<{ bookKey: string }>();
  if (bookKey === 'OT' || bookKey === 'NT') return <BibleTestamentMenu testament={bookKey} />;
  return <BibleChapterList key={bookKey} bookKey={bookKey ?? ''} />;
}

/** A book's chapters as a grid of numbers, under a band in its testament's bronze. */
function BibleChapterList({ bookKey }: { bookKey: string }) {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const showArabic = preferences.appLanguage === 'ar';
  const isPsalms = bookKey === 'psalms';
  const isEsther = bookKey === 'esther';
  const [loadedBook, setLoadedBook] = useState<BibleBook | null>(null);
  const [loadedChapters, setLoadedChapters] = useState<LoadedBibleChapters | null>(null);
  const [psalmNumbering, setPsalmNumbering] = useState<PsalmNumbering>('septuagint');
  const [loadError, setLoadError] = useState<BibleLoadError | null>(null);

  const chaptersRequestKey = `chapters:${bookKey}:${psalmNumbering}`;
  const chapters = loadedChapters?.requestKey === chaptersRequestKey
    ? loadedChapters.chapters
    : getCachedBibleChapterKeys(bookKey, psalmNumbering);
  const error = loadError?.requestKey === chaptersRequestKey ? loadError.message : null;

  useEffect(() => {
    let cancelled = false;
    const requestKey = `chapters:${bookKey}:${psalmNumbering}`;

    getBibleChapterKeys(bookKey, psalmNumbering)
      .then((nextChapters) => {
        if (!cancelled) setLoadedChapters({ requestKey, chapters: nextChapters });
      })
      .catch((err) => {
        if (!cancelled) setLoadError({ requestKey, message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [bookKey, psalmNumbering]);

  useEffect(() => {
    getBibleBook(bookKey).then(setLoadedBook).catch((err) => setLoadError({ requestKey: `book:${bookKey}`, message: err.message }));
  }, [bookKey]);

  useEffect(() => {
    if (!chapters || chapters.length !== 1) return;
    router.replace({
      pathname: '/bible/[bookKey]/[chapter]',
      params: {
        bookKey,
        chapter: String(chapters[0]),
        numbering: isPsalms ? psalmNumbering : undefined,
      },
    });
  }, [bookKey, chapters, isPsalms, psalmNumbering, router]);

  const title = { english: loadedBook?.titleEnglish || bookKey, arabic: loadedBook?.titleArabic || '', french: loadedBook?.titleFrench || '' };
  const testament = loadedBook ? TESTAMENTS[loadedBook.testament] : null;
  const theme = testament?.theme ?? getBookTheme('bible');
  // The chapters are gold on the page's navy, as the rest of the Bible's pages are.
  const accent = COLORS.gold;

  // A one-chapter book opens straight onto its text; until then (or while
  // the chapter list loads) the page holds the splash rather than an empty grid.
  if (!error && (!chapters || chapters.length === 1)) {
    return (
      <SafeAreaView edges={Platform.OS === 'web' ? ['left', 'right', 'bottom'] : []} style={styles.screen}>
        <AppHeader title={title} canGoBack onBack={() => goBack(router, '/bible')} tint={theme.gradient[0]} titleVisible={false} />
        <View style={styles.loadingArea}>
          <LoadingScreen />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <BookPage
      title={title}
      kicker={testament ? appText(testament) : undefined}
      arabic={showArabic}
      backHref={loadedBook ? `/bible/${loadedBook.testament}` : '/bible'}
      action={{ icon: 'search-outline', label: tr('Search the Bible', 'Rechercher dans la Bible', 'ابحث في الكتاب المقدس'), onPress: () => router.push('/bible/search') }}
      padded
    >
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <>
          {isPsalms ? (
            <View style={[styles.segmented, { borderColor: `${accent}33` }, showArabic && styles.rowReverse]}>
              {PSALM_NUMBERING_OPTIONS.map((option) => {
                const isSelected = psalmNumbering === option.key;
                const label = showArabic ? option.arabic : option.label;
                return (
                  <Pressable
                    key={option.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={label}
                    style={[styles.segment, isSelected && { backgroundColor: accent }]}
                    onPress={() => setPsalmNumbering(option.key)}
                  >
                    <Text style={[styles.segmentText, showArabic && styles.segmentArabic, { color: isSelected ? COLORS.navyDark : accent }]}>
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
                  الأصحاحات والآيات الملوَّنة باللون الأحمر لا تَرِد إلا في مخطوطات الترجمة السبعينية اليونانية، وتظهر فيها كإضافة إلى سفر أستير.
                </Text>
              ) : (
                <Text style={styles.estherDisclaimerText}>
                  Chapters and verses coloured red occur only in the Greek Septuagint (LXX) manuscripts and appear there as an addition to the Book of Esther.
                </Text>
              )}
            </View>
          ) : null}
          <View style={[styles.grid, showArabic && styles.rowReverse]}>
            {chapters!.map((chapterNumber) => {
              const isSpecialChapter = Boolean(getBibleSpecialChapterTitle(bookKey, chapterNumber));
              const isLxxAdditionChapter = isBibleLxxAdditionChapter(bookKey, chapterNumber);
              const chapterLabel = getBibleChapterDisplayLabel(bookKey, chapterNumber, preferences.appLanguage);

              return (
                <Pressable
                  key={chapterNumber}
                  accessibilityLabel={chapterLabel}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: `${accent}0F`, borderColor: `${accent}2E` },
                    isSpecialChapter && styles.namedChip,
                    isLxxAdditionChapter && styles.lxxAdditionChip,
                    pressed && { backgroundColor: `${accent}2E`, borderColor: `${accent}80` },
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: '/bible/[bookKey]/[chapter]',
                      params: {
                        bookKey,
                        chapter: String(chapterNumber),
                        numbering: isPsalms ? psalmNumbering : undefined,
                      },
                    })
                  }
                >
                  <Text
                    numberOfLines={isSpecialChapter ? 2 : 1}
                    style={[
                      styles.chipText,
                      { color: accent },
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
        </>
      )}
    </BookPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  loadingArea: { flex: 1, overflow: 'hidden' },
  rowReverse: { flexDirection: 'row-reverse' },
  error: { fontFamily: TYPOGRAPHY.body, color: COLORS.priest, fontSize: 17, marginTop: SPACING.lg, textAlign: 'center' },
  segmented: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  segment: { alignItems: 'center', borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: SPACING.sm },
  segmentText: { fontFamily: TYPOGRAPHY.title, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  segmentArabic: { fontFamily: TYPOGRAPHY.arabic, fontSize: 15, fontWeight: '700', writingDirection: 'rtl' },
  estherDisclaimer: {
    backgroundColor: 'rgba(214, 69, 69, 0.08)',
    borderColor: 'rgba(214, 69, 69, 0.42)',
    borderRadius: 12,
    borderWidth: 1,
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
    gap: 10,
    justifyContent: 'center',
    marginTop: 4,
  },
  chip: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    height: CHIP_SIZE,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
    width: CHIP_SIZE,
  },
  namedChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    width: 206,
  },
  lxxAdditionChip: {
    borderColor: 'rgba(214, 69, 69, 0.72)',
  },
  chipText: {
    fontFamily: TYPOGRAPHY.title,
    fontSize: 20,
    fontWeight: '700',
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
