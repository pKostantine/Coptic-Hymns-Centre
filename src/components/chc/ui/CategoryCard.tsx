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

interface CategoryCardProps {
  title: string;
  arabic?: string;
  onPress?: () => void;
  /** Both default true — the main menu's App Language setting passes only one of these, so the card shows a single centered title instead of the normal bilingual pair. */
  showEnglish?: boolean;
  showArabic?: boolean;
}

/** CHC CategoryCard — ported 1:1 from CategoryCard.js: main-menu row with a generic library-outline icon chip. */
export default function CategoryCard({ title, arabic, onPress, showEnglish = true, showArabic: showArabicProp = true }: CategoryCardProps) {
  const showArabic = showArabicProp && Boolean(arabic);
  const showEnglishTitle = showEnglish;
  const visibleTitleCount = (showEnglishTitle ? 1 : 0) + (showArabic ? 1 : 0);

  return (
    <Pressable style={({ pressed }) => [styles.card, SHADOWS.card, pressed && { opacity: 0.82 }]} onPress={onPress}>
      <View style={styles.iconWrap}>
        <Icon name="library-outline" size={24} color={COLORS.gold} />
      </View>
      <View style={styles.content}>
        <View style={styles.titleTable}>
          {showEnglishTitle ? (
            <Text style={[styles.title, visibleTitleCount === 1 && styles.centeredTitle]}>{formatEnglishDisplayText(title)}</Text>
          ) : null}
          {showArabic ? (
            <Text style={[styles.title, styles.arabicTitle, visibleTitleCount === 1 && styles.centeredTitle]}>{formatArabicNumbers(arabic!)}</Text>
          ) : null}
        </View>
      </View>
      <Icon name="chevron-forward" size={22} color={COLORS.gold} />
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
  content: { flex: 1 },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(201, 162, 39, 0.13)',
    borderRadius: 16,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  title: {
    flex: 1,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 21,
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
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
});
