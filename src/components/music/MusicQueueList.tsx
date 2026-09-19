import { MutableRefObject, useEffect, useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import Icon from '@/components/chc/ui/Icon';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { MusicQueueItem } from '@/context/MusicPlayerContext';
import { formatMusicTrackPerformers } from '@/utils/musicCredits';
import MusicArtwork from './MusicArtwork';

// Rows are a fixed height so a drag distance maps directly onto a slot index.
const ROW_HEIGHT = 64;
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

interface MusicQueueListProps {
  queue: MusicQueueItem[];
  queueKeys: string[];
  currentIndex: number;
  playing: boolean;
  isArabic: boolean;
  onSelect: (index: number) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onClear: () => void;
  /** Lets the parent lock its ScrollView while a row is being dragged. */
  onDragActiveChange: (active: boolean) => void;
}

interface DragHandlers {
  start: (index: number) => void;
  move: (dy: number) => void;
  end: () => void;
}

interface DragState {
  from: number;
  dy: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function MusicQueueList({
  queue,
  queueKeys,
  currentIndex,
  playing,
  isArabic,
  onSelect,
  onMove,
  onClear,
  onDragActiveChange,
}: MusicQueueListProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const count = queue.length;
  const target = drag ? clamp(drag.from + Math.round(drag.dy / ROW_HEIGHT), 0, count - 1) : -1;

  const offsetFor = (index: number): number => {
    if (!drag) return 0;
    if (index === drag.from) {
      // Keep the lifted row inside the list instead of letting it fly off.
      return clamp(drag.dy, -drag.from * ROW_HEIGHT, (count - 1 - drag.from) * ROW_HEIGHT);
    }
    if (drag.from < index && index <= target) return -ROW_HEIGHT;
    if (target <= index && index < drag.from) return ROW_HEIGHT;
    return 0;
  };

  // Row responders are created once, so they call through this ref to reach
  // the current render's drag state.
  const handlers = useRef<DragHandlers>({ start: () => undefined, move: () => undefined, end: () => undefined });
  useEffect(() => {
    handlers.current = {
      start: (index) => {
        setDrag({ from: index, dy: 0 });
        onDragActiveChange(true);
      },
      move: (dy) => setDrag((current) => (current ? { ...current, dy } : current)),
      end: () => {
        if (drag && target >= 0 && target !== drag.from) onMove(drag.from, target);
        setDrag(null);
        onDragActiveChange(false);
      },
    };
  });

  const upNext = count - Math.max(0, currentIndex) - 1;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, isArabic && styles.arabic]}>{isArabic ? 'قائمة الانتظار' : 'Queue'}</Text>
          <Text style={[styles.headerMeta, isArabic && styles.arabic]}>
            {isArabic
              ? `${Math.max(0, upNext)} التالي`
              : `${Math.max(0, upNext)} up next · ${count} ${count === 1 ? 'track' : 'tracks'}`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isArabic ? 'مسح قائمة الانتظار' : 'Clear queue'}
          disabled={count <= 1}
          onPress={onClear}
          style={({ pressed }) => [styles.clearButton, count <= 1 && styles.clearButtonDisabled, pressed && styles.pressed]}
        >
          <Icon name="close" size={14} color={count <= 1 ? COLORS.muted : COLORS.goldBright} />
          <Text style={[styles.clearText, count <= 1 && styles.clearTextDisabled]}>{isArabic ? 'مسح' : 'Clear queue'}</Text>
        </Pressable>
      </View>

      <View style={[styles.list, { height: count * ROW_HEIGHT }, Platform.OS === 'web' && styles.noSelect]}>
        {queue.map((item, index) => (
          <QueueRow
            key={queueKeys[index] ?? `${item.track.id}-${index}`}
            index={index}
            item={item}
            active={index === currentIndex}
            playing={playing}
            offset={offsetFor(index)}
            lifted={drag?.from === index}
            dragging={drag != null}
            handlers={handlers}
            onSelect={onSelect}
          />
        ))}
      </View>
    </View>
  );
}

interface QueueRowProps {
  index: number;
  item: MusicQueueItem;
  active: boolean;
  playing: boolean;
  offset: number;
  lifted: boolean;
  dragging: boolean;
  handlers: MutableRefObject<DragHandlers>;
  onSelect: (index: number) => void;
}

function QueueRow({ index, item, active, playing, offset, lifted, dragging, handlers, onSelect }: QueueRowProps) {
  const [translateY] = useState(() => new Animated.Value(0));
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    // The lifted row tracks the pointer 1:1, other rows glide out of its way,
    // and on drop everything snaps to 0 in the same frame the reorder lands,
    // so rows never animate twice.
    if (lifted || !dragging) {
      translateY.setValue(offset);
      return;
    }
    Animated.timing(translateY, { toValue: offset, duration: 140, useNativeDriver: USE_NATIVE_DRIVER }).start();
  }, [dragging, lifted, offset, translateY]);

  // Created once: a PanResponder keeps its gesture state per instance, so
  // rebuilding it mid-drag would reset dy and drop the row.
  // eslint-disable-next-line react-hooks/refs -- refs are read in gesture callbacks, not during render
  const [panResponder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => handlers.current.start(indexRef.current),
    onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => handlers.current.move(gesture.dy),
    onPanResponderRelease: () => handlers.current.end(),
    onPanResponderTerminate: () => handlers.current.end(),
  }));

  const performers = formatMusicTrackPerformers(item.track, item.releaseTitle ?? '');

  return (
    <Animated.View
      style={[
        styles.rowShell,
        { top: index * ROW_HEIGHT, transform: [{ translateY }] },
        lifted && styles.rowLifted,
      ]}
    >
      <View style={[styles.row, active && styles.rowActive, lifted && styles.rowLiftedInner]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Play ${item.track.title}`}
          disabled={dragging}
          onPress={() => onSelect(index)}
          style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
        >
          <MusicArtwork asset={item.coverAsset} size={44} radius={6} label={item.releaseTitle ?? item.track.title} />
          <View style={styles.rowText}>
            <Text numberOfLines={1} style={[styles.rowTitle, active && styles.rowTitleActive]}>{item.track.title}</Text>
            <Text numberOfLines={1} style={styles.rowArtist}>
              {active ? (playing ? 'Now playing · ' : 'Paused · ') : ''}{performers}
            </Text>
          </View>
        </Pressable>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel={`Reorder ${item.track.title}`}
          style={[styles.handle, Platform.OS === 'web' && styles.handleWeb]}
          {...panResponder.panHandlers}
        >
          <Icon name="reorder" size={22} color={lifted ? COLORS.goldBright : COLORS.muted} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: SPACING.lg,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingBottom: SPACING.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  headerTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '700' },
  headerMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 2 },
  arabic: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: COLORS.goldLine,
    backgroundColor: COLORS.goldSoft,
  },
  clearButtonDisabled: { borderColor: COLORS.border, backgroundColor: 'transparent' },
  clearText: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '700' },
  clearTextDisabled: { color: COLORS.muted },
  list: { position: 'relative' },
  noSelect: { userSelect: 'none' } as object,
  rowShell: { position: 'absolute', left: 0, right: 0, height: ROW_HEIGHT, paddingHorizontal: SPACING.xs },
  rowLifted: { zIndex: 10, elevation: 10 },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingLeft: SPACING.sm,
  },
  rowActive: { backgroundColor: COLORS.goldSoft },
  rowLiftedInner: {
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.goldLine,
    ...Platform.select({
      web: { boxShadow: '0 10px 28px rgba(0, 0, 0, 0.55)' } as object,
      default: { shadowColor: COLORS.shadow, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
    }),
  },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, height: '100%' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '700' },
  rowTitleActive: { color: COLORS.goldBright },
  rowArtist: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  handle: { width: 48, height: '100%', alignItems: 'center', justifyContent: 'center' },
  handleWeb: { cursor: 'grab', touchAction: 'none' } as object,
  pressed: { opacity: 0.7 },
});
