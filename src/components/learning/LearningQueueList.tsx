import { MutableRefObject, useEffect, useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import Icon from '@/components/chc/ui/Icon';
import RoundIconButton from '@/components/playback/RoundIconButton';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type { LearningQueueItem } from '@/context/LearningPlayerContext';
import type { PlaybackRepeatMode } from '@/types/playback';
import LearningArtwork from './LearningArtwork';

const ROW_HEIGHT = 64;
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

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

export default function LearningQueueList({
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
  likedItemIds,
  onToggleLike,
}: {
  queue: LearningQueueItem[];
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
  likedItemIds: ReadonlySet<string>;
  onToggleLike: (item: LearningQueueItem) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const target = drag ? clamp(drag.from + Math.round(drag.dy / ROW_HEIGHT), 0, queue.length - 1) : -1;
  const handlers = useRef<DragHandlers>({ start: () => undefined, move: () => undefined, end: () => undefined });

  useEffect(() => {
    handlers.current = {
      start: (index) => setDrag({ from: index, dy: 0 }),
      move: (dy) => setDrag((current) => current ? { ...current, dy } : null),
      end: () => {
        if (drag && target >= 0 && target !== drag.from) onMove(drag.from, target);
        setDrag(null);
      },
    };
  });

  const offsetFor = (index: number) => {
    if (!drag) return 0;
    if (index === drag.from) return clamp(drag.dy, -drag.from * ROW_HEIGHT, (queue.length - 1 - drag.from) * ROW_HEIGHT);
    if (drag.from < index && index <= target) return -ROW_HEIGHT;
    if (target <= index && index < drag.from) return ROW_HEIGHT;
    return 0;
  };

  const upNext = Math.max(0, queue.length - Math.max(0, currentIndex) - 1);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.headerTitle, isArabic && styles.arabic]}>{isArabic ? 'قائمة الانتظار' : 'Queue'}</Text>
            <Text style={[styles.headerMeta, isArabic && styles.arabic]}>
              {isArabic ? `${upNext} تالياً` : `${upNext} up next · ${queue.length} items`}
            </Text>
          </View>
          <View style={styles.modeButtons}>
            <RoundIconButton
              icon="shuffle"
              accessibilityLabel={shuffleEnabled ? 'Shuffle on' : 'Shuffle off'}
              active={shuffleEnabled}
              accentColor={COLORS.learning}
              onPress={onToggleShuffle}
              size={40}
            />
            <RoundIconButton
              icon="repeat"
              accessibilityLabel={`Repeat ${repeatMode}`}
              active={repeatMode !== 'off'}
              accentColor={COLORS.learning}
              badge={repeatMode === 'one' ? '1' : undefined}
              onPress={onCycleRepeat}
              size={40}
            />
          </View>
        </View>
        <Pressable disabled={queue.length <= 1} onPress={onClear} style={styles.clearButton}>
          <Icon name="close" size={12} color={queue.length <= 1 ? COLORS.muted : COLORS.learningBright} />
          <Text style={[styles.clearText, queue.length <= 1 && styles.disabledText]}>{isArabic ? 'مسح التالي' : 'Clear upcoming'}</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} scrollEnabled={!drag} nestedScrollEnabled>
        <View style={[styles.list, { height: queue.length * ROW_HEIGHT }]}>
          {queue.map((item, index) => (
            <LearningQueueRow
              key={queueKeys[index] ?? `${item.kind}:${item.id}:${index}`}
              item={item}
              index={index}
              active={index === currentIndex}
              playing={playing}
              liked={likedItemIds.has(item.id)}
              offset={offsetFor(index)}
              lifted={drag?.from === index}
              dragging={drag != null}
              handlers={handlers}
              onSelect={onSelect}
              onToggleLike={onToggleLike}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function LearningQueueRow({
  item,
  index,
  active,
  playing,
  liked,
  offset,
  lifted,
  dragging,
  handlers,
  onSelect,
  onToggleLike,
}: {
  item: LearningQueueItem;
  index: number;
  active: boolean;
  playing: boolean;
  liked: boolean;
  offset: number;
  lifted: boolean;
  dragging: boolean;
  handlers: MutableRefObject<DragHandlers>;
  onSelect: (index: number) => void;
  onToggleLike: (item: LearningQueueItem) => void;
}) {
  const [translateY] = useState(() => new Animated.Value(0));
  const indexRef = useRef(index);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => {
    if (lifted || !dragging) {
      translateY.setValue(offset);
      return;
    }
    Animated.timing(translateY, { toValue: offset, duration: 140, useNativeDriver: USE_NATIVE_DRIVER }).start();
  }, [dragging, lifted, offset, translateY]);

  const [panResponder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => handlers.current.start(indexRef.current),
    onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => handlers.current.move(gesture.dy),
    onPanResponderRelease: () => handlers.current.end(),
    onPanResponderTerminate: () => handlers.current.end(),
  }));

  return (
    <Animated.View style={[styles.rowShell, { top: index * ROW_HEIGHT, transform: [{ translateY }] }, lifted && styles.rowLifted]}>
      <View style={[styles.row, active && styles.rowActive]}>
        <View style={styles.handle} {...panResponder.panHandlers}>
          <Icon name="reorder" size={20} color={lifted ? COLORS.learningBright : COLORS.muted} />
        </View>
        <Pressable disabled={dragging} onPress={() => onSelect(index)} style={styles.rowMain}>
          <LearningArtwork asset={item.coverAsset} size={42} radius={6} label={item.containerTitle} />
          <View style={styles.rowCopy}>
            <Text numberOfLines={1} style={[styles.rowTitle, active && styles.rowTitleActive]}>{item.title}</Text>
            <Text numberOfLines={1} style={styles.rowMeta}>
              {active ? (playing ? 'Now playing · ' : 'Paused · ') : ''}{item.cantorName}
            </Text>
          </View>
        </Pressable>
        <Pressable accessibilityLabel={liked ? 'Unlike' : 'Like'} onPress={() => onToggleLike(item)} style={styles.likeButton}>
          <Icon name={liked ? 'heart' : 'heart-outline'} size={17} color={liked ? COLORS.learningBright : COLORS.muted} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  header: { padding: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  headerTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
  headerMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 3 },
  modeButtons: { flexDirection: 'row', gap: SPACING.sm },
  clearButton: { alignSelf: 'flex-start', minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm, paddingHorizontal: 9, borderRadius: RADII.pill, backgroundColor: COLORS.learningSoft },
  clearText: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800' },
  disabledText: { color: COLORS.muted },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: SPACING.sm },
  list: { position: 'relative' },
  rowShell: { position: 'absolute', left: 0, right: 0, height: ROW_HEIGHT, paddingHorizontal: SPACING.xs },
  rowLifted: { zIndex: 5, elevation: 5 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: RADII.sm },
  rowActive: { backgroundColor: COLORS.learningSoft },
  handle: { width: 40, height: '100%', alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, minWidth: 0, height: '100%', flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  rowTitleActive: { color: COLORS.learningBright },
  rowMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 10, marginTop: 2 },
  likeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
