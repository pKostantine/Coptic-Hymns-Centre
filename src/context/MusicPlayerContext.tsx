import { ReactNode, useCallback, useMemo } from 'react';

import { PlaybackProvider, usePlayback } from '@/context/PlaybackContext';
import { musicService } from '@/services/musicService';
import type { MusicConsumerAsset, MusicConsumerTrack } from '@/types/musicConsumer';
import type { PlaybackQueueEntry, PlaybackRepeatMode } from '@/types/playback';

export interface MusicQueueItem {
  track: MusicConsumerTrack;
  releaseId?: string | null;
  releaseTitle?: string | null;
  coverAsset?: MusicConsumerAsset | null;
  /** Phase 13 can attach a durable downloaded file URI here. */
  localUri?: string | null;
}

interface MusicPlayerContextValue {
  queue: MusicQueueItem[];
  currentIndex: number;
  currentItem: MusicQueueItem | null;
  playing: boolean;
  buffering: boolean;
  currentTimeMs: number;
  durationMs: number;
  repeatMode: PlaybackRepeatMode;
  shuffleEnabled: boolean;
  playbackError: string | null;
  playQueue: (items: MusicQueueItem[], startIndex?: number) => void;
  playItem: (item: MusicQueueItem) => void;
  togglePlayback: () => void;
  next: () => void;
  previous: () => void;
  seekToMs: (positionMs: number) => Promise<void>;
  selectQueueIndex: (index: number) => void;
  clearQueue: () => void;
  cycleRepeatMode: () => void;
  toggleShuffle: () => void;
}

function isMusicQueueItem(value: unknown): value is MusicQueueItem {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MusicQueueItem>;
  return Boolean(candidate.track && typeof candidate.track === 'object' && typeof candidate.track.id === 'string');
}

function toPlaybackEntry(item: MusicQueueItem, occurrence: number): PlaybackQueueEntry<MusicQueueItem> {
  const primaryArtist = item.track.artists.find((artist) => artist.role === 'primary')?.displayName
    ?? item.track.artists[0]?.displayName
    ?? 'Coptic Hymns Centre';

  return {
    key: `music:${item.track.id}:${occurrence}`,
    payload: item,
    playable: {
      id: item.track.id,
      kind: 'music_track',
      title: item.track.title,
      artist: primaryArtist,
      albumTitle: item.releaseTitle ?? null,
      artworkUri: musicService.resolveAsset(item.coverAsset ?? null),
      durationMs: item.track.durationMs,
      source: {
        localUri: item.localUri ?? null,
        remoteUri: musicService.resolveAsset(item.track.mediaAsset),
      },
      lyrics: { trackId: item.track.id },
    },
  };
}

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  return <PlaybackProvider>{children}</PlaybackProvider>;
}

/**
 * Compatibility/product adapter for the Phase 8 Music UI. The actual player
 * is product-agnostic in PlaybackContext so Learn & Study can share it later.
 */
export function useMusicPlayer(): MusicPlayerContextValue {
  const playback = usePlayback();

  const queue = useMemo(
    () => playback.queue.map((entry) => entry.payload).filter(isMusicQueueItem),
    [playback.queue],
  );
  const currentItem = playback.currentItem?.playable.kind === 'music_track'
    && isMusicQueueItem(playback.currentItem.payload)
    ? playback.currentItem.payload
    : null;

  const playQueue = useCallback((items: MusicQueueItem[], startIndex = 0) => {
    playback.playQueue(items.map(toPlaybackEntry), startIndex);
  }, [playback.playQueue]);

  const playItem = useCallback((item: MusicQueueItem) => {
    playback.playItem(toPlaybackEntry(item, 0));
  }, [playback.playItem]);

  return {
    queue,
    currentIndex: currentItem ? playback.currentIndex : -1,
    currentItem,
    playing: currentItem ? playback.playing : false,
    buffering: currentItem ? playback.buffering || playback.loadingSource : false,
    currentTimeMs: currentItem ? playback.currentTimeMs : 0,
    durationMs: currentItem ? playback.durationMs : 0,
    repeatMode: playback.repeatMode,
    shuffleEnabled: playback.shuffleEnabled,
    playbackError: playback.playbackError,
    playQueue,
    playItem,
    togglePlayback: playback.togglePlayback,
    next: playback.next,
    previous: playback.previous,
    seekToMs: playback.seekToMs,
    selectQueueIndex: playback.selectQueueIndex,
    clearQueue: playback.clearQueue,
    cycleRepeatMode: playback.cycleRepeatMode,
    toggleShuffle: playback.toggleShuffle,
  };
}
