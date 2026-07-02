import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADII, TYPOGRAPHY } from '../../../constants/theme';

export interface SegmentOption {
  value: string;
  label: string;
}

interface SegmentedToggleProps {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
  block?: boolean;
}

/** CHC SegmentedToggle — pill segmented control (language toggle, view switches). */
export default function SegmentedToggle({ options, value, onChange, size = 'md', block = false }: SegmentedToggleProps) {
  const fontSize = size === 'sm' ? 14 : 15;
  const paddingV = size === 'sm' ? 6 : 9;
  const paddingH = size === 'sm' ? 12 : 16;

  return (
    <View style={[styles.wrap, block && styles.block]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.segment,
              block && styles.segmentBlock,
              { paddingVertical: paddingV, paddingHorizontal: paddingH, backgroundColor: active ? COLORS.gold : 'transparent' },
            ]}
          >
            <Text style={[styles.label, { fontSize, color: active ? COLORS.navyDark : COLORS.muted }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.pill,
    alignSelf: 'flex-start',
  },
  block: {
    alignSelf: 'stretch',
  },
  segment: {
    borderRadius: RADII.pill,
  },
  segmentBlock: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    fontFamily: TYPOGRAPHY.title,
    fontWeight: '700',
  },
});
