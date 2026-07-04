import Icon from './Icon';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
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
}

/** Web main-menu row — wide and shallow, English left / Arabic right / chevron far right, matching the desktop-reader feel (mobile's CategoryCard.tsx is the tall card variant). */
export default function CategoryCard({ title, arabic, onPress }: CategoryCardProps) {
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress}>
      <View style={styles.iconWrap}>
        <Icon name="library-outline" size={26} color={COLORS.gold} />
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {formatEnglishDisplayText(title)}
      </Text>
      {arabic ? (
        <Text style={styles.arabicTitle} numberOfLines={1}>
          {formatArabicNumbers(arabic)}
        </Text>
      ) : null}
      <Icon name="chevron-forward" size={24} color={COLORS.gold} style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: SPACING.md,
    minHeight: 80,
    paddingHorizontal: SPACING.lg,
  },
  rowPressed: {
    backgroundColor: COLORS.surfaceSoft,
    borderColor: COLORS.goldLine,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(201, 162, 39, 0.13)',
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    marginRight: SPACING.md,
    width: 52,
  },
  title: {
    color: COLORS.white,
    flex: 1,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'left',
  },
  arabicTitle: {
    color: COLORS.white,
    flex: 1,
    fontFamily: 'Arial',
    fontSize: 21,
    fontWeight: '700',
    marginRight: SPACING.md,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  chevron: {
    marginLeft: SPACING.sm,
  },
});
