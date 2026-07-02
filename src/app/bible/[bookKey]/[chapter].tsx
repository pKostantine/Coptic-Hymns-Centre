import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import AppHeader from '@/components/chc/ui/AppHeader';
import DocumentWebView, { DocumentSection } from '@/components/chc/DocumentWebView';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { supabase } from '@/utils/supabase';

interface VerseRow {
  verse_number: number;
  english: string;
  coptic: string;
  arabic: string;
}

export default function BibleChapterDocument() {
  const router = useRouter();
  const { bookKey, chapter } = useLocalSearchParams<{ bookKey: string; chapter: string }>();
  const [sections, setSections] = useState<DocumentSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookKey || !chapter) return;
    supabase
      .rpc('get_bible_chapter', { p_book_key: bookKey, p_chapter_number: Number(chapter) })
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          return;
        }
        const verses = (data as VerseRow[]) || [];
        setSections([
          {
            id: `${bookKey}-${chapter}`,
            title: { english: `Chapter ${chapter}`, arabic: '' },
            verses: verses.map((v) => ({
              english: `${v.verse_number}. ${v.english || ''}`,
              coptic: v.coptic || '',
              arabic: `${v.arabic || ''} .${v.verse_number}`,
              type: 'text',
            })),
            alternateEvery: null,
            forceWhiteVerses: true,
          },
        ]);
      });
  }, [bookKey, chapter]);

  return (
    <View style={styles.screen}>
      <AppHeader title={bookKey || ''} arabic={`الإصحاح ${chapter}`} canGoBack onBack={() => router.back()} />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : !sections ? (
        <View style={styles.center}>
          <Text style={styles.loading}>Loading…</Text>
        </View>
      ) : (
        <DocumentWebView sections={sections} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { fontFamily: TYPOGRAPHY.body, color: COLORS.muted, fontSize: TYPOGRAPHY.fsBody },
  error: { fontFamily: TYPOGRAPHY.body, color: COLORS.priest, fontSize: TYPOGRAPHY.fsBody },
});
