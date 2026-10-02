'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import BottomTabBar from '@/components/vine/ui/BottomTabBar';
import CalendarSheet from '@/components/vine/ui/CalendarSheet';
import DayBlock from '@/components/vine/ui/DayBlock';
import LibraryBook from '@/components/vine/ui/LibraryBook';
import PageTitle from '@/components/vine/ui/PageTitle';
import { useLiturgicalDay } from '@/components/vine/ui/useLiturgicalDay';
import { CATEGORIES, HOLY_WEEK_DAYS, holyWeekDayHref, type CategoryDef } from '@/constants/manifest';
import { COLORS, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { bookDownloadManager } from '@/services/bookDownloadManager';
import type { BookDownloadProgress } from '@/types/bookDownloads';
import { formatCopticDayMonth } from '@/utils/localeFormat';
import { useHolyWeekSchedule } from '@/utils/useHolyWeekSchedule';
import { useContentWidth, useLayoutMode } from '@/utils/useLayoutMode';

import { appText, entryLabel, tr } from '../../utils/appText';

/** Books read every day are tiles; the rest are rows across the shelf. */
const WIDE_BOOKS = new Set(['agpeya', 'bible', 'holy-week']);

/** How many tiles sit side by side: two on a phone, more as the window widens. */
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

/**
 * The Books tab (Coptic Vine design system, "DayBlock" and "BookShelf"): the
 * liturgical day in its season's colours, then the library. The iPad sets the
 * day beside the library; the desktop pins it in a narrower left column with
 * the library four books across.
 */
export default function BooksHome() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const width = useContentWidth();
  const layout = useLayoutMode();
  const insets = useSafeAreaInsets();
  const arabic = preferences.appLanguage === 'ar';
  const holyWeek = useHolyWeekSchedule();
  const day = useLiturgicalDay();
  const [calendarOpen, setCalendarOpen] = useState(false);
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

  // While Pascha is being prayed the day block's footer is the way into the
  // day or eve being prayed right now.
  const current = holyWeek ? HOLY_WEEK_DAYS.find((entry) => entry.id === holyWeek.currentDayId) ?? null : null;
  const openSeasons = () => router.push('/season-selector');

  const description = (item: CategoryDef) => {
    // The Lectionary names the day it reads: "Readings for Thoout 20".
    if (item.id === 'lectionary' && day.coptic) {
      const date = formatCopticDayMonth(day.coptic.monthName, day.coptic.day, arabic);
      return tr(`Readings for ${date}`, `Lectures du ${date}`, `قراءات ${date}`);
    }
    return appText({ english: item.meta, arabic: item.metaArabic, french: item.metaFrench });
  };

  const renderBook = (item: CategoryDef) => {
    const book = item.downloadKey ? downloads.find((entry) => entry.bookKey === item.downloadKey) : undefined;
    return (
      <LibraryBook
        key={item.id}
        title={entryLabel(item)}
        description={description(item)}
        arabic={arabic}
        wide={WIDE_BOOKS.has(item.id)}
        onPress={() => router.push(`/${item.id}`)}
        {...(book ? { downloadStatus: book.status, downloadProgress: book.progress, onDownloadPress: () => downloadAction(book) } : {})}
      />
    );
  };

  const tiles = CATEGORIES.filter((item) => !WIDE_BOOKS.has(item.id));
  const rows = CATEGORIES.filter((item) => WIDE_BOOKS.has(item.id));
  const columns = layout === 'desktop' ? 4 : layout === 'tablet' ? 2 : columnsFor(width);
  const rowColumns = layout === 'desktop' ? 2 : layout === 'tablet' ? 1 : width >= 700 ? 2 : 1;

  const title = (
    <PageTitle
      title={tr('Books', 'Livres', 'الكتب')}
      arabic={arabic}
      flush={layout !== 'phone'}
      actions={[
        { icon: 'bookmark-outline', label: tr('Open bookmarks', 'Ouvrir les signets', 'افتح العلامات'), onPress: () => router.push('/bookmarks') },
        { icon: 'settings-outline', label: tr('Open settings', 'Ouvrir les réglages', 'افتح الإعدادات'), onPress: () => router.push('/book-settings') },
      ]}
    />
  );
  const dayBlock = (
    <DayBlock
      day={day}
      arabic={arabic}
      onOpenCalendar={() => setCalendarOpen(true)}
      onOpenSeasons={openSeasons}
      action={current ? { label: entryLabel(current), onPress: () => router.push(holyWeekDayHref(current) as never) } : undefined}
    />
  );
  const library = (
    <>
      <Text style={[styles.section, layout !== 'phone' && styles.sectionBeside, arabic && styles.arabic]} accessibilityRole="header">
        {tr('Library', 'Bibliothèque', 'المكتبة')}
      </Text>
      <View style={styles.shelf}>
        {chunk(tiles, columns).map((row) => (
          <View key={row[0].id} style={[styles.shelfRow, arabic && styles.rowReverse]}>
            {row.map(renderBook)}
            {/* A short last row keeps its tiles tile-sized. */}
            {Array.from({ length: columns - row.length }).map((_, index) => <View key={`gap-${index}`} style={styles.gap} />)}
          </View>
        ))}
        {chunk(rows, rowColumns).map((row) => (
          <View key={row[0].id} style={[styles.shelfRow, arabic && styles.rowReverse]}>
            {row.map(renderBook)}
          </View>
        ))}
      </View>
    </>
  );

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head>
        <title>{tr('Books', 'Livres', 'الكتب')}</title>
      </Head>

      <NowPlayingAwareScrollView
        contentContainerStyle={[styles.content, layout !== 'phone' && [styles.contentWide, { paddingTop: insets.top + 28 }]]}
        showsVerticalScrollIndicator={false}
      >
        {layout === 'phone' ? (
          <View style={styles.column}>
            {title}
            <View style={styles.gutter}>
              {dayBlock}
              {library}
            </View>
          </View>
        ) : (
          <View style={[styles.columns, arabic && styles.rowReverse]}>
            <View style={layout === 'desktop' ? styles.dayColumn : styles.half}>
              {title}
              {dayBlock}
            </View>
            <View style={styles.half}>{library}</View>
          </View>
        )}
      </NowPlayingAwareScrollView>

      <CalendarSheet visible={calendarOpen} onClose={() => setCalendarOpen(false)} onOpenSeasons={openSeasons} />
      <BottomTabBar active="books" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { paddingBottom: 28 },
  // A desktop browser is far wider than the shelf wants to be; past this it centres.
  column: { alignSelf: 'center', maxWidth: 980, width: '100%' },
  gutter: { paddingHorizontal: 16 },
  contentWide: { paddingHorizontal: 36 },
  columns: { alignItems: 'flex-start', flexDirection: 'row', gap: 28 },
  dayColumn: { width: 420 },
  half: { flex: 1, minWidth: 0 },
  // Beside the day block the library's heading lines up with the page title.
  sectionBeside: { marginTop: 10 },
  rowReverse: { flexDirection: 'row-reverse' },
  section: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700', marginBottom: 12, marginTop: 28 },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  shelf: { gap: 12 },
  shelfRow: { flexDirection: 'row', gap: 12 },
  gap: { flex: 1 },
});
