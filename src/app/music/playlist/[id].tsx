import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MusicArtwork from '@/components/music/MusicArtwork';
import MusicMiniPlayer from '@/components/music/MusicMiniPlayer';
import MusicTrackRow from '@/components/music/MusicTrackRow';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useMusicPlayer } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import type { MusicPlaylistPayload } from '@/types/musicConsumer';

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
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
                  <Pressable style={styles.downloadButton} onPress={() => Alert.alert(isArabic ? 'التنزيل' : 'Download', isArabic ? 'سيتم تفعيل التنزيل الكامل بلا اتصال في مرحلة التنزيلات.' : 'Full offline downloads are implemented in the dedicated Offline Downloads phase.')}>
                    <Text style={styles.downloadText}>↓ {isArabic ? 'تنزيل' : 'Download'}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.trackList}>
            {playlist.tracks.length ? playlist.tracks.map((track, index) => (
              <View key={track.id} style={styles.trackWrap}>
                <View style={styles.trackFlex}>
                  <MusicTrackRow
                    track={track}
                    index={index}
                    active={currentItem?.track.id === track.id}
                    onPress={() => playQueue(queue, index)}
                  />
                </View>
                <Pressable accessibilityLabel="Remove from playlist" onPress={() => void removeTrack(track.id)} style={styles.removeButton}>
                  <Text style={styles.removeText}>×</Text>
                </Pressable>
              </View>
            )) : (
              <View style={styles.empty}><Text style={[styles.emptyText, isArabic && styles.arabic]}>{isArabic ? 'هذه القائمة فارغة.' : 'This playlist is empty.'}</Text></View>
            )}
          </View>
        </ScrollView>
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
  hero: { flexDirection: 'row', gap: SPACING.lg, alignItems: 'flex-end', padding: SPACING.lg, borderRadius: RADII.lg, backgroundColor: COLORS.navyDark, borderWidth: 1, borderColor: COLORS.goldLine },
  heroText: { flex: 1, minWidth: 0 },
  eyebrow: { color: COLORS.gold, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 30, fontWeight: '700', marginTop: SPACING.xs },
  description: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19, marginTop: SPACING.sm },
  meta: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: SPACING.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
  playButton: { minHeight: 42, paddingHorizontal: SPACING.md, borderRadius: RADII.pill, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  playButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontWeight: '800' },
  downloadButton: { minHeight: 42, paddingHorizontal: SPACING.md, borderRadius: RADII.pill, borderWidth: 1, borderColor: COLORS.goldLine, backgroundColor: COLORS.goldSoft, alignItems: 'center', justifyContent: 'center' },
  downloadText: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontWeight: '700' },
  trackList: { marginTop: SPACING.lg, borderRadius: RADII.lg, overflow: 'hidden', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  trackWrap: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  trackFlex: { flex: 1 },
  removeButton: { width: 44, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: COLORS.muted, fontSize: 24 },
  empty: { padding: SPACING.lg },
  emptyText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
