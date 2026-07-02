import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import DocumentWebView, { DocumentSection } from '@/components/chc/DocumentWebView';
import { COLORS, TYPOGRAPHY } from '@/constants/theme';
import { useCalendar } from '@/context/CalendarContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { fontScaleToPx } from '@/utils/preferencesStorage';
import { supabase } from '@/utils/supabase';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';
import { goBack } from '@/utils/navigation';

interface ResolvedVerse {
  verse_number: number;
  chapter_number: number;
  english: string;
  coptic: string;
  arabic: string;
}

interface ReadingRow {
  service: string;
  reading_type: string;
  reading_reference: string;
  resolved_verses: { segment: string; book_key: string; verses: ResolvedVerse[] }[];
}

const SERVICE_ORDER = ['Vespers', 'Matins', 'Pauline', 'Catholic', 'Praxis', 'Liturgy'];
const TYPE_ORDER = ['Psalm', 'Gospel', 'Prophecy', 'Pauline Epistle', 'Catholic Epistle', 'Praxis'];

export default function LectionaryDocument() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const { effectiveDate } = useCalendar();
  const { isFullscreen, toggle: toggleFullscreen } = useBrowserFullscreen();
  const [sections, setSections] = useState<DocumentSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isoDate = effectiveDate.toISOString().slice(0, 10);
    supabase
      .rpc('get_readings_for_date', { p_date: isoDate })
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          return;
        }
        const rows = ((data as ReadingRow[]) || []).sort(
          (a, b) =>
            SERVICE_ORDER.indexOf(a.service) - SERVICE_ORDER.indexOf(b.service) ||
            TYPE_ORDER.indexOf(a.reading_type) - TYPE_ORDER.indexOf(b.reading_type),
        );

        setSections(
          rows.map((row) => ({
            id: `${row.service}-${row.reading_type}`,
            title: { english: `${row.service} — ${row.reading_type}`, arabic: '' },
            verses: row.resolved_verses.flatMap((segment) =>
              segment.verses.map((v) => ({
                english: `${v.chapter_number}:${v.verse_number} ${v.english || ''}`,
                coptic: v.coptic || '',
                arabic: v.arabic || '',
                type: 'text',
              })),
            ),
            alternateEvery: null,
            forceWhiteVerses: true,
          })),
        );
      });
  }, [effectiveDate]);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>CHC Lectionary</title>
      </Head>
      <AppHeader
        title={{ english: 'Lectionary', arabic: 'القطمارس' }}
        canGoBack
        onBack={() => goBack(router, '/')}
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
