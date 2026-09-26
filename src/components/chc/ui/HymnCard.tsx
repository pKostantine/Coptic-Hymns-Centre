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

/** Submenu text never grows past this multiple of its design size, so large accessibility text wraps rather than overflowing. */
const MAX_FONT_SCALE = 1.35;

interface HymnCardProps {
  title: string;
  arabic?: string;
  /** An optional second line under the title (English / Arabic). */
  subtitle?: string;
  subtitleArabic?: string;
  isBookmarked?: boolean;
  onPress?: () => void;
  onPressIn?: () => void;
  onHoverIn?: () => void;
  /** Both default true — the App Language setting passes only one of these, so the card shows a single title, aligned to that language's reading direction. */
  showEnglish?: boolean;
  showArabic?: boolean;
}

/**
 * CHC submenu row: the title (English left / Arabic right when both show),
 * an optional subtitle, the bookmark glyph, and a gold chevron. With only
 * Arabic showing, the whole row mirrors so it reads right to left.
 */
export default function HymnCard({
  title,
  arabic,
  subtitle,
  subtitleArabic,
  isBookmarked,
  onPress,
  onPressIn,
  onHoverIn,
  showEnglish = true,
  showArabic: showArabicProp = true,
}: HymnCardProps) {
  const showArabic = showArabicProp && Boolean(arabic);
  const arabicOnly = showArabic && !showEnglish;
  const secondLine = arabicOnly ? subtitleArabic || '' : subtitle || '';

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, arabicOnly && styles.mirrored, pressed && styles.cardPressed]}
      onPress={onPress}
      onPressIn={onPressIn}
      onHoverIn={onHoverIn}
    >
      <View style={styles.textGroup}>
        <View style={[styles.titleTable, arabicOnly && styles.mirrored]}>
          {showEnglish ? (
            <Text style={styles.title} maxFontSizeMultiplier={MAX_FONT_SCALE}>{formatEnglishDisplayText(title)}</Text>
          ) : null}
          {showArabic ? (
            <Text style={[styles.title, styles.arabicTitle]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{formatArabicNumbers(arabic!)}</Text>
          ) : null}
        </View>
        {secondLine ? (
          <Text style={[styles.subtitle, arabicOnly && styles.arabicSubtitle]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {arabicOnly ? formatArabicNumbers(secondLine) : secondLine}
          </Text>
        ) : null}
      </View>
      {isBookmarked ? <Icon name="bookmark" size={17} color={COLORS.gold} /> : null}
      <Icon name={arabicOnly ? 'chevron-back' : 'chevron-forward'} size={18} color={COLORS.gold} style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.cardLine,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm + 4,
    marginBottom: 10,
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  cardPressed: { backgroundColor: COLORS.surfaceSoft, borderColor: COLORS.goldLine },
  mirrored: { flexDirection: 'row-reverse' },
  textGroup: { flex: 1 },
  titleTable: { flexDirection: 'row', gap: SPACING.md },
  title: {
    color: COLORS.white,
    flex: 1,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0,
  },
  arabicTitle: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  subtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: 3 },
  arabicSubtitle: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  chevron: { opacity: 0.9 },
});
