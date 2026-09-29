'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import AppHeader from '@/components/chc/ui/AppHeader';
import BookCover from '@/components/chc/ui/BookCover';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import SeasonSpotlight from '@/components/chc/ui/SeasonSpotlight';
import { getBookTheme } from '@/constants/bookTheme';
import { CATEGORIES, holyWeekDayHref, type CategoryDef } from '@/constants/manifest';
import { COLORS, SPACING } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { bookDownloadManager } from '@/services/bookDownloadManager';
import type { BookDownloadProgress } from '@/types/bookDownloads';
import { useHolyWeekSchedule } from '@/utils/useHolyWeekSchedule';

import { appText, entryLabel, tr } from '../../utils/appText';
/** How many covers sit side by side: two on a phone, more as the window widens. */
function columnsFor(width: number): number {
  if (width >= 1000) return 4;
  if (width >= 700) return 3;
  return 2;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** The Books menu: the day in a spotlight, then the library as a shelf of jewel-coloured covers. */
export default function BooksHome() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const { width } = useWindowDimensions();
  const arabic = preferences.appLanguage === 'ar';
  const holyWeek = useHolyWeekSchedule();
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

  // While Pascha is being prayed the spotlight is the way into Holy Week, so
  // its cover steps off the shelf rather than showing the same book twice.
  const books = holyWeek ? CATEGORIES.filter((item) => item.id !== 'holy-week') : CATEGORIES;
  const columns = columnsFor(width);

  const renderCover = (item: CategoryDef, wide: boolean) => {
    const book = item.downloadKey ? downloads.find((entry) => entry.bookKey === item.downloadKey) : undefined;
    return (
      <BookCover
        key={item.id}
        title={entryLabel(item)}
        description={appText({ english: item.meta, arabic: item.metaArabic, french: item.metaFrench })}
        theme={getBookTheme(item.id)}
        arabic={arabic}
        wide={wide}
        overline={item.id === 'holy-week' ? (tr('PASCHA', 'PÂQUE', 'البصخة المقدسة')) : undefined}
        onPress={() => router.push(`/${item.id}`)}
        {...(book ? { downloadStatus: book.status, downloadProgress: book.progress, onDownloadPress: () => downloadAction(book) } : {})}
      />
    );
  };

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head>
        <title>{tr('Books', 'Livres', 'الكتب')}</title>
      </Head>
      <AppHeader
        title={{ english: 'Books', arabic: 'الكتب', french: 'Livres' }}
        visibleLanguages={{ english: !arabic, arabic }}
        rightLeadingIcon="bookmark-outline"
        onRightLeadingPress={() => router.push('/bookmarks')}
        rightLeadingAccessibilityLabel="Open bookmarks"
        rightIcon="settings-outline"
        onRightPress={() => router.push('/book-settings')}
        rightAccessibilityLabel="Open settings"
      />

      <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <SeasonSpotlight
            arabic={arabic}
            holyWeek={holyWeek}
            onOpenCalendar={() => router.push('/calendar')}
            onOpenHolyWeekDay={(day) => router.push(holyWeekDayHref(day) as never)}
            onOpenHolyWeek={() => router.push('/holy-week')}
          />
          <View style={styles.shelf}>
            {chunk(books, columns).map((row) => (
              // A short last row stretches its covers across the shelf.
              <View key={row[0].id} style={[styles.shelfRow, arabic && styles.rowReverse]}>
                {row.map((item) => renderCover(item, row.length < columns && row.length === 1))}
              </View>
            ))}
          </View>
        </View>
      </NowPlayingAwareScrollView>
      <BottomTabBar active="books" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.xl },
  // A desktop browser is far wider than the shelf wants to be; past this it centres.
  column: { alignSelf: 'center', gap: SPACING.md + 4, maxWidth: 980, width: '100%' },
  rowReverse: { flexDirection: 'row-reverse' },
  shelf: { gap: 12 },
  shelfRow: { flexDirection: 'row', gap: 12 },
});
