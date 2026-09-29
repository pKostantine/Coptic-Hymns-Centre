'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { appText, appTextIsArabic, type AppText } from '../../../utils/appText';
import { formatEnglishDisplayText } from '../../../utils/displayText';
import Icon, { IconName } from './Icon';

interface DocumentTopBarProps {
  title: string | AppText;
  onBack: () => void;
  backAccessibilityLabel?: string;
  leadingIcon?: IconName;
  onLeadingPress?: () => void;
  leadingAccessibilityLabel?: string;
  trailingIcon?: IconName;
  onTrailingPress?: () => void;
  trailingAccessibilityLabel?: string;
}

const BUTTON = 32;

/**
 * The bar above a document being read.
 *
 * AppHeader is the app's chrome — a 22–26px title over 40–48px bordered
 * buttons, ~96px tall on a desktop browser. That is right for a menu, where the
 * header is the page's identity, and wrong above a document, where it is only a
 * way out and the text underneath is the point. This is the same three
 * controls at roughly half the height: hairline rule, small glyphs with no
 * boxes around them, and a title sized to label the page rather than announce
 * it.
 *
 * Only the web build renders this. The native app navigates documents by edge
 * swipe and shows no bar at all.
 */
export default function DocumentTopBar({
  title,
  onBack,
  backAccessibilityLabel = 'Go back',
  leadingIcon,
  onLeadingPress,
  leadingAccessibilityLabel,
  trailingIcon,
  onTrailingPress,
  trailingAccessibilityLabel,
}: DocumentTopBarProps) {
  const insets = useSafeAreaInsets();
  const { preferences } = useReadingPreferences();
  const titleParts = typeof title === 'string' ? { english: title, arabic: '' } : title;

  // One language at a time, matching AppHeader: the app-wide choice, falling
  // back to whichever one this particular title actually has.
  const showArabic = appTextIsArabic(titleParts, preferences.appLanguage);
  const label = showArabic
    ? titleParts.arabic
    : formatEnglishDisplayText(appText(titleParts, preferences.appLanguage));

  const hasLeading = Boolean(leadingIcon && onLeadingPress);
  const hasTrailing = Boolean(trailingIcon && onTrailingPress);
  // Both sides reserve the width of the busier one so the title stays centred
  // however many buttons sit beside it.
  const slots = Math.max(1, (hasLeading ? 1 : 0) + (hasTrailing ? 1 : 0));
  const sideWidth = slots * BUTTON + (slots - 1) * SPACING.xs;

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        <View style={[styles.side, { width: sideWidth }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backAccessibilityLabel}
            hitSlop={8}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={onBack}
          >
            <Icon name="chevron-back" size={20} color={COLORS.gold} />
          </Pressable>
        </View>

        <Text style={[styles.title, showArabic && styles.arabicTitle]} numberOfLines={1}>
          {label}
        </Text>

        <View style={[styles.side, styles.sideEnd, { width: sideWidth }]}>
          {hasLeading ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={leadingAccessibilityLabel}
              hitSlop={8}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={onLeadingPress}
            >
              <Icon name={leadingIcon as IconName} size={18} color={COLORS.gold} />
            </Pressable>
          ) : null}
          {hasTrailing ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={trailingAccessibilityLabel}
              hitSlop={8}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={onTrailingPress}
            >
              <Icon name={trailingIcon as IconName} size={18} color={COLORS.gold} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: COLORS.navy,
    // A hairline rather than the menus' full gold rule: at this height a 1px
    // solid line is a third of the bar's visual weight.
    borderBottomColor: COLORS.goldLine,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    height: 40,
    paddingHorizontal: SPACING.sm,
  },
  side: { flexDirection: 'row', gap: SPACING.xs },
  sideEnd: { justifyContent: 'flex-end' },
  button: {
    alignItems: 'center',
    borderRadius: RADII.sm,
    height: BUTTON,
    justifyContent: 'center',
    width: BUTTON,
  },
  buttonPressed: { backgroundColor: COLORS.goldSoft },
  title: {
    color: COLORS.white,
    flex: 1,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  arabicTitle: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
});
