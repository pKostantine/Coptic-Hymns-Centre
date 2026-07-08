import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { formatEnglishDisplayText } from '../../../utils/displayText';
import { useIsMobileWeb } from '../../../utils/useIsMobileWeb';
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

/** CHC Header (web) — ported 1:1 from Header.web.js: no safe-area top inset, CHC_sm_web logo. */
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
  visibleLanguages = { english: true, arabic: true },
}: AppHeaderProps) {
  const titleParts = typeof title === 'string' ? { english: title, arabic: '' } : title;
  const showEnglish = visibleLanguages.english || !visibleLanguages.arabic;
  const showArabic = visibleLanguages.arabic && Boolean(titleParts.arabic);
  const visibleTitleCount = [showEnglish, showArabic].filter(Boolean).length;
  const hasRightLeadingAction = Boolean(rightLeadingIcon && onRightLeadingPress);
  const hasRightAction = Boolean(rightIcon && onRightPress);
  const isMobileWeb = useIsMobileWeb();
  const iconButtonStyle = [styles.iconButton, isMobileWeb && styles.iconButtonMobile];
  const iconSize = isMobileWeb ? 22 : 26;

  return (
    <View style={[styles.container, isMobileWeb && styles.containerMobile]}>
      <View style={styles.topRow}>
        {canGoBack ? (
          <Pressable accessibilityLabel="Go back" style={iconButtonStyle} onPress={onBack}>
            <Icon name="chevron-back" size={isMobileWeb ? 24 : 28} color={COLORS.gold} />
          </Pressable>
        ) : (
          <Image
            source={require('../../../../assets/images/CHC_sm_web.png')}
            style={[styles.logo, isMobileWeb && styles.logoMobile]}
          />
        )}

        <View style={styles.titleGroup}>
          {showEnglish ? (
            <Text
              style={[styles.title, isMobileWeb && styles.titleMobile, visibleTitleCount === 1 && styles.centeredTitle]}
              numberOfLines={1}
            >
              {formatEnglishDisplayText(titleParts.english)}
            </Text>
          ) : null}
          {showArabic ? (
            <Text
              style={[
                styles.title,
                isMobileWeb && styles.titleMobile,
                styles.arabicTitle,
                visibleTitleCount === 1 && styles.centeredTitle,
              ]}
              numberOfLines={1}
            >
              {titleParts.arabic}
            </Text>
          ) : null}
        </View>

        {hasRightLeadingAction || hasRightAction ? (
          <View style={styles.rightActions}>
            {hasRightLeadingAction ? (
              <Pressable
                accessibilityLabel={rightLeadingAccessibilityLabel}
                style={iconButtonStyle}
                onPress={onRightLeadingPress}
              >
                <Icon name={rightLeadingIcon as IconName} size={iconSize} color={COLORS.gold} />
              </Pressable>
            ) : null}
            {hasRightAction ? (
              <Pressable accessibilityLabel={rightAccessibilityLabel} style={iconButtonStyle} onPress={onRightPress}>
                <Icon name={rightIcon as IconName} size={iconSize} color={COLORS.gold} />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={[styles.iconSpacer, isMobileWeb && styles.iconSpacerMobile]} />
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
    borderColor: 'rgba(201, 162, 39, 0.45)',
    borderRadius: 20,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  iconButtonMobile: {
    borderRadius: 16,
    height: 36,
    width: 36,
  },
  logo: {
    height: 48,
    width: 48,
    resizeMode: 'contain',
  },
  logoMobile: {
    height: 32,
    width: 32,
  },
  iconSpacer: {
    height: 48,
    width: 48,
  },
  iconSpacerMobile: {
    height: 36,
    width: 36,
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
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0,
  },
  titleMobile: {
    fontSize: 18,
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
