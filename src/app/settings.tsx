import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import ToggleRow from '@/components/chc/ui/ToggleRow';
import { COLORS, SPACING } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { OrientationMode, VisibleLanguages } from '@/utils/preferencesStorage';
import { goBack } from '@/utils/navigation';

const LANGUAGE_OPTIONS: { key: keyof VisibleLanguages; label: string }[] = [
  { key: 'english', label: 'English' },
  { key: 'coptic', label: 'Coptic' },
  { key: 'copticRecitedPrayers', label: 'Coptic Recited Prayers' },
  { key: 'arabic', label: 'Arabic' },
];

const ORIENTATION_OPTIONS: { key: OrientationMode; label: string }[] = [
  { key: 'landscape', label: 'Landscape' },
  { key: 'reverseLandscape', label: 'Reverse Landscape' },
  { key: 'portrait', label: 'Portrait' },
  { key: 'auto', label: 'Auto Rotate' },
];

/** Settings screen — ported 1:1 from LanguageToggleBar.js, rendered as its own route instead of a Modal. */
export default function SettingsScreen() {
  const router = useRouter();
  const {
    preferences,
    toggleLanguage,
    setFontScale,
    setOrientationMode,
    toggleSelectText,
    toggleSlideshowMode,
    toggleDisplayComments,
    toggleDisplaySilentPrayers,
  } = useReadingPreferences();

  const showOrientationControls = Platform.OS !== 'web';

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>CHC Settings</title>
      </Head>
      <AppHeader title="Settings" canGoBack onBack={() => goBack(router, '/')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <Text style={styles.groupLabel}>Languages</Text>
          <View style={styles.languageList}>
            {LANGUAGE_OPTIONS.map((item) => (
              <ToggleRow
                key={item.key}
                label={item.label}
                active={preferences.visibleLanguages[item.key]}
                onPress={() => toggleLanguage(item.key)}
              />
            ))}
          </View>

          <View style={styles.fontControls}>
            <Pressable accessibilityLabel="Decrease font size" style={styles.fontButton} onPress={() => setFontScale(-1)}>
              <Ionicons name="remove" size={18} color={COLORS.gold} />
            </Pressable>
            <Text style={styles.fontSize}>{preferences.fontScale}</Text>
            <Pressable accessibilityLabel="Increase font size" style={styles.fontButton} onPress={() => setFontScale(1)}>
              <Ionicons name="add" size={18} color={COLORS.gold} />
            </Pressable>
          </View>

          {showOrientationControls ? (
            <View style={styles.orientationGroup}>
              <Text style={styles.groupLabel}>Orientation</Text>
              <View style={styles.orientationRow}>
                {ORIENTATION_OPTIONS.map((item) => {
                  const isActive = preferences.orientationMode === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      accessibilityLabel={`Use ${item.label} orientation`}
                      style={[styles.orientationButton, isActive && styles.toggleActive, { borderColor: isActive ? COLORS.gold : COLORS.border }]}
                      onPress={() => setOrientationMode(item.key)}
                    >
                      <Text style={styles.toggleText}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <ToggleRow label="Slideshow Mode" active={preferences.slideshowMode} onPress={toggleSlideshowMode} />
          <ToggleRow label="Select Text" active={preferences.selectText} onPress={toggleSelectText} />
          <ToggleRow label="Display Comments" active={preferences.displayComments} onPress={toggleDisplayComments} />
          <ToggleRow label="Display Silent Prayers" active={preferences.displaySilentPrayers} onPress={toggleDisplaySilentPrayers} />
        </View>
      </ScrollView>
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
  languageList: { gap: SPACING.sm },
  fontControls: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm, justifyContent: 'center' },
  fontButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  fontSize: { fontSize: 15, fontWeight: '700', minWidth: 30, textAlign: 'center', color: COLORS.white },
  orientationGroup: { gap: SPACING.sm },
  orientationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  orientationButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 128,
    paddingHorizontal: SPACING.sm,
  },
  toggleActive: { backgroundColor: COLORS.navy },
  toggleText: { fontSize: 13, fontWeight: '800', color: COLORS.white },
});
