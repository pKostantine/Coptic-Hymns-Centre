import Head from 'expo-router/head';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import AppHeader from '@/components/chc/ui/AppHeader';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { AppLanguage } from '@/utils/preferencesStorage';

const APP_LANGUAGE_OPTIONS: { key: AppLanguage; label: string; arabic: string }[] = [
  { key: 'en', label: 'English', arabic: 'الإنجليزية' },
  { key: 'ar', label: 'Arabic', arabic: 'العربية' },
];

/**
 * App-chrome-only language setting — only affects the main menu and
 * submenu/list screens (which side reads CategoryCard/HymnCard as a single
 * centered title). It never touches the text rendered inside an actual
 * document, which stays governed by Settings' own visibleLanguages toggles.
 *
 * Peer screen to the main menu, not a pushed subpage — reached and left via
 * the bottom tab bar (router.replace on both ends), so there's no back
 * button and no growing navigation stack.
 */
export default function AppSettingsScreen() {
  const { preferences, setAppLanguage } = useReadingPreferences();
  const showArabicChrome = preferences.appLanguage === 'ar';

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head>
        <title>CHC App Settings</title>
      </Head>
      <AppHeader
        title={{ english: 'App Settings', arabic: 'إعدادات التطبيق' }}
        visibleLanguages={{ english: !showArabicChrome, arabic: showArabicChrome }}
      />
      <NowPlayingAwareScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <View style={styles.groupLabelRow}>
            <Text style={styles.groupLabel}>App Language</Text>
            <Text style={[styles.groupLabel, styles.groupLabelArabic]}>لغة التطبيق</Text>
          </View>
          <View style={styles.optionRow}>
            {APP_LANGUAGE_OPTIONS.map((option) => {
              const isActive = preferences.appLanguage === option.key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isActive }}
                  accessibilityLabel={`Use ${option.label}`}
                  style={[styles.optionButton, isActive && styles.optionButtonActive]}
                  onPress={() => setAppLanguage(option.key)}
                >
                  <View style={[styles.radioOuter, isActive && styles.radioOuterActive]}>
                    {isActive ? <View style={styles.radioInner} /> : null}
                  </View>
                  <Text style={styles.optionText}>{option.label}</Text>
                  <Text style={[styles.optionText, styles.optionTextArabic]}>{option.arabic}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </NowPlayingAwareScrollView>
      <BottomTabBar active="settings" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xl },
  container: {
    borderBottomWidth: 1,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
    padding: SPACING.md,
  },
  groupLabel: { fontSize: 15, fontWeight: '800', color: COLORS.white },
  groupLabelRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm, justifyContent: 'space-between' },
  groupLabelArabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  optionRow: { gap: SPACING.sm },
  optionButton: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    minHeight: 48,
    paddingHorizontal: SPACING.md,
  },
  optionButtonActive: { backgroundColor: COLORS.navy, borderColor: COLORS.gold },
  radioOuter: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioOuterActive: { borderColor: COLORS.gold },
  radioInner: { backgroundColor: COLORS.gold, borderRadius: 5, height: 10, width: 10 },
  optionText: { color: COLORS.white, flex: 1, fontSize: 15, fontWeight: '700' },
  optionTextArabic: { fontFamily: 'Arial', textAlign: 'right', writingDirection: 'rtl' },
});
