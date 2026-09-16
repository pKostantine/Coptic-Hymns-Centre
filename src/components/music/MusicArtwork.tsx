import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS, RADII, TYPOGRAPHY } from '@/constants/theme';
import { musicService } from '@/services/musicService';
import type { MusicConsumerAsset } from '@/types/musicConsumer';

export default function MusicArtwork({
  asset,
  size,
  rounded = false,
  label,
}: {
  asset?: MusicConsumerAsset | null;
  size: number;
  rounded?: boolean;
  label?: string;
}) {
  const uri = musicService.resolveAsset(asset);
  const radius = rounded ? size / 2 : RADII.md;

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

  const initial = label?.trim().charAt(0).toUpperCase() || '♪';
  return (
    <View style={[styles.placeholder, { width: size, height: size, borderRadius: radius }]}>
      <Text style={[styles.placeholderText, { fontSize: Math.max(24, size * 0.3) }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.navyDark,
    borderWidth: 1,
    borderColor: COLORS.goldLine,
  },
  placeholderText: {
    color: COLORS.goldBright,
    fontFamily: TYPOGRAPHY.title,
    fontWeight: '700',
  },
});
