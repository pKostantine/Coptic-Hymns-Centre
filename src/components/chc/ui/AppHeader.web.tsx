'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { appText, type AppText } from '../../../utils/appText';
import { formatEnglishDisplayText } from '../../../utils/displayText';
import { useBrowserFullscreen } from '../../../utils/useBrowserFullscreen';
import { useIsMobileWeb } from '../../../utils/useIsMobileWeb';
import Icon, { IconName } from './Icon';

interface AppHeaderProps {
  title: string | AppText;
  canGoBack?: boolean;
  onBack?: () => void;
  rightLeadingIcon?: IconName;
  onRightLeadingPress?: () => void;
  rightLeadingAccessibilityLabel?: string;
  rightIcon?: IconName;
  onRightPress?: () => void;
  rightAccessibilityLabel?: string;
  visibleLanguages?: { english: boolean; arabic: boolean };
  showBrowserFullscreen?: boolean;
  /** A book's own colour in place of the navy bar, so the header runs straight into the band at the top of its menu. */
  tint?: string;
  /** False while the page shows the same title larger just below (a book's band); the header then names it only once that scrolls away. */
  titleVisible?: boolean;
}

/** CHC web header, with room for the safe area in edge-to-edge browsers. */
export default function AppHeader({
  title = 'Coptic Vine',
  canGoBack = false,
  onBack,
  rightLeadingIcon,
  onRightLeadingPress,
  rightLeadingAccessibilityLabel = 'Toggle full screen',
  rightIcon,
  onRightPress,
  rightAccessibilityLabel = 'Open settings',
  visibleLanguages,
  showBrowserFullscreen = true,
  tint,
  titleVisible = true,
}: AppHeaderProps) {
  const { preferences } = useReadingPreferences();
  const { isFullscreen, toggle: toggleFullscreen, shouldShow: shouldShowFullscreen } = useBrowserFullscreen();
  const titleParts = typeof title === 'string' ? { english: title, arabic: '' } : title;
  // Headers show whichever single language the user has selected app-wide —
  // never both at once — unless a caller explicitly overrides this. Falls
  // back to whichever language actually has text for this specific title if
  // the selected one doesn't, so a title missing an Arabic translation still
  // shows something rather than going blank.
  const wantsArabic = visibleLanguages ? visibleLanguages.arabic && !visibleLanguages.english : preferences.appLanguage === 'ar';
  const showArabic = wantsArabic && Boolean(titleParts.arabic);
  // Not Arabic: the French title in French, else the English.
  const latinTitle = appText({ ...titleParts, arabic: '' }, preferences.appLanguage === 'fr' ? 'fr' : 'en') || titleParts.arabic;
  const showEnglish = !showArabic;
  const defaultRightLeadingIcon = showBrowserFullscreen && shouldShowFullscreen ? (isFullscreen ? 'close-fullscreen' : 'open-in-full') : undefined;
  const defaultRightLeadingPress = showBrowserFullscreen && shouldShowFullscreen ? toggleFullscreen : undefined;
  const effectiveRightLeadingIcon = rightLeadingIcon ?? defaultRightLeadingIcon;
  const effectiveRightLeadingPress = rightLeadingIcon ? onRightLeadingPress : defaultRightLeadingPress;
  const hasRightLeadingAction = Boolean(effectiveRightLeadingIcon && effectiveRightLeadingPress);
  const hasRightAction = Boolean(rightIcon && onRightPress);
  const isMobileWeb = useIsMobileWeb();
  // Both sides take the width of the busier one, so the title stays centred
  // on the header however many buttons sit either side of it.
  const buttonSize = isMobileWeb ? 40 : 48;
  const slots = Math.max(1, canGoBack ? 1 : 0, (hasRightLeadingAction ? 1 : 0) + (hasRightAction ? 1 : 0));
  const sideWidth = slots * buttonSize + (slots - 1) * SPACING.sm;
  const insets = useSafeAreaInsets();
  const iconButtonStyle = [styles.iconButton, isMobileWeb && styles.iconButtonMobile];
  const iconSize = isMobileWeb ? 23 : 26;

  return (
    <View
      style={[
        styles.container,
        isMobileWeb && styles.containerMobile,
        tint ? { backgroundColor: tint, borderBottomColor: tint } : null,
        { paddingTop: (isMobileWeb ? SPACING.sm : SPACING.lg + 4) + insets.top },
      ]}
    >
      <View style={styles.topRow}>
        <View style={[styles.side, { width: sideWidth }]}>
          {canGoBack ? (
            <Pressable accessibilityLabel="Go back" style={iconButtonStyle} onPress={onBack}>
              <Icon name="chevron-back" size={isMobileWeb ? 24 : 28} color={COLORS.gold} />
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.titleGroup, !titleVisible && styles.titleHidden]} aria-hidden={!titleVisible}>
          {showEnglish ? (
            <Text
              style={[styles.title, isMobileWeb && styles.titleMobile, styles.centeredTitle]}
              numberOfLines={1}
            >
              {formatEnglishDisplayText(latinTitle)}
            </Text>
          ) : null}
          {showArabic ? (
            <Text
              style={[
                styles.title,
                isMobileWeb && styles.titleMobile,
                styles.arabicTitle,
                styles.centeredTitle,
              ]}
              numberOfLines={1}
            >
              {titleParts.arabic}
            </Text>
          ) : null}
        </View>

        <View style={[styles.side, styles.sideEnd, { width: sideWidth }]}>
          {hasRightLeadingAction ? (
            <Pressable
              accessibilityLabel={rightLeadingAccessibilityLabel}
              style={iconButtonStyle}
              onPress={effectiveRightLeadingPress}
            >
              <Icon name={effectiveRightLeadingIcon as IconName} size={iconSize} color={COLORS.gold} />
            </Pressable>
          ) : null}
          {hasRightAction ? (
            <Pressable accessibilityLabel={rightAccessibilityLabel} style={iconButtonStyle} onPress={onRightPress}>
              <Icon name={rightIcon as IconName} size={iconSize} color={COLORS.gold} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.green,
    borderBottomColor: COLORS.gold,
    borderBottomWidth: 1,
    paddingBottom: SPACING.md + 4,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg + 4,
  },
  containerMobile: {
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
  },
  iconButton: {
    alignItems: 'center',
    borderColor: 'rgba(227, 181, 59, 0.45)',
    borderRadius: 20,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  // Matched to AppHeader.tsx: 40 button and 22 title. Phone-width web was
  // rendering a header noticeably smaller than the app's.
  iconButtonMobile: {
    borderRadius: 18,
    height: 40,
    width: 40,
  },
  side: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  sideEnd: {
    justifyContent: 'flex-end',
  },
  titleGroup: {
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  titleHidden: {
    opacity: 0,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: TYPOGRAPHY.title,
    flex: 1,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0,
  },
  titleMobile: {
    fontSize: 22,
  },
  arabicTitle: {
    fontFamily: TYPOGRAPHY.arabic,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  centeredTitle: {
    textAlign: 'center',
  },
});
