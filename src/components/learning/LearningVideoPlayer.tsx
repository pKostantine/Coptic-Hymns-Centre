import { VideoView, useVideoPlayer } from 'expo-video';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS, RADII, TYPOGRAPHY } from '@/constants/theme';

export default function LearningVideoPlayer({ uri }: { uri: string | null }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });

  if (!uri) {
    return (
      <View style={[styles.video, styles.unavailable]}>
        <Text style={styles.unavailableText}>Video unavailable</Text>
      </View>
    );
  }

  return (
    <VideoView
      player={player}
      style={styles.video}
      contentFit="contain"
      nativeControls
      fullscreenOptions={{ enable: true }}
    />
  );
}

const styles = StyleSheet.create({
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: RADII.md,
    backgroundColor: COLORS.black,
  },
  unavailable: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  unavailableText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body },
});
