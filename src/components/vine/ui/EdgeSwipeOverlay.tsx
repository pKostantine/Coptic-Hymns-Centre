import { useMemo } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

interface EdgeSwipeOverlayProps {
  enabled: boolean;
  leftEdgeWidth?: number;
  rightEdgeWidth?: number;
  onSwipeFromLeft?: () => void;
  onSwipeFromRight?: () => void;
}

const DEFAULT_EDGE_WIDTH = 56;
const LEFT_SWIPE_DISTANCE = 60;
const RIGHT_SWIPE_DISTANCE = 36;

function isHorizontalSwipe(dx: number, dy: number) {
  return Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2;
}

function useEdgeResponder(direction: 'left' | 'right', onSwipe?: () => void) {
  return useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => Boolean(onSwipe),
        onMoveShouldSetPanResponder: (_, gestureState) => Boolean(onSwipe) && isHorizontalSwipe(gestureState.dx, gestureState.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, gestureState) => {
          if (!onSwipe || !isHorizontalSwipe(gestureState.dx, gestureState.dy)) return;
          if (direction === 'left' && gestureState.dx > LEFT_SWIPE_DISTANCE) {
            onSwipe();
            return;
          }
          if (direction === 'right' && gestureState.dx < -RIGHT_SWIPE_DISTANCE) {
            onSwipe();
          }
        },
      }),
    [direction, onSwipe],
  );
}

export default function EdgeSwipeOverlay({
  enabled,
  leftEdgeWidth = DEFAULT_EDGE_WIDTH,
  rightEdgeWidth = DEFAULT_EDGE_WIDTH,
  onSwipeFromLeft,
  onSwipeFromRight,
}: EdgeSwipeOverlayProps) {
  const leftResponder = useEdgeResponder('left', onSwipeFromLeft);
  const rightResponder = useEdgeResponder('right', onSwipeFromRight);
  const showLeftEdge = Boolean(onSwipeFromLeft) && leftEdgeWidth > 0;
  const showRightEdge = Boolean(onSwipeFromRight) && rightEdgeWidth > 0;

  if (!enabled) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {showLeftEdge ? (
        <View
          pointerEvents="box-only"
          style={[styles.edge, styles.leftEdge, { width: leftEdgeWidth }]}
          {...leftResponder.panHandlers}
        />
      ) : null}
      {showRightEdge ? (
        <View
          pointerEvents="box-only"
          style={[styles.edge, styles.rightEdge, { width: rightEdgeWidth }]}
          {...rightResponder.panHandlers}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  edge: {
    bottom: 0,
    position: 'absolute',
    top: 0,
    zIndex: 20,
  },
  leftEdge: {
    left: 0,
  },
  rightEdge: {
    right: 0,
  },
});
