import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import ToggleRow from '@/components/chc/ui/ToggleRow';
import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { bookDownloadManager, getAutomaticBookUpdatesEnabled, setAutomaticBookUpdatesEnabled } from '@/services/bookDownloadManager';
import { downloadManager } from '@/services/downloadManager';
import { getDownloadPreferences, setDownloadPreferences, type DownloadPreferences } from '@/services/downloadPreferences';
import type { BookDownloadProgress, ManagedContentResource } from '@/types/bookDownloads';
import type { OfflineDownloadProgress, OfflineStorageSummary } from '@/types/offlineDownloads';
import { goBack } from '@/utils/navigation';

const EMPTY: OfflineStorageSummary = { packageCount: 0, completeCount: 0, failedCount: 0, totalBytes: 0, musicBytes: 0, learningBytes: 0, bookBytes: 0 };

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function subscribe(listener: () => void) {
  const media = downloadManager.subscribe(listener);
  const books = bookDownloadManager.subscribe(listener);
  return () => { media(); books(); };
}
function revision() { return `${downloadManager.getRevision()}:${bookDownloadManager.getRevision()}`; }

export default function DownloadsScreen() {
  // Expo Router discovers both route filenames during web bundling. Keep the
  // platform guard as a second line of defence in addition to downloads.web.
  if (Platform.OS === 'web') return <Redirect href={'/account' as any} />;
  return <NativeDownloadsScreen />;
}

function NativeDownloadsScreen() {
  const router = useRouter();
  const { preferences: reading } = useReadingPreferences();
  const isArabic = reading.appLanguage === 'ar';
  const currentRevision = useSyncExternalStore(subscribe, revision, revision);
  const [summary, setSummary] = useState<OfflineStorageSummary>(EMPTY);
  const [mediaItems, setMediaItems] = useState<OfflineDownloadProgress[]>([]);
  const [books, setBooks] = useState<BookDownloadProgress[]>([]);
  const [resources, setResources] = useState<ManagedContentResource[]>([]);
  const [prefs, setPrefs] = useState<DownloadPreferences>({ wifiOnly: false, allowCellular: true, allowVideoOnCellular: false });
  const [autoUpdates, setAutoUpdates] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([downloadManager.getStorageSummary(), downloadManager.listDownloads(), getDownloadPreferences(), bookDownloadManager.listBooks(), bookDownloadManager.listResources(), getAutomaticBookUpdatesEnabled()])
      .then(([nextSummary, items, nextPrefs, nextBooks, nextResources, automatic]) => {
        if (!active) return;
        setSummary(nextSummary); setMediaItems(items.filter((item) => item.domain !== 'books')); setPrefs(nextPrefs);
        setBooks(nextBooks); setResources(nextResources); setAutoUpdates(automatic);
      });
    return () => { active = false; };
  }, [currentRevision]);

  const patchPreferences = async (value: Partial<DownloadPreferences>) => setPrefs(await setDownloadPreferences(value));
  const calendar = resources.find((resource) => resource.resourceId === 'calendar');
  const contentBytes = resources.reduce((sum, resource) => sum + resource.bytes, 0);
  const music = mediaItems.filter((item) => item.domain === 'music');
  const learning = mediaItems.filter((item) => item.domain === 'learning');
  const run = async (action: () => Promise<void>) => {
    try { await action(); } catch (error) { if (error instanceof Error && error.message !== 'Download paused.') Alert.alert('Download', error.message); }
  };
  const maintenance = async (kind: 'validate' | 'cleanup') => {
    setBusy(true);
    try {
      if (kind === 'validate') {
        const result = await downloadManager.validateIntegrity();
        Alert.alert('Download check', result.invalid ? `${result.invalid} of ${result.checked} package files need to be downloaded again.` : `${result.checked} package files passed validation.`);
      } else {
        const count = await downloadManager.cleanupIncomplete();
        Alert.alert('Cleanup complete', `${count} incomplete file${count === 1 ? '' : 's'} cleaned up.`);
      }
    } finally { setBusy(false); }
  };
  const removeAllMedia = () => Alert.alert(
    'Remove all media downloads?',
    'All downloaded Music and Learn & Study media will be removed. Books and Calendar will be kept.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove All', style: 'destructive', onPress: () => { void downloadManager.removeAll(); } },
    ],
  );
  const bookAction = (book: BookDownloadProgress) => {
    if (book.status === 'downloading' || book.status === 'queued') return run(() => bookDownloadManager.pause(book.bookKey));
    if (book.status === 'installed') {
      confirmBookRemoval(book);
      return Promise.resolve();
    }
    return run(() => bookDownloadManager.install(book.bookKey));
  };
  const confirmBookRemoval = (book: BookDownloadProgress) => Alert.alert(
    `Remove ${book.title}?`,
    'Shared content used by another book and Calendar will be kept.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { void run(() => bookDownloadManager.remove(book.bookKey)); } },
    ],
  );

  return <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
    <AppHeader title={{ english: 'Downloads & Storage', arabic: 'التنزيلات والتخزين' }} canGoBack onBack={() => goBack(router, '/account' as any)} visibleLanguages={{ english: !isArabic, arabic: isArabic }} />
    <NowPlayingAwareScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}><Text style={styles.heading}>Storage</Text><Text style={styles.total}>{bytes(summary.musicBytes + summary.learningBytes + contentBytes)}</Text><Text style={styles.muted}>Books {bytes(contentBytes)} • Music {bytes(summary.musicBytes)} • Learn & Study {bytes(summary.learningBytes)}</Text></View>
      <View style={styles.card}>
        <Text style={styles.heading}>Books</Text>
        {books.map((book) => <View key={book.bookKey} style={styles.item}>
          <View style={styles.grow}><Text style={styles.itemTitle}>{book.title}</Text><Text style={styles.muted}>{book.status.replaceAll('_', ' ')}{book.status === 'downloading' ? ` • ${Math.round(book.progress * 100)}%` : ''}</Text></View>
          {book.totalBytes ? <Text style={styles.size}>{bytes(book.totalBytes)}</Text> : null}
          <Pressable accessibilityRole="button" style={styles.smallButton} onPress={() => void bookAction(book)}><Text style={styles.smallButtonText}>{book.status === 'installed' ? 'Remove' : book.status === 'downloading' ? 'Pause' : book.status === 'update_available' ? 'Update' : book.status === 'failed' ? 'Retry' : book.status === 'paused' ? 'Resume' : 'Download'}</Text></Pressable>
          {!['not_downloaded', 'installed'].includes(book.status) ? <Pressable accessibilityRole="button" onPress={() => confirmBookRemoval(book)}><Text style={styles.remove}>Remove</Text></Pressable> : null}
        </View>)}
        <Pressable style={styles.action} onPress={() => void run(() => bookDownloadManager.checkForUpdates(true))}><Text style={styles.actionText}>Check for Updates</Text></Pressable>
      </View>
      <View style={styles.card}><Text style={styles.heading}>System download</Text><View style={styles.item}><View style={styles.grow}><Text style={styles.itemTitle}>Liturgical Calendar</Text><Text style={styles.muted}>Automatically managed • {calendar?.state?.replaceAll('_', ' ') || 'waiting for Wi-Fi'}</Text></View>{calendar?.bytes ? <Text style={styles.size}>{bytes(calendar.bytes)}</Text> : null}</View></View>
      <View style={styles.card}>
        <Text style={styles.heading}>Download preferences</Text>
        <ToggleRow label="Automatic book updates on Wi-Fi" active={autoUpdates} onPress={() => { const next = !autoUpdates; setAutoUpdates(next); void setAutomaticBookUpdatesEnabled(next); }} />
        <ToggleRow label="Wi-Fi only downloads" active={prefs.wifiOnly} onPress={() => void patchPreferences({ wifiOnly: !prefs.wifiOnly, allowCellular: prefs.wifiOnly ? prefs.allowCellular : false })} />
        <ToggleRow label="Allow cellular downloads" active={prefs.allowCellular && !prefs.wifiOnly} onPress={() => void patchPreferences({ allowCellular: !prefs.allowCellular, wifiOnly: prefs.allowCellular ? true : false })} />
        <ToggleRow label="Allow video over cellular" active={prefs.allowVideoOnCellular} onPress={() => void patchPreferences({ allowVideoOnCellular: !prefs.allowVideoOnCellular })} />
      </View>
      <DownloadGroup title="Music" items={music} onRemove={(key) => downloadManager.remove(key)} />
      <DownloadGroup title="Learning" items={learning} onRemove={(key) => downloadManager.remove(key)} />
      <View style={styles.card}><Text style={styles.heading}>Maintenance</Text><Pressable disabled={busy} style={styles.action} onPress={() => void maintenance('validate')}><Text style={styles.actionText}>Verify downloaded files</Text></Pressable><Pressable disabled={busy} style={styles.action} onPress={() => void maintenance('cleanup')}><Text style={styles.actionText}>Clean incomplete downloads</Text></Pressable><Pressable style={[styles.action, styles.danger]} onPress={removeAllMedia}><Text style={styles.dangerText}>Remove All Media Downloads</Text></Pressable></View>
    </NowPlayingAwareScrollView>
  </SafeAreaView>;
}

function DownloadGroup({ title, items, onRemove }: { title: string; items: OfflineDownloadProgress[]; onRemove: (key: string) => Promise<void> }) {
  return <View style={styles.card}><Text style={styles.heading}>{title}</Text>{items.length ? items.map((item) => <View key={item.packageKey} style={styles.item}><View style={styles.grow}><Text style={styles.itemTitle}>{item.title}</Text><Text style={styles.muted}>{item.status}</Text></View><Text style={styles.size}>{bytes(item.bytesWritten)}</Text><Pressable onPress={() => void onRemove(item.packageKey)}><Text style={styles.remove}>Remove</Text></Pressable></View>) : <Text style={styles.muted}>No downloads.</Text>}</View>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: COLORS.black }, content: { padding: SPACING.md, gap: SPACING.md, paddingBottom: SPACING.xl }, card: { backgroundColor: COLORS.navy, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADII.lg, padding: SPACING.md, gap: SPACING.sm }, heading: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontWeight: '800', fontSize: 16 }, total: { color: COLORS.goldBright, fontSize: 28, fontWeight: '800' }, muted: { color: COLORS.muted, fontSize: 13 }, action: { minHeight: 44, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADII.md, alignItems: 'center', justifyContent: 'center' }, actionText: { color: COLORS.white, fontWeight: '700' }, danger: { borderColor: '#8f3f45' }, dangerText: { color: '#ff8e96', fontWeight: '800' }, item: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderTopColor: COLORS.border, borderTopWidth: 1, paddingTop: SPACING.sm }, grow: { flex: 1 }, itemTitle: { color: COLORS.white, fontWeight: '700' }, size: { color: COLORS.muted, fontSize: 12 }, remove: { color: COLORS.goldBright, fontWeight: '700', fontSize: 12 }, smallButton: { borderColor: COLORS.goldLine, borderWidth: 1, borderRadius: RADII.md, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2 }, smallButtonText: { color: COLORS.goldBright, fontSize: 12, fontWeight: '800' } });
