import { Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import Icon, { type IconName } from '@/components/chc/ui/Icon';
import { COLORS, TYPOGRAPHY } from '@/constants/theme';

interface RoundIconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  size?: number;
  /** Filled with the accent colour, for toggles such as shuffle and repeat. */
  active?: boolean;
  accentColor?: string;
  /** Small corner badge, e.g. "1" for repeat-one. */
  badge?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The circular icon button used across the player: close, fullscreen, shuffle, repeat. */
export default function RoundIconButton({
  icon,
  accessibilityLabel,
  onPress,
  size = 44,
  active = false,
  accentColor = COLORS.gold,
  badge,
  disabled = false,
  style,
}: RoundIconButtonProps) {
  const iconColor = active ? COLORS.black : COLORS.white;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        active ? { backgroundColor: accentColor, borderColor: accentColor } : hovered && styles.hovered,
        pressed && styles.pressed,
        disabled && styles.disabled,
        Platform.OS === 'web' && styles.webCursor,
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.44)} color={iconColor} />
      {badge ? (
        <View style={[styles.badge, { borderColor: active ? accentColor : COLORS.surface }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  hovered: { backgroundColor: 'rgba(255, 255, 255, 0.14)' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.94 }] },
  disabled: { opacity: 0.4 },
  webCursor: { cursor: 'pointer' } as object,
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 3,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  badgeText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 9, fontWeight: '900', lineHeight: 11 },
});
