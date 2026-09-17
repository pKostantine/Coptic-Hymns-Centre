import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useLearningPlayer } from '@/context/LearningPlayerContext';
import LearningArtwork from './LearningArtwork';

export default function LearningMiniPlayer() {
  const router = useRouter();
  const {
    currentItem,
    playing,
    buffering,
    togglePlayback,
    next,
    currentTimeMs,
    durationMs,
  } = useLearningPlayer();

  if (!currentItem) return null;
  const progress = durationMs > 0 ? Math.min(1, currentTimeMs / durationMs) : 0;

  return (
    <View style={styles.wrapper}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.row}>
        <Pressable style={styles.info} onPress={() => router.push('/learn/now-playing')}>
          <LearningArtwork
            asset={currentItem.coverAsset}
            size={46}
            label={currentItem.containerTitle}
          />
          <View style={styles.textWrap}>
            <Text numberOfLines={1} style={styles.title}>{currentItem.title}</Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {currentItem.cantorName + ' · ' + currentItem.containerTitle}
            </Text>
          </View>
        </Pressable>
        <Pressable accessibilityLabel={playing ? 'Pause' : 'Play'} style={styles.control} onPress={togglePlayback}>
          <Text style={styles.controlText}>{buffering ? '…' : playing ? 'Ⅱ' : '▶'}</Text>
        </Pressable>
        <Pressable accessibilityLabel="Next lesson" style={styles.control} onPress={next}>
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
    borderColor: COLORS.learningLine,
    backgroundColor: COLORS.learningDeep,
  },
  progressTrack: { height: 2, backgroundColor: COLORS.border },
  progressFill: { height: 2, backgroundColor: COLORS.learning },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', padding: 6, gap: SPACING.xs },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  textWrap: { flex: 1, minWidth: 0 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '700' },
  subtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 2 },
  control: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  controlText: { color: COLORS.learningBright, fontSize: 17, fontWeight: '800' },
});
