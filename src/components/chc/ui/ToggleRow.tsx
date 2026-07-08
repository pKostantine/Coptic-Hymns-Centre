import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, TYPOGRAPHY } from '../../../constants/theme';

interface ToggleRowProps {
  label: string;
  isArabic?: boolean;
  active: boolean;
  onPress: () => void;
}

/** CHC ToggleRow — ported 1:1 from LanguageToggleBar.js's `languageOption` row + hand-drawn switch. */
export default function ToggleRow({ label, isArabic = false, active, onPress }: ToggleRowProps) {
  return (
    <Pressable accessibilityLabel={`Toggle ${label}`} onPress={onPress} style={styles.languageOption}>
      <Text style={[styles.languageLabel, isArabic && styles.languageLabelArabic]}>{label}</Text>
      <View style={[styles.switchTrack, { backgroundColor: active ? COLORS.navy : '#1C1C1C', borderColor: active ? COLORS.gold : COLORS.border }]}>
        <View
          style={[
            styles.switchThumb,
            { backgroundColor: active ? COLORS.gold : COLORS.muted, alignSelf: active ? 'flex-end' : 'flex-start' },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  languageOption: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  languageLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.white,
    paddingRight: 16,
  },
  languageLabelArabic: {
    fontFamily: TYPOGRAPHY.arabic,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  switchTrack: {
    width: 48,
    borderRadius: 999,
    borderWidth: 1,
    padding: 2,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
});
