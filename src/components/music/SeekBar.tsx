import { useEffect, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  PanResponderGestureState,
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
  onSeek: (positionMs: number) => void | Promise<void>;
  accentColor?: string;
  /** Slightly denser treatment for short landscape/full-screen control rows. */
  dense?: boolean;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const SEEK_ACK_TOLERANCE_MS = 1100;
const SEEK_ACK_TIMEOUT_MS = 2500;

/**
 * A scrubber designed to stay visually locked to the finger.
 *
 * Important implementation details:
 * - Dragging is calculated from the touch's initial local X + PanResponder dx,
 *   never page coordinates. This survives rotations, safe-area padding,
 *   nested sheets and browser offsets without the thumb jumping.
 * - Position updates from the audio engine are ignored while scrubbing.
 * - After release, the requested position stays rendered optimistically until
 *   expo-audio reports that it has reached the seek. That removes the
 *   old "snap back, then jump forward" effect.
 * - Move updates are coalesced to one render per animation frame.
 */
export default function SeekBar({
  positionMs,
  durationMs,
  onSeek,
  accentColor = COLORS.gold,
  dense = false,
}: SeekBarProps) {
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const [optimisticSeekMs, setOptimisticSeekMs] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [layoutWidth, setLayoutWidth] = useState(0);

  const widthRef = useRef(0);
  const startRatioRef = useRef(0);
  const scrubRatioRef = useRef<number | null>(null);
  const optimisticSeekRef = useRef<number | null>(null);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRatioRef = useRef<number | null>(null);
  const thumbSize = dense ? 12 : 16;
  const latest = useRef({ durationMs, onSeek, thumbSize });

  useEffect(() => {
    latest.current = { durationMs, onSeek, thumbSize };
  }, [durationMs, onSeek, thumbSize]);

  useEffect(() => {
    optimisticSeekRef.current = optimisticSeekMs;
  }, [optimisticSeekMs]);

  useEffect(() => () => {
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
  }, []);

  // Keep the requested seek on screen until the native/web audio clock catches
  // up. Clearing it immediately is what caused the seeker to visibly snap back.
  useEffect(() => {
    const target = optimisticSeekRef.current;
    if (target == null || scrubRatioRef.current != null) return;
    if (Math.abs(positionMs - target) <= SEEK_ACK_TOLERANCE_MS) {
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      seekTimeoutRef.current = null;
      optimisticSeekRef.current = null;
      setOptimisticSeekMs(null);
    }
  }, [positionMs]);

  const scheduleRatio = (ratio: number) => {
    const next = clamp01(ratio);
    scrubRatioRef.current = next;
    pendingRatioRef.current = next;
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingRatioRef.current;
      pendingRatioRef.current = null;
      if (pending != null) setScrubRatio(pending);
    });
  };

  const ratioFromGrant = (event: GestureResponderEvent) => {
    const width = widthRef.current;
    const halfThumb = latest.current.thumbSize / 2;
    const travel = Math.max(1, width - latest.current.thumbSize);
    if (width <= 0) return 0;
    return clamp01((event.nativeEvent.locationX - halfThumb) / travel);
  };

  const ratioFromDrag = (gesture: PanResponderGestureState) => {
    const travel = Math.max(1, widthRef.current - latest.current.thumbSize);
    if (widthRef.current <= 0) return startRatioRef.current;
    return clamp01(startRatioRef.current + gesture.dx / travel);
  };

  const commitSeek = (ratio: number) => {
    const safeRatio = clamp01(ratio);
    const targetMs = safeRatio * latest.current.durationMs;

    // Flush the visual position synchronously before ending the drag.
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingRatioRef.current = null;
    scrubRatioRef.current = null;
    setScrubRatio(null);

    optimisticSeekRef.current = targetMs;
    setOptimisticSeekMs(targetMs);

    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => {
      optimisticSeekRef.current = null;
      setOptimisticSeekMs(null);
      seekTimeoutRef.current = null;
    }, SEEK_ACK_TIMEOUT_MS);

    try {
      const result = latest.current.onSeek(targetMs);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        void (result as Promise<void>).catch(() => {
          if (optimisticSeekRef.current === targetMs) {
            optimisticSeekRef.current = null;
            setOptimisticSeekMs(null);
          }
        });
      }
    } catch {
      if (optimisticSeekRef.current === targetMs) {
        optimisticSeekRef.current = null;
        setOptimisticSeekMs(null);
      }
    }
  };

  // Created once. All changing inputs are read from refs so a rerender never
  // tears down a gesture that is already in progress.
  // eslint-disable-next-line react-hooks/refs -- refs are intentionally read in responder callbacks.
  const [panResponder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => latest.current.durationMs > 0 && widthRef.current > 0,
    onMoveShouldSetPanResponder: () => latest.current.durationMs > 0 && widthRef.current > 0,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event: GestureResponderEvent) => {
      const ratio = ratioFromGrant(event);
      startRatioRef.current = ratio;
      // Once the user touches the bar, their finger wins over any in-flight
      // native seek acknowledgement.
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      seekTimeoutRef.current = null;
      optimisticSeekRef.current = null;
      setOptimisticSeekMs(null);
      scheduleRatio(ratio);
    },
    onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      scheduleRatio(ratioFromDrag(gesture));
    },
    onPanResponderRelease: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      commitSeek(ratioFromDrag(gesture));
    },
    onPanResponderTerminate: () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      pendingRatioRef.current = null;
      scrubRatioRef.current = null;
      setScrubRatio(null);
    },
  }));

  const scrubbing = scrubRatio != null;
  const playedRatio = durationMs > 0 ? clamp01(positionMs / durationMs) : 0;
  const optimisticRatio = durationMs > 0 && optimisticSeekMs != null
    ? clamp01(optimisticSeekMs / durationMs)
    : null;
  const ratio = scrubRatio ?? optimisticRatio ?? playedRatio;
  const displayMs = scrubRatio != null
    ? scrubRatio * durationMs
    : optimisticSeekMs ?? positionMs;
  const active = scrubbing || hovered || optimisticSeekMs != null;

  const hoverProps = Platform.OS === 'web'
    ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
    : {};

  // Keep the thumb centre inside the actual bar at both ends rather than
  // rendering half of it outside the track.
  const thumbTravel = Math.max(0, layoutWidth - thumbSize);
  const thumbLeft = thumbSize / 2 + thumbTravel * ratio;

  return (
    <View style={styles.wrapper}>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        accessibilityValue={{
          min: 0,
          max: Math.round(durationMs / 1000),
          now: Math.round(displayMs / 1000),
        }}
        accessibilityActions={[
          { name: 'increment', label: 'Forward 10 seconds' },
          { name: 'decrement', label: 'Back 10 seconds' },
        ]}
        onAccessibilityAction={(event) => {
          if (durationMs <= 0) return;
          const delta = event.nativeEvent.actionName === 'increment' ? 10000 : -10000;
          const target = Math.max(0, Math.min(durationMs, displayMs + delta));
          commitSeek(target / durationMs);
        }}
        onLayout={(event: LayoutChangeEvent) => {
          const nextWidth = event.nativeEvent.layout.width;
          widthRef.current = nextWidth;
          setLayoutWidth(nextWidth);
        }}
        style={[
          styles.hitArea,
          dense && styles.hitAreaDense,
          Platform.OS === 'web' && styles.webCursor,
        ]}
        {...hoverProps}
        {...panResponder.panHandlers}
      >
        <View
          pointerEvents="none"
          style={[
            styles.track,
            { marginHorizontal: thumbSize / 2 },
            active && styles.trackActive,
          ]}
        >
          <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: accentColor }]} />
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            dense && styles.thumbDense,
            {
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              left: thumbLeft,
              marginLeft: -thumbSize / 2,
              backgroundColor: accentColor,
            },
            active ? styles.thumbActive : styles.thumbIdle,
          ]}
        />
      </View>
      <View pointerEvents="none" style={[styles.timeRow, dense && styles.timeRowDense]}>
        <Text style={[styles.time, dense && styles.timeDense, scrubbing && { color: accentColor }]}>
          {formatPlaybackTime(displayMs)}
        </Text>
        <Text style={[styles.time, dense && styles.timeDense]}>
          {durationMs > 0 ? `-${formatPlaybackTime(Math.max(0, durationMs - displayMs))}` : '--:--'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%' },
  // A forgiving touch target around the thin visible bar is critical on phones.
  hitArea: { height: 38, justifyContent: 'center' },
  hitAreaDense: { height: 30 },
  webCursor: { cursor: 'pointer', touchAction: 'none' } as object,
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    overflow: 'hidden',
  },
  trackActive: { height: 6, borderRadius: 3 },
  fill: { height: '100%', borderRadius: 3 },
  thumb: {
    position: 'absolute',
    top: 11,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.42,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  thumbDense: { top: 9 },
  thumbIdle: { transform: [{ scale: 0.82 }] },
  thumbActive: { transform: [{ scale: 1.12 }] },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -1 },
  timeRowDense: { marginTop: -2 },
  time: {
    color: COLORS.muted,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  timeDense: { fontSize: 10 },
});
