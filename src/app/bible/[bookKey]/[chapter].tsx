import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import DocumentWebView, { DocumentSection } from '@/components/chc/DocumentWebView';
import { COLORS, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { fontScaleToPx } from '@/utils/preferencesStorage';
import { supabase } from '@/utils/supabase';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';

interface VerseRow {
  verse_number: number;
  english: string;
  coptic: string;
  arabic: string;
}

export default function BibleChapterDocument() {
  const router = useRouter();
  const { bookKey, chapter, title } = useLocalSearchParams<{ bookKey: string; chapter: string; title?: string }>();
  const { preferences } = useReadingPreferences();
  const { isFullscreen, toggle: toggleFullscreen } = useBrowserFullscreen();
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
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>{`CHC ${title || bookKey || 'Bible'} ${chapter}`}</title>
      </Head>
      <AppHeader
        title={{ english: `${title || bookKey || ''} ${chapter}`, arabic: `الإصحاح ${chapter}` }}
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
      ) : !sections ? (
        <View style={styles.center}>
          <Text style={styles.loading}>Loading…</Text>
        </View>
      ) : (
        <DocumentWebView
          sections={sections}
          fontSize={fontScaleToPx(preferences.fontScale)}
          visibleColumns={{
            english: preferences.visibleLanguages.english,
            coptic: preferences.visibleLanguages.coptic,
            arabic: preferences.visibleLanguages.arabic,
          }}
          selectText={preferences.selectText}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { fontFamily: TYPOGRAPHY.body, color: COLORS.muted, fontSize: 17 },
  error: { fontFamily: TYPOGRAPHY.body, color: COLORS.priest, fontSize: 17 },
});
