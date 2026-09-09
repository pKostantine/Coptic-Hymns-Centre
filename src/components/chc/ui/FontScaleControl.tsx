import { Slider } from '@expo/ui';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { toEasternArabicDigits } from '@/utils/localeFormat';
import { MAX_FONT_SCALE, MIN_FONT_SCALE } from '@/utils/preferencesStorage';

export interface FontScaleControlProps {
  fontScale: number;
  isArabic: boolean;
  /** Already-localized "Text Size" label. */
  label: string;
  /** Nudges the scale by a step — the web build's -/+ buttons. */
  onStep: (delta: number) => void;
  /** Sets the scale outright — what the slider reports as it moves. */
  onSetValue: (value: number) => void;
}

/**
 * Native font-size control: a real SwiftUI/Jetpack Compose slider, which beats
 * tapping a step button ten times to cross the range on a phone.
 *
 * The web build gets FontScaleControl.web.tsx (the original -/+ buttons)
 * instead, which also keeps @expo/ui out of the web bundle entirely — Metro
 * resolves the .web.tsx variant and never follows this file's imports there.
 */
export default function FontScaleControl({
  fontScale,
  isArabic,
  label,
  onSetValue,
}: FontScaleControlProps) {
  return (
    <View style={styles.group}>
      <View style={styles.header}>
        <Text style={[styles.label, isArabic && styles.arabicText]}>{label}</Text>
        <Text style={[styles.value, isArabic && styles.arabicText]}>
          {isArabic ? toEasternArabicDigits(fontScale) : fontScale}
        </Text>
      </View>
      <View
        accessible
        accessibilityLabel={label}
        accessibilityValue={{ min: MIN_FONT_SCALE, max: MAX_FONT_SCALE, now: fontScale }}
      >
        <Slider
          value={fontScale}
          min={MIN_FONT_SCALE}
          max={MAX_FONT_SCALE}
          step={1}
          onValueChange={onSetValue}
        />
      </View>
      {/* Anchors the two ends of the track as smallest/largest, so the control
          reads without having to drag it first. */}
      <View style={styles.endMarkers}>
        <Text style={[styles.endMarker, styles.endMarkerSmall]}>A</Text>
        <Text style={[styles.endMarker, styles.endMarkerLarge]}>A</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACING.xs },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  value: { fontSize: 15, fontWeight: '700', minWidth: 30, textAlign: 'center', color: COLORS.white },
  endMarkers: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
  endMarker: { color: COLORS.gold, fontWeight: '700' },
  endMarkerSmall: { fontSize: 12 },
  endMarkerLarge: { fontSize: 22 },
  arabicText: {
    fontFamily: TYPOGRAPHY.arabic,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
