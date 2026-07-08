import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import Icon from './Icon';

interface BottomTabBarProps {
  /** Which tab is the current screen — "Books" is the main menu, "settings" is /app-settings. Both are peer screens reached via router.replace, so switching never grows a back-button stack and this same bar renders identically on both. */
  active: 'books' | 'settings';
}

export default function BottomTabBar({ active }: BottomTabBarProps) {
  const router = useRouter();

  return (
    <View style={styles.bar}>
      <Pressable accessibilityLabel="Books" style={styles.tab} onPress={() => router.replace('/')}>
        <Icon name="library-outline" size={27} color={active === 'books' ? COLORS.gold : COLORS.muted} />
        <Text style={[styles.tabLabel, active === 'books' && styles.tabLabelActive]}>Books</Text>
      </Pressable>
      <Pressable accessibilityLabel="App Settings" style={styles.tab} onPress={() => router.replace('/app-settings')}>
        <Icon name="settings-outline" size={27} color={active === 'settings' ? COLORS.gold : COLORS.muted} />
        <Text style={[styles.tabLabel, active === 'settings' && styles.tabLabelActive]}>App Settings</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: COLORS.navy,
    borderTopColor: COLORS.gold,
    borderTopWidth: 1,
    flexDirection: 'row',
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 10,
  },
  tabLabel: {
    color: COLORS.muted,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 12,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: COLORS.gold,
  },
});
