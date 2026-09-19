import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import FontScaleControl from '@/components/chc/ui/FontScaleControl';
import Icon from '@/components/chc/ui/Icon';
import SaintHymnPicker from '@/components/chc/ui/SaintHymnPicker';
import ToggleRow from '@/components/chc/ui/ToggleRow';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { goBack } from '@/utils/navigation';
import { OrientationMode, VisibleLanguages } from '@/utils/preferencesStorage';
import { DISABLED_TEXT_SELECTION_STYLE } from '@/utils/textSelection';

const LANGUAGE_OPTIONS: { key: keyof VisibleLanguages; label: string; arabic: string }[] = [
  { key: 'english', label: 'English', arabic: 'الإنجليزية' }, { key: 'coptic', label: 'Coptic', arabic: 'القبطية' },
  { key: 'copticRecitedPrayers', label: 'Coptic Recited Prayers', arabic: 'الصلوات القبطية المرتلة قراءة' }, { key: 'arabic', label: 'Arabic', arabic: 'العربية' },
];
const ORIENTATION_OPTIONS: { key: OrientationMode; label: string; arabic: string }[] = [
  { key: 'landscape', label: 'Landscape', arabic: 'أفقي' }, { key: 'reverseLandscape', label: 'Reverse Landscape', arabic: 'أفقي معكوس' },
  { key: 'portrait', label: 'Portrait', arabic: 'عمودي' }, { key: 'auto', label: 'Auto Rotate', arabic: 'تدوير تلقائي' },
];
const SETTINGS_LABELS = {
  settings: { english: 'Settings', arabic: 'الإعدادات' }, languages: { english: 'Languages', arabic: 'اللغات' }, orientation: { english: 'Orientation', arabic: 'الاتجاه' },
  display: { english: 'Display', arabic: 'العرض' }, slideshowMode: { english: 'Slideshow Mode', arabic: 'وضع العرض التقديمي' }, selectText: { english: 'Select Text', arabic: 'تحديد النص' },
  displayComments: { english: 'Display Comments', arabic: 'عرض التعليقات' }, displaySilentPrayers: { english: 'Display Silent Prayers', arabic: 'عرض الصلوات السرية' }, displayNowPlayingBar: { english: 'Display Now Playing Bar', arabic: 'عرض شريط التشغيل الحالي' },
  content: { english: 'Content', arabic: 'المحتوى' }, saintHymns: { english: 'Saint Hymns', arabic: 'ألحان القديسين' }, inMonastery: { english: 'In Monastery', arabic: 'في الدير' },
  textSize: { english: 'Text Size', arabic: 'حجم النص' }, downloads: { english: 'Downloads & Storage', arabic: 'التنزيلات والتخزين' },
};
interface SettingsScreenProps { onClose?: () => void; }
export default function SettingsScreen({ onClose }: SettingsScreenProps) {
  const router = useRouter(); const isHosted = Boolean(onClose); const closeScreen = () => (onClose ? onClose() : goBack(router, '/'));
  const { preferences, toggleLanguage, setFontScale, setFontScaleValue, setOrientationMode, toggleSelectText, toggleSlideshowMode, toggleDisplayComments, toggleDisplaySilentPrayers, toggleDisplayNowPlayingBar, toggleSaintHymn, clearSaintHymns, toggleInMonastery } = useReadingPreferences();
  const [saintPickerOpen, setSaintPickerOpen] = useState(false); const chosenSaintHymns = preferences.selectedSaintHymns || []; const isArabicChrome = preferences.appLanguage === 'ar';
  const labelText = (label: { english?: string; label?: string; arabic: string }) => isArabicChrome ? label.arabic : label.english || label.label || ''; const localizedTextStyle = isArabicChrome && styles.arabicText;
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.safeArea, DISABLED_TEXT_SELECTION_STYLE]}>
    {isHosted ? null : <Head><title>CHC Settings</title></Head>}
    <AppHeader title={SETTINGS_LABELS.settings} canGoBack onBack={closeScreen} visibleLanguages={{ english: !isArabicChrome, arabic: isArabicChrome }} />
    <ScrollView contentContainerStyle={styles.scrollContent}><View style={styles.container}>
      <Text style={[styles.groupLabel, localizedTextStyle]}>{labelText(SETTINGS_LABELS.languages)}</Text><View style={styles.languageList}>{LANGUAGE_OPTIONS.map((item) => <ToggleRow key={item.key} label={labelText(item)} isArabic={isArabicChrome} active={preferences.visibleLanguages[item.key]} onPress={() => toggleLanguage(item.key)} />)}</View>
      {Platform.OS !== 'web' ? <View style={styles.orientationGroup}><Text style={[styles.groupLabel, localizedTextStyle]}>{labelText(SETTINGS_LABELS.orientation)}</Text><View style={styles.orientationRow}>{ORIENTATION_OPTIONS.map((item) => { const isActive = preferences.orientationMode === item.key; const label = labelText(item); return <Pressable key={item.key} accessibilityLabel={isArabicChrome ? label : `Use ${item.label} orientation`} style={[styles.orientationButton, isActive && styles.toggleActive, { borderColor: isActive ? COLORS.gold : COLORS.border }]} onPress={() => setOrientationMode(item.key)}><Text style={[styles.toggleText, localizedTextStyle]}>{label}</Text></Pressable>; })}</View></View> : null}
      <Text style={[styles.groupLabel, localizedTextStyle]}>{labelText(SETTINGS_LABELS.display)}</Text><FontScaleControl fontScale={preferences.fontScale} isArabic={isArabicChrome} label={labelText(SETTINGS_LABELS.textSize)} onStep={setFontScale} onSetValue={setFontScaleValue} />
      <ToggleRow label={labelText(SETTINGS_LABELS.slideshowMode)} isArabic={isArabicChrome} active={preferences.slideshowMode} onPress={toggleSlideshowMode} /><ToggleRow label={labelText(SETTINGS_LABELS.selectText)} isArabic={isArabicChrome} active={preferences.selectText} disabled={preferences.slideshowMode} onPress={toggleSelectText} /><ToggleRow label={labelText(SETTINGS_LABELS.displayComments)} isArabic={isArabicChrome} active={preferences.displayComments} onPress={toggleDisplayComments} /><ToggleRow label={labelText(SETTINGS_LABELS.displaySilentPrayers)} isArabic={isArabicChrome} active={preferences.displaySilentPrayers} onPress={toggleDisplaySilentPrayers} /><ToggleRow label={labelText(SETTINGS_LABELS.displayNowPlayingBar)} isArabic={isArabicChrome} active={preferences.displayNowPlayingBar} onPress={toggleDisplayNowPlayingBar} />
      <Text style={[styles.groupLabel, localizedTextStyle]}>{labelText(SETTINGS_LABELS.content)}</Text>
      <Pressable accessibilityLabel="Choose saint hymns" style={styles.contentRow} onPress={() => setSaintPickerOpen(true)}><Text style={[styles.contentRowLabel, localizedTextStyle]}>{labelText(SETTINGS_LABELS.saintHymns)}</Text><Icon name="chevron-forward" size={18} color={COLORS.muted} /></Pressable>
      <ToggleRow label={labelText(SETTINGS_LABELS.inMonastery)} isArabic={isArabicChrome} active={preferences.inMonastery} onPress={toggleInMonastery} />
      {!isHosted && Platform.OS !== 'web' ? <Pressable accessibilityLabel={labelText(SETTINGS_LABELS.downloads)} style={styles.contentRow} onPress={() => router.push('/downloads')}><Text style={[styles.contentRowLabel, localizedTextStyle]}>{labelText(SETTINGS_LABELS.downloads)}</Text><Icon name="chevron-forward" size={18} color={COLORS.muted} /></Pressable> : null}
    </View></ScrollView>
    <SaintHymnPicker visible={saintPickerOpen} onClose={() => setSaintPickerOpen(false)} isArabic={isArabicChrome} selected={chosenSaintHymns} onToggle={toggleSaintHymn} onClearSaint={clearSaintHymns} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: COLORS.black }, scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xl }, container: { borderBottomWidth: 1, borderTopWidth: 1, borderColor: COLORS.border, gap: SPACING.md, padding: SPACING.md }, groupLabel: { fontSize: 15, fontWeight: '800', color: COLORS.white }, contentRow: { alignItems: 'center', backgroundColor: '#111111', borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }, contentRowLabel: { color: COLORS.white, flex: 1, fontSize: 15, fontWeight: '700' }, languageList: { gap: SPACING.sm }, orientationGroup: { gap: SPACING.sm }, orientationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }, orientationButton: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexGrow: 1, justifyContent: 'center', minHeight: 40, minWidth: 128, paddingHorizontal: SPACING.sm }, toggleActive: { backgroundColor: COLORS.navy }, toggleText: { fontSize: 13, fontWeight: '800', color: COLORS.white }, arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' } });
