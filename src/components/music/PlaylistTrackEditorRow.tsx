import { useCallback, useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';

import Icon from '@/components/chc/ui/Icon';
import MusicTrackRow from '@/components/music/MusicTrackRow';
import { COLORS, SPACING } from '@/constants/theme';
import type { MusicConsumerTrack } from '@/types/musicConsumer';

const ROW_HEIGHT = 63;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export default function PlaylistTrackEditorRow({
  track,
  index,
  count,
  active,
  liked,
  onPlay,
  onToggleLike,
  onRemove,
  onMove,
}: {
  track: MusicConsumerTrack;
  index: number;
  count: number;
  active: boolean;
  liked: boolean;
  onPlay: () => void;
  onToggleLike: () => void;
  onRemove: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
}) {
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const returnToRow = useCallback(() => {
    setDragOffset(0);
    setDragging(false);
  }, []);

  const moveTo = useCallback((targetIndex: number) => {
    const boundedTarget = clamp(targetIndex, 0, count - 1);
    if (boundedTarget === index) {
      returnToRow();
      return;
    }

    setDragOffset(0);
    setDragging(false);
    onMove(index, boundedTarget);
  }, [count, index, onMove, returnToRow]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      setDragOffset(0);
      setDragging(true);
    },
    onPanResponderMove: (_event, gesture) => {
      setDragOffset(clamp(
        gesture.dy,
        -index * ROW_HEIGHT,
        (count - index - 1) * ROW_HEIGHT,
      ));
    },
    onPanResponderRelease: (_event, gesture) => {
      moveTo(index + Math.round(gesture.dy / ROW_HEIGHT));
    },
    onPanResponderTerminate: returnToRow,
    onShouldBlockNativeResponder: () => true,
  }), [count, index, moveTo, returnToRow]);

  return (
    <View
      style={[
        styles.row,
        { transform: [{ translateY: dragOffset }] },
        dragging && styles.rowDragging,
      ]}
    >
      <MusicTrackRow
        track={track}
        index={index}
        active={active}
        onPress={onPlay}
        showLikeButton
        liked={liked}
        onToggleLike={onToggleLike}
        trailing={(
          <View style={styles.actions}>
            <Pressable
              accessibilityLabel={`Remove ${track.title} from playlist`}
              accessibilityRole="button"
              onPress={(event) => {
                event.stopPropagation();
                onRemove();
              }}
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
            >
              <Icon name="close" size={18} color={COLORS.muted} />
            </Pressable>
            <View
              {...panResponder.panHandlers}
              accessibilityActions={[
                { name: 'decrement', label: 'Move track up' },
                { name: 'increment', label: 'Move track down' },
              ]}
              accessibilityLabel={`Drag ${track.title} to reorder`}
              accessibilityRole="adjustable"
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'decrement') moveTo(index - 1);
                if (event.nativeEvent.actionName === 'increment') moveTo(index + 1);
              }}
              style={styles.dragHandle}
            >
              <Icon name="reorder" size={21} color={COLORS.goldBright} />
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: COLORS.surface,
    zIndex: 0,
  },
  rowDragging: {
    backgroundColor: COLORS.navyDark,
    elevation: 8,
    opacity: 0.96,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.38,
    shadowRadius: 9,
    zIndex: 20,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    marginLeft: SPACING.xs,
  },
  actionButton: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 36,
  },
  dragHandle: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 38,
  },
  pressed: { opacity: 0.55 },
});
