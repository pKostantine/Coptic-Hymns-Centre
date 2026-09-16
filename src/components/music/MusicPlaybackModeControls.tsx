import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useMusicPlayer } from '@/context/MusicPlayerContext';

export default function MusicPlaybackModeControls() {
  const { repeatMode, shuffleEnabled, cycleRepeatMode, toggleShuffle } = useMusicPlayer();
  const repeatLabel = repeatMode === 'one' ? 'Repeat 1' : repeatMode === 'all' ? 'Repeat All' : 'Repeat';

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: shuffleEnabled }}
        onPress={toggleShuffle}
        style={[styles.button, shuffleEnabled && styles.buttonActive]}
      >
        <Text style={[styles.text, shuffleEnabled && styles.textActive]}>⇄ Shuffle</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: repeatMode !== 'off' }}
        onPress={cycleRepeatMode}
        style={[styles.button, repeatMode !== 'off' && styles.buttonActive]}
      >
        <Text style={[styles.text, repeatMode !== 'off' && styles.textActive]}>
          {repeatMode === 'one' ? '↻¹' : '↻'} {repeatLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  button: {
    minHeight: 34,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActive: {
    borderColor: COLORS.goldLine,
    backgroundColor: COLORS.goldSoft,
  },
  text: {
    color: COLORS.muted,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 12,
    fontWeight: '700',
  },
  textActive: {
    color: COLORS.goldBright,
  },
});
