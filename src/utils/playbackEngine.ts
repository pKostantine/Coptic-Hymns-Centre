import type { PlaybackQueueEntry, PlaybackRepeatMode, PlaybackSnapshot } from '@/types/playback';

export function clampPlaybackIndex(length: number, index: number): number {
  if (length <= 0) return -1;
  return Math.max(0, Math.min(Math.trunc(index), length - 1));
}

export function nextRepeatMode(mode: PlaybackRepeatMode): PlaybackRepeatMode {
  if (mode === 'off') return 'all';
  if (mode === 'all') return 'one';
  return 'off';
}

export function getManualNextIndex(length: number, currentIndex: number, repeatMode: PlaybackRepeatMode): number {
  if (length <= 0 || currentIndex < 0) return -1;
  if (currentIndex + 1 < length) return currentIndex + 1;
  return repeatMode === 'all' ? 0 : currentIndex;
}

export function getManualPreviousIndex(length: number, currentIndex: number, repeatMode: PlaybackRepeatMode): number {
  if (length <= 0 || currentIndex < 0) return -1;
  if (currentIndex > 0) return currentIndex - 1;
  return repeatMode === 'all' ? length - 1 : 0;
}

export function getFinishedTrackAction(
  length: number,
  currentIndex: number,
  repeatMode: PlaybackRepeatMode,
): { type: 'stop' } | { type: 'replay' } | { type: 'advance'; index: number } {
  if (length <= 0 || currentIndex < 0) return { type: 'stop' };
  if (repeatMode === 'one') return { type: 'replay' };
  if (currentIndex + 1 < length) return { type: 'advance', index: currentIndex + 1 };
  if (repeatMode === 'all') return { type: 'advance', index: 0 };
  return { type: 'stop' };
}

/** Fisher-Yates, while keeping the currently playing entry at the same index. */
export function shuffleQueuePreservingCurrent<T>(
  entries: T[],
  currentIndex: number,
  random: () => number = Math.random,
): { queue: T[]; currentIndex: number } {
  if (entries.length <= 1) return { queue: [...entries], currentIndex: clampPlaybackIndex(entries.length, currentIndex) };
  const safeIndex = clampPlaybackIndex(entries.length, currentIndex);
  if (safeIndex < 0) return { queue: [...entries], currentIndex: -1 };

  const current = entries[safeIndex];
  const remainder = entries.filter((_, index) => index !== safeIndex);
  for (let i = remainder.length - 1; i > 0; i -= 1) {
    const j = Math.max(0, Math.min(i, Math.floor(random() * (i + 1))));
    [remainder[i], remainder[j]] = [remainder[j], remainder[i]];
  }
  remainder.splice(safeIndex, 0, current);
  return { queue: remainder, currentIndex: safeIndex };
}

export function restoreOriginalQueue<T extends { key: string }>(
  originalQueue: T[],
  currentQueue: T[],
  currentIndex: number,
): { queue: T[]; currentIndex: number } {
  const currentKey = currentIndex >= 0 ? currentQueue[currentIndex]?.key : null;
  const queue = [...originalQueue];
  const restoredIndex = currentKey ? queue.findIndex((entry) => entry.key === currentKey) : -1;
  return { queue, currentIndex: restoredIndex >= 0 ? restoredIndex : clampPlaybackIndex(queue.length, currentIndex) };
}

export function choosePlaybackUri(
  localUri: string | null | undefined,
  remoteUri: string | null | undefined,
  localAvailable = true,
): string | null {
  const local = localUri?.trim();
  if (local && localAvailable) return local;
  const remote = remoteUri?.trim();
  return remote || null;
}

export function isPlaybackQueueEntry(value: unknown): value is PlaybackQueueEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PlaybackQueueEntry>;
  if (typeof entry.key !== 'string' || !entry.playable || typeof entry.playable !== 'object') return false;
  return typeof entry.playable.id === 'string'
    && typeof entry.playable.title === 'string'
    && Boolean(entry.playable.source)
    && typeof entry.playable.source === 'object';
}

export function sanitizePlaybackSnapshot(value: unknown): PlaybackSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as Partial<PlaybackSnapshot>;
  if (snapshot.version !== 1) return null;
  if (!Array.isArray(snapshot.queue) || !snapshot.queue.every(isPlaybackQueueEntry)) return null;
  const originalQueue = Array.isArray(snapshot.originalQueue) && snapshot.originalQueue.every(isPlaybackQueueEntry)
    ? snapshot.originalQueue
    : snapshot.queue;
  const repeatMode: PlaybackRepeatMode = snapshot.repeatMode === 'all' || snapshot.repeatMode === 'one' ? snapshot.repeatMode : 'off';
  const currentIndex = clampPlaybackIndex(snapshot.queue.length, typeof snapshot.currentIndex === 'number' ? snapshot.currentIndex : 0);
  const positionMs = typeof snapshot.positionMs === 'number' && Number.isFinite(snapshot.positionMs)
    ? Math.max(0, Math.round(snapshot.positionMs))
    : 0;

  return {
    version: 1,
    queue: snapshot.queue,
    originalQueue,
    currentIndex,
    positionMs,
    repeatMode,
    shuffleEnabled: Boolean(snapshot.shuffleEnabled),
  };
}
