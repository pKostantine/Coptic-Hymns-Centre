import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import AppHeader from '@/components/chc/ui/AppHeader';
import DocumentWebView, { DocumentSection } from '@/components/chc/DocumentWebView';
import { COLORS, TYPOGRAPHY } from '@/constants/theme';
import { supabase } from '@/utils/supabase';

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
  const [sections, setSections] = useState<DocumentSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    supabase
      .rpc('get_readings_for_date', { p_date: today })
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
  }, []);

  return (
    <View style={styles.screen}>
      <AppHeader title="Lectionary" arabic="القطمارس" canGoBack onBack={() => router.back()} />
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
