import Icon from '@/components/chc/ui/Icon';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import ToggleRow from '@/components/chc/ui/ToggleRow';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { OrientationMode, VisibleLanguages } from '@/utils/preferencesStorage';
import { goBack } from '@/utils/navigation';

const LANGUAGE_OPTIONS: { key: keyof VisibleLanguages; label: string; arabic: string }[] = [
  { key: 'english', label: 'English', arabic: 'الإنجليزية' },
  { key: 'coptic', label: 'Coptic', arabic: 'القبطية' },
  { key: 'copticRecitedPrayers', label: 'Coptic Recited Prayers', arabic: 'الصلوات القبطية المرتلة قراءة' },
  { key: 'arabic', label: 'Arabic', arabic: 'العربية' },
];

const ORIENTATION_OPTIONS: { key: OrientationMode; label: string; arabic: string }[] = [
  { key: 'landscape', label: 'Landscape', arabic: 'أفقي' },
  { key: 'reverseLandscape', label: 'Reverse Landscape', arabic: 'أفقي معكوس' },
  { key: 'portrait', label: 'Portrait', arabic: 'عمودي' },
  { key: 'auto', label: 'Auto Rotate', arabic: 'تدوير تلقائي' },
];

const SETTINGS_LABELS = {
  settings: { english: 'Settings', arabic: 'الإعدادات' },
  languages: { english: 'Languages', arabic: 'اللغات' },
  orientation: { english: 'Orientation', arabic: 'الاتجاه' },
  slideshowMode: { english: 'Slideshow Mode', arabic: 'وضع العرض التقديمي' },
  selectText: { english: 'Select Text', arabic: 'تحديد النص' },
  displayComments: { english: 'Display Comments', arabic: 'عرض التعليقات' },
  displaySilentPrayers: { english: 'Display Silent Prayers', arabic: 'عرض الصلوات السرية' },
};

const EASTERN_ARABIC_DIGITS: Record<string, string> = {
  '0': '٠',
  '1': '١',
  '2': '٢',
  '3': '٣',
  '4': '٤',
  '5': '٥',
  '6': '٦',
  '7': '٧',
  '8': '٨',
  '9': '٩',
};

function toEasternArabicDigits(value: number | string) {
  return String(value).replace(/\d/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit);
}

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
  const isArabicChrome = preferences.appLanguage === 'ar';
  const labelText = (label: { english?: string; label?: string; arabic: string }) =>
    isArabicChrome ? label.arabic : label.english || label.label || '';
  const localizedTextStyle = isArabicChrome && styles.arabicText;

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>CHC Settings</title>
      </Head>
      <AppHeader
        title={SETTINGS_LABELS.settings}
        canGoBack
        onBack={() => goBack(router, '/')}
        visibleLanguages={{ english: !isArabicChrome, arabic: isArabicChrome }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <Text style={[styles.groupLabel, localizedTextStyle]}>{labelText(SETTINGS_LABELS.languages)}</Text>
          <View style={styles.languageList}>
            {LANGUAGE_OPTIONS.map((item) => (
              <ToggleRow
                key={item.key}
                label={labelText(item)}
                isArabic={isArabicChrome}
                active={preferences.visibleLanguages[item.key]}
                onPress={() => toggleLanguage(item.key)}
              />
            ))}
          </View>

          <View style={styles.fontControls}>
            <Pressable accessibilityLabel="Decrease font size" style={styles.fontButton} onPress={() => setFontScale(-1)}>
              <Icon name="remove" size={18} color={COLORS.gold} />
            </Pressable>
            <Text style={[styles.fontSize, localizedTextStyle]}>
              {isArabicChrome ? toEasternArabicDigits(preferences.fontScale) : preferences.fontScale}
            </Text>
            <Pressable accessibilityLabel="Increase font size" style={styles.fontButton} onPress={() => setFontScale(1)}>
              <Icon name="add" size={18} color={COLORS.gold} />
            </Pressable>
          </View>

          {Platform.OS !== 'web' ? (
            <View style={styles.orientationGroup}>
              <Text style={[styles.groupLabel, localizedTextStyle]}>{labelText(SETTINGS_LABELS.orientation)}</Text>
              <View style={styles.orientationRow}>
                {ORIENTATION_OPTIONS.map((item) => {
                  const isActive = preferences.orientationMode === item.key;
                  const label = labelText(item);
                  return (
                    <Pressable
                      key={item.key}
                      accessibilityLabel={isArabicChrome ? label : `Use ${item.label} orientation`}
                      style={[styles.orientationButton, isActive && styles.toggleActive, { borderColor: isActive ? COLORS.gold : COLORS.border }]}
                      onPress={() => setOrientationMode(item.key)}
                    >
                      <Text style={[styles.toggleText, localizedTextStyle]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <ToggleRow label={labelText(SETTINGS_LABELS.slideshowMode)} isArabic={isArabicChrome} active={preferences.slideshowMode} onPress={toggleSlideshowMode} />
          <ToggleRow label={labelText(SETTINGS_LABELS.selectText)} isArabic={isArabicChrome} active={preferences.selectText} onPress={toggleSelectText} />
          <ToggleRow label={labelText(SETTINGS_LABELS.displayComments)} isArabic={isArabicChrome} active={preferences.displayComments} onPress={toggleDisplayComments} />
          <ToggleRow
            label={labelText(SETTINGS_LABELS.displaySilentPrayers)}
            isArabic={isArabicChrome}
            active={preferences.displaySilentPrayers}
            onPress={toggleDisplaySilentPrayers}
          />
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
  arabicText: {
    fontFamily: TYPOGRAPHY.arabic,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
