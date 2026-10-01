import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { DAY_BLOCK_GRADIENT_END, DAY_BLOCK_GRADIENT_START, type DayBlockTheme } from '../../../constants/seasonAppearance';
import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import Icon, { type IconName } from './Icon';
import { VineDivider } from './Ornaments';

const MAX_FONT_SCALE = 1.25;

export interface TodayCardAction {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Set before the label: the design's ▶ on "Open" and "Pray". */
  leadingIcon?: IconName;
  /** Set after it: the chevron on the Books block's Holy Week button. */
  trailingIcon?: IconName;
}

export interface TodayCardFooter {
  /** The small line: "Next season", "Then", "Next". */
  label: string;
  value: string;
  /** Set after the value in the lighter colour: "· 56 days", "· at dawn". */
  detail?: string;
  action?: TodayCardAction;
}

interface TodayCardProps {
  theme: DayBlockTheme;
  /** Drawn instead of the season's gradient (Holy Week's crimson). */
  background?: ReactNode;
  arabic: boolean;
  /** The row across the top: Live, the season, the eve or the day's arrows. */
  controls?: ReactNode;
  heading: string;
  /** "small" for a service's name, which runs longer than a date. */
  headingSize?: 'large' | 'small';
  subheading?: string;
  /** Makes the heading a button (the Books block opens the calendar from it). */
  onPressHeading?: () => void;
  headingAccessibilityLabel?: string;
  /** A strip of days or hours under the heading (DayStrip). */
  strip?: ReactNode;
  /** Under the vine divider: what comes next, and the gold button. */
  footer?: TodayCardFooter;
}

/**
 * The day card at the top of the Books screen and of the book pages (CHC
 * design, "Books" and "Book Pages"): a control row, a large heading over a
 * smaller line, an optional strip of days or hours, and a footer under the
 * vine divider saying what comes next. It wears the season's colours unless
 * given a background of its own.
 */
export default function TodayCard({
  theme,
  background,
  arabic,
  controls,
  heading,
  headingSize = 'large',
  subheading,
  onPressHeading,
  headingAccessibilityLabel,
  strip,
  footer,
}: TodayCardProps) {
  const headingBlock = (
    <>
      <Text
        style={[headingSize === 'small' ? styles.headingSmall : styles.heading, { color: theme.text }, arabic && styles.arabicHeading]}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        numberOfLines={headingSize === 'small' ? 2 : 1}
        adjustsFontSizeToFit={headingSize === 'large'}
        minimumFontScale={0.7}
      >
        {heading}
      </Text>
      {subheading ? (
        <Text style={[styles.subheading, { color: theme.muted }, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}>
          {subheading}
        </Text>
      ) : null}
    </>
  );

  return (
    <View style={[styles.block, { borderColor: theme.border }]}>
      {background ?? <ThemeBackground theme={theme} />}

      <View style={[styles.inner, !footer && styles.innerAlone]}>
        {controls}
        {onPressHeading ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={headingAccessibilityLabel}
            onPress={onPressHeading}
            style={({ pressed }) => [controls ? styles.date : null, pressed && styles.pressed]}
          >
            {headingBlock}
          </Pressable>
        ) : (
          <View style={controls ? styles.date : null}>{headingBlock}</View>
        )}
        {strip}
      </View>

      {footer ? (
        <>
          <View style={styles.divider} pointerEvents="none">
            <VineDivider width={200} height={26} />
          </View>
          <View style={[styles.footer, arabic && styles.rowReverse]}>
            <View style={styles.footerText}>
              <Text style={[styles.footerLabel, { color: theme.muted }, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {footer.label}
              </Text>
              <Text style={[styles.footerValue, { color: theme.text }, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}>
                {footer.value}
                {footer.detail ? <Text style={[styles.footerDetail, { color: theme.strong }]}>{` · ${footer.detail}`}</Text> : null}
              </Text>
            </View>
            {footer.action ? <GoButton action={footer.action} arabic={arabic} /> : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

/** The gold pill in a day card's footer. */
function GoButton({ action, arabic }: { action: TodayCardAction; arabic: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel ?? action.label}
      onPress={action.onPress}
      style={({ pressed }) => [styles.go, arabic && styles.rowReverse, pressed && styles.pressed]}
    >
      {action.leadingIcon ? <Icon name={action.leadingIcon} size={14} color={COLORS.greenDeep} /> : null}
      <Text style={[styles.goText, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{action.label}</Text>
      {action.trailingIcon ? <Icon name={action.trailingIcon} size={14} color={COLORS.greenDeep} /> : null}
    </Pressable>
  );
}

export interface DayStripItem {
  key: string;
  /** Over the value: the weekday, or the hour's name. */
  label: string;
  /** The day of the month, the hour's number — or an icon (the Night's moon). */
  value: string | { icon: IconName };
  /** Under it: the Coptic day. */
  sub?: string;
  selected: boolean;
  /** The gold dot of a feast (or of Good Friday). */
  dot?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}

/**
 * A row of days or hours across a day card, the chosen one on a gold pill.
 * Days read weekday, date, Coptic day; hours read their name over their
 * number in the title face.
 */
export function DayStrip({ items, theme, arabic, variant = 'days' }: { items: DayStripItem[]; theme: DayBlockTheme; arabic: boolean; variant?: 'days' | 'hours' }) {
  return (
    <View style={[styles.strip, arabic && styles.rowReverse]}>
      {items.map((item) => {
        const color = (normal: string) => (item.selected ? theme.selectedText : normal);
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected: item.selected }}
            accessibilityLabel={item.accessibilityLabel}
            onPress={item.onPress}
            style={({ pressed }) => [styles.stripItem, item.selected && { backgroundColor: theme.selected }, pressed && !item.selected && styles.stripItemPressed]}
          >
            {item.dot ? <View style={[styles.stripDot, arabic ? styles.stripDotArabic : null, { backgroundColor: item.selected ? theme.selectedText : COLORS.gold }]} /> : null}
            <Text
              style={[variant === 'hours' ? styles.stripLabelHours : styles.stripLabel, { color: color(theme.muted) }, arabic && styles.arabicSmall]}
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
            >
              {item.label}
            </Text>
            {typeof item.value === 'string' ? (
              <Text style={[variant === 'hours' ? styles.stripHour : styles.stripValue, { color: color(theme.text) }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {item.value}
              </Text>
            ) : (
              <View style={styles.stripIcon}>
                <Icon name={item.value.icon} size={16} color={item.selected ? theme.selectedText : COLORS.rowBlue} />
              </View>
            )}
            {item.sub !== undefined ? (
              <Text style={[styles.stripSub, { color: color(theme.strong) }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {item.sub}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The season's gradient. When the day changes to another season the new
 * colours fade in over the old ones (about 220 ms, as the spec asks) rather
 * than cutting.
 */
export function ThemeBackground({ theme }: { theme: DayBlockTheme }) {
  const [layers, setLayers] = useState<{ current: DayBlockTheme; previous: DayBlockTheme | null }>({ current: theme, previous: null });

  if (layers.current.key !== theme.key) {
    // Recorded during render so the old colours stay underneath while the new
    // ones fade in over them.
    setLayers({ current: theme, previous: layers.current });
  }

  return (
    <>
      {layers.previous ? <Gradient theme={layers.previous} /> : null}
      {/* Keyed by season: each new season's layer mounts fresh and fades itself in. */}
      <FadeIn key={layers.current.key} animate={layers.previous !== null}>
        <Gradient theme={layers.current} />
      </FadeIn>
    </>
  );
}

function FadeIn({ animate, children }: { animate: boolean; children: ReactNode }) {
  const [opacity] = useState(() => new Animated.Value(animate ? 0 : 1));
  useEffect(() => {
    if (!animate) return;
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [animate, opacity]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
      {children}
    </Animated.View>
  );
}

function Gradient({ theme }: { theme: DayBlockTheme }) {
  return (
    <LinearGradient
      colors={[theme.from, theme.to]}
      locations={[0, theme.toAt]}
      start={DAY_BLOCK_GRADIENT_START}
      end={DAY_BLOCK_GRADIENT_END}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  block: { borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  inner: { paddingHorizontal: 16, paddingTop: 16 },
  innerAlone: { paddingBottom: 18 },
  rowReverse: { flexDirection: 'row-reverse' },
  date: { marginTop: 20 },
  heading: { fontFamily: TYPOGRAPHY.title, fontSize: 40, fontWeight: '700', lineHeight: 46 },
  headingSmall: { fontFamily: TYPOGRAPHY.title, fontSize: 30, fontWeight: '700', lineHeight: 34 },
  subheading: { fontFamily: TYPOGRAPHY.body, fontSize: 15, marginTop: 6 },
  strip: { flexDirection: 'row', gap: 4, marginTop: 20 },
  stripItem: { alignItems: 'center', borderRadius: 14, flex: 1, gap: 2, minWidth: 0, paddingBottom: 9, paddingTop: 8 },
  stripItemPressed: { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  stripLabel: { fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '600' },
  stripLabelHours: { fontFamily: TYPOGRAPHY.body, fontSize: 10, fontWeight: '600' },
  stripValue: { fontFamily: TYPOGRAPHY.body, fontSize: 17, fontWeight: '600' },
  stripHour: { fontFamily: TYPOGRAPHY.title, fontSize: 19, fontWeight: '700' },
  stripIcon: { height: 23, justifyContent: 'center' },
  stripSub: { fontFamily: TYPOGRAPHY.body, fontSize: 10 },
  stripDot: { borderRadius: 2, height: 4, position: 'absolute', right: 9, top: 6, width: 4 },
  stripDotArabic: { left: 9, right: undefined },
  divider: { alignItems: 'center', marginTop: 14, opacity: 0.85 },
  footer: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingBottom: 14, paddingHorizontal: 16, paddingTop: 12 },
  footerText: { flex: 1, minWidth: 0 },
  footerLabel: { fontFamily: TYPOGRAPHY.body, fontSize: 12 },
  footerValue: { fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '600', marginTop: 2 },
  footerDetail: { fontWeight: '500' },
  go: {
    alignItems: 'center',
    backgroundColor: COLORS.gold,
    borderRadius: 99,
    flexDirection: 'row',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
  },
  goText: { color: COLORS.greenDeep, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  arabicHeading: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  arabicSmall: { fontFamily: TYPOGRAPHY.arabic },
});
