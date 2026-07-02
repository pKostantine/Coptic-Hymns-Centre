import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import AppHeader from '@/components/chc/ui/AppHeader';
import ListRow from '@/components/chc/ui/ListRow';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { supabase } from '@/utils/supabase';

interface BibleBook {
  book_key: string;
  book_order: number;
  testament: string;
  title_english: string;
  title_arabic: string;
}

export default function BibleBookList() {
  const router = useRouter();
  const [books, setBooks] = useState<BibleBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .rpc('get_bible_books')
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setBooks((data as BibleBook[]) || []);
      });
  }, []);

  const oldTestament = (books || []).filter((b) => b.testament === 'OT').sort((a, b) => a.book_order - b.book_order);
  const newTestament = (books || []).filter((b) => b.testament === 'NT').sort((a, b) => a.book_order - b.book_order);

  return (
    <View style={styles.screen}>
      <AppHeader title="Bible" arabic="الكتاب المقدس" canGoBack onBack={() => router.back()} />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : !books ? (
        <View style={styles.center}>
          <Text style={styles.loading}>Loading…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.sectionLabel}>Old Testament</Text>
          {oldTestament.map((book) => (
            <ListRow
              key={book.book_key}
              icon="book-outline"
              title={book.title_english}
              arabic={book.title_arabic}
              onPress={() => router.push(`/bible/${book.book_key}`)}
            />
          ))}
          <Text style={styles.sectionLabel}>New Testament</Text>
          {newTestament.map((book) => (
            <ListRow
              key={book.book_key}
              icon="book-outline"
              title={book.title_english}
              arabic={book.title_arabic}
              onPress={() => router.push(`/bible/${book.book_key}`)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { fontFamily: TYPOGRAPHY.body, color: COLORS.muted, fontSize: TYPOGRAPHY.fsBody },
  error: { fontFamily: TYPOGRAPHY.body, color: COLORS.priest, fontSize: TYPOGRAPHY.fsBody },
  list: { padding: SPACING.md, gap: SPACING.sm + 4 },
  sectionLabel: {
    fontFamily: TYPOGRAPHY.title,
    fontSize: TYPOGRAPHY.fsSm,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
});
