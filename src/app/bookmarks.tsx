import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareFlatList } from '@/components/playback/NowPlayingAwareScroll';
import AppHeader from '@/components/chc/ui/AppHeader';
import HymnCard from '@/components/chc/ui/HymnCard';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { bookmarkKeyFor, CATEGORIES, DIVINE_LITURGY_SERVICES, HOLY_WEEK_HOURS, holyWeekHourHref, RAISING_OF_INCENSE_OPTIONS, SERVICES_BY_CATEGORY } from '@/constants/manifest';
import { goBack } from '@/utils/navigation';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { getBibleChapterDisplayLabel, getBibleBooks, type BibleBook } from '@/utils/bibleService';

interface BookmarkEntry {
  id: string;
  title: string;
  arabic: string;
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
  ) => {
    const key = bookmarkKeyFor(schema, table, entryId);
    index[key] = { id: key, title, arabic, href };
    // Bookmarks saved before the key gained its entry-id suffix are genuinely
    // ambiguous — nothing recorded which entry they were made from. Rather
    // than drop them from the list, the bare key stays resolvable, pointing at
    // the first entry that claims it.
    const bare = `${schema}:${table}`;
    if (key !== bare && !index[bare]) index[bare] = { id: bare, title, arabic, href };
  };

  for (const category of CATEGORIES) {
    if (category.kind === 'direct' && category.schema && category.table) {
      register(category.schema, category.table, category.id, category.title, category.arabic, `/${category.id}`);
    }
  }

  for (const [categoryId, services] of Object.entries(SERVICES_BY_CATEGORY)) {
    for (const service of services) {
      register(service.schema, service.table, service.id, service.title, service.arabic, `/${categoryId}/${service.id}`);
    }
  }

  for (const option of RAISING_OF_INCENSE_OPTIONS) {
    register(option.schema, option.table, option.id, option.title, option.arabic, `/liturgy/raising-of-incense/${option.id}`);
  }

  for (const service of DIVINE_LITURGY_SERVICES) {
    register(service.schema, service.table, service.id, service.title, service.arabic, `/liturgy/divine-liturgy/${service.id}`);
  }

  for (const hour of HOLY_WEEK_HOURS) {
    register(hour.schema, hour.table, hour.id, hour.title, hour.arabic, holyWeekHourHref(hour));
  }

  return index;
}

const BOOKMARK_INDEX = buildBookmarkIndex();

/** Bookmarks screen — ported from HomeScreen.js's bookmarks Modal (rendered as its own route here instead of a Modal). */
export default function BookmarksScreen() {
  const router = useRouter();
  const { bookmarks, preferences } = useReadingPreferences();
  const showEnglish = preferences.appLanguage === 'en';
  const showArabic = preferences.appLanguage === 'ar';
  const [bibleBooks, setBibleBooks] = useState<BibleBook[]>([]);

  useEffect(() => {
    let cancelled = false;
    getBibleBooks()
      .then((books) => {
        if (!cancelled) setBibleBooks(books);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = useMemo(() => {
    return bookmarks
      .map((id): BookmarkEntry | null => {
        if (id.startsWith('bible:')) {
          const [, , bookKey, chapter] = id.split(':');
          const book = bibleBooks.find((b) => b.bookKey === bookKey);
          if (!book) return null;
          const chapterNumber = Number(chapter);
          const englishChapter = getBibleChapterDisplayLabel(bookKey, chapterNumber, 'en');
          const arabicChapter = getBibleChapterDisplayLabel(bookKey, chapterNumber, 'ar');
          return {
            id,
            title: `${book.titleEnglish} ${englishChapter}`,
            arabic: `${book.titleArabic} ${arabicChapter}`,
            href: `/bible/${bookKey}/${chapter}`,
          };
        }
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
            href: `${parent.href}?sub=${subdocumentKey}`,
          };
        }
        return BOOKMARK_INDEX[id] || null;
      })
      .filter((entry): entry is BookmarkEntry => entry !== null);
  }, [bookmarks, bibleBooks]);

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
          renderItem={({ item }) => (
            <HymnCard
              title={item.title}
              arabic={item.arabic}
              showEnglish={showEnglish}
              showArabic={showArabic}
              isBookmarked
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
  listContent: { padding: SPACING.md, paddingBottom: SPACING.xl },
});
