export type PlaybackEntityKind = 'music_track' | 'learning_audio' | 'learning_video_audio';
export type PlaybackRepeatMode = 'off' | 'all' | 'one';

export interface PlaybackSource {
  remoteUri?: string | null;
  localUri?: string | null;
  headers?: Record<string, string> | null;
}

export interface PlaybackLyricReference {
  trackId?: string | null;
  locale?: string | null;
  kind?: string | null;
}

/**
 * Low-level playback contract shared by Music now and Learn & Study later.
 * Product-specific UI data belongs in PlaybackQueueEntry.payload rather than
 * leaking music/learning schemas into the native playback engine.
 */
export interface PlayableEntity {
  id: string;
  kind: PlaybackEntityKind;
  title: string;
  artist?: string | null;
  albumTitle?: string | null;
  artworkUri?: string | null;
  durationMs?: number | null;
  source: PlaybackSource;
  lyrics?: PlaybackLyricReference | null;
}

export interface PlaybackQueueEntry<TPayload = unknown> {
  key: string;
  playable: PlayableEntity;
  payload?: TPayload;
}

export interface PlaybackSnapshot {
  version: 1;
  queue: PlaybackQueueEntry[];
  originalQueue: PlaybackQueueEntry[];
  currentIndex: number;
  positionMs: number;
  repeatMode: PlaybackRepeatMode;
  shuffleEnabled: boolean;
}
