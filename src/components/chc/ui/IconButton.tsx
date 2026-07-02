import { Ionicons } from '@expo/vector-icons';
import { Pressable, ViewStyle } from 'react-native';

import { COLORS, MOTION, RADII } from '../../../constants/theme';

type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, { box: number; icon: number }> = {
  sm: { box: 40, icon: 22 },
  md: { box: 44, icon: 24 },
  lg: { box: 52, icon: 27 },
};

interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  size?: Size;
  label: string;
  active?: boolean;
  round?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

/** CHC IconButton — gold-bordered square action button used in chrome. */
export default function IconButton({ icon, size = 'md', label, active = false, round = false, onPress, style }: IconButtonProps) {
  const s = SIZES[size];

  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: s.box,
          height: s.box,
          borderRadius: round ? s.box / 2 : RADII.sm,
          backgroundColor: active ? COLORS.goldSoft : 'transparent',
          borderWidth: 1,
          borderColor: COLORS.goldLine,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? MOTION.pressOpacity : 1,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={s.icon} color={COLORS.gold} />
    </Pressable>
  );
}
