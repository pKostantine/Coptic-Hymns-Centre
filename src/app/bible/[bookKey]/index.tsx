import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import AppHeader from '@/components/chc/ui/AppHeader';
import HymnCard from '@/components/chc/ui/HymnCard';
import LoadingScreen from '@/components/chc/ui/LoadingScreen';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { getBibleBooks, getBibleChapterKeys, PsalmNumbering } from '@/utils/bibleService';
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
                return (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.psalmNumberingButton,
                      { backgroundColor: isSelected ? COLORS.gold : COLORS.surface, borderColor: isSelected ? COLORS.gold : COLORS.border },
                    ]}
                    onPress={() => setPsalmNumbering(option.key)}
                  >
                    <Text style={[styles.psalmNumberingText, { color: isSelected ? COLORS.black : COLORS.white }]}>{option.label}</Text>
                    <Text style={[styles.psalmNumberingArabic, { color: isSelected ? COLORS.black : COLORS.white }]}>{option.arabic}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={styles.grid}>
            {chapters.map((chapterNumber) => (
              <Pressable
                key={chapterNumber}
                style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                onPress={() =>
                  router.push({
                    pathname: '/bible/[bookKey]/[chapter]',
                    params: {
                      bookKey: bookKey!,
                      chapter: String(chapterNumber),
                      title: title || bookKey || '',
                      psalmNumbering: isPsalms ? psalmNumbering : undefined,
                    },
                  })
                }
              >
                <Text style={styles.chipText}>{chapterNumber}</Text>
              </Pressable>
            ))}
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
    gap: 2,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  psalmNumberingText: { fontFamily: TYPOGRAPHY.title, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  psalmNumberingArabic: { fontFamily: 'Arial', fontSize: 14, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
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
  },
  chipPressed: {
    backgroundColor: COLORS.surfaceSoft,
    borderColor: COLORS.goldLine,
  },
  chipText: {
    fontFamily: TYPOGRAPHY.title,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.gold,
  },
});
