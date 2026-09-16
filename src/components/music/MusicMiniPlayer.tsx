import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useMusicPlayer } from '@/context/MusicPlayerContext';
import MusicArtwork from './MusicArtwork';

export default function MusicMiniPlayer() {
  const router = useRouter();
  const { currentItem, playing, buffering, togglePlayback, next, currentTimeMs, durationMs } = useMusicPlayer();

  if (!currentItem) return null;

  const progress = durationMs > 0 ? Math.min(1, currentTimeMs / durationMs) : 0;
  const artist = currentItem.track.artists.find((item) => item.role === 'primary')?.displayName
    ?? currentItem.track.artists[0]?.displayName
    ?? '';

  return (
    <View style={styles.wrapper}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.row}>
        <Pressable style={styles.info} onPress={() => router.push('/music/now-playing')}>
          <MusicArtwork asset={currentItem.coverAsset} size={46} label={currentItem.releaseTitle ?? currentItem.track.title} />
          <View style={styles.textWrap}>
            <Text numberOfLines={1} style={styles.title}>{currentItem.track.title}</Text>
            <Text numberOfLines={1} style={styles.artist}>{artist || currentItem.releaseTitle || 'Coptic Hymns Centre'}</Text>
          </View>
        </Pressable>
        <Pressable accessibilityLabel={playing ? 'Pause' : 'Play'} style={styles.control} onPress={togglePlayback}>
          <Text style={styles.controlText}>{buffering ? '…' : playing ? 'Ⅱ' : '▶'}</Text>
        </Pressable>
        <Pressable accessibilityLabel="Next track" style={styles.control} onPress={next}>
          <Text style={styles.controlText}>▶|</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: SPACING.sm,
    marginBottom: SPACING.xs,
    borderRadius: RADII.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceSoft,
  },
  progressTrack: { height: 2, backgroundColor: COLORS.border },
  progressFill: { height: 2, backgroundColor: COLORS.gold },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', padding: 6, gap: SPACING.xs },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  textWrap: { flex: 1, minWidth: 0 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '700' },
  artist: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 2 },
  control: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  controlText: { color: COLORS.goldBright, fontSize: 17, fontWeight: '800' },
});
