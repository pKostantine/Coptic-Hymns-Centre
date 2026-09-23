import { useEffect, useRef } from 'react';
import { VideoView, useVideoPlayer, type VideoView as VideoViewHandle } from 'expo-video';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS, RADII, TYPOGRAPHY } from '@/constants/theme';

export interface LearningVideoPlayerHandle {
  enterPictureInPicture: () => Promise<void>;
}

export default function LearningVideoPlayer({
  uri,
  onHandle,
}: {
  uri: string | null;
  onHandle?: (handle: LearningVideoPlayerHandle | null) => void;
}) {
  const viewRef = useRef<VideoViewHandle>(null);
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.staysActiveInBackground = true;
    instance.showNowPlayingNotification = true;
  });

  useEffect(() => {
    onHandle?.({
      enterPictureInPicture: async () => {
        await viewRef.current?.startPictureInPicture();
      },
    });
    return () => onHandle?.(null);
  }, [onHandle]);

  if (!uri) {
    return (
      <View style={[styles.video, styles.unavailable]}>
        <Text style={styles.unavailableText}>Video unavailable</Text>
      </View>
    );
  }

  return (
    <VideoView
      ref={viewRef}
      player={player}
      style={styles.video}
      contentFit="contain"
      nativeControls
      allowsPictureInPicture
      startsPictureInPictureAutomatically
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
