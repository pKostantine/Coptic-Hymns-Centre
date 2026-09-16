import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { musicService } from '@/services/musicService';
import type { MusicConsumerAsset, MusicConsumerTrack } from '@/types/musicConsumer';

export interface MusicQueueItem {
  track: MusicConsumerTrack;
  releaseId?: string | null;
  releaseTitle?: string | null;
  coverAsset?: MusicConsumerAsset | null;
}

interface MusicPlayerContextValue {
  queue: MusicQueueItem[];
  currentIndex: number;
  currentItem: MusicQueueItem | null;
  playing: boolean;
  buffering: boolean;
  currentTimeMs: number;
  durationMs: number;
  playQueue: (items: MusicQueueItem[], startIndex?: number) => void;
  playItem: (item: MusicQueueItem) => void;
  togglePlayback: () => void;
  next: () => void;
  previous: () => void;
  seekToMs: (positionMs: number) => Promise<void>;
  selectQueueIndex: (index: number) => void;
  clearQueue: () => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 125 });
  const status = useAudioPlayerStatus(player);
  const [queue, setQueue] = useState<MusicQueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const currentItem = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  const loadIndex = useCallback((items: MusicQueueItem[], index: number, autoplay = true) => {
    if (!items.length) return;
    const boundedIndex = Math.max(0, Math.min(index, items.length - 1));
    const item = items[boundedIndex];
    const uri = musicService.resolveAsset(item.track.mediaAsset);
    if (!uri) return;

    setQueue(items);
    setCurrentIndex(boundedIndex);
    player.replace(uri);
    if (autoplay) player.play();
  }, [player]);

  const playQueue = useCallback((items: MusicQueueItem[], startIndex = 0) => {
    loadIndex(items, startIndex, true);
  }, [loadIndex]);

  const playItem = useCallback((item: MusicQueueItem) => {
    loadIndex([item], 0, true);
  }, [loadIndex]);

  const next = useCallback(() => {
    if (!queue.length || currentIndex < 0) return;
    if (currentIndex + 1 >= queue.length) {
      player.pause();
      return;
    }
    loadIndex(queue, currentIndex + 1, true);
  }, [currentIndex, loadIndex, player, queue]);

  const previous = useCallback(() => {
    if (!queue.length || currentIndex < 0) return;
    if ((status.currentTime ?? 0) > 4) {
      void player.seekTo(0);
      return;
    }
    loadIndex(queue, Math.max(0, currentIndex - 1), true);
  }, [currentIndex, loadIndex, player, queue, status.currentTime]);

  const togglePlayback = useCallback(() => {
    if (!currentItem) return;
    if (status.playing) player.pause();
    else player.play();
  }, [currentItem, player, status.playing]);

  const seekToMs = useCallback(async (positionMs: number) => {
    const safeMs = Math.max(0, Math.min(positionMs, Math.max(0, (status.duration ?? 0) * 1000)));
    await player.seekTo(safeMs / 1000);
  }, [player, status.duration]);

  const selectQueueIndex = useCallback((index: number) => {
    if (index < 0 || index >= queue.length) return;
    loadIndex(queue, index, true);
  }, [loadIndex, queue]);

  const clearQueue = useCallback(() => {
    player.pause();
    player.replace(null);
    setQueue([]);
    setCurrentIndex(-1);
  }, [player]);

  useEffect(() => {
    if (status.didJustFinish && currentIndex >= 0 && currentIndex < queue.length - 1) {
      loadIndex(queue, currentIndex + 1, true);
    }
  }, [currentIndex, loadIndex, queue, status.didJustFinish]);

  const value = useMemo<MusicPlayerContextValue>(() => ({
    queue,
    currentIndex,
    currentItem,
    playing: Boolean(status.playing),
    buffering: Boolean(status.isBuffering),
    currentTimeMs: Math.max(0, Math.round((status.currentTime ?? 0) * 1000)),
    durationMs: Math.max(0, Math.round((status.duration ?? 0) * 1000)),
    playQueue,
    playItem,
    togglePlayback,
    next,
    previous,
    seekToMs,
    selectQueueIndex,
    clearQueue,
  }), [
    clearQueue,
    currentIndex,
    currentItem,
    next,
    playItem,
    playQueue,
    previous,
    queue,
    seekToMs,
    selectQueueIndex,
    status.currentTime,
    status.duration,
    status.isBuffering,
    status.playing,
    togglePlayback,
  ]);

  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>;
}

export function useMusicPlayer(): MusicPlayerContextValue {
  const value = useContext(MusicPlayerContext);
  if (!value) throw new Error('useMusicPlayer must be used inside MusicPlayerProvider.');
  return value;
}
