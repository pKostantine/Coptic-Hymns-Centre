import { useEffect, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { COLORS, TYPOGRAPHY } from '@/constants/theme';

export function formatPlaybackTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = seconds.toString().padStart(2, '0');
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${paddedSeconds}`
    : `${minutes}:${paddedSeconds}`;
}

interface SeekBarProps {
  positionMs: number;
  durationMs: number;
  onSeek: (positionMs: number) => void;
  accentColor?: string;
}

/**
 * Tap or drag anywhere on the track to scrub. The thumb follows the finger
 * locally and the player only seeks on release, so dragging never stutters
 * the audio or fights the position updates coming back from the player.
 */
export default function SeekBar({ positionMs, durationMs, onSeek, accentColor = COLORS.gold }: SeekBarProps) {
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const width = useRef(0);
  // Page X of the bar's left edge, captured when the gesture starts. Move
  // events are measured against it, because once the pointer leaves the bar
  // locationX is relative to whatever element happens to be underneath.
  const originPageX = useRef(0);
  const latest = useRef({ durationMs, onSeek });
  useEffect(() => {
    latest.current = { durationMs, onSeek };
  }, [durationMs, onSeek]);

  // Created once: a PanResponder keeps its gesture state per instance, so
  // rebuilding it mid-drag would reset the scrub. The handlers only run on
  // gestures and read the latest props through refs.
  // eslint-disable-next-line react-hooks/refs -- refs are read in gesture callbacks, not during render
  const [panResponder] = useState(() => {
    const ratioAt = (pageX: number) => {
      if (width.current <= 0) return 0;
      return Math.max(0, Math.min(1, (pageX - originPageX.current) / width.current));
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.durationMs > 0,
      onMoveShouldSetPanResponder: () => latest.current.durationMs > 0,
      // Keep the gesture when the finger drifts vertically inside a ScrollView.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event: GestureResponderEvent) => {
        originPageX.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
        setScrubRatio(ratioAt(event.nativeEvent.pageX));
      },
      onPanResponderMove: (event: GestureResponderEvent) => {
        setScrubRatio(ratioAt(event.nativeEvent.pageX));
      },
      onPanResponderRelease: (event: GestureResponderEvent) => {
        const ratio = ratioAt(event.nativeEvent.pageX);
        latest.current.onSeek(ratio * latest.current.durationMs);
        setScrubRatio(null);
      },
      onPanResponderTerminate: () => setScrubRatio(null),
    });
  });

  const scrubbing = scrubRatio != null;
  const playedRatio = durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0;
  const ratio = scrubbing ? scrubRatio : playedRatio;
  const displayMs = scrubbing ? scrubRatio * durationMs : positionMs;
  const active = scrubbing || hovered;

  const hoverProps = Platform.OS === 'web'
    ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
    : {};

  return (
    <View style={styles.wrapper}>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        accessibilityValue={{ min: 0, max: Math.round(durationMs / 1000), now: Math.round(displayMs / 1000) }}
        onLayout={(event: LayoutChangeEvent) => { width.current = event.nativeEvent.layout.width; }}
        style={[styles.hitArea, Platform.OS === 'web' && styles.webCursor]}
        {...hoverProps}
        {...panResponder.panHandlers}
      >
        <View pointerEvents="none" style={[styles.track, active && styles.trackActive]}>
          <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: accentColor }]} />
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            { left: `${ratio * 100}%`, backgroundColor: accentColor },
            active ? styles.thumbActive : styles.thumbIdle,
          ]}
        />
      </View>
      <View pointerEvents="none" style={styles.timeRow}>
        <Text style={[styles.time, scrubbing && { color: accentColor }]}>{formatPlaybackTime(displayMs)}</Text>
        <Text style={styles.time}>
          {durationMs > 0 ? `-${formatPlaybackTime(Math.max(0, durationMs - displayMs))}` : '--:--'}
        </Text>
      </View>
    </View>
  );
}

const THUMB = 14;

const styles = StyleSheet.create({
  wrapper: { width: '100%' },
  // Tall invisible hit area around a thin visible track.
  hitArea: { height: 28, justifyContent: 'center' },
  webCursor: { cursor: 'pointer' } as object,
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.14)', overflow: 'hidden' },
  trackActive: { height: 6, borderRadius: 3 },
  fill: { height: '100%', borderRadius: 3 },
  thumb: {
    position: 'absolute',
    top: (28 - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    borderRadius: THUMB / 2,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  thumbIdle: { transform: [{ scale: 0.75 }] },
  thumbActive: { transform: [{ scale: 1.15 }] },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  time: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontVariant: ['tabular-nums'] },
});
