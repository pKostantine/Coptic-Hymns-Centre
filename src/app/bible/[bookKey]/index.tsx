import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import AppHeader from '@/components/chc/ui/AppHeader';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { supabase } from '@/utils/supabase';

interface ChapterRow {
  chapter_number: number;
  verse_count: number;
}

export default function BibleChapterList() {
  const router = useRouter();
  const { bookKey } = useLocalSearchParams<{ bookKey: string }>();
  const [chapters, setChapters] = useState<ChapterRow[] | null>(null);

  useEffect(() => {
    if (!bookKey) return;
    supabase
      .rpc('get_bible_chapter_list', { p_book_key: bookKey })
      .then(({ data }) => setChapters((data as ChapterRow[]) || []));
  }, [bookKey]);

  return (
    <View style={styles.screen}>
      <AppHeader title={bookKey || ''} canGoBack onBack={() => router.back()} />
      {!chapters ? (
        <View style={styles.center}>
          <Text style={styles.loading}>Loading…</Text>
        </View>
      ) : (
        <FlatList
          data={chapters}
          numColumns={5}
          keyExtractor={(item) => String(item.chapter_number)}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Pressable
              style={styles.chip}
              onPress={() => router.push(`/bible/${bookKey}/${item.chapter_number}`)}
            >
              <Text style={styles.chipText}>{item.chapter_number}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { fontFamily: TYPOGRAPHY.body, color: COLORS.muted, fontSize: TYPOGRAPHY.fsBody },
  grid: { padding: SPACING.md, gap: SPACING.sm },
  chip: {
    flex: 1,
    margin: SPACING.xs,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
  },
  chipText: {
    fontFamily: TYPOGRAPHY.title,
    fontSize: TYPOGRAPHY.fsTitle,
    fontWeight: '700',
    color: COLORS.gold,
  },
});
