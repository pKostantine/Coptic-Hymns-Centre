import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import Icon, { type IconName } from './Icon';

const MAX_FONT_SCALE = 1.25;

export interface JewelTileProps {
  /** Top-to-foot colours of the tile. */
  gradient: readonly [string, string, ...string[]];
  /** A light tint of the same hue, for the overline, icon and chevron. */
  accent: string;
  title: string;
  overline?: string;
  subtitle?: string;
  /** "stack": overline at the head, title at the foot (grid tiles). "row": a full-width card read left to right, with a chevron. */
  layout?: 'stack' | 'row';
  icon?: IconName;
  /** A row tile's own mark in place of an icon (Holy Week's cross badge). */
  leading?: ReactNode;
  minHeight?: number;
  titleSize?: number;
  arabic: boolean;
  bookmarked?: boolean;
  /** A hairline in the tile's own accent instead of the default faint white one. */
  outlined?: boolean;
  onPress: () => void;
}

/**
 * A tile in a book's menu, in the book's jewel colours — the same material as
 * its cover on the Books shelf, cut to fit what the menu holds: a grid of
 * hours, a pair of services, a full-width step in the Liturgy.
 */
export default function JewelTile({
  gradient,
  accent,
  title,
  overline,
  subtitle,
  layout = 'stack',
  icon,
  leading,
  minHeight,
  titleSize,
  arabic,
  bookmarked,
  outlined,
  onPress,
}: JewelTileProps) {
  const row = layout === 'row';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[overline, title, subtitle].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        row ? styles.tileRow : styles.tileStack,
        row && arabic && styles.rowReverse,
        { borderColor: outlined ? `${accent}55` : 'rgba(255, 255, 255, 0.09)' },
        minHeight ? { minHeight } : null,
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={row ? { x: 1, y: 0.7 } : { x: 0.6, y: 1 }}
        style={[StyleSheet.absoluteFill, styles.fill]}
      />
      {/* Wrapped so it stacks above the gradient on web, where a bare SVG paints beneath positioned siblings. */}
      {row && leading ? <View>{leading}</View> : row && icon ? <View><Icon name={icon} size={26} color={accent} /></View> : null}

      {row ? (
        <View style={styles.rowText}>
          {overline ? <Text style={[styles.overline, { color: accent }, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{overline}</Text> : null}
          <Text style={[styles.rowTitle, titleSize ? { fontSize: titleSize } : null, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, arabic && styles.arabicText]} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>{subtitle}</Text> : null}
        </View>
      ) : (
        <>
          <View style={[styles.head, arabic && styles.rowReverse]}>
            {overline ? (
              <Text style={[styles.overline, styles.headOverline, { color: accent }, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}>{overline}</Text>
            ) : <View />}
            <View style={[styles.headMarks, arabic && styles.rowReverse]}>
              {bookmarked ? <View><Icon name="bookmark" size={14} color={COLORS.gold} /></View> : null}
              {icon ? <View style={styles.headIcon}><Icon name={icon} size={24} color={accent} /></View> : null}
            </View>
          </View>
          <View>
            <Text
              style={[styles.stackTitle, titleSize ? { fontSize: titleSize } : null, arabic && styles.arabicText]}
              numberOfLines={2}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
            >
              {title}
            </Text>
            {subtitle ? <Text style={[styles.subtitle, arabic && styles.arabicText]} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>{subtitle}</Text> : null}
          </View>
        </>
      )}

      {row && bookmarked ? <View><Icon name="bookmark" size={16} color={COLORS.gold} /></View> : null}
      {row ? <View><Icon name={arabic ? 'chevron-back' : 'chevron-forward'} size={18} color={accent} /></View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Grows to fill a TileRow cell; in a plain column it keeps its own height.
  tile: { borderRadius: 18, borderWidth: 1, flexGrow: 1, overflow: 'hidden' },
  fill: { borderRadius: 17 },
  tileStack: { justifyContent: 'space-between', minHeight: 104, padding: 14 },
  tileRow: { alignItems: 'center', flexDirection: 'row', gap: 14, minHeight: 78, paddingHorizontal: 18, paddingVertical: 14 },
  rowReverse: { flexDirection: 'row-reverse' },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  head: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, justifyContent: 'space-between', minHeight: 18 },
  headOverline: { flexShrink: 1, marginTop: 2 },
  headMarks: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  headIcon: { opacity: 0.9 },
  overline: { fontFamily: TYPOGRAPHY.body, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.3 },
  stackTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 18, fontWeight: '700', marginTop: 14 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 19, fontWeight: '700', marginTop: 2 },
  subtitle: { color: 'rgba(255, 255, 255, 0.74)', fontFamily: TYPOGRAPHY.body, fontSize: 12.5, marginTop: 3 },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
