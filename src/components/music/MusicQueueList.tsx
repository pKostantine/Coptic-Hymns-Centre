import { MutableRefObject, useEffect, useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import Icon from '@/components/chc/ui/Icon';
import RoundIconButton from '@/components/playback/RoundIconButton';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { MusicQueueItem } from '@/context/MusicPlayerContext';
import type { PlaybackRepeatMode } from '@/types/playback';
import { formatMusicTrackPerformers } from '@/utils/musicCredits';
import MusicArtwork from './MusicArtwork';

// Rows are a fixed height so a drag distance maps directly onto a slot index.
const ROW_HEIGHT = 64;
const COMPACT_ROW_HEIGHT = 52;
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
  shuffleEnabled: boolean;
  repeatMode: PlaybackRepeatMode;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  likedTrackIds?: ReadonlySet<string>;
  onToggleLike?: (trackId: string) => void;
  compact?: boolean;
  /**
   * `true` gives the list its own scroll area (desktop side panel). Otherwise
   * the rows sit inline and the page scrolls; use onDragActiveChange to lock
   * the page while a row is being dragged.
   */
  scrollable?: boolean;
  onDragActiveChange?: (active: boolean) => void;
  style?: StyleProp<ViewStyle>;
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
  shuffleEnabled,
  repeatMode,
  onToggleShuffle,
  onCycleRepeat,
  likedTrackIds,
  onToggleLike,
  compact = false,
  scrollable = false,
  onDragActiveChange,
  style,
}: MusicQueueListProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const count = queue.length;
  const rowHeight = compact ? COMPACT_ROW_HEIGHT : ROW_HEIGHT;
  const target = drag ? clamp(drag.from + Math.round(drag.dy / rowHeight), 0, count - 1) : -1;

  const offsetFor = (index: number): number => {
    if (!drag) return 0;
    if (index === drag.from) {
      // Keep the lifted row inside the list instead of letting it fly off.
      return clamp(drag.dy, -drag.from * rowHeight, (count - 1 - drag.from) * rowHeight);
    }
    if (drag.from < index && index <= target) return -rowHeight;
    if (target <= index && index < drag.from) return rowHeight;
    return 0;
  };

  // Row responders are created once, so they call through this ref to reach
  // the current render's drag state.
  const handlers = useRef<DragHandlers>({ start: () => undefined, move: () => undefined, end: () => undefined });
  useEffect(() => {
    handlers.current = {
      start: (index) => {
        setDrag({ from: index, dy: 0 });
        onDragActiveChange?.(true);
      },
      move: (dy) => setDrag((current) => (current ? { ...current, dy } : current)),
      end: () => {
        if (drag && target >= 0 && target !== drag.from) onMove(drag.from, target);
        setDrag(null);
        onDragActiveChange?.(false);
      },
    };
  });

  const upNext = Math.max(0, count - Math.max(0, currentIndex) - 1);
  const repeatLabel = repeatMode === 'one' ? 'Repeat one' : repeatMode === 'all' ? 'Repeat all' : 'Repeat off';

  const rows = (
    <View style={[styles.list, { height: count * rowHeight }, Platform.OS === 'web' && styles.noSelect]}>
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
          liked={likedTrackIds?.has(item.track.id) ?? false}
          onToggleLike={onToggleLike}
          compact={compact}
          rowHeight={rowHeight}
        />
      ))}
    </View>
  );

  return (
    <View style={[styles.card, scrollable && styles.cardScrollable, style]}>
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View style={styles.headerTop}>
          <Text style={[styles.headerTitle, compact && styles.headerTitleCompact, isArabic && styles.arabic]}>{isArabic ? 'قائمة الانتظار' : 'Queue'}</Text>
          <View style={styles.modeButtons}>
            <RoundIconButton
              icon="shuffle"
              accessibilityLabel={shuffleEnabled ? 'Shuffle on' : 'Shuffle off'}
              active={shuffleEnabled}
              onPress={onToggleShuffle}
              size={compact ? 38 : 46}
            />
            <RoundIconButton
              icon="repeat"
              accessibilityLabel={repeatLabel}
              active={repeatMode !== 'off'}
              badge={repeatMode === 'one' ? '1' : undefined}
              onPress={onCycleRepeat}
              size={compact ? 38 : 46}
            />
          </View>
        </View>
        <View style={[styles.headerBottom, compact && styles.headerBottomCompact]}>
          <Text style={[styles.headerMeta, compact && styles.headerMetaCompact, isArabic && styles.arabic]}>
            {isArabic ? `${upNext} التالي` : `${upNext} up next · ${count} ${count === 1 ? 'track' : 'tracks'}`}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isArabic ? 'مسح قائمة الانتظار' : 'Clear queue'}
            disabled={count <= 1}
            onPress={onClear}
            style={({ pressed }) => [styles.clearButton, count <= 1 && styles.clearButtonDisabled, pressed && styles.pressed]}
          >
            <Icon name="close" size={12} color={count <= 1 ? COLORS.muted : COLORS.goldBright} />
            <Text style={[styles.clearText, count <= 1 && styles.clearTextDisabled]}>{isArabic ? 'مسح' : 'Clear queue'}</Text>
          </Pressable>
        </View>
      </View>

      {scrollable ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          scrollEnabled={drag == null}
          nestedScrollEnabled
        >
          {rows}
        </ScrollView>
      ) : rows}
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
  liked: boolean;
  onToggleLike?: (trackId: string) => void;
  compact: boolean;
  rowHeight: number;
}

function QueueRow({ index, item, active, playing, offset, lifted, dragging, handlers, onSelect, liked, onToggleLike, compact, rowHeight }: QueueRowProps) {
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
        { top: index * rowHeight, height: rowHeight, transform: [{ translateY }] },
        lifted && styles.rowLifted,
      ]}
    >
      <View style={[styles.row, active && styles.rowActive, lifted && styles.rowLiftedInner]}>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel={`Reorder ${item.track.title}`}
          style={[styles.handle, compact && styles.handleCompact, Platform.OS === 'web' && styles.handleWeb]}
          {...panResponder.panHandlers}
        >
          <Icon name="reorder" size={compact ? 18 : 22} color={lifted ? COLORS.goldBright : COLORS.muted} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Play ${item.track.title}`}
          disabled={dragging}
          onPress={() => onSelect(index)}
          style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
        >
          <MusicArtwork asset={item.coverAsset} size={compact ? 36 : 44} radius={6} label={item.releaseTitle ?? item.track.title} />
          <View style={styles.rowText}>
            <Text numberOfLines={1} style={[styles.rowTitle, compact && styles.rowTitleCompact, active && styles.rowTitleActive]}>{item.track.title}</Text>
            <Text numberOfLines={1} style={[styles.rowArtist, compact && styles.rowArtistCompact]}>
              {active ? (playing ? 'Now playing · ' : 'Paused · ') : ''}{performers}
            </Text>
          </View>
        </Pressable>
        {onToggleLike ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={liked ? `Unlike ${item.track.title}` : `Like ${item.track.title}`}
            disabled={dragging}
            onPress={() => onToggleLike(item.track.id)}
            style={({ pressed }) => [styles.likeButton, compact && styles.likeButtonCompact, pressed && styles.pressed]}
          >
            <Icon name={liked ? 'heart' : 'heart-outline'} size={compact ? 16 : 17} color={liked ? COLORS.goldBright : COLORS.muted} />
          </Pressable>
        ) : null}
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
  cardScrollable: { marginTop: 0, flex: 1, minHeight: 0, overflow: 'hidden' },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: SPACING.xs,
  },
  headerCompact: { paddingTop: 8, paddingBottom: 6, marginBottom: 2 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.sm },
  headerBottomCompact: { marginTop: 4 },
  modeButtons: { flexDirection: 'row', gap: 10 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: SPACING.sm },
  headerTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700' },
  headerTitleCompact: { fontSize: 18 },
  headerMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 2 },
  headerMetaCompact: { fontSize: 11 },
  arabic: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 28,
    paddingHorizontal: 10,
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
  rowShell: { position: 'absolute', left: 0, right: 0, paddingHorizontal: SPACING.xs },
  rowLifted: { zIndex: 10, elevation: 10 },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: SPACING.xs,
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
  rowTitleCompact: { fontSize: 13 },
  rowTitleActive: { color: COLORS.goldBright },
  rowArtist: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  rowArtistCompact: { fontSize: 10, marginTop: 1 },
  likeButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  likeButtonCompact: { width: 32, height: 32, borderRadius: 16 },
  handle: { width: 48, height: '100%', alignItems: 'center', justifyContent: 'center' },
  handleCompact: { width: 38 },
  handleWeb: { cursor: 'grab', touchAction: 'none' } as object,
  pressed: { opacity: 0.7 },
});
