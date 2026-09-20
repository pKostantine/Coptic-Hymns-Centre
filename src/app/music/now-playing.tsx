import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  PanResponder,
  PanResponderGestureState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon, { type IconName } from '@/components/chc/ui/Icon';
import MusicArtwork from '@/components/music/MusicArtwork';
import MusicLyricsView from '@/components/music/MusicLyricsView';
import MusicQueueList from '@/components/music/MusicQueueList';
import SeekBar from '@/components/music/SeekBar';
import PlayerSheet from '@/components/playback/PlayerSheet';
import RoundIconButton from '@/components/playback/RoundIconButton';
import { useOverlayTransition } from '@/components/playback/useOverlayTransition';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useMusicPlayer } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import type { MusicConsumerAsset, PublishedLyricSet } from '@/types/musicConsumer';
import { formatMusicTrackPerformers } from '@/utils/musicCredits';

// Lyrics | player | queue side by side once there is room for all three.
const WIDE_MIN_WIDTH = 1024;
const WIDE_MIN_HEIGHT = 560;
const HEADER_HEIGHT = 64;
// Swipe distance (or flick speed) that dismisses the player.
const DISMISS_DISTANCE = 130;
const DISMISS_VELOCITY = 0.75;
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * On web the full-screen lyrics view also takes the browser full screen, and
 * leaving it (Esc) closes the view. Native just shows the overlay, which
 * already covers the whole app.
 */
function useBrowserFullscreen(active: boolean, onExit: () => void) {
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !active || typeof document === 'undefined') return;
    const root = document.documentElement;
    let entered = false;

    const handleChange = () => {
      if (entered && !document.fullscreenElement) onExitRef.current();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onExitRef.current();
    };

    document.addEventListener('fullscreenchange', handleChange);
    document.addEventListener('keydown', handleKey);
    if (root.requestFullscreen && !document.fullscreenElement) {
      root.requestFullscreen().then(() => { entered = true; }).catch(() => undefined);
    }

    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      document.removeEventListener('keydown', handleKey);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [active]);
}

interface MusicNowPlayingScreenProps {
  embedded?: boolean;
  onClose?: () => void;
}

export default function MusicNowPlayingScreen({ embedded = false, onClose }: MusicNowPlayingScreenProps = {}) {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const {
    currentItem,
    queue,
    queueKeys,
    currentIndex,
    playing,
    buffering,
    currentTimeMs,
    durationMs,
    togglePlayback,
    next,
    previous,
    seekToMs,
    selectQueueIndex,
    moveQueueItem,
    clearUpcoming,
    repeatMode,
    shuffleEnabled,
    cycleRepeatMode,
    toggleShuffle,
  } = useMusicPlayer();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [lyricsFullscreen, setLyricsFullscreen] = useState(false);
  const [openSheet, setOpenSheet] = useState<'lyrics' | 'queue' | null>(null);
  const [dismissDrag] = useState(() => new Animated.Value(0));
  const dismiss = useRef({ close: () => undefined as void, height: 0 });
  const exitFullscreen = useRef(() => undefined as void);
  const fullscreenTransition = useOverlayTransition(lyricsFullscreen);
  const [lyricSets, setLyricSets] = useState<PublishedLyricSet[]>([]);
  const [selectedLyricSetId, setSelectedLyricSetId] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [liked, setLiked] = useState(false);
  const [libraryAuthenticated, setLibraryAuthenticated] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  useBrowserFullscreen(lyricsFullscreen, () => setLyricsFullscreen(false));

  const closePlayer = () => {
    if (embedded && onClose) {
      onClose();
      return;
    }
    router.back();
  };

  useEffect(() => {
    dismiss.current = { close: closePlayer, height };
    exitFullscreen.current = () => setLyricsFullscreen(false);
  }, [closePlayer, height]);

  // Swiping down on the full-screen lyrics header drops back to the player.
  // eslint-disable-next-line react-hooks/refs -- refs are read in gesture callbacks, not during render
  const [fullscreenDismissResponder] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture: PanResponderGestureState) => (
      gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.5
    ),
    onPanResponderRelease: (_event, gesture: PanResponderGestureState) => {
      if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) exitFullscreen.current();
    },
  }));

  // Pull the whole player down to put it away, the way a sheet behaves. The
  // gesture only starts on a clear downward drag, so the seek bar, the queue
  // and horizontal swipes keep working.
  // eslint-disable-next-line react-hooks/refs -- refs are read in gesture callbacks, not during render
  const [dismissResponder] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture: PanResponderGestureState) => (
      gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.5
    ),
    onPanResponderMove: (_event, gesture: PanResponderGestureState) => {
      dismissDrag.setValue(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (_event, gesture: PanResponderGestureState) => {
      if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
        Animated.timing(dismissDrag, {
          toValue: dismiss.current.height,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start(() => {
          dismissDrag.setValue(0);
          dismiss.current.close();
        });
        return;
      }
      Animated.spring(dismissDrag, { toValue: 0, useNativeDriver: USE_NATIVE_DRIVER, bounciness: 4 }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(dismissDrag, { toValue: 0, useNativeDriver: USE_NATIVE_DRIVER, bounciness: 4 }).start();
    },
  }));

  useEffect(() => {
    if (!currentItem) {
      setLyricSets([]);
      setSelectedLyricSetId(null);
      return;
    }
    let active = true;
    setLyricsLoading(true);
    musicService.getLyrics(currentItem.track.id)
      .then((payload) => {
        if (!active) return;
        setLyricSets(payload.lyricSets);
        const preferredLocale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
        const preferred = payload.lyricSets.find((set) => set.locale === preferredLocale)
          ?? payload.lyricSets.find((set) => set.kind === 'original')
          ?? payload.lyricSets[0]
          ?? null;
        setSelectedLyricSetId(preferred?.id ?? null);
      })
      .catch(() => {
        if (active) {
          setLyricSets([]);
          setSelectedLyricSetId(null);
        }
      })
      .finally(() => { if (active) setLyricsLoading(false); });
    return () => { active = false; };
  }, [currentItem?.track.id, preferences.appLanguage]);

  useEffect(() => {
    if (!currentItem) return;
    let active = true;
    musicService.getLibrary(preferences.appLanguage === 'ar' ? 'ar' : 'en')
      .then((library) => {
        if (!active) return;
        setLibraryAuthenticated(library.authenticated);
        setLiked(library.likedTracks.some((track) => track.id === currentItem.track.id));
      })
      .catch(() => {
        if (active) {
          setLibraryAuthenticated(false);
          setLiked(false);
        }
      });
    return () => { active = false; };
  }, [currentItem?.track.id, preferences.appLanguage]);

  const selectedSet = lyricSets.find((set) => set.id === selectedLyricSetId) ?? null;
  const activeLineId = useMemo(() => {
    if (!selectedSet) return null;
    const active = selectedSet.lines.find((line, index) => {
      if (line.startMs == null) return false;
      const nextStart = selectedSet.lines[index + 1]?.startMs ?? null;
      const effectiveEnd = line.endMs ?? nextStart ?? Number.POSITIVE_INFINITY;
      return currentTimeMs >= line.startMs && currentTimeMs < effectiveEnd;
    });
    return active?.id ?? null;
  }, [currentTimeMs, selectedSet]);

  const toggleLike = async () => {
    if (!currentItem || likeBusy) return;
    if (!libraryAuthenticated) {
      Alert.alert(
        isArabic ? 'الأغاني المعجبة' : 'Liked Songs',
        isArabic ? 'سجّل الدخول إلى حساب CHC لحفظ الأغاني المعجبة.' : 'Sign in to your CHC account to save Liked Songs.',
      );
      return;
    }
    setLikeBusy(true);
    try {
      const nextLiked = !liked;
      await musicService.setLiked(currentItem.track.id, nextLiked);
      setLiked(nextLiked);
    } catch (cause) {
      Alert.alert(isArabic ? 'الأغاني المعجبة' : 'Liked Songs', cause instanceof Error ? cause.message : 'Unable to update Liked Songs.');
    } finally {
      setLikeBusy(false);
    }
  };

  const showDownloadAction = () => {
    Alert.alert(
      isArabic ? 'التنزيل' : 'Download',
      isArabic
        ? 'تم تجهيز إجراء التنزيل في تجربة الموسيقى. التخزين الكامل والاستماع بلا اتصال سيتم تفعيله في مرحلة التنزيلات.'
        : 'The download action is part of the Music experience. Full local storage and offline playback are implemented in the dedicated Offline Downloads phase.',
    );
  };

  const header = (
    <View style={styles.header}>
      <RoundIconButton icon="chevron-down" accessibilityLabel="Close now playing" onPress={closePlayer} />
      <View style={styles.headerCenter}>
        <Text style={styles.headerEyebrow}>{isArabic ? 'قيد التشغيل' : 'NOW PLAYING'}</Text>
        {currentItem?.releaseTitle ? <Text numberOfLines={1} style={styles.headerTitle}>{currentItem.releaseTitle}</Text> : null}
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (!currentItem) {
    return (
      <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
        {header}
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Nothing playing</Text>
          <Text style={styles.emptyBody}>Choose a track from Music to start listening.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/music')}><Text style={styles.primaryButtonText}>Browse Music</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const performerLine = formatMusicTrackPerformers(currentItem.track, 'Coptic Hymns Centre');
  const effectiveDurationMs = durationMs || currentItem.track.durationMs || 0;
  const artworkUri = musicService.resolveAsset(currentItem.coverAsset ?? null);
  const wide = width >= WIDE_MIN_WIDTH && height >= WIDE_MIN_HEIGHT;

  // Size the centre column from the space actually available so the whole
  // player fits on screen without scrolling.
  const availableHeight = height - insets.top - insets.bottom - HEADER_HEIGHT - SPACING.lg * 2;
  const centerWidth = wide ? clamp(width * 0.3, 360, 460) : 0;
  const wideArtSize = clamp(Math.min(availableHeight - 350, centerWidth - 64), 160, 400);
  // Phones show the player full-height with the pull-up buttons pinned below,
  // so the artwork takes whatever room the rest of the controls leave.
  const narrowArtSize = clamp(Math.min(width - SPACING.lg * 2, availableHeight - 290), 140, 360);

  const lyricsProps = {
    lyricSets,
    selectedSetId: selectedLyricSetId,
    onSelectSet: setSelectedLyricSetId,
    activeLineId,
    loading: lyricsLoading,
    onSeekLine: (startMs: number) => void seekToMs(startMs),
  };

  const queueProps = {
    queue,
    queueKeys,
    currentIndex,
    playing,
    isArabic,
    onSelect: selectQueueIndex,
    onMove: moveQueueItem,
    onClear: clearUpcoming,
    shuffleEnabled,
    repeatMode,
    onToggleShuffle: toggleShuffle,
    onCycleRepeat: cycleRepeatMode,
  };

  const lyricsPanelHeader = (
    <View style={styles.panelHeader}>
      <Text style={[styles.panelTitle, isArabic && styles.arabic]}>{isArabic ? 'الكلمات' : 'Lyrics'}</Text>
      <RoundIconButton
        icon="open-in-full"
        accessibilityLabel="Full screen lyrics"
        onPress={() => setLyricsFullscreen(true)}
        size={46}
      />
    </View>
  );

  const isPhoneLayout = !wide && width < 460;
  const player = (
    <PlayerCard
      compact={isPhoneLayout}
      artSize={wide ? wideArtSize : narrowArtSize}
      coverAsset={currentItem.coverAsset}
      artLabel={currentItem.releaseTitle ?? currentItem.track.title}
      title={currentItem.track.title}
      performers={performerLine}
      positionMs={currentTimeMs}
      durationMs={effectiveDurationMs}
      playing={playing}
      buffering={buffering}
      liked={liked}
      likeBusy={likeBusy}
      isArabic={isArabic}
      onSeek={(positionMs) => void seekToMs(positionMs)}
      onPrevious={previous}
      onTogglePlayback={togglePlayback}
      onNext={next}
      onToggleLike={() => void toggleLike()}
      onDownload={Platform.OS !== 'web' ? showDownloadAction : undefined}
    />
  );

  const rootStyle = embedded ? [styles.safeArea, styles.embeddedSafeArea] : styles.safeArea;

  return (
    <SafeAreaView edges={['left', 'right']} style={rootStyle}>
      {embedded ? <Pressable accessibilityLabel="Close now playing overlay" onPress={closePlayer} style={styles.overlayBackdrop} /> : null}
      <Animated.View
        style={[styles.dismissLayer, { transform: [{ translateY: dismissDrag }] }]}
        {...(wide ? {} : dismissResponder.panHandlers)}
      >
        {header}

        {wide ? (
          <View style={styles.wideBody}>
            <View style={[styles.panel, styles.sidePanel]}>
              {lyricsPanelHeader}
              <MusicLyricsView {...lyricsProps} />
            </View>
            <View style={[styles.panel, styles.playerPanel, { width: centerWidth }]}>
              {player}
            </View>
            <MusicQueueList {...queueProps} scrollable style={styles.sidePanel} />
          </View>
        ) : (
          <View style={styles.narrowBody}>
            <View style={styles.narrowPlayer}>{player}</View>

            <View style={styles.pullUpRow}>
              <PullUpButton
                icon="book"
                label={isArabic ? 'الكلمات' : 'Lyrics'}
                onPress={() => setOpenSheet('lyrics')}
              />
              <PullUpButton
                icon="list-outline"
                label={isArabic ? 'قائمة الانتظار' : 'Queue'}
                count={queue.length}
                onPress={() => setOpenSheet('queue')}
              />
            </View>
          </View>
        )}
      </Animated.View>

      {!wide ? (
        <>
          <PlayerSheet
            visible={openSheet === 'lyrics'}
            onClose={() => setOpenSheet(null)}
            accessibilityLabel={isArabic ? 'الكلمات' : 'Lyrics'}
          >
            <View style={styles.sheetContent}>
              {lyricsPanelHeader}
              <MusicLyricsView {...lyricsProps} />
            </View>
          </PlayerSheet>

          <PlayerSheet
            visible={openSheet === 'queue'}
            onClose={() => setOpenSheet(null)}
            accessibilityLabel={isArabic ? 'قائمة الانتظار' : 'Queue'}
          >
            <MusicQueueList {...queueProps} scrollable style={styles.sheetQueue} />
          </PlayerSheet>
        </>
      ) : null}

      {fullscreenTransition.mounted ? (
        <Animated.View
          style={[
            styles.fullscreen,
            {
              opacity: fullscreenTransition.progress,
              transform: [
                { scale: fullscreenTransition.progress.interpolate({ inputRange: [0, 1], outputRange: [1.03, 1] }) },
              ],
            },
          ]}
        >
          {artworkUri ? (
            <Image source={{ uri: artworkUri }} blurRadius={60} contentFit="cover" style={StyleSheet.absoluteFill} />
          ) : null}
          <View style={styles.fullscreenScrim} />

          <View
            style={[styles.fullscreenTop, { paddingTop: insets.top + SPACING.md }]}
            {...fullscreenDismissResponder.panHandlers}
          >
            <MusicArtwork asset={currentItem.coverAsset} size={52} radius={8} label={currentItem.releaseTitle ?? currentItem.track.title} />
            <View style={styles.fullscreenTrack}>
              <Text numberOfLines={1} style={styles.fullscreenTitle}>{currentItem.track.title}</Text>
              <Text numberOfLines={1} style={styles.fullscreenArtist}>{performerLine}</Text>
            </View>
            <RoundIconButton
              icon="close-fullscreen"
              accessibilityLabel="Exit full screen lyrics"
              onPress={() => setLyricsFullscreen(false)}
              size={48}
            />
          </View>

          <MusicLyricsView {...lyricsProps} variant="fullscreen" />

          <View style={[styles.fullscreenControls, { paddingBottom: insets.bottom + SPACING.lg }]}>
            <SeekBar positionMs={currentTimeMs} durationMs={effectiveDurationMs} onSeek={(positionMs) => void seekToMs(positionMs)} />
            <TransportControls
              playing={playing}
              buffering={buffering}
              onPrevious={previous}
              onTogglePlayback={togglePlayback}
              onNext={next}
              large
            />
          </View>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

interface PullUpButtonProps {
  icon: IconName;
  label: string;
  count?: number;
  onPress: () => void;
}

/** Wide bottom button that pulls up the lyrics or the queue on phones. */
function PullUpButton({ icon, label, count, onPress }: PullUpButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.pullUpButton, pressed && styles.pullUpButtonPressed]}
    >
      <Icon name={icon} size={19} color={COLORS.goldBright} />
      <Text numberOfLines={1} style={styles.pullUpLabel}>{label}</Text>
      {count != null ? <Text style={styles.pullUpCount}>{count}</Text> : null}
      <Icon name="chevron-down" size={15} color={COLORS.muted} style={styles.pullUpChevron} />
    </Pressable>
  );
}

interface TransportControlsProps {
  playing: boolean;
  buffering: boolean;
  onPrevious: () => void;
  onTogglePlayback: () => void;
  onNext: () => void;
  large?: boolean;
}

function TransportControls({ playing, buffering, onPrevious, onTogglePlayback, onNext, large = false }: TransportControlsProps) {
  const playSize = large ? 76 : 68;
  const skipIcon = large ? 30 : 26;

  return (
    <View style={styles.controls}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous track"
        onPress={onPrevious}
        style={({ pressed }) => [styles.sideControl, pressed && styles.pressedControl]}
      >
        <Icon name="play-skip-back" size={skipIcon} color={COLORS.white} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause' : 'Play'}
        onPress={onTogglePlayback}
        style={({ pressed }) => [
          styles.playButton,
          { width: playSize, height: playSize, borderRadius: playSize / 2 },
          pressed && styles.pressedControl,
        ]}
      >
        {buffering ? (
          <ActivityIndicator color={COLORS.black} />
        ) : (
          <Icon
            name={playing ? 'pause' : 'play'}
            size={Math.round(playSize * 0.42)}
            color={COLORS.black}
            // The play triangle's visual centre sits left of its box.
            style={playing ? undefined : styles.playNudge}
          />
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next track"
        onPress={onNext}
        style={({ pressed }) => [styles.sideControl, pressed && styles.pressedControl]}
      >
        <Icon name="play-skip-forward" size={skipIcon} color={COLORS.white} />
      </Pressable>
    </View>
  );
}

interface PlayerCardProps extends Omit<TransportControlsProps, 'large'> {
  compact?: boolean;
  artSize: number;
  coverAsset?: MusicConsumerAsset | null;
  artLabel: string;
  title: string;
  performers: string;
  positionMs: number;
  durationMs: number;
  liked: boolean;
  likeBusy: boolean;
  isArabic: boolean;
  onSeek: (positionMs: number) => void;
  onToggleLike: () => void;
  onDownload?: () => void;
}

function PlayerCard({
  compact = false,
  artSize,
  coverAsset,
  artLabel,
  title,
  performers,
  positionMs,
  durationMs,
  liked,
  likeBusy,
  isArabic,
  onSeek,
  onToggleLike,
  onDownload,
  ...transport
}: PlayerCardProps) {
  const contentWidth = Math.max(artSize, 320);

  return (
    <View style={[styles.playerCard, compact && styles.playerCardCompact]}>
      <View style={[styles.artShadow, compact && styles.artShadowCompact]}>
        <MusicArtwork asset={coverAsset} size={artSize} radius={compact ? 12 : 16} label={artLabel} />
      </View>

      <View style={[styles.titleRow, { maxWidth: contentWidth }, compact && styles.titleRowCompact]}>
        <View style={styles.titleText}>
          <Text numberOfLines={2} style={[styles.trackTitle, compact && styles.trackTitleCompact]}>{title}</Text>
          <Text numberOfLines={1} style={[styles.artist, compact && styles.artistCompact]}>{performers}</Text>
        </View>
        <RoundIconButton
          icon={liked ? 'heart' : 'heart-outline'}
          accessibilityLabel={liked ? (isArabic ? 'إزالة الإعجاب' : 'Unlike') : (isArabic ? 'إعجاب' : 'Like')}
          active={liked}
          disabled={likeBusy}
          onPress={onToggleLike}
          size={42}
        />
      </View>

      <View style={[styles.seekBar, { maxWidth: contentWidth }, compact && styles.seekBarCompact]}>
        <SeekBar positionMs={positionMs} durationMs={durationMs} onSeek={onSeek} />
      </View>

      <TransportControls {...transport} large={!compact} />

      {onDownload ? (
        <Pressable style={styles.downloadAction} onPress={onDownload}>
          <Text style={styles.downloadText}>↓ {isArabic ? 'تنزيل' : 'Download'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  embeddedSafeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 90,
    elevation: 90,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  overlayBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.28)' },
  dismissLayer: { flex: 1, minHeight: 0 },
  arabic: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },

  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: SPACING.sm },
  headerEyebrow: { color: COLORS.gold, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  headerTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 15, fontWeight: '700', marginTop: 2 },
  headerSpacer: { width: 44 },

  wideBody: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: 1600,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: SPACING.md + 4,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  panel: {
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  sidePanel: { flex: 1, minWidth: 0, minHeight: 0 },
  playerPanel: {
    justifyContent: 'center',
    backgroundColor: '#0B1E33',
    borderColor: 'rgba(201, 162, 39, 0.22)',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  panelTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700' },

  playerCard: { alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg },
  playerCardCompact: { paddingHorizontal: 14, paddingVertical: 12 },
  artShadow: {
    borderRadius: 16,
    ...Platform.select({
      web: { boxShadow: '0 18px 40px rgba(0, 0, 0, 0.55)' } as object,
      default: { shadowColor: COLORS.shadow, shadowOpacity: 0.55, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
    }),
  },
  titleRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.lg },
  titleRowCompact: { marginTop: 12, gap: 8 },
  titleText: { flex: 1, minWidth: 0 },
  trackTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 24, lineHeight: 30, fontWeight: '700' },
  trackTitleCompact: { fontSize: 20, lineHeight: 26 },
  artist: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '700', marginTop: 4 },
  artistCompact: { fontSize: 12, marginTop: 3 },
  seekBar: { width: '100%', marginTop: SPACING.md },
  seekBarCompact: { marginTop: 10 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xl, marginTop: SPACING.xs },
  playButton: { backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  playNudge: { marginLeft: 4 },
  sideControl: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  pressedControl: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  downloadAction: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginTop: SPACING.md,
  },
  downloadText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '700' },

  narrowBody: { flex: 1, minHeight: 0, paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
  narrowPlayer: { flex: 1, justifyContent: 'center' },
  pullUpRow: { flexDirection: 'row', gap: SPACING.sm + 4 },
  pullUpButton: {
    flex: 1,
    minWidth: 0,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  pullUpButtonPressed: { opacity: 0.75, backgroundColor: 'rgba(255, 255, 255, 0.12)' },
  pullUpLabel: { flex: 1, minWidth: 0, color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '700' },
  pullUpCount: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '700' },
  // The shared chevron points down; these buttons open upwards.
  pullUpChevron: { transform: [{ rotate: '180deg' }] },
  sheetContent: { flex: 1, minHeight: 0 },
  sheetQueue: { flex: 1, marginTop: 0, backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0 },

  fullscreen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, elevation: 100, backgroundColor: COLORS.black },
  fullscreenScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 8, 18, 0.78)' },
  fullscreenTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  fullscreenTrack: { flex: 1, minWidth: 0 },
  fullscreenTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 18, fontWeight: '700' },
  fullscreenArtist: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '700', marginTop: 2 },
  fullscreenControls: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 25, fontWeight: '700' },
  emptyBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center', marginTop: SPACING.sm },
  primaryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.lg, borderRadius: RADII.pill, backgroundColor: COLORS.gold, marginTop: SPACING.lg },
  primaryButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontWeight: '800' },
});
