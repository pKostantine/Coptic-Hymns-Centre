import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS, RADII, TYPOGRAPHY } from '@/constants/theme';
import { learningService } from '@/services/learningService';
import type { LearningMediaAsset } from '@/types/learningPlatform';

export default function LearningArtwork({
  asset,
  size,
  rounded = false,
  radius: cornerRadius,
  label,
}: {
  asset?: LearningMediaAsset | null;
  size: number;
  rounded?: boolean;
  /** Corner radius override for small thumbnails. */
  radius?: number;
  label?: string;
}) {
  const uri = learningService.resolveAsset(asset);
  const radius = rounded ? size / 2 : cornerRadius ?? RADII.md;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        contentFit="cover"
        transition={160}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: COLORS.surfaceSoft }}
      />
    );
  }

  const initial = label?.trim().charAt(0).toUpperCase() || 'L';
  return (
    <View style={[styles.placeholder, { width: size, height: size, borderRadius: radius }]}>
      <Text style={[styles.initial, { fontSize: Math.max(22, size * 0.28) }]}>{initial}</Text>
      {!rounded ? <Text style={styles.mark}>LEARN</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.learningDeep,
    borderWidth: 1,
    borderColor: COLORS.learningLine,
  },
  initial: {
    color: COLORS.learningBright,
    fontFamily: TYPOGRAPHY.title,
    fontWeight: '700',
  },
  mark: {
    color: COLORS.learning,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 2,
  },
});
