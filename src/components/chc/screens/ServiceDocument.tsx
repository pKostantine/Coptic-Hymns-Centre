import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import AppHeader from '../ui/AppHeader';
import IconButton from '../ui/IconButton';
import DocumentWebView, { DocumentSection } from '../DocumentWebView';
import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { hydrateSupabaseServiceHymn } from '../../../utils/hymnLibrary';

interface ServiceDocumentProps {
  schema: string;
  table: string;
  title: string;
  arabic: string;
}

/** Generic document reader: hydrates a service for today and renders it in the trilingual WebView table. */
export default function ServiceDocument({ schema, table, title, arabic }: ServiceDocumentProps) {
  const router = useRouter();
  const [sections, setSections] = useState<DocumentSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSections(null);
    setError(null);

    hydrateSupabaseServiceHymn(schema, table, new Date())
      .then((result) => {
        if (!cancelled) setSections(result as DocumentSection[]);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load this service.');
      });

    return () => {
      cancelled = true;
    };
  }, [schema, table]);

  return (
    <View style={styles.screen}>
      <AppHeader
        title={title}
        arabic={arabic}
        canGoBack
        onBack={() => router.back()}
        right={<IconButton icon="bookmark-outline" label="Bookmark" size="sm" onPress={() => {}} />}
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
        <DocumentWebView sections={sections} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  loading: { fontFamily: TYPOGRAPHY.body, color: COLORS.muted, fontSize: TYPOGRAPHY.fsBody },
  error: { fontFamily: TYPOGRAPHY.body, color: COLORS.priest, fontSize: TYPOGRAPHY.fsBody, textAlign: 'center' },
});
