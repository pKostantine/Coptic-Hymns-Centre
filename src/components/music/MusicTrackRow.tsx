import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Icon from '@/components/chc/ui/Icon';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { MusicConsumerTrack } from '@/types/musicConsumer';
import { formatMusicTrackPerformers } from '@/utils/musicCredits';

function formatDuration(durationMs: number | null): string {
  if (!durationMs || durationMs < 0) return '';
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function MusicTrackRow({
  track,
  index,
  active = false,
  onPress,
  trailing,
  showLikeButton = false,
  liked = false,
  onToggleLike,
}: {
  track: MusicConsumerTrack;
  index: number;
  active?: boolean;
  onPress: () => void;
  trailing?: ReactNode;
  showLikeButton?: boolean;
  liked?: boolean;
  onToggleLike?: () => void;
}) {
  const credit = formatMusicTrackPerformers(track);

  return (
    <Pressable style={[styles.row, active && styles.rowActive]} onPress={onPress}>
      <Text style={[styles.index, active && styles.activeText]}>{index + 1}</Text>
      <View style={styles.info}>
        <Text numberOfLines={1} style={[styles.title, active && styles.activeText]}>{track.title}</Text>
        {credit || track.subtitle ? (
          <Text numberOfLines={1} style={styles.subtitle}>
            {[credit, track.subtitle].filter(Boolean).join(' • ')}
          </Text>
        ) : null}
      </View>
      <Text style={styles.duration}>{formatDuration(track.durationMs)}</Text>
      {showLikeButton && onToggleLike ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike track' : 'Like track'}
          onPress={(event) => {
            event.stopPropagation();
            onToggleLike();
          }}
          style={styles.likeButton}
        >
          <Icon name={liked ? 'heart' : 'heart-outline'} size={16} color={liked ? COLORS.goldBright : COLORS.muted} />
        </Pressable>
      ) : null}
      {trailing ?? <Text style={[styles.play, active && styles.activeText]}>▶</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowActive: { backgroundColor: COLORS.goldSoft },
  index: { width: 24, textAlign: 'center', color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13 },
  info: { flex: 1, minWidth: 0 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '700' },
  subtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  duration: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontVariant: ['tabular-nums'] },
  likeButton: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  play: { width: 22, textAlign: 'center', color: COLORS.goldBright, fontSize: 12 },
  activeText: { color: COLORS.goldBright },
});
