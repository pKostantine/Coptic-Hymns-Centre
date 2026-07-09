import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import Icon from './Icon';

interface BottomTabBarProps {
  /** Which tab is the current screen — "Books" is the main menu, "settings" is /app-settings. Both are peer screens reached via router.replace, so switching never grows a back-button stack and this same bar renders identically on both. */
  active: 'books' | 'settings';
}

export default function BottomTabBar({ active }: BottomTabBarProps) {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const labels = isArabic
    ? { books: 'الكتب', settings: 'إعدادات التطبيق' }
    : { books: 'Books', settings: 'App Settings' };
  const labelStyle = [styles.tabLabel, isArabic && styles.tabLabelArabic];

  return (
    <View style={styles.bar}>
      <Pressable accessibilityLabel={labels.books} style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]} onPress={() => router.replace('/')}>
        {active === 'books' ? <View style={styles.activeIndicator} /> : null}
        <Icon name="library-outline" size={27} color={active === 'books' ? COLORS.gold : COLORS.muted} />
        <Text style={[labelStyle, active === 'books' && styles.tabLabelActive]}>{labels.books}</Text>
      </Pressable>
      <Pressable accessibilityLabel={labels.settings} style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]} onPress={() => router.replace('/app-settings')}>
        {active === 'settings' ? <View style={styles.activeIndicator} /> : null}
        <Icon name="settings-outline" size={27} color={active === 'settings' ? COLORS.gold : COLORS.muted} />
        <Text style={[labelStyle, active === 'settings' && styles.tabLabelActive]}>{labels.settings}</Text>
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
  tabLabel: {
    color: COLORS.muted,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 12,
    fontWeight: '700',
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
