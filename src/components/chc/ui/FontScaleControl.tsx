import { Host, Slider } from '@expo/ui';
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
 * repeatedly tapping step buttons to cross the range on a phone.
 *
 * The Host wrapper is mandatory, not decorative. Slider is not a React Native
 * view — it is a SwiftUI view on iOS and a Jetpack Compose view on Android, and
 * Host is the bridging container that gives it a platform UI-toolkit hierarchy
 * to live in. Mounting one as a bare child of an ordinary <View> crashes the
 * app natively (which is a process kill, not a red box) the moment the screen
 * renders. Every example in the @expo/ui docs wraps its components this way.
 *
 * The slider is deliberately not wrapped in an `accessible` View. Marking a
 * parent accessible collapses its whole subtree into one element, which would
 * have flattened the native slider's own adjustable semantics into a single
 * static node — worse than leaving it alone. The control names itself through
 * the visible label sitting directly above it instead.
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
      {/* matchContents lets the host take its height from the slider it wraps;
          without it the host has no intrinsic size and the control collapses.
          seedColor becomes the SwiftUI tint on iOS and seeds a Material 3
          palette on Android, which is the only way to colour these controls —
          they take no style prop — so the slider picks up the app's gold
          instead of the OS accent. layoutDirection is pinned so the track
          always runs small-to-large left-to-right, matching the fixed A/A
          markers below; the rest of this app's layout isn't mirrored for
          Arabic either, so letting the locale flip just this one control
          would leave it disagreeing with its own labels. */}
      <Host
        matchContents={{ vertical: true }}
        colorScheme="dark"
        seedColor={COLORS.gold}
        layoutDirection="leftToRight"
        style={styles.sliderHost}
      >
        <Slider
          value={fontScale}
          min={MIN_FONT_SCALE}
          max={MAX_FONT_SCALE}
          step={1}
          onValueChange={onSetValue}
        />
      </Host>
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
  sliderHost: { width: '100%' },
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
