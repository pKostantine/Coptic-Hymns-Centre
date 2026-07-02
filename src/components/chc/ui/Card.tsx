import { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { COLORS, MOTION, RADII, SHADOWS, SPACING } from '../../../constants/theme';

interface CardProps extends PropsWithChildren {
  raised?: boolean;
  padded?: boolean;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
}

/** CHC Card — the base dark surface panel. Hairline border, 18px radius. */
export default function Card({ children, raised = false, padded = true, onPress, style }: CardProps) {
  const content = (
    <View
      style={[
        styles.base,
        raised ? styles.raised : styles.card,
        padded && styles.padded,
        raised ? SHADOWS.raised : SHADOWS.card,
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: MOTION.pressOpacity } : null)}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  card: {
    backgroundColor: COLORS.surface,
  },
  raised: {
    backgroundColor: COLORS.surfaceSoft,
  },
  padded: {
    padding: SPACING.md,
  },
});
