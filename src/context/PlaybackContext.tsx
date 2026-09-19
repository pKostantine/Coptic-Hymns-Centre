import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Platform } from 'react-native';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { downloadManager } from '@/services/downloadManager';
import type { PlaybackQueueEntry, PlaybackRepeatMode, PlaybackSnapshot } from '@/types/playback';
import {
  choosePlaybackUri,
  clampPlaybackIndex,
  getFinishedTrackAction,
  getManualNextIndex,
  getManualPreviousIndex,
  keepOnlyCurrentEntry,
  moveQueueEntry,
  nextRepeatMode,
  restoreOriginalQueue,
  shuffleQueuePreservingCurrent,
} from '@/utils/playbackEngine';
import {
  loadPlaybackSnapshot,
  localPlaybackUriExists,
  savePlaybackSnapshot,
} from '@/utils/playbackStateStorage';

export interface PlaybackContextValue {
  queue: PlaybackQueueEntry[];
  currentIndex: number;
  currentItem: PlaybackQueueEntry | null;
  playing: boolean;
  buffering: boolean;
  loadingSource: boolean;
  currentTimeMs: number;
  durationMs: number;
  repeatMode: PlaybackRepeatMode;
  shuffleEnabled: boolean;
  playbackError: string | null;
  playQueue: (items: PlaybackQueueEntry[], startIndex?: number) => void;
  playItem: (item: PlaybackQueueEntry) => void;
  togglePlayback: () => void;
  next: () => void;
  previous: () => void;
  seekToMs: (positionMs: number) => Promise<void>;
  selectQueueIndex: (index: number) => void;
  /** Drag-to-reorder. The playing entry keeps playing wherever it lands. */
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  /** Empties the queue but keeps the current entry playing. */
  clearUpcoming: () => void;
  /** Stops playback and forgets the queue entirely. */
  clearQueue: () => void;
  /**
   * Rewrites entries in place (same keys, same order), e.g. to refresh stale
   * metadata restored from a saved snapshot.
   */
  updateQueueEntries: (update: (entry: PlaybackQueueEntry) => PlaybackQueueEntry) => void;
  /** True once any saved snapshot has been restored. */
  hydrated: boolean;
  cycleRepeatMode: () => void;
  toggleShuffle: () => void;
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

async function resolveEntryUri(entry: PlaybackQueueEntry): Promise<string | null> {
  const localUri = entry.playable.source.localUri?.trim() || null;
  const remoteUri = entry.playable.source.remoteUri?.trim() || null;
  const localAvailable = localUri ? await localPlaybackUriExists(localUri) : false;
  if (localAvailable) return choosePlaybackUri(localUri, remoteUri, true);

  return downloadManager.resolvePlaybackUri(
    entry.playable.kind,
    entry.playable.id,
    remoteUri,
  );
}

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, {
    updateInterval: 125,
    preferredForwardBufferDuration: 20,
  });
  const status = useAudioPlayerStatus(player);
  const [queue, setQueue] = useState<PlaybackQueueEntry[]>([]);
  const [originalQueue, setOriginalQueue] = useState<PlaybackQueueEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [repeatMode, setRepeatMode] = useState<PlaybackRepeatMode>('off');
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const sourceRequestId = useRef(0);
  const restorePositionMs = useRef<number | null>(null);

  const currentItem = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;
  const currentTimeMs = Math.max(0, Math.round((status.currentTime ?? 0) * 1000));
  const durationMs = Math.max(0, Math.round((status.duration ?? 0) * 1000));

  const loadEntry = useCallback(async (
    entries: PlaybackQueueEntry[],
    index: number,
    autoplay: boolean,
    positionMs = 0,
  ) => {
    const boundedIndex = clampPlaybackIndex(entries.length, index);
    if (boundedIndex < 0) return;
    const requestId = ++sourceRequestId.current;
    setLoadingSource(true);
    setPlaybackError(null);

    try {
      const entry = entries[boundedIndex];
      const uri = await resolveEntryUri(entry);
      if (requestId !== sourceRequestId.current) return;
      if (!uri) throw new Error('No playable local or remote source is available.');

      setCurrentIndex(boundedIndex);
      player.replace({
        uri,
        headers: entry.playable.source.headers ?? undefined,
        name: entry.playable.title,
      });

      restorePositionMs.current = positionMs > 0 ? positionMs : null;
      if (autoplay) player.play();
    } catch (cause) {
      if (requestId !== sourceRequestId.current) return;
      setPlaybackError(cause instanceof Error ? cause.message : 'Unable to load audio.');
      player.pause();
    } finally {
      if (requestId === sourceRequestId.current) setLoadingSource(false);
    }
  }, [player]);

  const playQueue = useCallback((items: PlaybackQueueEntry[], startIndex = 0) => {
    if (!items.length) return;
    const original = [...items];
    const safeIndex = clampPlaybackIndex(original.length, startIndex);
    const nextState = shuffleEnabled
      ? shuffleQueuePreservingCurrent(original, safeIndex)
      : { queue: original, currentIndex: safeIndex };

    setOriginalQueue(original);
    setQueue(nextState.queue);
    void loadEntry(nextState.queue, nextState.currentIndex, true);
  }, [loadEntry, shuffleEnabled]);

  const playItem = useCallback((item: PlaybackQueueEntry) => {
    setOriginalQueue([item]);
    setQueue([item]);
    void loadEntry([item], 0, true);
  }, [loadEntry]);

  const togglePlayback = useCallback(() => {
    if (!currentItem) return;
    if (status.playing) player.pause();
    else player.play();
  }, [currentItem, player, status.playing]);

  const seekToMs = useCallback(async (positionMs: number) => {
    const knownDurationMs = Math.max(durationMs, currentItem?.playable.durationMs ?? 0);
    const safeMs = Math.max(0, knownDurationMs > 0 ? Math.min(positionMs, knownDurationMs) : positionMs);
    await player.seekTo(safeMs / 1000);
  }, [currentItem?.playable.durationMs, durationMs, player]);

  const next = useCallback(() => {
    if (!queue.length || currentIndex < 0) return;
    const nextIndex = getManualNextIndex(queue.length, currentIndex, repeatMode);
    if (nextIndex === currentIndex) return;
    void loadEntry(queue, nextIndex, true);
  }, [currentIndex, loadEntry, queue, repeatMode]);

  const previous = useCallback(() => {
    if (!queue.length || currentIndex < 0) return;
    if (currentTimeMs > 4000) {
      void player.seekTo(0);
      return;
    }
    const previousIndex = getManualPreviousIndex(queue.length, currentIndex, repeatMode);
    if (previousIndex === currentIndex) {
      void player.seekTo(0);
      return;
    }
    void loadEntry(queue, previousIndex, true);
  }, [currentIndex, currentTimeMs, loadEntry, player, queue, repeatMode]);

  const selectQueueIndex = useCallback((index: number) => {
    if (index < 0 || index >= queue.length) return;
    void loadEntry(queue, index, true);
  }, [loadEntry, queue]);

  const moveQueueItem = useCallback((fromIndex: number, toIndex: number) => {
    const moved = moveQueueEntry(queue, currentIndex, fromIndex, toIndex);
    setQueue(moved.queue);
    setCurrentIndex(moved.currentIndex);
    // Without shuffle the queue *is* the listening order, so a manual reorder
    // must survive toggling shuffle on and off again.
    if (!shuffleEnabled) setOriginalQueue(moved.queue);
  }, [currentIndex, queue, shuffleEnabled]);

  const clearUpcoming = useCallback(() => {
    const kept = keepOnlyCurrentEntry(queue, currentIndex);
    setQueue(kept.queue);
    setOriginalQueue(kept.queue);
    setCurrentIndex(kept.currentIndex);
  }, [currentIndex, queue]);

  const updateQueueEntries = useCallback((update: (entry: PlaybackQueueEntry) => PlaybackQueueEntry) => {
    setQueue((entries) => entries.map(update));
    setOriginalQueue((entries) => entries.map(update));
  }, []);

  const clearQueue = useCallback(() => {
    sourceRequestId.current += 1;
    player.pause();
    player.setActiveForLockScreen(false);
    player.replace(null);
    setQueue([]);
    setOriginalQueue([]);
    setCurrentIndex(-1);
    setPlaybackError(null);
    void savePlaybackSnapshot(null);
  }, [player]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((current) => nextRepeatMode(current));
  }, []);

  const toggleShuffle = useCallback(() => {
    if (!queue.length || currentIndex < 0) {
      setShuffleEnabled((value) => !value);
      return;
    }

    if (!shuffleEnabled) {
      const shuffled = shuffleQueuePreservingCurrent(queue, currentIndex);
      setQueue(shuffled.queue);
      setCurrentIndex(shuffled.currentIndex);
      setShuffleEnabled(true);
      return;
    }

    const restored = restoreOriginalQueue(originalQueue.length ? originalQueue : queue, queue, currentIndex);
    setQueue(restored.queue);
    setCurrentIndex(restored.currentIndex);
    setShuffleEnabled(false);
  }, [currentIndex, originalQueue, queue, shuffleEnabled]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
  }, []);

  // Media Session action handlers outlive renders, so they read the latest
  // queue navigation through refs instead of capturing stale callbacks.
  const nextRef = useRef<() => void>(() => undefined);
  const previousRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const webGlobal = globalThis as unknown as {
      navigator?: {
        mediaSession?: {
          metadata: unknown | null;
          setActionHandler?: (action: string, handler: (() => void) | null) => void;
        };
      };
      MediaMetadata?: new (init: {
        title?: string;
        artist?: string;
        album?: string;
        artwork?: { src: string; type?: string }[];
      }) => unknown;
    };

    if (!currentItem) {
      player.setActiveForLockScreen(false);
      if (Platform.OS === 'web' && webGlobal.navigator?.mediaSession) {
        webGlobal.navigator.mediaSession.metadata = null;
      }
      return;
    }

    const playable = currentItem.playable;
    const metadata = {
      title: playable.title,
      artist: playable.artist ?? undefined,
      albumTitle: playable.albumTitle ?? undefined,
      artworkUrl: playable.artworkUri ?? undefined,
    };
    player.setActiveForLockScreen(true, metadata, {
      showSeekBackward: true,
      showSeekForward: true,
    });
    player.updateLockScreenMetadata(metadata);

    // expo-audio owns playback on web, but Chrome's global media controls use
    // the Media Session API for the rich card. Set that metadata explicitly so
    // CHC gets the same album-art treatment as YouTube and SoundCloud.
    if (Platform.OS === 'web' && webGlobal.navigator?.mediaSession && webGlobal.MediaMetadata) {
      webGlobal.navigator.mediaSession.metadata = new webGlobal.MediaMetadata({
        title: playable.title,
        artist: playable.artist ?? undefined,
        album: playable.albumTitle ?? undefined,
        artwork: playable.artworkUri ? [{ src: playable.artworkUri, type: 'image/jpeg' }] : undefined,
      });

      // expo-audio maps Chrome's previous/next buttons to 10-second seeks.
      // CHC is a queue player, so those buttons should change tracks.
      const session = webGlobal.navigator.mediaSession;
      try {
        session.setActionHandler?.('nexttrack', () => nextRef.current());
        session.setActionHandler?.('previoustrack', () => previousRef.current());
      } catch {
        // Older browsers reject unknown actions; the basic controls still work.
      }
    }
  }, [currentItem, player]);

  useEffect(() => {
    const requestedPosition = restorePositionMs.current;
    if (requestedPosition == null || !status.isLoaded) return;
    restorePositionMs.current = null;
    void player.seekTo(requestedPosition / 1000);
  }, [player, status.isLoaded]);

  // didJustFinish stays true until the *next* source reports its first status.
  // Advancing changes currentIndex, which re-runs this effect while the stale
  // flag is still set, so without an edge check one finished track would skip
  // straight through the rest of the queue and stop on the last entry.
  const finishHandled = useRef(false);
  useEffect(() => {
    if (!status.didJustFinish) {
      finishHandled.current = false;
      return;
    }
    if (finishHandled.current || currentIndex < 0) return;
    finishHandled.current = true;
    const action = getFinishedTrackAction(queue.length, currentIndex, repeatMode);
    if (action.type === 'replay') {
      void player.seekTo(0).then(() => player.play());
      return;
    }
    if (action.type === 'advance') {
      void loadEntry(queue, action.index, true);
      return;
    }
    player.pause();
  }, [currentIndex, loadEntry, player, queue, repeatMode, status.didJustFinish]);

  useEffect(() => {
    let active = true;
    loadPlaybackSnapshot()
      .then((snapshot) => {
        if (!active || !snapshot || !snapshot.queue.length) return;
        setQueue(snapshot.queue);
        setOriginalQueue(snapshot.originalQueue.length ? snapshot.originalQueue : snapshot.queue);
        setCurrentIndex(snapshot.currentIndex);
        setRepeatMode(snapshot.repeatMode);
        setShuffleEnabled(snapshot.shuffleEnabled);
        void loadEntry(snapshot.queue, snapshot.currentIndex, false, snapshot.positionMs);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => { active = false; };
  }, [loadEntry]);

  const persistenceBucket = Math.floor(currentTimeMs / 5000);
  useEffect(() => {
    if (!hydrated || !queue.length || currentIndex < 0) return;
    const snapshot: PlaybackSnapshot = {
      version: 1,
      queue,
      originalQueue: originalQueue.length ? originalQueue : queue,
      currentIndex,
      positionMs: persistenceBucket * 5000,
      repeatMode,
      shuffleEnabled,
    };
    void savePlaybackSnapshot(snapshot);
  }, [currentIndex, hydrated, originalQueue, persistenceBucket, queue, repeatMode, shuffleEnabled]);

  useEffect(() => {
    nextRef.current = next;
    previousRef.current = previous;
  }, [next, previous]);

  const value = useMemo<PlaybackContextValue>(() => ({
    queue,
    currentIndex,
    currentItem,
    playing: Boolean(status.playing),
    buffering: Boolean(status.isBuffering),
    loadingSource,
    currentTimeMs,
    durationMs,
    repeatMode,
    shuffleEnabled,
    playbackError,
    playQueue,
    playItem,
    togglePlayback,
    next,
    previous,
    seekToMs,
    selectQueueIndex,
    moveQueueItem,
    clearUpcoming,
    clearQueue,
    updateQueueEntries,
    hydrated,
    cycleRepeatMode,
    toggleShuffle,
  }), [
    clearUpcoming,
    hydrated,
    moveQueueItem,
    updateQueueEntries,
    clearQueue,
    currentIndex,
    currentItem,
    currentTimeMs,
    cycleRepeatMode,
    durationMs,
    loadingSource,
    next,
    playItem,
    playQueue,
    playbackError,
    previous,
    queue,
    repeatMode,
    seekToMs,
    selectQueueIndex,
    shuffleEnabled,
    status.isBuffering,
    status.playing,
    togglePlayback,
    toggleShuffle,
  ]);

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export function usePlayback(): PlaybackContextValue {
  const value = useContext(PlaybackContext);
  if (!value) throw new Error('usePlayback must be used inside PlaybackProvider.');
  return value;
}
