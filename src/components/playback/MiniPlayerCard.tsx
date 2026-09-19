import { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import Icon from '@/components/chc/ui/Icon';
import { COLORS, TYPOGRAPHY } from '@/constants/theme';

interface MiniPlayerCardProps {
  artwork: ReactNode;
  title: string;
  subtitle: string;
  playing: boolean;
  buffering: boolean;
  /** 0–1 */
  progress: number;
  accentColor: string;
  onOpen: () => void;
  onTogglePlayback: () => void;
  onNext: () => void;
  onHide?: () => void;
  nextLabel: string;
}

/**
 * The floating "now playing" card that sits just above the tab bar. Shared by
 * Music and Learn & Study so both products get the same shape; only the
 * accent colour and the content differ.
 */
export default function MiniPlayerCard({
  artwork,
  title,
  subtitle,
  playing,
  buffering,
  progress,
  accentColor,
  onOpen,
  onTogglePlayback,
  onNext,
  onHide,
  nextLabel,
}: MiniPlayerCardProps) {
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={styles.outer}>
      <View style={styles.card}>
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open now playing: ${title}`}
            style={({ pressed }) => [styles.info, pressed && styles.pressed]}
            onPress={onOpen}
          >
            {artwork}
            <View style={styles.textWrap}>
              <Text numberOfLines={1} style={styles.title}>{title}</Text>
              {subtitle ? <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            hitSlop={6}
            style={({ pressed }) => [styles.playButton, { backgroundColor: accentColor }, pressed && styles.pressedButton]}
            onPress={onTogglePlayback}
          >
            {buffering ? (
              <ActivityIndicator size="small" color={COLORS.black} />
            ) : (
              <Icon
                name={playing ? 'pause' : 'play'}
                size={16}
                color={COLORS.black}
                // The play triangle's visual centre sits left of its box.
                style={playing ? undefined : styles.playNudge}
              />
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={nextLabel}
            hitSlop={6}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressedButton]}
            onPress={onNext}
          >
            <Icon name="play-skip-forward" size={18} color={COLORS.white} />
          </Pressable>

          {onHide ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hide now playing"
              hitSlop={6}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressedButton]}
              onPress={onHide}
            >
              <Icon name="chevron-down" size={18} color={COLORS.white} />
            </Pressable>
          ) : null}
        </View>

        <View pointerEvents="none" style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${clamped * 100}%`, backgroundColor: accentColor }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The card floats on its own; GlobalNowPlayingOverlay owns the spacing so the
  // gap above the tab bar or page edge is exactly the same everywhere.
  outer: {
    backgroundColor: 'transparent',
  },
  card: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0E2238',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)' } as object,
      default: {
        shadowColor: COLORS.shadow,
        shadowOpacity: 0.45,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      },
    }),
  },
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 10,
    gap: 10,
  },
  info: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 8 },
  pressed: { opacity: 0.75 },
  textWrap: { flex: 1, minWidth: 0 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '700' },
  subtitle: { color: 'rgba(201, 211, 220, 0.8)', fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 2 },
  playButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  playNudge: { marginLeft: 2 },
  iconButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pressedButton: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  progressTrack: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  progressFill: { height: 2, borderRadius: 1 },
});
