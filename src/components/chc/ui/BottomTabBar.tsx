import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useId, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useBottomChrome } from '../../../context/BottomChromeContext';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { useIsCompactLandscape } from '../../../utils/useIsCompactLandscape';
import Icon from './Icon';

interface BottomTabBarProps {
  /** Top-level CHC section. Switching tabs uses replace(), so the peer sections
   * never build a back-button stack on top of one another. */
  active: 'home' | 'books' | 'music' | 'learn' | 'account' | null;
}

export default function BottomTabBar({ active }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preferences } = useReadingPreferences();
  const isCompactLandscape = useIsCompactLandscape();
  const isArabic = preferences.appLanguage === 'ar';
  const labels = isArabic
    ? { home: 'الرئيسية', books: 'الكتب', music: 'الترانيم', learn: 'التعلّم', account: 'الحساب' }
    : { home: 'Home', books: 'Books', music: 'Music', learn: 'Learn', account: 'Account' };
  const labelStyle = [styles.tabLabel, isCompactLandscape && styles.tabLabelLandscape, isArabic && styles.tabLabelArabic];
  const tabStyle = [styles.tab, isCompactLandscape && styles.tabLandscape];
  const iconSize = isCompactLandscape ? 22 : 27;

  // Tell floating UI (the now-playing bar) where this bar's top edge is, so it
  // can sit just above it. Only while focused: screens lower in a stack keep
  // their tab bar mounted underneath the screen being shown.
  const { reportTabBar } = useBottomChrome();
  const reportId = useId();
  const barHeight = useRef(0);
  const focused = useRef(false);
  const reportHeight = useCallback((height: number) => {
    const nextHeight = Math.max(0, Math.round(height));
    barHeight.current = nextHeight;
    if (focused.current && nextHeight > 0) {
      reportTabBar(reportId, nextHeight);
    }
  }, [reportId, reportTabBar]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    if (barHeight.current > 0) {
      reportTabBar(reportId, barHeight.current);
    }
    return () => {
      focused.current = false;
      reportTabBar(reportId, null);
    };
  }, [reportId, reportTabBar]));

  return (
    <View
      style={styles.shell}
      onLayout={(event) => reportHeight(event.nativeEvent.layout.height)}
    >
      <View style={[styles.bar, Platform.OS === 'web' && { paddingBottom: insets.bottom }]}>
      <Pressable accessibilityLabel={labels.home} style={tabStyle} onPress={() => router.replace('/')}>
        {active === 'home' ? <View style={styles.activeIndicator} /> : null}
        <Icon name="home-outline" size={iconSize} color={active === 'home' ? COLORS.gold : COLORS.muted} />
        <Text numberOfLines={1} style={[labelStyle, active === 'home' && styles.tabLabelActive]}>{labels.home}</Text>
      </Pressable>

      <Pressable accessibilityLabel={labels.books} style={tabStyle} onPress={() => router.replace('/books')}>
        {active === 'books' ? <View style={styles.activeIndicator} /> : null}
        <Icon name="library-outline" size={iconSize} color={active === 'books' ? COLORS.gold : COLORS.muted} />
        <Text numberOfLines={1} style={[labelStyle, active === 'books' && styles.tabLabelActive]}>{labels.books}</Text>
      </Pressable>

      <Pressable accessibilityLabel={labels.music} style={tabStyle} onPress={() => router.replace('/music')}>
        {active === 'music' ? <View style={styles.activeIndicator} /> : null}
        <Icon name="musical-notes" size={iconSize} color={active === 'music' ? COLORS.gold : COLORS.muted} />
        <Text numberOfLines={1} style={[labelStyle, active === 'music' && styles.tabLabelActive]}>{labels.music}</Text>
      </Pressable>

      <Pressable accessibilityLabel={labels.learn} style={tabStyle} onPress={() => router.replace('/learn')}>
        {active === 'learn' ? <View style={[styles.activeIndicator, styles.learningIndicator]} /> : null}
        <Icon name="school-outline" size={iconSize} color={active === 'learn' ? COLORS.learning : COLORS.muted} />
        <Text numberOfLines={1} style={[labelStyle, active === 'learn' && styles.tabLabelLearning]}>{labels.learn}</Text>
      </Pressable>

      <Pressable accessibilityLabel={labels.account} style={tabStyle} onPress={() => router.replace('/account')}>
        {active === 'account' ? <View style={styles.activeIndicator} /> : null}
        <Icon name="person-circle-outline" size={iconSize} color={active === 'account' ? COLORS.gold : COLORS.muted} />
        <Text numberOfLines={1} style={[labelStyle, active === 'account' && styles.tabLabelActive]}>{labels.account}</Text>
      </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { backgroundColor: COLORS.navy },
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
  learningIndicator: { backgroundColor: COLORS.learning },
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
  tabLabelLearning: {
    color: COLORS.learningBright,
  },
});
