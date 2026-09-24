import type { PlaybackEntityKind } from '@/types/playback';

export type OfflineDownloadDomain = 'music' | 'learning' | 'books';
export type OfflineDownloadEntityType = 'music_track' | 'music_release' | 'music_playlist' | 'music_liked_songs' | 'learning_recording' | 'learning_lesson' | 'learning_album' | 'learning_lesson_set' | 'learning_playlist' | 'book_resource';
export type OfflineSnapshotEntityType = OfflineDownloadEntityType | 'music_lyrics' | 'music_library';
export type OfflineDownloadStatus = 'idle' | 'queued' | 'downloading' | 'paused' | 'complete' | 'failed' | 'cancelled';
export type OfflineResourceRole = 'media' | 'artwork' | 'content';

export interface OfflineEntitySnapshot<T = unknown> { key: string; entityType: OfflineSnapshotEntityType; entityId: string; locale: string; data: T; }
export interface OfflineDownloadResource {
  fileKey: string; remoteUri: string; role: OfflineResourceRole; mimeType?: string | null; fileSizeBytes?: number | null;
  checksum?: string | null; version?: string | null; extension?: string | null; headers?: Record<string, string> | null;
  playableKind?: PlaybackEntityKind | null; playableId?: string | null;
}
export interface OfflineDownloadRequest {
  packageKey: string; domain: OfflineDownloadDomain; entityType: OfflineDownloadEntityType; entityId: string; locale: string;
  title: string; subtitle?: string | null; resources: OfflineDownloadResource[]; snapshots: OfflineEntitySnapshot[];
}
export interface OfflineDownloadProgress {
  packageKey: string; domain: OfflineDownloadDomain; entityType: OfflineDownloadEntityType; entityId: string; title: string;
  status: OfflineDownloadStatus; progress: number; bytesWritten: number; totalBytes: number | null; error: string | null; updatedAt: string;
}
export interface OfflineStorageSummary {
  packageCount: number; completeCount: number; failedCount: number; totalBytes: number; musicBytes: number; learningBytes: number; bookBytes: number;
}
export interface OfflineIntegrityResult { checked: number; invalid: number; }

export interface OfflineDownloadManager {
  enqueue(request: OfflineDownloadRequest): Promise<void>;
  update(request: OfflineDownloadRequest): Promise<void>;
  checkForUpdate(request: OfflineDownloadRequest): Promise<boolean>;
  pause(packageKey: string): Promise<void>;
  resume(packageKey: string): Promise<void>;
  cancel(packageKey: string): Promise<void>;
  retry(packageKey: string): Promise<void>;
  remove(packageKey: string): Promise<void>;
  removeAll(): Promise<void>;
  cleanupIncomplete(): Promise<number>;
  validateIntegrity(): Promise<OfflineIntegrityResult>;
  getStorageSummary(): Promise<OfflineStorageSummary>;
  listDownloads(): Promise<OfflineDownloadProgress[]>;
  getProgress(packageKey: string): Promise<OfflineDownloadProgress | null>;
  isDownloaded(entityType: OfflineDownloadEntityType, entityId: string): Promise<boolean>;
  resolvePlaybackUri(playableKind: PlaybackEntityKind, playableId: string, remoteUri?: string | null): Promise<string | null>;
  subscribe(listener: () => void): () => void;
  getRevision(): number;
}
