import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { LearningMediaAsset } from '@/types/learningPlatform';
import LearningArtwork from './LearningArtwork';

export default function LearningCollectionCard({
  kind,
  title,
  description,
  meta,
  artwork,
  onPress,
  isArabic = false,
}: {
  kind: 'album' | 'lesson_set';
  title: string;
  description?: string | null;
  meta?: string | null;
  artwork?: LearningMediaAsset | null;
  onPress: () => void;
  isArabic?: boolean;
}) {
  const isLessonSet = kind === 'lesson_set';
  return (
    <Pressable style={styles.card} onPress={onPress}>
      {artwork ? (
        <LearningArtwork asset={artwork} size={68} radius={8} label={title} />
      ) : (
        <View style={[styles.icon, isLessonSet && styles.iconLessons]}>
          <Text style={styles.iconGlyph}>{isLessonSet ? '1·2·3' : '♪'}</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text numberOfLines={2} style={[styles.title, isArabic && styles.arabic]}>{title}</Text>
        {meta ? <Text numberOfLines={1} style={[styles.meta, isArabic && styles.arabic]}>{meta}</Text> : null}
        {description ? <Text numberOfLines={2} style={[styles.description, isArabic && styles.arabic]}>{description}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.sm,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  icon: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.md,
    backgroundColor: COLORS.navyDark,
    borderWidth: 1,
    borderColor: COLORS.goldLine,
  },
  iconLessons: { backgroundColor: COLORS.learningDeep, borderColor: COLORS.learningLine },
  iconGlyph: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '800' },
  info: { flex: 1, minWidth: 0 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '800' },
  meta: { color: COLORS.learning, fontFamily: TYPOGRAPHY.body, fontSize: 10, fontWeight: '800', marginTop: 4, textTransform: 'uppercase' },
  description: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, lineHeight: 17, marginTop: 4 },
  chevron: { color: COLORS.learning, fontSize: 28, paddingHorizontal: SPACING.xs },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
