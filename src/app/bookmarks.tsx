import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareFlatList } from '@/components/playback/NowPlayingAwareScroll';
import AppHeader from '@/components/chc/ui/AppHeader';
import MenuRow, { menuRowPosition } from '@/components/chc/ui/MenuRow';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { bookmarkKeyFor, CATEGORIES, DIVINE_LITURGY_SERVICES, HOLY_WEEK_HOURS, holyWeekHourHref, RAISING_OF_INCENSE_OPTIONS, SERVICES_BY_CATEGORY } from '@/constants/manifest';
import { goBack } from '@/utils/navigation';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { isBibleBookmark } from '@/components/chc/screens/BibleBookmarks';

interface BookmarkEntry {
  id: string;
  title: string;
  arabic: string;
  french?: string;
  href: string;
}

function buildBookmarkIndex(): Record<string, BookmarkEntry> {
  const index: Record<string, BookmarkEntry> = {};

  // Keyed by bookmarkKeyFor, which appends the entry id only where several
  // entries open the same schema/table. Vespers and Matins are both
  // liturgy.raising_of_incense, so before this they wrote the SAME key and
  // whichever was registered last (Matins) silently claimed every bookmark
  // made in either — including subdocument ones, which build on the parent id.
  const register = (
    schema: string,
    table: string,
    entryId: string,
    title: string,
    arabic: string,
    href: string,
    french?: string,
  ) => {
    const key = bookmarkKeyFor(schema, table, entryId);
    index[key] = { id: key, title, arabic, french, href };
    // Bookmarks saved before the key gained its entry-id suffix are genuinely
    // ambiguous — nothing recorded which entry they were made from. Rather
    // than drop them from the list, the bare key stays resolvable, pointing at
    // the first entry that claims it.
    const bare = `${schema}:${table}`;
    if (key !== bare && !index[bare]) index[bare] = { id: bare, title, arabic, french, href };
  };

  for (const category of CATEGORIES) {
    if (category.kind === 'direct' && category.schema && category.table) {
      register(category.schema, category.table, category.id, category.title, category.arabic, `/${category.id}`, category.french);
    }
  }

  for (const [categoryId, services] of Object.entries(SERVICES_BY_CATEGORY)) {
    for (const service of services) {
      register(service.schema, service.table, service.id, service.title, service.arabic, `/${categoryId}/${service.id}`, service.french);
    }
  }

  for (const option of RAISING_OF_INCENSE_OPTIONS) {
    register(option.schema, option.table, option.id, option.title, option.arabic, `/liturgy/raising-of-incense/${option.id}`, option.french);
  }

  for (const service of DIVINE_LITURGY_SERVICES) {
    register(service.schema, service.table, service.id, service.title, service.arabic, `/liturgy/divine-liturgy/${service.id}`, service.french);
  }

  for (const hour of HOLY_WEEK_HOURS) {
    register(hour.schema, hour.table, hour.id, hour.title, hour.arabic, holyWeekHourHref(hour), hour.french);
  }

  return index;
}

const BOOKMARK_INDEX = buildBookmarkIndex();

/** Bookmarks screen — ported from HomeScreen.js's bookmarks Modal (rendered as its own route here instead of a Modal). */
export default function BookmarksScreen() {
  const router = useRouter();
  const { bookmarks, preferences } = useReadingPreferences();
  // French shows in the English (left-to-right) slot.
  const showEnglish = preferences.appLanguage !== 'ar';
  const showArabic = preferences.appLanguage === 'ar';

  // Bible chapters have their own bookmarks, in the Bible (BibleBookmarks).
  const entries = useMemo(() => {
    return bookmarks
      .filter((id) => !isBibleBookmark(id))
      .map((id): BookmarkEntry | null => {
        // Subdocument bookmarks: "${parentSchema}:${parentTable}:sub:${KEY}"
        const subMatch = id.match(/^(.+):sub:([^:]+)$/);
        if (subMatch) {
          const [, parentId, subdocumentKey] = subMatch;
          const parent = BOOKMARK_INDEX[parentId];
          if (!parent) return null;
          const subdocumentLabel = subdocumentKey
            .split('_')
            .map((word: string) => word.charAt(0) + word.slice(1).toLowerCase())
            .join(' ');
          return {
            id,
            title: `${parent.title} – ${subdocumentLabel}`,
            arabic: parent.arabic ? `${parent.arabic} – ${subdocumentLabel}` : '',
            french: parent.french ? `${parent.french} – ${subdocumentLabel}` : undefined,
            href: `${parent.href}?sub=${subdocumentKey}`,
          };
        }
        return BOOKMARK_INDEX[id] || null;
      })
      .filter((entry): entry is BookmarkEntry => entry !== null);
  }, [bookmarks]);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>CHC Bookmarks</title>
      </Head>
      <AppHeader title="Bookmarks" canGoBack onBack={() => goBack(router, '/books')} />
      {entries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No bookmarks yet.</Text>
        </View>
      ) : (
        <NowPlayingAwareFlatList
          contentContainerStyle={styles.listContent}
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <MenuRow
              title={preferences.appLanguage === 'fr' ? item.french || item.title : item.title}
              arabic={item.arabic}
              showEnglish={showEnglish}
              showArabic={showArabic}
              position={menuRowPosition(index, entries.length)}
              onPress={() => router.push(item.href as never)}
            />
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
  listContent: { alignSelf: 'center', maxWidth: 640, padding: SPACING.md, paddingBottom: SPACING.xl, width: '100%' },
});
