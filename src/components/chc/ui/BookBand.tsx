import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { BookTheme } from '../../../constants/bookTheme';
import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import CopticCross from './CopticCross';

const MAX_FONT_SCALE = 1.25;

/** The band's text keeps to the same measure as the menu under it, so both line up on wide screens. */
export const BOOK_MENU_MAX_WIDTH = 680;

interface BookBandProps {
  theme: BookTheme;
  title: string;
  description?: string;
  overline?: string;
  arabic: boolean;
  /** Anything to set under the description — Holy Week puts a "today" line there. */
  children?: ReactNode;
}

/**
 * The top of a book's own menu: its jewel colour carried over from its cover
 * on the Books shelf, running on from the header above it and fading down
 * into the page, with the book's name set large at its foot. Opening a book
 * reads as stepping inside that cover.
 */
export default function BookBand({ theme, title, description, overline, arabic, children }: BookBandProps) {
  return (
    <View style={styles.band}>
      <LinearGradient
        colors={[theme.gradient[0], theme.gradient[1], COLORS.black]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner}>
        <View style={[styles.watermark, arabic ? styles.watermarkLeft : styles.watermarkRight]} pointerEvents="none">
          <CopticCross size={112} color={`${theme.accent}1F`} />
        </View>
        <View style={[styles.text, arabic ? styles.textArabic : styles.textLatin]}>
          {overline ? (
            <Text style={[styles.overline, { color: theme.accent }, arabic && styles.arabicOverline]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{overline}</Text>
          ) : null}
          <Text style={[styles.title, arabic && styles.arabicTitle]} maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={2}>{title}</Text>
          {description ? (
            <Text style={[styles.description, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{description}</Text>
          ) : null}
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { overflow: 'hidden' },
  inner: {
    alignSelf: 'center',
    justifyContent: 'flex-end',
    maxWidth: BOOK_MENU_MAX_WIDTH,
    minHeight: 132,
    paddingBottom: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
    width: '100%',
  },
  watermark: { position: 'absolute', top: 12 },
  watermarkRight: { right: 22 },
  watermarkLeft: { left: 22 },
  // The text stops short of the cross, so a long name wraps before it rather than across it.
  text: {},
  textLatin: { paddingRight: 84 },
  textArabic: { paddingLeft: 84 },
  overline: { fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', letterSpacing: 1.8, marginBottom: 4 },
  arabicOverline: { fontFamily: TYPOGRAPHY.arabic, fontSize: 13, letterSpacing: 0, textAlign: 'right', writingDirection: 'rtl' },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 34, fontWeight: '700', lineHeight: 40 },
  arabicTitle: { fontFamily: TYPOGRAPHY.arabic, lineHeight: 50, textAlign: 'right', writingDirection: 'rtl' },
  description: { color: 'rgba(255, 255, 255, 0.78)', fontFamily: TYPOGRAPHY.body, fontSize: 14.5, marginTop: 4 },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
