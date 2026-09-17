import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { LearningLessonMediaType } from '@/types/learningPlatform';

function formatDuration(durationMs: number | null): string {
  if (!durationMs || durationMs < 0) return '';
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ':' + seconds.toString().padStart(2, '0');
}

export default function LearningMediaRow({
  title,
  subtitle,
  durationMs,
  index,
  mediaType = 'audio',
  active = false,
  onPress,
  trailing,
  isArabic = false,
}: {
  title: string;
  subtitle?: string | null;
  durationMs: number | null;
  index: number;
  mediaType?: LearningLessonMediaType;
  active?: boolean;
  onPress: () => void;
  trailing?: ReactNode;
  isArabic?: boolean;
}) {
  return (
    <View style={[styles.row, active && styles.rowActive]}>
      <Pressable style={styles.main} onPress={onPress}>
        <View style={[styles.indexBadge, mediaType === 'video' && styles.videoBadge]}>
          <Text style={[styles.index, active && styles.activeText]}>{index + 1}</Text>
        </View>
        <View style={styles.info}>
          <Text numberOfLines={1} style={[styles.title, isArabic && styles.arabic, active && styles.activeText]}>{title}</Text>
          {subtitle ? <Text numberOfLines={1} style={[styles.subtitle, isArabic && styles.arabic]}>{subtitle}</Text> : null}
        </View>
        <View style={styles.meta}>
          {mediaType === 'video' ? <Text style={styles.type}>VIDEO</Text> : null}
          <Text style={styles.duration}>{formatDuration(durationMs)}</Text>
        </View>
        <Text style={[styles.play, active && styles.activeText]}>{mediaType === 'video' ? '▣' : '▶'}</Text>
      </Pressable>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowActive: { backgroundColor: COLORS.learningSoft },
  main: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  indexBadge: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: COLORS.surfaceSoft,
  },
  videoBadge: { borderWidth: 1, borderColor: COLORS.learningLine },
  index: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '700' },
  info: { flex: 1, minWidth: 0 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '700' },
  subtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  meta: { alignItems: 'flex-end', gap: 2 },
  type: { color: COLORS.learning, fontFamily: TYPOGRAPHY.body, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  duration: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontVariant: ['tabular-nums'] },
  play: { width: 22, textAlign: 'center', color: COLORS.learningBright, fontSize: 12 },
  trailing: { paddingRight: SPACING.sm },
  activeText: { color: COLORS.learningBright },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
