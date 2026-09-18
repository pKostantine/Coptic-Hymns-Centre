import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { MusicConsumerTrack } from '@/types/musicConsumer';

/**
 * Who a song is by. A song's main artist can differ from the release's, and
 * guests are credited per song, so both belong on the row rather than just the
 * primary name.
 */
function formatTrackCredit(track: MusicConsumerTrack): string {
  const main = track.artists.find((item) => item.role === 'primary')?.displayName
    ?? track.artists[0]?.displayName
    ?? '';

  const featured = track.artists
    .filter((item) => item.role === 'featured')
    .map((item) => item.displayName)
    .filter(Boolean);

  if (!featured.length) return main;

  const guests = featured.length === 1
    ? featured[0]
    : `${featured.slice(0, -1).join(', ')} & ${featured[featured.length - 1]}`;

  return main ? `${main} feat. ${guests}` : `feat. ${guests}`;
}

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
}: {
  track: MusicConsumerTrack;
  index: number;
  active?: boolean;
  onPress: () => void;
  trailing?: ReactNode;
}) {
  const credit = formatTrackCredit(track);

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
  play: { width: 22, textAlign: 'center', color: COLORS.goldBright, fontSize: 12 },
  activeText: { color: COLORS.goldBright },
});
