import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { COLORS, MOTION, RADII, TYPOGRAPHY } from '../../../constants/theme';

type Variant = 'primary' | 'navy' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, { paddingV: number; paddingH: number; fontSize: number; minHeight: number; gap: number; icon: number }> = {
  sm: { paddingV: 8, paddingH: 14, fontSize: 15, minHeight: 36, gap: 6, icon: 17 },
  md: { paddingV: 11, paddingH: 20, fontSize: 17, minHeight: 44, gap: 8, icon: 19 },
  lg: { paddingV: 14, paddingH: 26, fontSize: 19, minHeight: 52, gap: 10, icon: 22 },
};

const VARIANTS: Record<Variant, { background: string; color: string; borderColor: string }> = {
  primary: { background: COLORS.gold, color: COLORS.navyDark, borderColor: COLORS.gold },
  navy: { background: COLORS.navy, color: COLORS.white, borderColor: COLORS.navy },
  outline: { background: 'transparent', color: COLORS.gold, borderColor: COLORS.goldLine },
  ghost: { background: 'transparent', color: COLORS.gold, borderColor: 'transparent' },
};

interface ButtonProps {
  label: string;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  block?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

/** CHC Button — liturgical action button. Gold is the brand accent. */
export default function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  disabled = false,
  block = false,
  onPress,
  style,
}: ButtonProps) {
  const s = SIZES[size];
  const v = VARIANTS[variant];

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: v.background,
          borderColor: v.borderColor,
          paddingVertical: s.paddingV,
          paddingHorizontal: s.paddingH,
          minHeight: s.minHeight,
          gap: s.gap,
          width: block ? '100%' : undefined,
          opacity: disabled ? 0.45 : pressed ? MOTION.pressOpacity : 1,
        },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={s.icon} color={v.color} /> : null}
      <Text style={[styles.label, { color: v.color, fontSize: s.fontSize }]}>{label}</Text>
      {iconRight ? <Ionicons name={iconRight} size={s.icon} color={v.color} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.sm,
    borderWidth: 1,
  },
  label: {
    fontFamily: TYPOGRAPHY.title,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
