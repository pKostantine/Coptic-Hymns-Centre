import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import HymnCard from '@/components/chc/ui/HymnCard';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { CATEGORIES, SERVICES_BY_CATEGORY } from '@/constants/manifest';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';

interface BookmarkEntry {
  id: string;
  title: string;
  arabic: string;
  href: string;
}

function buildBookmarkIndex(): Record<string, BookmarkEntry> {
  const index: Record<string, BookmarkEntry> = {};

  for (const category of CATEGORIES) {
    if (category.kind === 'direct' && category.schema && category.table) {
      index[`${category.schema}:${category.table}`] = {
        id: `${category.schema}:${category.table}`,
        title: category.title,
        arabic: category.arabic,
        href: `/${category.id}`,
      };
    }
  }

  for (const [categoryId, services] of Object.entries(SERVICES_BY_CATEGORY)) {
    for (const service of services) {
      index[`${service.schema}:${service.table}`] = {
        id: `${service.schema}:${service.table}`,
        title: service.title,
        arabic: service.arabic,
        href: `/${categoryId}/${service.id}`,
      };
    }
  }

  return index;
}

const BOOKMARK_INDEX = buildBookmarkIndex();

/** Bookmarks screen — ported from HomeScreen.js's bookmarks Modal (rendered as its own route here instead of a Modal). */
export default function BookmarksScreen() {
  const router = useRouter();
  const { bookmarks } = useReadingPreferences();

  const entries = bookmarks.map((id) => BOOKMARK_INDEX[id]).filter(Boolean);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>CHC Bookmarks</title>
      </Head>
      <AppHeader title="Bookmarks" canGoBack onBack={() => router.back()} />
      {entries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No bookmarks yet.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <HymnCard title={item.title} arabic={item.arabic} isBookmarked onPress={() => router.push(item.href as never)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  emptyState: { flex: 1, justifyContent: 'center', padding: SPACING.lg },
  emptyText: { fontFamily: TYPOGRAPHY.title, fontSize: 20, textAlign: 'center', color: COLORS.white },
  listContent: { padding: SPACING.md, paddingBottom: SPACING.xl },
});
