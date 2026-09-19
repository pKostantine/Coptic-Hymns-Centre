import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import MusicArtwork from '@/components/music/MusicArtwork';
import MusicDownloadButton from '@/components/music/MusicDownloadButton';
import MusicMiniPlayer from '@/components/music/MusicMiniPlayer';
import MusicTrackRow from '@/components/music/MusicTrackRow';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useMusicPlayer } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import {
  musicPlaylistDownloadRequest,
  musicTrackDownloadRequest,
} from '@/services/offlineDownloadRequests';
import type { MusicPlaylistPayload, PublishedTrackLyricsPayload } from '@/types/musicConsumer';

export default function MusicPlaylistScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const { currentItem, playQueue } = useMusicPlayer();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const playlistId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [playlist, setPlaylist] = useState<MusicPlaylistPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queue = useMemo(() => (playlist?.tracks ?? []).map((track) => ({ track, releaseId: track.releaseId, coverAsset: playlist?.coverAsset })), [playlist]);
  const downloadRequest = useMemo(
    () => playlist ? musicPlaylistDownloadRequest(playlist, locale) : null,
    [locale, playlist],
  );

  useEffect(() => {
    if (!playlistId) return;
    let active = true;
    setLoading(true);
    setError(null);
    musicService.getPlaylist(playlistId, locale)
      .then((payload) => { if (active) setPlaylist(payload); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load playlist.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [locale, playlistId]);

  const preparePlaylistDownload = async () => {
    if (!playlist) throw new Error('Playlist is not loaded.');
    const lyrics = await Promise.all(playlist.tracks.map(async (track) => {
      try { return [track.id, await musicService.getLyrics(track.id, locale)] as const; }
      catch { return [track.id, null] as const; }
    }));
    return musicPlaylistDownloadRequest(
      playlist,
      locale,
      Object.fromEntries(lyrics) as Record<string, PublishedTrackLyricsPayload | null>,
    );
  };

  const removeTrack = async (trackId: string) => {
    if (!playlistId) return;
    try {
      await musicService.removeFromPlaylist(playlistId, trackId);
      setPlaylist((current) => current ? { ...current, tracks: current.tracks.filter((track) => track.id !== trackId) } : current);
    } catch (cause) {
      Alert.alert('Playlist', cause instanceof Error ? cause.message : 'Unable to remove track.');
    }
  };

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable>
        <Text numberOfLines={1} style={[styles.headerTitle, isArabic && styles.arabic]}>{isArabic ? 'قائمة التشغيل' : 'Playlist'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? <ActivityIndicator color={COLORS.gold} style={styles.loader} /> : null}
      {error ? <View style={styles.center}><Text style={styles.error}>{error}</Text></View> : null}

      {playlist ? (
        <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <MusicArtwork asset={playlist.coverAsset} size={184} label={playlist.name} />
            <View style={styles.heroText}>
              <Text style={[styles.eyebrow, isArabic && styles.arabic]}>{playlist.visibility.toUpperCase()}</Text>
              <Text style={[styles.title, isArabic && styles.arabic]}>{playlist.name}</Text>
              {playlist.description ? <Text style={[styles.description, isArabic && styles.arabic]}>{playlist.description}</Text> : null}
              <Text style={[styles.meta, isArabic && styles.arabic]}>
                {isArabic ? `${playlist.tracks.length} ترنيمة` : `${playlist.tracks.length} ${playlist.tracks.length === 1 ? 'track' : 'tracks'}`}
              </Text>
              {playlist.tracks.length ? (
                <View style={styles.actions}>
                  <Pressable style={styles.playButton} onPress={() => playQueue(queue, 0)}><Text style={styles.playButtonText}>▶ {isArabic ? 'تشغيل' : 'Play'}</Text></Pressable>
                  {downloadRequest ? (
                    <MusicDownloadButton
                      packageKey={downloadRequest.packageKey}
                      request={preparePlaylistDownload}
                      isArabic={isArabic}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.trackList}>
            {playlist.tracks.length ? playlist.tracks.map((track, index) => {
              const trackRequest = musicTrackDownloadRequest({ track, locale, coverAsset: playlist.coverAsset });
              return (
                <View key={track.id} style={styles.trackWrap}>
                  <View style={styles.trackFlex}>
                    <MusicTrackRow
                      track={track}
                      index={index}
                      active={currentItem?.track.id === track.id}
                      onPress={() => playQueue(queue, index)}
                      trailing={(
                        <MusicDownloadButton
                          packageKey={trackRequest.packageKey}
                          request={async () => {
                            let lyrics: PublishedTrackLyricsPayload | null = null;
                            try { lyrics = await musicService.getLyrics(track.id, locale); } catch { /* optional */ }
                            return musicTrackDownloadRequest({ track, locale, coverAsset: playlist.coverAsset, lyrics });
                          }}
                          isArabic={isArabic}
                          compact
                          label=""
                        />
                      )}
                    />
                  </View>
                  <Pressable accessibilityLabel="Remove from playlist" onPress={() => void removeTrack(track.id)} style={styles.removeButton}>
                    <Text style={styles.removeText}>×</Text>
                  </Pressable>
                </View>
              );
            }) : (
              <View style={styles.empty}><Text style={[styles.emptyText, isArabic && styles.arabic]}>{isArabic ? 'هذه القائمة فارغة.' : 'This playlist is empty.'}</Text></View>
            )}
          </View>
        </NowPlayingAwareScrollView>
      ) : null}

      <MusicMiniPlayer />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { color: COLORS.gold, fontSize: 34, lineHeight: 36 },
  headerTitle: { flex: 1, color: COLORS.white, textAlign: 'center', fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 44 },
  loader: { marginTop: SPACING.xl },
  center: { padding: SPACING.lg, alignItems: 'center' },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center' },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  hero: { alignItems: 'center', padding: SPACING.lg, borderRadius: RADII.lg, backgroundColor: COLORS.navyDark, borderWidth: 1, borderColor: COLORS.goldLine },
  heroText: { width: '100%', maxWidth: 680, alignItems: 'center', marginTop: SPACING.lg },
  eyebrow: { color: COLORS.gold, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textAlign: 'center' },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 30, fontWeight: '700', marginTop: SPACING.xs, textAlign: 'center' },
  description: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19, marginTop: SPACING.sm, textAlign: 'center' },
  meta: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: SPACING.sm, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.md },
  playButton: { minHeight: 42, paddingHorizontal: SPACING.md, borderRadius: RADII.pill, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  playButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontWeight: '800' },
  trackList: { marginTop: SPACING.lg, borderRadius: RADII.lg, overflow: 'hidden', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  trackWrap: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  trackFlex: { flex: 1 },
  removeButton: { width: 44, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: COLORS.muted, fontSize: 24 },
  empty: { padding: SPACING.lg },
  emptyText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
