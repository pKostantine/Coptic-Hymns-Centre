import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import MusicArtwork from '@/components/music/MusicArtwork';
import MusicDownloadButton from '@/components/music/MusicDownloadButton';
import MusicMiniPlayer from '@/components/music/MusicMiniPlayer';
import MusicTrackRow from '@/components/music/MusicTrackRow';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useMusicPlayer, type MusicQueueItem } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import {
  musicReleaseDownloadRequest,
  musicTrackDownloadRequest,
} from '@/services/offlineDownloadRequests';
import type { MusicConsumerRelease, PublishedTrackLyricsPayload } from '@/types/musicConsumer';

export default function MusicReleaseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const releaseId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [release, setRelease] = useState<MusicConsumerRelease | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { currentItem, playQueue } = useMusicPlayer();

  useEffect(() => {
    if (!releaseId) return;
    let active = true;
    setRelease(null);
    setError(null);
    musicService.getRelease(releaseId, locale)
      .then((payload) => { if (active) setRelease(payload); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load release.'); });
    return () => { active = false; };
  }, [locale, releaseId]);

  const tracks = Array.isArray(release?.tracks) ? release.tracks : [];
  const queue = useMemo<MusicQueueItem[]>(() => tracks.map((track) => ({
    track: { ...track, artists: Array.isArray(track.artists) ? track.artists : [] },
    releaseId: release?.id ?? null,
    releaseTitle: release?.title ?? null,
    coverAsset: release?.coverAsset ?? null,
  })), [release, tracks]);
  const downloadRequest = useMemo(
    () => release ? musicReleaseDownloadRequest(release, locale) : null,
    [locale, release],
  );

  const prepareReleaseDownload = async () => {
    if (!release) throw new Error('Release is not loaded.');
    const lyrics = await Promise.all(tracks.map(async (track) => {
      try { return [track.id, await musicService.getLyrics(track.id, locale)] as const; }
      catch { return [track.id, null] as const; }
    }));
    return musicReleaseDownloadRequest(
      release,
      locale,
      Object.fromEntries(lyrics) as Record<string, PublishedTrackLyricsPayload | null>,
    );
  };

  if (!release) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onBack={() => router.back()} title={isArabic ? 'الإصدار' : 'Release'} isArabic={isArabic} />
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={COLORS.gold} style={styles.loader} />}
      </SafeAreaView>
    );
  }

  const artistName = release.primaryArtist?.displayName ?? 'Coptic Hymns Centre';
  const releaseType = isArabic
    ? release.releaseType === 'album' ? 'ألبوم' : release.releaseType === 'ep' ? 'EP' : 'أغنية منفردة'
    : release.releaseType === 'album' ? 'Album' : release.releaseType === 'ep' ? 'EP' : 'Single';

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Header onBack={() => router.back()} title={releaseType} isArabic={isArabic} />
      <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <MusicArtwork asset={release.coverAsset} size={220} label={release.title} />
          <View style={styles.meta}>
            <Text style={[styles.title, isArabic && styles.arabic]}>{release.title}</Text>
            {release.subtitle ? <Text style={[styles.subtitle, isArabic && styles.arabic]}>{release.subtitle}</Text> : null}
            <Pressable disabled={!release.primaryArtist?.id} onPress={() => release.primaryArtist?.id && router.push(`/music/artist/${release.primaryArtist.id}`)}>
              <Text style={[styles.artist, isArabic && styles.arabic]}>{artistName}</Text>
            </Pressable>
            <Text style={[styles.releaseMeta, isArabic && styles.arabic]}>
              {[releaseType, release.releaseDate?.slice(0, 4), isArabic ? `${tracks.length} ترنيمة` : `${tracks.length} track${tracks.length === 1 ? '' : 's'}`].filter(Boolean).join(' • ')}
            </Text>
            {release.description ? <Text style={[styles.description, isArabic && styles.arabic]}>{release.description}</Text> : null}
            <View style={styles.actions}>
              <Pressable style={styles.playAll} onPress={() => queue.length && playQueue(queue, 0)}>
                <Text style={styles.playAllText}>▶  {isArabic ? 'تشغيل' : 'Play'}</Text>
              </Pressable>
              {downloadRequest ? (
                <MusicDownloadButton
                  packageKey={downloadRequest.packageKey}
                  request={prepareReleaseDownload}
                  isArabic={isArabic}
                />
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.trackList}>
          {tracks.map((track, index) => {
            const trackRequest = musicTrackDownloadRequest({
              track,
              locale,
              releaseTitle: release.title,
              coverAsset: release.coverAsset,
            });
            return (
              <MusicTrackRow
                key={track.id}
                track={track}
                index={index}
                active={currentItem?.track.id === track.id}
                onPress={() => playQueue(queue, index)}
                trailing={(
                  <MusicDownloadButton
                    packageKey={trackRequest.packageKey}
                    request={async () => {
                      let lyrics: PublishedTrackLyricsPayload | null = null;
                      try { lyrics = await musicService.getLyrics(track.id, locale); } catch { /* optional offline metadata */ }
                      return musicTrackDownloadRequest({
                        track,
                        locale,
                        releaseTitle: release.title,
                        coverAsset: release.coverAsset,
                        lyrics,
                      });
                    }}
                    isArabic={isArabic}
                    compact
                    label=""
                  />
                )}
              />
            );
          })}
        </View>
      </NowPlayingAwareScrollView>
      <MusicMiniPlayer />
    </SafeAreaView>
  );
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.errorBoundary}>
        <Text style={styles.errorBoundaryTitle}>Release could not be displayed</Text>
        <Text style={styles.error}>{error.message || 'An unexpected error occurred while opening this release.'}</Text>
        <View style={styles.errorBoundaryActions}>
          <Pressable style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
          <Pressable style={styles.backLink} onPress={() => router.replace('/music')}>
            <Text style={styles.backLinkText}>Back to Music</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Header({ onBack, title, isArabic }: { onBack: () => void; title: string; isArabic: boolean }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="Back" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable>
      <Text numberOfLines={1} style={[styles.headerTitle, isArabic && styles.arabic]}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { color: COLORS.gold, fontSize: 38, lineHeight: 40 },
  headerTitle: { flex: 1, textAlign: 'center', color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontWeight: '700', fontSize: 17 },
  headerSpacer: { width: 44 },
  content: { paddingBottom: SPACING.xl },
  hero: { alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  meta: { width: '100%', maxWidth: 680, alignItems: 'center', marginTop: SPACING.lg },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, textAlign: 'center', marginTop: SPACING.xs },
  artist: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '700', marginTop: SPACING.sm, textAlign: 'center' },
  releaseMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: SPACING.xs, textAlign: 'center' },
  description: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: SPACING.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg },
  playAll: { paddingHorizontal: SPACING.xl, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: RADII.pill, backgroundColor: COLORS.gold },
  playAllText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '800' },
  trackList: { marginTop: SPACING.lg, marginHorizontal: SPACING.md, borderRadius: RADII.md, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  loader: { marginTop: SPACING.xl },
  errorBoundary: { flex: 1, padding: SPACING.xl, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  errorBoundaryTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  errorBoundaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, justifyContent: 'center' },
  retryButton: { minHeight: 44, paddingHorizontal: SPACING.lg, borderRadius: RADII.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold },
  retryButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontWeight: '800' },
  backLink: { minHeight: 44, paddingHorizontal: SPACING.lg, borderRadius: RADII.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.goldLine },
  backLinkText: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontWeight: '700' },
  error: { color: COLORS.priest, textAlign: 'center', margin: SPACING.xl, fontFamily: TYPOGRAPHY.body },
  arabic: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
});
