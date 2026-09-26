import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareFlatList } from '@/components/playback/NowPlayingAwareScroll';
import AppHeader from '@/components/chc/ui/AppHeader';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import CategoryCard from '@/components/chc/ui/CategoryCard';
import Icon from '@/components/chc/ui/Icon';
import TodayCard from '@/components/chc/ui/TodayCard';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { CATEGORIES } from '@/constants/manifest';
import { bookDownloadManager } from '@/services/bookDownloadManager';
import type { BookDownloadProgress } from '@/types/bookDownloads';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';

/** Below this the cards stay in one column; above it there is room for two. */
const TWO_COLUMN_WIDTH = 700;


/** Main menu: the day, a toolbar, then the books. */
export default function BooksHome() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const { width } = useWindowDimensions();
  // A wide window — a tablet, a sideways phone, a desktop browser — pairs the
  // cards up rather than running one tall column down the middle of the screen.
  const columns = width >= TWO_COLUMN_WIDTH ? 2 : 1;
  const showEnglish = preferences.appLanguage === 'en';
  const showArabic = preferences.appLanguage === 'ar';
  const appTitle = showArabic ? 'الكتب' : 'Books';
  const downloadRevision = useSyncExternalStore(bookDownloadManager.subscribe, bookDownloadManager.getRevision, bookDownloadManager.getRevision);
  const [downloads, setDownloads] = useState<BookDownloadProgress[]>([]);

  useEffect(() => {
    let active = true;
    void bookDownloadManager.listBooks().then((items) => { if (active) setDownloads(items); });
    return () => { active = false; };
  }, [downloadRevision]);

  const downloadAction = (book: BookDownloadProgress) => {
    const action = book.status === 'downloading' || book.status === 'queued'
      ? bookDownloadManager.pause(book.bookKey)
      : book.status === 'installed'
        ? Promise.resolve(router.push('/downloads'))
        : bookDownloadManager.install(book.bookKey);
    void action.catch((error) => Alert.alert('Download', error instanceof Error ? error.message : 'Unable to download this book.'));
  };

  const toolbar = (
    <View style={styles.toolbar}>
      <Pressable accessibilityLabel="Open bookmarks" style={styles.toolButton} onPress={() => router.push('/bookmarks')}>
        <Icon name="bookmark-outline" size={20} color={COLORS.gold} />
      </Pressable>
      <Pressable accessibilityLabel="Open calendar" style={styles.toolButton} onPress={() => router.push('/calendar')}>
        <Icon name="calendar-outline" size={20} color={COLORS.gold} />
      </Pressable>
      <Pressable accessibilityLabel="Open settings" style={styles.toolButton} onPress={() => router.push('/book-settings')}>
        <Icon name="settings-outline" size={20} color={COLORS.gold} />
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head>
        <title>{appTitle}</title>
      </Head>
      <AppHeader
        title={{ english: 'Books', arabic: 'الكتب' }}
        visibleLanguages={{ english: showEnglish, arabic: showArabic }}
      />

      <NowPlayingAwareFlatList
        /* FlatList can't switch column count on an existing instance, so the
           count doubles as its key and a rotation remounts the list. */
        key={columns}
        columnWrapperStyle={columns > 1 ? styles.gridRow : undefined}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <TodayCard arabic={showArabic} onOpenReadings={() => router.push('/lectionary')} />
            {toolbar}
            <Text style={[styles.sectionLabel, showArabic && styles.sectionLabelArabic]}>
              {showArabic ? 'كل الكتب' : 'All books'}
            </Text>
          </View>
        }
        data={CATEGORIES}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        renderItem={({ item }) => (
          <View style={columns > 1 ? styles.gridCell : undefined}>
            <CategoryCard
              categoryId={item.id}
              title={item.title}
              arabic={item.arabic}
              subtitle={showArabic ? item.metaArabic : item.meta}
              showEnglish={showEnglish}
              showArabic={showArabic}
              onPress={() => router.push(`/${item.id}`)}
              {...(() => {
                const book = item.downloadKey ? downloads.find((entry) => entry.bookKey === item.downloadKey) : undefined;
                return book ? { downloadStatus: book.status, downloadProgress: book.progress, onDownloadPress: () => downloadAction(book) } : {};
              })()}
            />
          </View>
        )}
      />
      <BottomTabBar active="books" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  header: { gap: SPACING.md, marginBottom: SPACING.xs },
  toolbar: {
    alignSelf: 'center',
    backgroundColor: COLORS.surface,
    maxWidth: 420,
    borderColor: COLORS.cardLine,
    borderRadius: RADII.pill,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 5,
    width: '100%',
  },
  toolButton: {
    alignItems: 'center',
    borderRadius: RADII.pill,
    flex: 1,
    height: 38,
    justifyContent: 'center',
  },
  sectionLabel: {
    color: COLORS.muted,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  sectionLabelArabic: { fontFamily: TYPOGRAPHY.arabic, fontSize: 12, letterSpacing: 0, lineHeight: 20, textAlign: 'right', textTransform: 'none' },
  listContent: {
    alignSelf: 'center',
    // A desktop browser is far wider than these cards want to be; past this the
    // column stops stretching and centres instead.
    maxWidth: 980,
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
    width: '100%',
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  gridCell: {
    width: '49%',
  },
});
