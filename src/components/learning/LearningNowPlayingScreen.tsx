import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '@/components/chc/ui/Icon';
import MusicLyricsView from '@/components/music/MusicLyricsView';
import SeekBar from '@/components/music/SeekBar';
import PlayerSheet from '@/components/playback/PlayerSheet';
import RoundIconButton from '@/components/playback/RoundIconButton';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { type LearningQueueItem, useLearningPlayer } from '@/context/LearningPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { learningService } from '@/services/learningService';
import type { PublishedLyricSet } from '@/types/musicConsumer';
import { goBack } from '@/utils/navigation';
import { publicUrl } from '@/utils/publicUrl';
import { shareLink } from '@/utils/shareLink';
import LearningArtwork from './LearningArtwork';
import LearningPlaylistPicker from './LearningPlaylistPicker';
import LearningQueueList from './LearningQueueList';

const WIDE_MIN_WIDTH = 1024;
const WIDE_MIN_HEIGHT = 560;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function itemKind(item: LearningQueueItem): 'album_recording' | 'lesson' {
  return item.kind === 'recording' ? 'album_recording' : 'lesson';
}

export default function LearningNowPlayingScreen({
  embedded = false,
  onClose,
}: {
  embedded?: boolean;
  onClose?: () => void;
} = {}) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { preferences } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const locale = isArabic ? 'ar' : 'en';
  const player = useLearningPlayer();
  const {
    currentItem,
    queue,
    queueKeys,
    currentIndex,
    playing,
    buffering,
    currentTimeMs,
    durationMs,
    repeatMode,
    shuffleEnabled,
  } = player;
  const [openSheet, setOpenSheet] = useState<'lyrics' | 'queue' | null>(null);
  const [lyricsFullscreen, setLyricsFullscreen] = useState(false);
  const [lyricSets, setLyricSets] = useState<PublishedLyricSet[]>([]);
  const [selectedLyricSetId, setSelectedLyricSetId] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [likedItemIds, setLikedItemIds] = useState<Set<string>>(new Set());
  const [libraryAuthenticated, setLibraryAuthenticated] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  const closePlayer = () => {
    if (embedded && onClose) onClose();
    else goBack(router, '/learn');
  };

  useEffect(() => {
    if (!currentItem) {
      setLyricSets([]);
      setSelectedLyricSetId(null);
      return;
    }
    let active = true;
    setLyricsLoading(true);
    learningService.getLyrics(itemKind(currentItem), currentItem.id)
      .then((payload) => {
        if (!active) return;
        const sets: PublishedLyricSet[] = payload.lyricSets.map((set) => ({
          id: set.id,
          trackId: set.itemId,
          locale: set.locale,
          kind: 'original',
          syncPrecision: set.syncPrecision,
          title: null,
          source: null,
          publicationStatus: set.publicationStatus,
          lines: set.lines.map((line) => ({ ...line, words: line.words ?? [] })),
        }));
        setLyricSets(sets);
        const preferred = sets.find((set) => set.locale === locale) ?? sets[0] ?? null;
        setSelectedLyricSetId(preferred?.id ?? null);
      })
      .catch(() => {
        if (!active) return;
        setLyricSets([]);
        setSelectedLyricSetId(null);
      })
      .finally(() => { if (active) setLyricsLoading(false); });
    return () => { active = false; };
  }, [currentItem?.id, currentItem?.kind, locale]);

  useEffect(() => {
    if (!currentItem) return;
    let active = true;
    learningService.getItemLibrary(locale)
      .then((library) => {
        if (!active) return;
        setLibraryAuthenticated(library.authenticated);
        setLikedItemIds(new Set(library.likedItemIds));
      })
      .catch(() => {
        if (!active) return;
        setLibraryAuthenticated(false);
        setLikedItemIds(new Set());
      });
    return () => { active = false; };
  }, [currentItem?.id, locale]);

  const selectedSet = lyricSets.find((set) => set.id === selectedLyricSetId) ?? null;
  const activeLineId = useMemo(() => {
    if (!selectedSet || selectedSet.syncPrecision === 'unsynced') return null;
    return selectedSet.lines.find((line, index) => {
      if (line.startMs == null) return false;
      const nextStart = selectedSet.lines[index + 1]?.startMs ?? null;
      const effectiveEnd = line.endMs ?? nextStart ?? Number.POSITIVE_INFINITY;
      return currentTimeMs >= line.startMs && currentTimeMs < effectiveEnd;
    })?.id ?? null;
  }, [currentTimeMs, selectedSet]);

  const toggleLike = async (item: LearningQueueItem) => {
    if (likeBusy) return;
    if (!libraryAuthenticated) {
      Alert.alert(
        isArabic ? 'المحتوى المفضّل' : 'Liked Learning',
        isArabic ? 'سجّل الدخول لحفظ الدروس والتسجيلات المفضّلة.' : 'Sign in to save liked lessons and recordings.',
      );
      return;
    }
    setLikeBusy(true);
    const nextLiked = !likedItemIds.has(item.id);
    try {
      await learningService.setItemLiked(itemKind(item), item.id, nextLiked);
      setLikedItemIds((current) => {
        const next = new Set(current);
        if (nextLiked) next.add(item.id); else next.delete(item.id);
        return next;
      });
    } catch (cause) {
      Alert.alert(isArabic ? 'المحتوى المفضّل' : 'Liked Learning', cause instanceof Error ? cause.message : 'Unable to update this item.');
    } finally {
      setLikeBusy(false);
    }
  };

  if (!currentItem) {
    return (
      <SafeAreaView edges={['left', 'right']} style={[styles.safeArea, embedded && styles.embedded]}>
        <PlayerHeader title="Learn & Study" onClose={closePlayer} />
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{isArabic ? 'لا يوجد درس قيد التشغيل' : 'Nothing playing'}</Text>
          <Text style={styles.emptyBody}>{isArabic ? 'اختر درساً أو تسجيلاً للبدء.' : 'Choose a lesson or recording to start learning.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const effectiveDuration = durationMs || currentItem.durationMs || 0;
  const wide = width >= WIDE_MIN_WIDTH && height >= WIDE_MIN_HEIGHT;
  const landscapePhone = width > height && height <= 600 && width < 1100;
  const availableHeight = height - insets.top - insets.bottom - 150;
  const artSize = landscapePhone
    ? clamp(Math.min(height - insets.top - insets.bottom - 100, width * 0.3), 120, 210)
    : clamp(Math.min(width - 54, availableHeight * 0.52), 210, wide ? 360 : 340);
  const artworkUri = learningService.resolveAsset(currentItem.coverAsset);
  const lyricsProps = {
    lyricSets,
    selectedSetId: selectedLyricSetId,
    onSelectSet: setSelectedLyricSetId,
    activeLineId,
    loading: lyricsLoading,
    onSeekLine: (startMs: number) => void player.seekToMs(startMs),
    accentColor: COLORS.learning,
    forceCompact: landscapePhone,
  };
  const queueProps = {
    queue,
    queueKeys,
    currentIndex,
    playing,
    isArabic,
    onSelect: player.selectQueueIndex,
    onMove: player.moveQueueItem,
    onClear: player.clearUpcoming,
    shuffleEnabled,
    repeatMode,
    onToggleShuffle: player.toggleShuffle,
    onCycleRepeat: player.cycleRepeatMode,
    likedItemIds,
    onToggleLike: (item: LearningQueueItem) => void toggleLike(item),
  };

  const handleShare = async () => {
    const path = currentItem.kind === 'recording'
      ? `/learn/album/${currentItem.containerId}`
      : `/learn/lesson-set/${currentItem.containerId}`;
    await shareLink({
      title: currentItem.title,
      text: `${currentItem.title} - ${currentItem.cantorName}`,
      url: publicUrl(path),
    });
  };

  const playerCard = (
    <LearningPlayerCard
      item={currentItem}
      artSize={artSize}
      positionMs={currentTimeMs}
      durationMs={effectiveDuration}
      playing={playing}
      buffering={buffering}
      liked={likedItemIds.has(currentItem.id)}
      likeBusy={likeBusy}
      isArabic={isArabic}
      locale={locale}
      onSeek={(position) => void player.seekToMs(position)}
      onPrevious={player.previous}
      onTogglePlayback={player.togglePlayback}
      onNext={player.next}
      onToggleLike={() => void toggleLike(currentItem)}
      onShare={() => void handleShare()}
      compact={landscapePhone}
    />
  );

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.safeArea, embedded && styles.embedded]}>
      <PlayerHeader title={currentItem.containerTitle} onClose={closePlayer} />
      {wide ? (
        <View style={styles.wideBody}>
          <View style={styles.panel}>
            <PanelHeader title={isArabic ? 'الكلمات' : 'Lyrics'} onFullscreen={() => setLyricsFullscreen(true)} />
            <MusicLyricsView {...lyricsProps} />
          </View>
          <View style={styles.playerColumn}>{playerCard}</View>
          <LearningQueueList {...queueProps} />
        </View>
      ) : landscapePhone ? (
        <View style={styles.landscapeBody}>
          <View style={styles.landscapeArt}>
            <LearningArtwork asset={currentItem.coverAsset} size={artSize} radius={14} label={currentItem.containerTitle} />
          </View>
          <View style={styles.landscapeControls}>
            <LearningPlayerCard
              item={currentItem}
              artSize={artSize}
              showArtwork={false}
              positionMs={currentTimeMs}
              durationMs={effectiveDuration}
              playing={playing}
              buffering={buffering}
              liked={likedItemIds.has(currentItem.id)}
              likeBusy={likeBusy}
              isArabic={isArabic}
              locale={locale}
              onSeek={(position) => void player.seekToMs(position)}
              onPrevious={player.previous}
              onTogglePlayback={player.togglePlayback}
              onNext={player.next}
              onToggleLike={() => void toggleLike(currentItem)}
              onShare={() => void handleShare()}
              compact
            />
            <SheetButtons onLyrics={() => setOpenSheet('lyrics')} onQueue={() => setOpenSheet('queue')} count={queue.length} isArabic={isArabic} />
          </View>
        </View>
      ) : (
        <View style={[styles.narrowBody, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
          <View style={styles.narrowPlayer}>{playerCard}</View>
          <SheetButtons onLyrics={() => setOpenSheet('lyrics')} onQueue={() => setOpenSheet('queue')} count={queue.length} isArabic={isArabic} />
        </View>
      )}

      {!wide ? (
        <>
          <PlayerSheet visible={openSheet === 'lyrics'} onClose={() => setOpenSheet(null)} accessibilityLabel="Lyrics">
            <View style={styles.sheetContent}>
              <PanelHeader title={isArabic ? 'الكلمات' : 'Lyrics'} onFullscreen={() => setLyricsFullscreen(true)} />
              <MusicLyricsView {...lyricsProps} />
            </View>
          </PlayerSheet>
          <PlayerSheet visible={openSheet === 'queue'} onClose={() => setOpenSheet(null)} accessibilityLabel="Queue">
            <View style={styles.sheetContent}><LearningQueueList {...queueProps} /></View>
          </PlayerSheet>
        </>
      ) : null}

      {lyricsFullscreen ? (
        <View style={styles.fullscreen}>
          {artworkUri ? <Image source={{ uri: artworkUri }} blurRadius={60} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
          <View style={styles.fullscreenScrim} />
          <View style={[styles.fullscreenHeader, { paddingTop: insets.top + SPACING.sm }]}>
            <LearningArtwork asset={currentItem.coverAsset} size={48} radius={8} label={currentItem.containerTitle} />
            <View style={styles.fullscreenCopy}>
              <Text numberOfLines={1} style={styles.fullscreenTitle}>{currentItem.title}</Text>
              <Text numberOfLines={1} style={styles.fullscreenMeta}>{currentItem.cantorName}</Text>
            </View>
            <RoundIconButton icon="close-fullscreen" accessibilityLabel="Exit full screen lyrics" onPress={() => setLyricsFullscreen(false)} size={46} accentColor={COLORS.learning} />
          </View>
          <MusicLyricsView {...lyricsProps} variant="fullscreen" />
          <View style={[styles.fullscreenControls, { paddingBottom: insets.bottom + SPACING.md }]}>
            <SeekBar positionMs={currentTimeMs} durationMs={effectiveDuration} onSeek={(position) => void player.seekToMs(position)} accentColor={COLORS.learning} />
            <TransportControls playing={playing} buffering={buffering} onPrevious={player.previous} onTogglePlayback={player.togglePlayback} onNext={player.next} />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function PlayerHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top, height: 64 + insets.top }]}>
      <RoundIconButton icon="chevron-down" accessibilityLabel="Close now playing" onPress={onClose} size={44} accentColor={COLORS.learning} />
      <View style={styles.headerCopy}>
        <Text style={styles.headerEyebrow}>NOW PLAYING</Text>
        <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function PanelHeader({ title, onFullscreen }: { title: string; onFullscreen: () => void }) {
  return (
    <View style={styles.panelHeader}>
      <Text style={styles.panelTitle}>{title}</Text>
      <RoundIconButton icon="open-in-full" accessibilityLabel="Full screen lyrics" onPress={onFullscreen} size={42} accentColor={COLORS.learning} />
    </View>
  );
}

function SheetButtons({ onLyrics, onQueue, count, isArabic }: { onLyrics: () => void; onQueue: () => void; count: number; isArabic: boolean }) {
  return (
    <View style={styles.sheetButtons}>
      <SheetButton icon="book" label={isArabic ? 'الكلمات' : 'Lyrics'} onPress={onLyrics} />
      <SheetButton icon="list-outline" label={isArabic ? 'قائمة الانتظار' : 'Queue'} count={count} onPress={onQueue} />
    </View>
  );
}

function SheetButton({ icon, label, count, onPress }: { icon: 'book' | 'list-outline'; label: string; count?: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.sheetButton}>
      <Icon name={icon} size={19} color={COLORS.learningBright} />
      <Text style={styles.sheetButtonText}>{label}</Text>
      {count != null ? <Text style={styles.sheetCount}>{count}</Text> : null}
      <Icon name="chevron-down" size={15} color={COLORS.muted} style={{ transform: [{ rotate: '180deg' }] }} />
    </Pressable>
  );
}

function LearningPlayerCard({
  item,
  artSize,
  showArtwork = true,
  positionMs,
  durationMs,
  playing,
  buffering,
  liked,
  likeBusy,
  isArabic,
  locale,
  onSeek,
  onPrevious,
  onTogglePlayback,
  onNext,
  onToggleLike,
  onShare,
  compact = false,
}: {
  item: LearningQueueItem;
  artSize: number;
  showArtwork?: boolean;
  positionMs: number;
  durationMs: number;
  playing: boolean;
  buffering: boolean;
  liked: boolean;
  likeBusy: boolean;
  isArabic: boolean;
  locale: string;
  onSeek: (position: number) => void;
  onPrevious: () => void;
  onTogglePlayback: () => void;
  onNext: () => void;
  onToggleLike: () => void;
  onShare: () => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.playerCard, compact && styles.playerCardCompact]}>
      {showArtwork ? <LearningArtwork asset={item.coverAsset} size={artSize} radius={compact ? 12 : 16} label={item.containerTitle} /> : null}
      <View style={styles.trackCopy}>
        <Text numberOfLines={2} style={[styles.trackTitle, compact && styles.trackTitleCompact]}>{item.title}</Text>
        <Text numberOfLines={1} style={styles.containerTitle}>{item.containerTitle}</Text>
        <Text numberOfLines={1} style={styles.cantorName}>{item.cantorName}</Text>
      </View>
      <View style={styles.seek}><SeekBar positionMs={positionMs} durationMs={durationMs} onSeek={onSeek} accentColor={COLORS.learning} dense={compact} /></View>
      <TransportControls playing={playing} buffering={buffering} onPrevious={onPrevious} onTogglePlayback={onTogglePlayback} onNext={onNext} compact={compact} />
      <View style={styles.actions}>
        <RoundIconButton icon={liked ? 'heart' : 'heart-outline'} accessibilityLabel={liked ? 'Unlike' : 'Like'} active={liked} accentColor={COLORS.learning} disabled={likeBusy} onPress={onToggleLike} size={compact ? 40 : 44} />
        <RoundIconButton icon="share-outline" accessibilityLabel="Share" accentColor={COLORS.learning} onPress={onShare} size={compact ? 40 : 44} />
        <LearningPlaylistPicker itemKind={itemKind(item)} itemId={item.id} locale={locale} isArabic={isArabic} />
      </View>
    </View>
  );
}

function TransportControls({ playing, buffering, onPrevious, onTogglePlayback, onNext, compact = false }: { playing: boolean; buffering: boolean; onPrevious: () => void; onTogglePlayback: () => void; onNext: () => void; compact?: boolean }) {
  const playSize = compact ? 54 : 70;
  return (
    <View style={styles.transport}>
      <RoundIconButton icon="play-skip-back" accessibilityLabel="Previous" onPress={onPrevious} size={compact ? 42 : 52} accentColor={COLORS.learning} />
      <Pressable accessibilityLabel={playing ? 'Pause' : 'Play'} onPress={onTogglePlayback} style={[styles.playButton, { width: playSize, height: playSize, borderRadius: playSize / 2 }]}>
        {buffering ? <ActivityIndicator color={COLORS.learningDeep} /> : <Icon name={playing ? 'pause' : 'play'} size={Math.round(playSize * 0.42)} color={COLORS.learningDeep} />}
      </Pressable>
      <RoundIconButton icon="play-skip-forward" accessibilityLabel="Next" onPress={onNext} size={compact ? 42 : 52} accentColor={COLORS.learning} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  embedded: { position: 'absolute', inset: 0, zIndex: 90, elevation: 90 },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.md, backgroundColor: COLORS.black },
  headerCopy: { flex: 1, minWidth: 0, alignItems: 'center' },
  headerEyebrow: { color: COLORS.learning, fontFamily: TYPOGRAPHY.body, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  headerTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800', marginTop: 2 },
  headerSpacer: { width: 44 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 25, fontWeight: '700' },
  emptyBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: SPACING.sm, textAlign: 'center' },
  wideBody: { flex: 1, minHeight: 0, flexDirection: 'row', gap: SPACING.md, padding: SPACING.md },
  panel: { flex: 1, minWidth: 0, overflow: 'hidden', borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  playerColumn: { width: '32%', minWidth: 350, alignItems: 'center', justifyContent: 'center' },
  panelHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md },
  panelTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
  narrowBody: { flex: 1, minHeight: 0, justifyContent: 'space-between', paddingHorizontal: SPACING.md },
  narrowPlayer: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  landscapeBody: { flex: 1, minHeight: 0, flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  landscapeArt: { width: '35%', alignItems: 'center' },
  landscapeControls: { flex: 1, minWidth: 0 },
  playerCard: { width: '100%', maxWidth: 440, alignItems: 'center' },
  playerCardCompact: { maxWidth: 640 },
  trackCopy: { width: '100%', alignItems: 'center', marginTop: SPACING.md },
  trackTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 25, lineHeight: 31, fontWeight: '700', textAlign: 'center' },
  trackTitleCompact: { fontSize: 19, lineHeight: 24 },
  containerTitle: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800', marginTop: 5 },
  cantorName: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  seek: { width: '100%', marginTop: SPACING.md },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.lg, marginTop: SPACING.sm },
  playButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learning },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, marginTop: SPACING.md },
  sheetButtons: { flexDirection: 'row', gap: SPACING.sm, paddingBottom: SPACING.sm },
  sheetButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: SPACING.sm, borderRadius: RADII.pill, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  sheetButtonText: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800' },
  sheetCount: { minWidth: 21, height: 21, borderRadius: 11, color: COLORS.learningDeep, backgroundColor: COLORS.learning, textAlign: 'center', lineHeight: 21, fontFamily: TYPOGRAPHY.body, fontSize: 10, fontWeight: '900' },
  sheetContent: { flex: 1, minHeight: 0, paddingHorizontal: SPACING.sm, paddingBottom: SPACING.sm },
  fullscreen: { position: 'absolute', inset: 0, zIndex: 120, elevation: 120, backgroundColor: COLORS.black },
  fullscreenScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 7, 12, 0.88)' },
  fullscreenHeader: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.md },
  fullscreenCopy: { flex: 1, minWidth: 0 },
  fullscreenTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '800' },
  fullscreenMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 3 },
  fullscreenControls: { paddingHorizontal: SPACING.lg },
});
