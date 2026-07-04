import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { formatEnglishDisplayText } from '../../../utils/displayText';
import { useIsMobileWeb } from '../../../utils/useIsMobileWeb';

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

/**
 * Web main-menu row — wide and shallow, English left / Arabic right / chevron
 * far right, matching the desktop-reader feel (mobile's CategoryCard.tsx is
 * the tall card variant). Below MOBILE_WEB_BREAKPOINT there isn't room for
 * English and Arabic side by side without truncating either one, so the two
 * stack instead — same row, just taller.
 */
export default function CategoryCard({ title, arabic, onPress }: CategoryCardProps) {
  const isMobileWeb = useIsMobileWeb();

  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress}>
      <View style={styles.iconWrap}>
        <Ionicons name="library-outline" size={26} color={COLORS.gold} />
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {formatEnglishDisplayText(title)}
      </Text>
      {arabic ? (
        <Text style={styles.arabicTitle} numberOfLines={1}>
          {formatArabicNumbers(arabic)}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={24} color={COLORS.gold} style={styles.chevron} />
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
  rowMobile: {
    minHeight: 64,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
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
  iconWrapMobile: {
    height: 40,
    marginRight: SPACING.sm,
    width: 40,
  },
  titleGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  titleGroupMobile: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: 2,
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
  titleMobile: {
    flex: 0,
    fontSize: 17,
    width: '100%',
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
  arabicTitleMobile: {
    flex: 0,
    fontSize: 16,
    marginRight: 0,
    width: '100%',
  },
  chevron: {
    marginLeft: SPACING.sm,
  },
});
