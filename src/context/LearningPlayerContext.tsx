import { useCallback, useMemo } from 'react';

import { usePlayback } from '@/context/PlaybackContext';
import { learningService } from '@/services/learningService';
import type {
  LearningAlbumDetail,
  LearningLessonSetDetail,
  LearningMediaAsset,
} from '@/types/learningPlatform';
import type { PlaybackQueueEntry, PlaybackRepeatMode } from '@/types/playback';

export interface LearningQueueItem {
  kind: 'recording' | 'lesson';
  id: string;
  title: string;
  subtitle: string | null;
  durationMs: number | null;
  mediaAsset: LearningMediaAsset;
  containerId: string;
  containerTitle: string;
  cantorName: string;
  coverAsset: LearningMediaAsset | null;
  hymnId: string | null;
  localUri?: string | null;
}

interface LearningPlayerContextValue {
  queue: LearningQueueItem[];
  currentIndex: number;
  currentItem: LearningQueueItem | null;
  playing: boolean;
  buffering: boolean;
  currentTimeMs: number;
  durationMs: number;
  repeatMode: PlaybackRepeatMode;
  playbackError: string | null;
  playQueue: (items: LearningQueueItem[], startIndex?: number) => void;
  playItem: (item: LearningQueueItem) => void;
  togglePlayback: () => void;
  next: () => void;
  previous: () => void;
  seekToMs: (positionMs: number) => Promise<void>;
  selectQueueIndex: (index: number) => void;
  cycleRepeatMode: () => void;
}

export function learningAlbumQueue(album: LearningAlbumDetail): LearningQueueItem[] {
  return album.recordings.map((recording) => ({
    kind: 'recording',
    id: recording.id,
    title: recording.title,
    subtitle: recording.subtitle,
    durationMs: recording.durationMs,
    mediaAsset: recording.mediaAsset,
    containerId: album.id,
    containerTitle: album.title,
    cantorName: album.cantor.displayName,
    coverAsset: album.coverAsset,
    hymnId: recording.hymnId,
  }));
}

export function learningLessonSetAudioQueue(lessonSet: LearningLessonSetDetail): LearningQueueItem[] {
  return lessonSet.lessons
    .filter((lesson) => lesson.mediaType === 'audio')
    .map((lesson) => ({
      kind: 'lesson',
      id: lesson.id,
      title: lesson.title,
      subtitle: lesson.description,
      durationMs: lesson.durationMs,
      mediaAsset: lesson.mediaAsset,
      containerId: lessonSet.id,
      containerTitle: lessonSet.title,
      cantorName: lessonSet.cantor.displayName,
      coverAsset: lessonSet.coverAsset,
      hymnId: lessonSet.hymn.id,
    }));
}

function isLearningQueueItem(value: unknown): value is LearningQueueItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<LearningQueueItem>;
  return (item.kind === 'recording' || item.kind === 'lesson')
    && typeof item.id === 'string'
    && typeof item.title === 'string'
    && Boolean(item.mediaAsset);
}

function toPlaybackEntry(item: LearningQueueItem, occurrence: number): PlaybackQueueEntry<LearningQueueItem> {
  return {
    key: ['learning', item.kind, item.id, occurrence].join(':'),
    payload: item,
    playable: {
      id: item.id,
      kind: 'learning_audio',
      title: item.title,
      artist: item.cantorName,
      albumTitle: item.containerTitle,
      artworkUri: learningService.resolveAsset(item.coverAsset),
      durationMs: item.durationMs,
      source: {
        localUri: item.localUri ?? null,
        remoteUri: learningService.resolveAsset(item.mediaAsset),
      },
    },
  };
}

export function useLearningPlayer(): LearningPlayerContextValue {
  const playback = usePlayback();
  const playPlaybackQueue = playback.playQueue;
  const playPlaybackItem = playback.playItem;
  const queue = useMemo(
    () => playback.queue.map((entry) => entry.payload).filter(isLearningQueueItem),
    [playback.queue],
  );
  const currentItem = playback.currentItem?.playable.kind === 'learning_audio'
    && isLearningQueueItem(playback.currentItem.payload)
    ? playback.currentItem.payload
    : null;

  const playQueue = useCallback((items: LearningQueueItem[], startIndex = 0) => {
    playPlaybackQueue(items.map(toPlaybackEntry), startIndex);
  }, [playPlaybackQueue]);

  const playItem = useCallback((item: LearningQueueItem) => {
    playPlaybackItem(toPlaybackEntry(item, 0));
  }, [playPlaybackItem]);

  return {
    queue,
    currentIndex: currentItem ? playback.currentIndex : -1,
    currentItem,
    playing: currentItem ? playback.playing : false,
    buffering: currentItem ? playback.buffering || playback.loadingSource : false,
    currentTimeMs: currentItem ? playback.currentTimeMs : 0,
    durationMs: currentItem ? playback.durationMs : 0,
    repeatMode: playback.repeatMode,
    playbackError: playback.playbackError,
    playQueue,
    playItem,
    togglePlayback: playback.togglePlayback,
    next: playback.next,
    previous: playback.previous,
    seekToMs: playback.seekToMs,
    selectQueueIndex: playback.selectQueueIndex,
    cycleRepeatMode: playback.cycleRepeatMode,
  };
}
