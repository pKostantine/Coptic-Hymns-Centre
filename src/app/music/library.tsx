import { type ErrorBoundaryProps, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import Icon from '@/components/chc/ui/Icon';
import MusicArtwork from '@/components/music/MusicArtwork';
import MusicSectionNav from '@/components/music/MusicSectionNav';
import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useMusicPlayer } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { downloadManager } from '@/services/downloadManager';
import { musicService } from '@/services/musicService';
import type { MusicLibraryPayload } from '@/types/musicConsumer';
import { formatMusicTrackPerformers } from '@/utils/musicCredits';

type LibraryFolder = 'likes' | 'playlists' | 'releases' | 'following' | 'downloads';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter();

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <AppHeader title={{ english: 'Your Library', arabic: 'مكتبتك' }} visibleLanguages={{ english: true, arabic: false }} />
      <View style={styles.crashCard}>
        <Text style={styles.crashTitle}>Library could not be displayed</Text>
        <Text selectable style={styles.crashBody}>{error.message}</Text>
        <View style={styles.crashActions}>
          <Pressable style={styles.primaryButton} onPress={() => void retry()}>
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => router.replace('/music')}>
            <Text style={styles.secondaryButtonText}>Back to Music</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function MusicLibraryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { preferences } = useReadingPreferences();
  const { playQueue } = useMusicPlayer();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const [library, setLibrary] = useState<MusicLibraryPayload | null>(null);
  const [downloadCount, setDownloadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLibrary = useCallback(async (_activeUserId?: string) => {
    setLoading(true);
    setError(null);
    try {
      setLibrary(await musicService.getLibrary(locale));
      if (Platform.OS !== 'web') {
        const downloads = await downloadManager.listDownloads();
        setDownloadCount(downloads.filter((item) => item.domain === 'music').length);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load your music library.');
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- route entry starts an async data load
    void loadLibrary(user?.id);
  }, [loadLibrary, user?.id]);

  const recentQueue = useMemo(() => (library?.recentTracks ?? []).map(({ track, release }) => ({
    track,
    releaseId: release?.id ?? track.releaseId,
    releaseTitle: release?.title ?? null,
    releaseType: release?.releaseType ?? null,
    musicType: release?.musicType ?? null,
    recordingType: release?.recordingType ?? null,
    coverAsset: release?.coverAsset ?? null,
  })), [library?.recentTracks]);

  const openFolder = (section: LibraryFolder | 'recent-tracks' | 'recent-releases') => {
    router.push({ pathname: '/music/library/[section]', params: { section } });
  };

  const folders: { id: LibraryFolder; title: string; count: number; detail: string }[] = [
    {
      id: 'likes',
      title: isArabic ? 'الترانيم المعجبة' : 'Liked tracks',
      count: library?.likedTracks.length ?? 0,
      detail: isArabic ? 'الترانيم المحفوظة' : 'Saved tracks',
    },
    {
      id: 'playlists',
      title: isArabic ? 'قوائم التشغيل' : 'Playlists',
      count: library?.playlists.length ?? 0,
      detail: isArabic ? 'مجموعاتك' : 'Your collections',
    },
    {
      id: 'releases',
      title: isArabic ? 'الإصدارات المعجبة' : 'Liked releases',
      count: library?.likedReleases.length ?? 0,
      detail: isArabic ? 'الألبومات والإصدارات المحفوظة' : 'Saved albums and releases',
    },
    {
      id: 'following',
      title: isArabic ? 'الفنانون المتابَعون' : 'Following',
      count: library?.followedArtists.length ?? 0,
      detail: isArabic ? 'الفنانون الذين تتابعهم' : 'Artists you follow',
    },
    {
      id: 'downloads',
      title: isArabic ? 'التنزيلات' : 'Downloads',
      count: downloadCount,
      detail: Platform.OS === 'web'
        ? (isArabic ? 'متاحة في تطبيق الهاتف' : 'Available in the mobile app')
        : (isArabic ? 'محفوظة على هذا الجهاز' : 'Saved on this device'),
    },
  ];

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{isArabic ? 'مكتبتي — كوبتك هيمنز سنتر' : 'Your Library — Coptic Hymns Centre'}</title></Head>
      <AppHeader
        title={{ english: 'Your Library', arabic: 'مكتبتك' }}
        visibleLanguages={{ english: !isArabic, arabic: isArabic }}
      />
      <MusicSectionNav active="library" />

      <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator color={COLORS.gold} style={styles.loader} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && library && !library.authenticated ? (
          <View style={styles.authCard}>
            <Text style={[styles.authTitle, isArabic && styles.arabic]}>{isArabic ? 'سجّل الدخول إلى حساب CHC' : 'Sign in to your CHC account'}</Text>
            <Text style={[styles.authBody, isArabic && styles.arabic]}>
              {isArabic
                ? 'الإعجابات وقوائم التشغيل وسجل الاستماع مرتبطة بحسابك.'
                : 'Likes, playlists, follows, and listening history are tied to your account.'}
            </Text>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/account')}>
              <Text style={styles.primaryButtonText}>{isArabic ? 'فتح الحساب' : 'Open Account'}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.folderList}>
          {folders.map((folder) => (
            <Pressable
              key={folder.id}
              accessibilityRole="button"
              onPress={() => openFolder(folder.id)}
              style={({ pressed }) => [styles.folderRow, pressed && styles.pressed]}
            >
              <View style={styles.folderText}>
                <Text style={[styles.folderTitle, isArabic && styles.arabic]}>{folder.title}</Text>
                <Text style={[styles.folderDetail, isArabic && styles.arabic]}>{folder.count} · {folder.detail}</Text>
              </View>
              <Icon name={isArabic ? 'chevron-back' : 'chevron-forward'} size={20} color={COLORS.muted} />
            </Pressable>
          ))}
        </View>

        {library?.authenticated ? (
          <>
            <RecentHeading
              title={isArabic ? 'الترانيم المشغّلة مؤخراً' : 'Recently played tracks'}
              action={isArabic ? 'الكل' : 'See all'}
              isArabic={isArabic}
              onPress={() => openFolder('recent-tracks')}
            />
            {library.recentTracks.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRow}>
                {library.recentTracks.slice(0, 10).map((recent, index) => (
                  <Pressable key={recent.track.id} style={styles.recentCard} onPress={() => playQueue(recentQueue, index)}>
                    <MusicArtwork asset={recent.release?.coverAsset} size={144} label={recent.track.title} />
                    <Text numberOfLines={1} style={[styles.recentTitle, isArabic && styles.arabic]}>{recent.track.title}</Text>
                    <Text numberOfLines={1} style={[styles.recentMeta, isArabic && styles.arabic]}>
                      {formatMusicTrackPerformers(recent.track, recent.release?.primaryArtist?.displayName ?? '')}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : <Text style={[styles.emptyText, isArabic && styles.arabic]}>{isArabic ? 'ستظهر الترانيم هنا بعد الاستماع.' : 'Tracks will appear here after you listen.'}</Text>}

            <RecentHeading
              title={isArabic ? 'الإصدارات المشغّلة مؤخراً' : 'Recently played releases'}
              action={isArabic ? 'الكل' : 'See all'}
              isArabic={isArabic}
              onPress={() => openFolder('recent-releases')}
            />
            {library.recentReleases.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRow}>
                {library.recentReleases.slice(0, 10).map((release) => (
                  <Pressable key={release.id} style={styles.recentCard} onPress={() => router.push(`/music/release/${release.id}`)}>
                    <MusicArtwork asset={release.coverAsset} size={144} label={release.title} />
                    <Text numberOfLines={1} style={[styles.recentTitle, isArabic && styles.arabic]}>{release.title}</Text>
                    <Text numberOfLines={1} style={[styles.recentMeta, isArabic && styles.arabic]}>{release.primaryArtist?.displayName ?? release.releaseType}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : <Text style={[styles.emptyText, isArabic && styles.arabic]}>{isArabic ? 'ستظهر الإصدارات هنا بعد الاستماع.' : 'Releases will appear here after you listen.'}</Text>}
          </>
        ) : null}
      </NowPlayingAwareScrollView>

      <BottomTabBar active="music" />
    </SafeAreaView>
  );
}

function RecentHeading({
  title,
  action,
  isArabic,
  onPress,
}: {
  title: string;
  action: string;
  isArabic: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{title}</Text>
      <Pressable onPress={onPress} style={styles.seeAllButton}>
        <Text style={[styles.seeAllText, isArabic && styles.arabic]}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { alignSelf: 'center', gap: SPACING.md, maxWidth: 1120, padding: SPACING.md, paddingBottom: SPACING.xl * 2, width: '100%' },
  loader: { marginVertical: SPACING.xl },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center' },
  crashCard: { backgroundColor: COLORS.navyDark, borderColor: COLORS.goldLine, borderRadius: RADII.lg, borderWidth: 1, gap: SPACING.md, margin: SPACING.md, padding: SPACING.lg },
  crashTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700' },
  crashBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19 },
  crashActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  primaryButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: COLORS.gold, borderRadius: RADII.pill, justifyContent: 'center', minHeight: 40, paddingHorizontal: SPACING.lg },
  primaryButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', borderColor: COLORS.border, borderRadius: RADII.pill, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: SPACING.lg },
  secondaryButtonText: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  authCard: { backgroundColor: COLORS.navyDark, borderColor: COLORS.border, borderRadius: RADII.lg, borderWidth: 1, gap: SPACING.sm, padding: SPACING.lg },
  authTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '800' },
  authBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19 },
  folderList: { borderBottomColor: COLORS.border, borderBottomWidth: StyleSheet.hairlineWidth },
  folderRow: { alignItems: 'center', borderTopColor: COLORS.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 72, paddingHorizontal: SPACING.xs },
  folderText: { flex: 1, minWidth: 0 },
  folderTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 17, fontWeight: '700' },
  folderDetail: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 4 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.lg },
  sectionTitle: { color: COLORS.white, flex: 1, fontFamily: TYPOGRAPHY.title, fontSize: 23, fontWeight: '800' },
  seeAllButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: SPACING.sm },
  seeAllText: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800' },
  horizontalRow: { gap: SPACING.md, paddingRight: SPACING.lg },
  recentCard: { width: 144 },
  recentTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800', marginTop: 8 },
  recentMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 3 },
  emptyText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.58 },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
