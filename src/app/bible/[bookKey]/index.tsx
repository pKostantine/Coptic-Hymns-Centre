import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import HymnCard from '@/components/chc/ui/HymnCard';
import LoadingScreen from '@/components/chc/ui/LoadingScreen';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { getBibleBooks, getBibleChapterDisplayLabel, getBibleChapterKeys, getCachedBibleChapterKeys, getBibleSpecialChapterTitle, isBibleLxxAdditionChapter, PsalmNumbering } from '@/utils/bibleService';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';
import { goBack } from '@/utils/navigation';

const CHIP_SIZE = 58;

type BibleBookList = Awaited<ReturnType<typeof getBibleBooks>>;
type BibleListBook = BibleBookList[number];
type LoadedBibleBooks = { requestKey: string; books: BibleBookList };
type LoadedBibleChapters = { requestKey: string; chapters: number[] };
type BibleLoadError = { requestKey: string; message: string };

const PSALM_NUMBERING_OPTIONS: { key: PsalmNumbering; label: string; arabic: string }[] = [
  { key: 'septuagint', label: 'Septuagint', arabic: 'السبعيني' },
  { key: 'masoretic', label: 'Masoretic', arabic: 'العبري' },
];

function prefetchBookChapters(book: BibleListBook) {
  // Speculative failures are shown by the destination page if its retry fails.
  void getBibleChapterKeys(book.bookKey).catch(() => {});
}

function prefetchVisibleBookChapters({ viewableItems }: { viewableItems: ViewToken<BibleListBook>[] }) {
  viewableItems.forEach(({ item }) => prefetchBookChapters(item));
}

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
  const [loadedBooks, setLoadedBooks] = useState<LoadedBibleBooks | null>(null);
  const [loadedChapters, setLoadedChapters] = useState<LoadedBibleChapters | null>(null);
  const [psalmNumbering, setPsalmNumbering] = useState<PsalmNumbering>('septuagint');
  const [loadError, setLoadError] = useState<BibleLoadError | null>(null);

  const booksRequestKey = testament ? `books:${testament}` : '';
  const chaptersRequestKey = bookKey && !testament ? `chapters:${bookKey}:${psalmNumbering}` : '';
  const activeRequestKey = booksRequestKey || chaptersRequestKey;
  const books = loadedBooks?.requestKey === booksRequestKey ? loadedBooks.books : null;
  const chapters = loadedChapters?.requestKey === chaptersRequestKey
    ? loadedChapters.chapters
    : bookKey && !testament ? getCachedBibleChapterKeys(bookKey, psalmNumbering) : null;
  const error = loadError?.requestKey === activeRequestKey ? loadError.message : null;

  useEffect(() => {
    if (!testament) return;
    let cancelled = false;
    const requestKey = `books:${testament}`;

    getBibleBooks()
      .then((allBooks) => {
        if (!cancelled) setLoadedBooks({ requestKey, books: allBooks.filter((book) => book.testament === testament).sort((a, b) => a.bookOrder - b.bookOrder) });
      })
      .catch((err) => {
        if (!cancelled) setLoadError({ requestKey, message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [testament]);

  useEffect(() => {
    if (!bookKey || testament) return;
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
  }, [bookKey, testament, psalmNumbering]);

  useEffect(() => {
    if (!bookKey || testament || !chapters || chapters.length !== 1) return;
    router.replace({
      pathname: '/bible/[bookKey]/[chapter]',
      params: {
        bookKey,
        chapter: String(chapters[0]),
        title: title || bookKey,
        arabic: arabic || '',
        psalmNumbering: isPsalms ? psalmNumbering : undefined,
      },
    });
  }, [arabic, bookKey, chapters, isPsalms, psalmNumbering, router, testament, title]);

  const openBook = useCallback(
    (book: BibleListBook) => {
      const bookChapters = getCachedBibleChapterKeys(book.bookKey);
      if (bookChapters?.length === 1) {
        router.push({
          pathname: '/bible/[bookKey]/[chapter]',
          params: { bookKey: book.bookKey, chapter: String(bookChapters[0]), title: book.titleEnglish, arabic: book.titleArabic },
        });
        return;
      }

      // Open the page on the tap; an uncached chapter list loads on that page.
      router.push({
        pathname: '/bible/[bookKey]',
        params: { bookKey: book.bookKey, title: book.titleEnglish, arabic: book.titleArabic },
      });
    },
    [router],
  );

  return (
    <SafeAreaView edges={Platform.OS === 'web' ? ['left', 'right', 'bottom'] : []} style={styles.screen}>
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
      <View style={styles.content}>
        {error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : testament ? (
          !books ? (
            <LoadingScreen />
          ) : (
            <FlatList
              style={styles.bookList}
              contentContainerStyle={styles.list}
              data={books}
              keyExtractor={(book) => book.bookKey}
              onViewableItemsChanged={prefetchVisibleBookChapters}
              renderItem={({ item: book }) => (
                <HymnCard
                  title={book.titleEnglish}
                  arabic={book.titleArabic}
                  showEnglish={showEnglish}
                  showArabic={showArabic}
                  onPressIn={() => prefetchBookChapters(book)}
                  onHoverIn={() => prefetchBookChapters(book)}
                  onPress={() => openBook(book)}
                />
              )}
            />
          )
        ) : !chapters ? (
          <LoadingScreen />
        ) : chapters.length === 1 ? (
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
                const isLxxAdditionChapter = isBibleLxxAdditionChapter(bookKey, chapterNumber);
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  content: { flex: 1, overflow: 'hidden' },
  bookList: { flex: 1 },
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
