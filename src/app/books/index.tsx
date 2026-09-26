import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareFlatList } from '@/components/playback/NowPlayingAwareScroll';
import AppHeader from '@/components/chc/ui/AppHeader';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import CategoryCard from '@/components/chc/ui/CategoryCard';
import Icon from '@/components/chc/ui/Icon';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { CATEGORIES } from '@/constants/manifest';
import { bookDownloadManager } from '@/services/bookDownloadManager';
import type { BookDownloadProgress } from '@/types/bookDownloads';
import { useCalendar } from '@/context/CalendarContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';
import { useIsCompactLandscape } from '@/utils/useIsCompactLandscape';

/** Main menu — ported 1:1 from HomeScreen.js/HomeScreen.web.js: Header, an action row (web adds a fullscreen toggle), then the category list. Bottom tab bar (Books/App Settings) shown only here. */
export default function BooksHome() {
  const router = useRouter();
  const { isLive, effectiveDate, goLive } = useCalendar();
  const { preferences } = useReadingPreferences();
  const { isFullscreen, toggle: toggleFullscreen, shouldShow: shouldShowFullscreen } = useBrowserFullscreen();
  // A sideways phone has width to spare and almost no height, so the menu
  // pairs its cards up. Tablets retain the standard single-column layout.
  const columns = useIsCompactLandscape() ? 2 : 1;
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

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head>
        <title>{appTitle}</title>
      </Head>
      <AppHeader
        title={{ english: 'Books', arabic: 'الكتب' }}
        visibleLanguages={{ english: showEnglish, arabic: showArabic }}
      />

      <View style={styles.actionRow}>
        {shouldShowFullscreen ? (
          <Pressable accessibilityLabel="Toggle full screen" style={styles.actionButton} onPress={toggleFullscreen}>
            <Icon name={isFullscreen ? 'close-fullscreen' : 'open-in-full'} size={24} color={COLORS.gold} />
          </Pressable>
        ) : null}
        <Pressable accessibilityLabel="Open bookmarks" style={styles.actionButton} onPress={() => router.push('/bookmarks')}>
          <Icon name="bookmark-outline" size={26} color={COLORS.gold} />
        </Pressable>
        <Pressable accessibilityLabel="Open calendar" style={styles.actionButton} onPress={() => router.push('/calendar')}>
          <Icon name="calendar-outline" size={27} color={COLORS.gold} />
        </Pressable>
        <Pressable accessibilityLabel="Open settings" style={styles.actionButton} onPress={() => router.push('/book-settings')}>
          <Icon name="settings-outline" size={27} color={COLORS.gold} />
        </Pressable>
      </View>

      {!isLive ? (
        <Pressable style={styles.notLiveBanner} onPress={goLive}>
          <Icon name="time-outline" size={16} color={COLORS.gold} />
          <Text style={styles.notLiveText}>
            Viewing {effectiveDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} — tap to go live
          </Text>
        </Pressable>
      ) : null}

      <NowPlayingAwareFlatList
        /* FlatList can't switch column count on an existing instance, so the
           count doubles as its key and a rotation remounts the list. */
        key={columns}
        columnWrapperStyle={columns > 1 ? styles.gridRow : undefined}
        contentContainerStyle={styles.listContent}
        data={CATEGORIES}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        renderItem={({ item }) => (
          <View style={columns > 1 ? styles.gridCell : undefined}>
            <CategoryCard
              title={item.title}
              arabic={item.arabic}
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
  actionButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  notLiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: 999,
    backgroundColor: COLORS.goldSoft,
    borderWidth: 1,
    borderColor: COLORS.goldLine,
  },
  notLiveText: {
    fontFamily: TYPOGRAPHY.body,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gold,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  // columnGap only: the cards carry their own marginBottom, so a plain `gap`
  // would stack on top of it and double the space between rows.
  gridRow: {
    columnGap: SPACING.md,
  },
  gridCell: {
    flex: 1,
  },
});
