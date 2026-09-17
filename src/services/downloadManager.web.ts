import type {
  OfflineDownloadManager,
  OfflineDownloadProgress,
  OfflineDownloadRequest,
} from '@/types/offlineDownloads';
import type { PlaybackEntityKind } from '@/types/playback';

class WebDownloadManager implements OfflineDownloadManager {
  private revision = 0;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRevision = (): number => this.revision;

  private unavailable(): never {
    throw new Error('Offline downloads are available in the CHC iOS and Android apps.');
  }

  enqueue(_request: OfflineDownloadRequest): Promise<void> {
    return Promise.reject(new Error('Offline downloads are available in the CHC iOS and Android apps.'));
  }

  pause(_packageKey: string): Promise<void> { return Promise.reject(this.unavailable()); }
  resume(_packageKey: string): Promise<void> { return Promise.reject(this.unavailable()); }
  cancel(_packageKey: string): Promise<void> { return Promise.reject(this.unavailable()); }
  retry(_packageKey: string): Promise<void> { return Promise.reject(this.unavailable()); }
  remove(_packageKey: string): Promise<void> { return Promise.resolve(); }
  getProgress(_packageKey: string): Promise<OfflineDownloadProgress | null> { return Promise.resolve(null); }
  isDownloaded(_entityType: OfflineDownloadRequest['entityType'], _entityId: string): Promise<boolean> { return Promise.resolve(false); }

  resolvePlaybackUri(
    _playableKind: PlaybackEntityKind,
    _playableId: string,
    remoteUri?: string | null,
  ): Promise<string | null> {
    return Promise.resolve(remoteUri?.trim() || null);
  }
}

export const downloadManager: OfflineDownloadManager = new WebDownloadManager();
