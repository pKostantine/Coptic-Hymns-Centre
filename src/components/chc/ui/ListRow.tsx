import { Ionicons } from '@expo/vector-icons';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, MOTION, RADII, SHADOWS, SPACING, TYPOGRAPHY } from '../../../constants/theme';

interface ListRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  iconImage?: ImageSourcePropType;
  title: string;
  arabic?: string;
  meta?: string;
  chevron?: boolean;
  bookmarked?: boolean;
  onPress?: () => void;
}

/**
 * CHC ListRow — the library navigation row. Gold icon chip on the left,
 * bilingual (English + Arabic) title in the middle, gold chevron on the right.
 */
export default function ListRow({ icon, iconImage, title, arabic, meta, chevron = true, bookmarked = false, onPress }: ListRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, SHADOWS.card, pressed ? { opacity: MOTION.pressOpacity } : null]}
    >
      {icon || iconImage ? (
        <View style={styles.iconChip}>
          {iconImage ? (
            <Image source={iconImage} style={styles.iconImage} resizeMode="contain" />
          ) : (
            <Ionicons name={icon!} size={24} color={COLORS.gold} />
          )}
        </View>
      ) : null}

      <View style={styles.middle}>
        <View style={styles.titleCol}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        {arabic ? (
          <Text style={styles.arabic} numberOfLines={1}>
            {arabic}
          </Text>
        ) : null}
      </View>

      {bookmarked ? <Ionicons name="bookmark" size={18} color={COLORS.gold} /> : null}
      {chevron ? <Ionicons name="chevron-forward" size={22} color={COLORS.gold} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    padding: SPACING.md,
  },
  iconChip: {
    width: 48,
    height: 48,
    borderRadius: RADII.md,
    backgroundColor: COLORS.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImage: {
    width: 28,
    height: 28,
  },
  middle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minWidth: 0,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: TYPOGRAPHY.title,
    fontSize: TYPOGRAPHY.fsTitle,
    fontWeight: '700',
    color: COLORS.white,
    lineHeight: TYPOGRAPHY.fsTitle * TYPOGRAPHY.lhTitle,
  },
  meta: {
    fontFamily: TYPOGRAPHY.body,
    fontSize: TYPOGRAPHY.fsSm,
    color: COLORS.muted,
    marginTop: 2,
  },
  arabic: {
    flex: 1,
    fontFamily: TYPOGRAPHY.arabicBold,
    fontSize: TYPOGRAPHY.fsTitle + 2,
    color: COLORS.white,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
