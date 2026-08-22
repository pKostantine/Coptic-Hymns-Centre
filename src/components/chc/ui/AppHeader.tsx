import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { formatEnglishDisplayText } from '../../../utils/displayText';
import Icon, { IconName } from './Icon';

interface AppHeaderProps {
  title: string | { english: string; arabic: string };
  canGoBack?: boolean;
  onBack?: () => void;
  rightLeadingIcon?: IconName;
  onRightLeadingPress?: () => void;
  rightLeadingAccessibilityLabel?: string;
  rightIcon?: IconName;
  onRightPress?: () => void;
  rightAccessibilityLabel?: string;
  visibleLanguages?: { english: boolean; arabic: boolean };
}

/** CHC Header — ported 1:1 from Header.js/Header.web.js: generic icon-toolbar chrome shared by every screen. */
export default function AppHeader({
  title = 'Coptic Hymns Centre',
  canGoBack = false,
  onBack,
  rightLeadingIcon,
  onRightLeadingPress,
  rightLeadingAccessibilityLabel = 'Toggle full screen',
  rightIcon,
  onRightPress,
  rightAccessibilityLabel = 'Open settings',
  visibleLanguages,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const { preferences } = useReadingPreferences();
  const titleParts = typeof title === 'string' ? { english: title, arabic: '' } : title;
  // Headers show whichever single language the user has selected app-wide —
  // never both at once — unless a caller explicitly overrides this (none
  // currently do; the prop stays available for a future icon-only/dual-title
  // special case). Falls back to whichever language actually has text for
  // this specific title if the selected one doesn't, so a title missing an
  // Arabic translation still shows something rather than going blank.
  const wantsArabic = visibleLanguages ? visibleLanguages.arabic && !visibleLanguages.english : preferences.appLanguage === 'ar';
  const showArabic = wantsArabic && Boolean(titleParts.arabic);
  const showEnglish = !showArabic;
  const hasRightLeadingAction = Boolean(rightLeadingIcon && onRightLeadingPress);
  const hasRightAction = Boolean(rightIcon && onRightPress);

  return (
    <View style={[styles.container, { paddingTop: SPACING.sm + insets.top }]}>
      <View style={styles.topRow}>
        {canGoBack ? (
          <Pressable accessibilityLabel="Go back" style={styles.iconButton} onPress={onBack}>
            <Icon name="chevron-back" size={24} color={COLORS.gold} />
          </Pressable>
        ) : (
          <Image source={require('../../../../assets/images/CHC_sm.png')} style={styles.logo} />
        )}

        <View style={styles.titleGroup}>
          {showEnglish ? (
            <Text style={[styles.title, styles.centeredTitle]} numberOfLines={1}>
              {formatEnglishDisplayText(titleParts.english || titleParts.arabic)}
            </Text>
          ) : null}
          {showArabic ? (
            <Text style={[styles.title, styles.arabicTitle, styles.centeredTitle]} numberOfLines={1}>
              {titleParts.arabic}
            </Text>
          ) : null}
        </View>

        {hasRightLeadingAction || hasRightAction ? (
          <View style={styles.rightActions}>
            {hasRightLeadingAction ? (
              <Pressable
                accessibilityLabel={rightLeadingAccessibilityLabel}
                style={styles.iconButton}
                onPress={onRightLeadingPress}
              >
                <Icon name={rightLeadingIcon as IconName} size={23} color={COLORS.gold} />
              </Pressable>
            ) : null}
            {hasRightAction ? (
              <Pressable accessibilityLabel={rightAccessibilityLabel} style={styles.iconButton} onPress={onRightPress}>
                <Icon name={rightIcon as IconName} size={23} color={COLORS.gold} />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.iconSpacer} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.navy,
    borderBottomColor: COLORS.gold,
    borderBottomWidth: 1,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
  },
  iconButton: {
    alignItems: 'center',
    borderColor: 'rgba(201, 162, 39, 0.45)',
    borderRadius: 18,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  logo: {
    height: 44,
    width: 44,
    resizeMode: 'contain',
  },
  iconSpacer: {
    height: 40,
    width: 40,
  },
  rightActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  titleGroup: {
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: TYPOGRAPHY.title,
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
  },
  arabicTitle: {
    fontFamily: TYPOGRAPHY.arabic,
    writingDirection: 'rtl',
  },
  centeredTitle: {
    textAlign: 'center',
  },
});
