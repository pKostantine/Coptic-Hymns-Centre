import { Pressable, StyleSheet, Text, View } from 'react-native';

import Icon from '@/components/chc/ui/Icon';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { toEasternArabicDigits } from '@/utils/localeFormat';
import type { FontScaleControlProps } from './FontScaleControl';

/**
 * Web font-size control: the original -/+ step buttons.
 *
 * A pointer hits a discrete button more precisely than it drags a 21-stop
 * track, and keeping @expo/ui's slider off this path also keeps it out of the
 * web bundle. The native build gets FontScaleControl.tsx.
 */
export default function FontScaleControl({ fontScale, isArabic, onStep }: FontScaleControlProps) {
  return (
    <View style={styles.controls}>
      <Pressable accessibilityLabel="Decrease font size" style={styles.button} onPress={() => onStep(-1)}>
        <Icon name="remove" size={18} color={COLORS.gold} />
      </Pressable>
      <Text style={[styles.value, isArabic && styles.arabicText]}>
        {isArabic ? toEasternArabicDigits(fontScale) : fontScale}
      </Text>
      <Pressable accessibilityLabel="Increase font size" style={styles.button} onPress={() => onStep(1)}>
        <Icon name="add" size={18} color={COLORS.gold} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm, justifyContent: 'center' },
  button: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  value: { fontSize: 15, fontWeight: '700', minWidth: 30, textAlign: 'center', color: COLORS.white },
  arabicText: {
    fontFamily: TYPOGRAPHY.arabic,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
