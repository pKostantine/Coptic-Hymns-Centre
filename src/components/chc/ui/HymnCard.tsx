import Icon from './Icon';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, SHADOWS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { formatEnglishDisplayText } from '../../../utils/displayText';

const EASTERN_ARABIC_DIGITS: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩',
};

function formatArabicNumbers(text: string) {
  return String(text || '').replace(/\d/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit);
}

interface HymnCardProps {
  title: string;
  arabic?: string;
  isBookmarked?: boolean;
  onPress?: () => void;
  onPressIn?: () => void;
  onHoverIn?: () => void;
  /** Both default true — the main menu's App Language setting passes only one of these, so the card shows a single centered title instead of the normal bilingual pair. */
  showEnglish?: boolean;
  showArabic?: boolean;
}

/** CHC HymnCard — ported 1:1 from HymnCard.js: submenu/bookmark row, no icon chip, inline bookmark glyph. */
export default function HymnCard({ title, arabic, isBookmarked, onPress, onPressIn, onHoverIn, showEnglish = true, showArabic: showArabicProp = true }: HymnCardProps) {
  const showArabic = showArabicProp && Boolean(arabic);
  const showEnglishTitle = showEnglish;
  const visibleTitleCount = (showEnglishTitle ? 1 : 0) + (showArabic ? 1 : 0);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, SHADOWS.hymnCard, pressed && { opacity: 0.82 }]}
      onPress={onPress}
      onPressIn={onPressIn}
      onHoverIn={onHoverIn}
    >
      <View style={styles.textGroup}>
        <View style={styles.titleRow}>
          <View style={styles.titleTable}>
            {showEnglishTitle ? (
              <Text style={[styles.title, visibleTitleCount === 1 && styles.centeredTitle]}>{formatEnglishDisplayText(title)}</Text>
            ) : null}
            {showArabic ? (
              <Text style={[styles.title, styles.arabicTitle, visibleTitleCount === 1 && styles.centeredTitle]}>{formatArabicNumbers(arabic!)}</Text>
            ) : null}
          </View>
          {isBookmarked ? <Icon name="bookmark" size={18} color={COLORS.gold} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  textGroup: { flex: 1 },
  title: {
    flex: 1,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0,
    color: COLORS.white,
  },
  arabicTitle: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  centeredTitle: {
    textAlign: 'center',
  },
  titleTable: {
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
});
