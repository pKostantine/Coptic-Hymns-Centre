import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { useIsCompactLandscape } from '../../../utils/useIsCompactLandscape';
import Icon from './Icon';

interface BottomTabBarProps {
  /** Which tab is the current screen — "Books" is the main menu, "settings" is /app-settings. Both are peer screens reached via router.replace, so switching never grows a back-button stack and this same bar renders identically on both. */
  active: 'books' | 'settings';
}

export default function BottomTabBar({ active }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preferences } = useReadingPreferences();
  // Sideways, height is the scarce axis: sitting the label beside the icon
  // instead of under it, on tighter padding, roughly halves the bar so it
  // stops eating the little vertical room the content has left.
  const isCompactLandscape = useIsCompactLandscape();
  const isArabic = preferences.appLanguage === 'ar';
  const labels = isArabic
    ? { books: 'الكتب', settings: 'إعدادات التطبيق' }
    : { books: 'Books', settings: 'App Settings' };
  const labelStyle = [styles.tabLabel, isCompactLandscape && styles.tabLabelLandscape, isArabic && styles.tabLabelArabic];
  const tabStyle = [styles.tab, isCompactLandscape && styles.tabLandscape];
  const iconSize = isCompactLandscape ? 22 : 27;

  return (
    <View style={[styles.bar, Platform.OS === 'web' && { paddingBottom: insets.bottom }]}>
      <Pressable accessibilityLabel={labels.books} style={tabStyle} onPress={() => router.replace('/')}>
        {active === 'books' ? <View style={styles.activeIndicator} /> : null}
        <Icon name="library-outline" size={iconSize} color={active === 'books' ? COLORS.gold : COLORS.muted} />
        <Text numberOfLines={1} style={[labelStyle, active === 'books' && styles.tabLabelActive]}>{labels.books}</Text>
      </Pressable>
      <Pressable accessibilityLabel={labels.settings} style={tabStyle} onPress={() => router.replace('/app-settings')}>
        {active === 'settings' ? <View style={styles.activeIndicator} /> : null}
        <Icon name="settings-outline" size={iconSize} color={active === 'settings' ? COLORS.gold : COLORS.muted} />
        <Text numberOfLines={1} style={[labelStyle, active === 'settings' && styles.tabLabelActive]}>{labels.settings}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: COLORS.navy,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexDirection: 'row',
  },
  activeIndicator: {
    backgroundColor: COLORS.gold,
    height: 3,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 10,
    position: 'relative',
  },
  tabLandscape: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
  },
  tabLabel: {
    color: COLORS.muted,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 12,
    fontWeight: '700',
  },
  tabLabelLandscape: {
    fontSize: 14,
    flexShrink: 1,
  },
  tabLabelArabic: {
    fontFamily: TYPOGRAPHY.arabic,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  tabLabelActive: {
    color: COLORS.gold,
  },
});
