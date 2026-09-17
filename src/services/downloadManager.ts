import {
  Directory,
  DownloadTask,
  File,
  Paths,
  type DownloadPauseState,
  type DownloadProgress,
} from 'expo-file-system';

import {
  findPlayableLocalUri,
  getDownloadProgress,
  getPackageFiles,
  getStoredDownloadRequest,
  isEntityDownloaded,
  refreshPackageProgress,
  removeOfflinePackage,
  saveDownloadRequest,
  setPackageState,
  updateOfflineFile,
  type OfflineFileRow,
} from '@/services/offlineDatabase';
import type {
  OfflineDownloadManager,
  OfflineDownloadProgress,
  OfflineDownloadRequest,
  OfflineDownloadResource,
} from '@/types/offlineDownloads';
import type { PlaybackEntityKind } from '@/types/playback';

const DOWNLOAD_DIRECTORY = new Directory(Paths.document, 'chc-offline', 'files');

type ActiveTransfer = {
  fileKey: string;
  task: DownloadTask;
};

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'media';
}

function inferExtension(resource: OfflineDownloadResource): string {
  if (resource.extension) {
    const extension = resource.extension.startsWith('.') ? resource.extension : `.${resource.extension}`;
    return extension.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
  }
  const mime = resource.mimeType?.toLowerCase() ?? '';
  if (mime.includes('mpeg')) return '.mp3';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('m4a') || mime.includes('aac')) return '.m4a';
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('jpeg')) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  try {
    const pathname = new URL(resource.remoteUri).pathname;
    const match = pathname.match(/\.[a-zA-Z0-9]{1,8}$/);
    if (match) return match[0].toLowerCase();
  } catch {
    // Cloudflare/public asset URLs are normally absolute. A missing extension is safe.
  }
  return resource.role === 'artwork' ? '.img' : '.media';
}

function destinationFor(resource: OfflineDownloadResource): File {
  DOWNLOAD_DIRECTORY.create({ idempotent: true, intermediates: true });
  return new File(DOWNLOAD_DIRECTORY, `${sanitizeFilePart(resource.fileKey)}${inferExtension(resource)}`);
}

function isUsableLocalFile(uri: string | null, expectedSize?: number | null): boolean {
  if (!uri) return false;
  try {
    const file = new File(uri);
    if (!file.exists || file.size <= 0) return false;
    if (expectedSize != null && expectedSize > 0 && file.size !== expectedSize) return false;
    return true;
  } catch {
    return false;
  }
}

class NativeDownloadManager implements OfflineDownloadManager {
  private listeners = new Set<() => void>();
  private revision = 0;
  private activeTransfers = new Map<string, ActiveTransfer>();
  private packageWorkers = new Map<string, Promise<void>>();
  private lastProgressWrite = new Map<string, number>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRevision = (): number => this.revision;

  private emit(): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }

  async enqueue(request: OfflineDownloadRequest): Promise<void> {
    await saveDownloadRequest(request);
    const current = await getDownloadProgress(request.packageKey);
    if (current?.status === 'complete') {
      this.emit();
      return;
    }
    await setPackageState(request.packageKey, 'queued');
    this.emit();
    this.startWorker(request.packageKey);
  }

  async pause(packageKey: string): Promise<void> {
    const active = this.activeTransfers.get(packageKey);
    await setPackageState(packageKey, 'paused');
    if (active) {
      await active.task.pauseAsync();
      const savable = active.task.savable();
      await updateOfflineFile(active.fileKey, {
        status: 'paused',
        resumeJson: JSON.stringify(savable),
      });
    }
    await refreshPackageProgress(packageKey);
    this.emit();
  }

  async resume(packageKey: string): Promise<void> {
    const request = await getStoredDownloadRequest(packageKey);
    if (!request) throw new Error('This download is no longer available to resume.');
    await setPackageState(packageKey, 'queued');
    this.emit();
    this.startWorker(packageKey);
  }

  async cancel(packageKey: string): Promise<void> {
    await setPackageState(packageKey, 'cancelled');
    const active = this.activeTransfers.get(packageKey);
    if (active) {
      active.task.cancel();
      await updateOfflineFile(active.fileKey, { status: 'cancelled', resumeJson: null });
    }
    await refreshPackageProgress(packageKey);
    this.emit();
  }

  async retry(packageKey: string): Promise<void> {
    const request = await getStoredDownloadRequest(packageKey);
    if (!request) throw new Error('This download is no longer available to retry.');
    const files = await getPackageFiles(packageKey);
    for (const file of files) {
      if (file.status === 'failed' || file.status === 'cancelled') {
        await updateOfflineFile(file.file_key, { status: 'queued', error: null, resumeJson: null });
      }
    }
    await setPackageState(packageKey, 'queued');
    this.emit();
    this.startWorker(packageKey);
  }

  async remove(packageKey: string): Promise<void> {
    const active = this.activeTransfers.get(packageKey);
    if (active) active.task.cancel();
    const orphanedFiles = await removeOfflinePackage(packageKey);
    for (const row of orphanedFiles) {
      if (!row.local_uri) continue;
      try {
        const file = new File(row.local_uri);
        if (file.exists) file.delete();
      } catch {
        // Database removal is authoritative; stale OS files can be reclaimed later.
      }
    }
    this.emit();
  }

  getProgress(packageKey: string): Promise<OfflineDownloadProgress | null> {
    return getDownloadProgress(packageKey);
  }

  isDownloaded(entityType: OfflineDownloadRequest['entityType'], entityId: string): Promise<boolean> {
    return isEntityDownloaded(entityType, entityId);
  }

  async resolvePlaybackUri(
    playableKind: PlaybackEntityKind,
    playableId: string,
    remoteUri?: string | null,
  ): Promise<string | null> {
    const localUri = await findPlayableLocalUri(playableKind, playableId);
    if (localUri && isUsableLocalFile(localUri)) return localUri;
    return remoteUri?.trim() || null;
  }

  private startWorker(packageKey: string): void {
    if (this.packageWorkers.has(packageKey)) return;
    const worker = this.processPackage(packageKey)
      .catch(async (cause) => {
        const state = await getDownloadProgress(packageKey);
        if (state?.status === 'paused' || state?.status === 'cancelled') return;
        const message = cause instanceof Error ? cause.message : 'Download failed.';
        await setPackageState(packageKey, 'failed', message);
        await refreshPackageProgress(packageKey);
        this.emit();
      })
      .finally(() => {
        this.packageWorkers.delete(packageKey);
        this.activeTransfers.delete(packageKey);
      });
    this.packageWorkers.set(packageKey, worker);
  }

  private async processPackage(packageKey: string): Promise<void> {
    const request = await getStoredDownloadRequest(packageKey);
    if (!request) throw new Error('Download metadata is missing.');
    await setPackageState(packageKey, 'downloading');
    this.emit();

    const files = await getPackageFiles(packageKey);
    for (const row of files) {
      const packageState = await getDownloadProgress(packageKey);
      if (packageState?.status === 'paused' || packageState?.status === 'cancelled') return;

      if (row.status === 'complete' && isUsableLocalFile(row.local_uri, row.file_size_bytes)) continue;
      if (row.status === 'complete') {
        await updateOfflineFile(row.file_key, {
          localUri: null,
          status: 'queued',
          bytesWritten: 0,
          resumeJson: null,
        });
      }
      await this.downloadFile(packageKey, row);
      const stateAfterFile = await getDownloadProgress(packageKey);
      if (stateAfterFile?.status === 'paused' || stateAfterFile?.status === 'cancelled') return;
    }

    await setPackageState(packageKey, 'complete');
    await refreshPackageProgress(packageKey);
    this.emit();
  }

  private async downloadFile(packageKey: string, row: OfflineFileRow): Promise<void> {
    const request = await getStoredDownloadRequest(packageKey);
    const resource = request?.resources.find((item) => item.fileKey === row.file_key);
    if (!resource) throw new Error(`Missing resource metadata for ${row.file_key}.`);
    const destination = destinationFor(resource);

    if (destination.exists && row.status !== 'paused') {
      try { destination.delete(); } catch { /* replaced by the transfer if possible */ }
    }

    let task: DownloadTask;
    const onProgress = (progress: DownloadProgress) => {
      const now = Date.now();
      const lastWrite = this.lastProgressWrite.get(row.file_key) ?? 0;
      if (now - lastWrite < 250 && progress.bytesWritten < progress.totalBytes) return;
      this.lastProgressWrite.set(row.file_key, now);
      void updateOfflineFile(row.file_key, {
        status: 'downloading',
        bytesWritten: Math.max(0, progress.bytesWritten),
        totalBytes: progress.totalBytes >= 0 ? progress.totalBytes : null,
      }).then(() => refreshPackageProgress(packageKey)).then(() => this.emit());
    };

    if (row.resume_json) {
      try {
        const state = JSON.parse(row.resume_json) as DownloadPauseState;
        task = DownloadTask.fromSavable(state, { onProgress, headers: resource.headers ?? undefined });
      } catch {
        task = File.createDownloadTask(resource.remoteUri, destination, {
          headers: resource.headers ?? undefined,
          onProgress,
          sessionType: 'background',
        });
      }
    } else {
      task = File.createDownloadTask(resource.remoteUri, destination, {
        headers: resource.headers ?? undefined,
        onProgress,
        sessionType: 'background',
      });
    }

    this.activeTransfers.set(packageKey, { fileKey: row.file_key, task });
    await updateOfflineFile(row.file_key, { status: 'downloading', error: null });
    this.emit();

    try {
      const downloaded = task.state === 'paused' ? await task.resumeAsync() : await task.downloadAsync();
      if (!downloaded) {
        const packageState = await getDownloadProgress(packageKey);
        if (packageState?.status === 'paused') {
          await updateOfflineFile(row.file_key, {
            status: 'paused',
            resumeJson: JSON.stringify(task.savable()),
          });
        }
        return;
      }

      await updateOfflineFile(row.file_key, {
        localUri: downloaded.uri,
        status: 'complete',
        bytesWritten: downloaded.size,
        totalBytes: downloaded.size,
        resumeJson: null,
        error: null,
      });
      await refreshPackageProgress(packageKey);
      this.emit();
    } catch (cause) {
      const packageState = await getDownloadProgress(packageKey);
      if (packageState?.status === 'cancelled' || packageState?.status === 'paused') return;
      const message = cause instanceof Error ? cause.message : 'Unable to download media.';
      await updateOfflineFile(row.file_key, { status: 'failed', error: message, resumeJson: null });
      await refreshPackageProgress(packageKey);
      this.emit();
      throw cause;
    } finally {
      this.activeTransfers.delete(packageKey);
      try { task.release(); } catch { /* task already released by native runtime */ }
    }
  }
}

export const downloadManager: OfflineDownloadManager = new NativeDownloadManager();
