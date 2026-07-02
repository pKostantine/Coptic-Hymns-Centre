import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import AppHeader from '@/components/chc/ui/AppHeader';
import HymnCard from '@/components/chc/ui/HymnCard';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { supabase } from '@/utils/supabase';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';

interface BibleBook {
  book_key: string;
  book_order: number;
  testament: string;
  title_english: string;
  title_arabic: string;
}

interface ChapterRow {
  chapter_number: number;
  verse_count: number;
}

const CHIP_SIZE = 58;

export default function BibleNestedList() {
  const router = useRouter();
  const { bookKey, title, arabic } = useLocalSearchParams<{ bookKey: string; title?: string; arabic?: string }>();
  const { isFullscreen, toggle: toggleFullscreen } = useBrowserFullscreen();
  const testament = bookKey === 'OT' || bookKey === 'NT' ? bookKey : null;
  const [books, setBooks] = useState<BibleBook[] | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookKey) return;
    setBooks(null);
    setChapters(null);
    setError(null);

    if (testament) {
      supabase.rpc('get_bible_books').then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          return;
        }
        setBooks(
          ((data as BibleBook[]) || [])
            .filter((book) => book.testament === testament)
            .sort((a, b) => a.book_order - b.book_order),
        );
      });
      return;
    }

    supabase.rpc('get_bible_chapter_list', { p_book_key: bookKey }).then(({ data, error: err }) => {
      if (err) {
        setError(err.message);
        return;
      }
      setChapters((data as ChapterRow[]) || []);
    });
  }, [bookKey, testament]);

  return (
    <View style={styles.screen}>
      <Head>
        <title>{`CHC ${title || bookKey || 'Bible'}`}</title>
      </Head>
      <AppHeader
        title={{ english: title || bookKey || '', arabic: arabic || '' }}
        canGoBack
        onBack={() => router.back()}
        rightLeadingIcon={isFullscreen ? 'close-fullscreen' : 'open-in-full'}
        rightLeadingIconFamily="material"
        onRightLeadingPress={toggleFullscreen}
      />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : testament ? (
        !books ? (
          <View style={styles.center}>
            <Text style={styles.loading}>Loading...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {books.map((book) => (
              <HymnCard
                key={book.book_key}
                title={book.title_english}
                arabic={book.title_arabic}
                onPress={() =>
                  router.push({
                    pathname: '/bible/[bookKey]',
                    params: { bookKey: book.book_key, title: book.title_english, arabic: book.title_arabic },
                  })
                }
              />
            ))}
          </ScrollView>
        )
      ) : !chapters ? (
        <View style={styles.center}>
          <Text style={styles.loading}>Loading...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {chapters.map((item) => (
            <Pressable
              key={item.chapter_number}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              onPress={() =>
                router.push({
                  pathname: '/bible/[bookKey]/[chapter]',
                  params: { bookKey: bookKey!, chapter: String(item.chapter_number), title: title || bookKey || '' },
                })
              }
            >
              <Text style={styles.chipText}>{item.chapter_number}</Text>
            </Pressable>
          ))}
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
  list: { padding: SPACING.md, gap: SPACING.md },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: SPACING.md,
    gap: SPACING.sm,
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
