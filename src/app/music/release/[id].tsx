import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MusicArtwork from '@/components/music/MusicArtwork';
import MusicMiniPlayer from '@/components/music/MusicMiniPlayer';
import MusicTrackRow from '@/components/music/MusicTrackRow';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useMusicPlayer, type MusicQueueItem } from '@/context/MusicPlayerContext';
import { musicService } from '@/services/musicService';
import type { MusicConsumerRelease } from '@/types/musicConsumer';

export default function MusicReleaseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const releaseId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [release, setRelease] = useState<MusicConsumerRelease | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { currentItem, playQueue } = useMusicPlayer();

  useEffect(() => {
    if (!releaseId) return;
    let active = true;
    musicService.getRelease(releaseId)
      .then((payload) => { if (active) setRelease(payload); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load release.'); });
    return () => { active = false; };
  }, [releaseId]);

  const queue = useMemo<MusicQueueItem[]>(() => release?.tracks.map((track) => ({
    track,
    releaseId: release.id,
    releaseTitle: release.title,
    coverAsset: release.coverAsset ?? null,
  })) ?? [], [release]);

  if (!release) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onBack={() => router.back()} title="Release" />
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={COLORS.gold} style={styles.loader} />}
      </SafeAreaView>
    );
  }

  const artistName = release.primaryArtist?.displayName ?? 'Coptic Hymns Centre';

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Header onBack={() => router.back()} title={release.releaseType === 'album' ? 'Album' : release.releaseType === 'ep' ? 'EP' : 'Single'} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <MusicArtwork asset={release.coverAsset} size={220} label={release.title} />
          <View style={styles.meta}>
            <Text style={styles.title}>{release.title}</Text>
            {release.subtitle ? <Text style={styles.subtitle}>{release.subtitle}</Text> : null}
            <Pressable disabled={!release.primaryArtist?.id} onPress={() => release.primaryArtist?.id && router.push(`/music/artist/${release.primaryArtist.id}`)}>
              <Text style={styles.artist}>{artistName}</Text>
            </Pressable>
            <Text style={styles.releaseMeta}>
              {[release.releaseType.toUpperCase(), release.releaseDate?.slice(0, 4), `${release.tracks.length} track${release.tracks.length === 1 ? '' : 's'}`].filter(Boolean).join(' • ')}
            </Text>
            {release.description ? <Text style={styles.description}>{release.description}</Text> : null}
            <Pressable style={styles.playAll} onPress={() => queue.length && playQueue(queue, 0)}>
              <Text style={styles.playAllText}>▶  Play</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.trackList}>
          {release.tracks.map((track, index) => (
            <MusicTrackRow
              key={track.id}
              track={track}
              index={index}
              active={currentItem?.track.id === track.id}
              onPress={() => playQueue(queue, index)}
            />
          ))}
        </View>
      </ScrollView>
      <MusicMiniPlayer />
    </SafeAreaView>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="Back" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable>
      <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
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
  artist: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '700', marginTop: SPACING.sm },
  releaseMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: SPACING.xs },
  description: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: SPACING.md },
  playAll: { marginTop: SPACING.lg, paddingHorizontal: SPACING.xl, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: RADII.pill, backgroundColor: COLORS.gold },
  playAllText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '800' },
  trackList: { marginTop: SPACING.lg, marginHorizontal: SPACING.md, borderRadius: RADII.md, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  loader: { marginTop: SPACING.xl },
  error: { color: COLORS.priest, textAlign: 'center', margin: SPACING.xl, fontFamily: TYPOGRAPHY.body },
});
