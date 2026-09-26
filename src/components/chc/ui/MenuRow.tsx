import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import { formatEnglishDisplayText } from '../../../utils/displayText';
import { toEasternArabicDigits } from '../../../utils/localeFormat';
import Icon from './Icon';

/** Where a row sits in its group: the group's rounded outline is drawn by its first and last rows. */
export type MenuRowPosition = 'only' | 'first' | 'middle' | 'last';

export function menuRowPosition(index: number, count: number): MenuRowPosition {
  if (count <= 1) return 'only';
  if (index === 0) return 'first';
  return index === count - 1 ? 'last' : 'middle';
}

/** Menu text never grows past this multiple of its design size, so large accessibility text wraps instead of breaking the rows. */
const MAX_FONT_SCALE = 1.35;
const RADIUS = 16;

interface MenuRowProps {
  title: string;
  arabic?: string;
  subtitle?: string;
  subtitleArabic?: string;
  /** The app shows one language at a time; with only Arabic the row mirrors to read right to left. */
  showEnglish?: boolean;
  showArabic?: boolean;
  position?: MenuRowPosition;
  /** Something before the title — a numbered badge, say. The divider between rows starts after it. */
  leading?: ReactNode;
  isBookmarked?: boolean;
  /** An eve's night palette instead of the usual surface. */
  tone?: 'default' | 'night';
  /** The chevron's colour — a book's own accent inside its menu. */
  accent?: string;
  onPress?: () => void;
  onPressIn?: () => void;
  onHoverIn?: () => void;
}

/**
 * One row of a grouped list — the Books menus' submenus, the Bible's books,
 * the bookmarks. Rows share one rounded outline with hairline dividers between
 * them, rather than each being its own boxed card, so a list reads as a list.
 */
export default function MenuRow({
  title,
  arabic,
  subtitle,
  subtitleArabic,
  showEnglish = true,
  showArabic: showArabicProp = true,
  position = 'only',
  leading,
  isBookmarked,
  tone = 'default',
  accent,
  onPress,
  onPressIn,
  onHoverIn,
}: MenuRowProps) {
  const showArabic = showArabicProp && Boolean(arabic);
  const arabicOnly = showArabic && !showEnglish;
  const secondLine = arabicOnly ? subtitleArabic : subtitle;
  const isTop = position === 'first' || position === 'only';
  const isBottom = position === 'last' || position === 'only';
  const night = tone === 'night';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={onPressIn}
      onHoverIn={onHoverIn}
      style={({ pressed }) => [
        styles.row,
        night && styles.rowNight,
        isTop && styles.top,
        isBottom && styles.bottom,
        arabicOnly ? styles.rowArabic : styles.rowEnglish,
        pressed && (night ? styles.pressedNight : styles.pressed),
      ]}
    >
      {leading ? <View style={[styles.leading, arabicOnly ? styles.leadingArabic : styles.leadingEnglish]}>{leading}</View> : null}
      <View style={[styles.body, arabicOnly ? styles.bodyArabic : styles.bodyEnglish, !isTop && styles.divided]}>
        <View style={styles.text}>
          <View style={[styles.titles, arabicOnly && styles.mirrored]}>
            {showEnglish ? (
              <Text style={styles.title} maxFontSizeMultiplier={MAX_FONT_SCALE}>{formatEnglishDisplayText(title)}</Text>
            ) : null}
            {showArabic ? (
              <Text style={[styles.title, styles.arabic]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{toEasternArabicDigits(arabic!)}</Text>
            ) : null}
          </View>
          {secondLine ? (
            <Text style={[styles.subtitle, arabicOnly && styles.arabic]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {arabicOnly ? toEasternArabicDigits(secondLine) : secondLine}
            </Text>
          ) : null}
        </View>
        {isBookmarked ? <Icon name="bookmark" size={16} color={COLORS.gold} /> : null}
        <Icon name={arabicOnly ? 'chevron-back' : 'chevron-forward'} size={16} color={accent ?? (night ? COLORS.nightLine : 'rgba(201, 162, 39, 0.7)')} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.cardLine,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  rowNight: { backgroundColor: COLORS.nightSurface, borderColor: COLORS.nightLine },
  rowEnglish: { flexDirection: 'row', paddingLeft: 16 },
  rowArabic: { flexDirection: 'row-reverse', paddingRight: 16 },
  top: { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS, borderTopWidth: 1 },
  bottom: { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS, borderBottomWidth: 1 },
  pressed: { backgroundColor: COLORS.surfaceSoft },
  pressedNight: { backgroundColor: '#0A1830' },
  leading: { alignItems: 'center', justifyContent: 'center' },
  leadingEnglish: { marginRight: 14 },
  leadingArabic: { marginLeft: 14 },
  body: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flex: 1,
    gap: 10,
    minHeight: 56,
    paddingVertical: 13,
  },
  bodyEnglish: { flexDirection: 'row', paddingRight: 14 },
  bodyArabic: { flexDirection: 'row-reverse', paddingLeft: 14 },
  // The divider belongs to the text column, so it starts after any leading badge.
  divided: { borderTopColor: 'rgba(255, 255, 255, 0.08)', borderTopWidth: StyleSheet.hairlineWidth },
  text: { flex: 1, minWidth: 0 },
  titles: { flexDirection: 'row', gap: 12 },
  mirrored: { flexDirection: 'row-reverse' },
  title: { color: COLORS.white, flex: 1, fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '700' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  subtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: 3 },
});
