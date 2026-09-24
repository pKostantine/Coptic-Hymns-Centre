import { Directory, DownloadTask, File, Paths, type DownloadPauseState, type DownloadProgress } from 'expo-file-system';

import { findPlayableLocalUri, getDownloadProgress, getPackageFiles, getStoredDownloadRequest, isEntityDownloaded, refreshPackageProgress, removeOfflinePackage, saveDownloadRequest, setPackageState, updateOfflineFile, type OfflineFileRow } from '@/services/offlineDatabase';
import { assertDownloadNetworkAllowed } from '@/services/downloadPreferences';
import { cleanupIncompleteDownloads, getDownloadStorageSummary, isDownloadRequestStale, listDownloads, removeAllDownloadRecords, validateDownloadedFiles } from '@/services/downloadStorageManager';
import type { OfflineDownloadManager, OfflineDownloadProgress, OfflineDownloadRequest, OfflineDownloadResource } from '@/types/offlineDownloads';
import type { PlaybackEntityKind } from '@/types/playback';

const DOWNLOAD_DIRECTORY = new Directory(Paths.document, 'chc-offline', 'files');
type ActiveTransfer = { fileKey: string; task: DownloadTask };

function sanitizeFilePart(value: string): string { return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'media'; }
function inferExtension(resource: OfflineDownloadResource): string {
  if (resource.extension) return (resource.extension.startsWith('.') ? resource.extension : `.${resource.extension}`).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
  const mime = resource.mimeType?.toLowerCase() ?? '';
  if (mime.includes('mpeg')) return '.mp3'; if (mime.includes('mp4')) return '.mp4'; if (mime.includes('m4a') || mime.includes('aac')) return '.m4a';
  if (mime.includes('wav')) return '.wav'; if (mime.includes('webm')) return '.webm'; if (mime.includes('jpeg')) return '.jpg'; if (mime.includes('png')) return '.png'; if (mime.includes('webp')) return '.webp';
  if (mime.includes('json')) return '.json';
  try { const match = new URL(resource.remoteUri).pathname.match(/\.[a-zA-Z0-9]{1,8}$/); if (match) return match[0].toLowerCase(); } catch { /* extension is optional */ }
  return resource.role === 'artwork' ? '.img' : resource.role === 'content' ? '.json' : '.media';
}
function destinationFor(resource: OfflineDownloadResource): File { DOWNLOAD_DIRECTORY.create({ idempotent: true, intermediates: true }); return new File(DOWNLOAD_DIRECTORY, `${sanitizeFilePart(resource.fileKey)}${inferExtension(resource)}`); }
function isUsableLocalFile(uri: string | null, expectedSize?: number | null): boolean { if (!uri) return false; try { const file = new File(uri); return file.exists && file.size > 0 && (expectedSize == null || expectedSize <= 0 || file.size === expectedSize); } catch { return false; } }
function hasVideo(request: OfflineDownloadRequest): boolean { return request.resources.some((item) => item.playableKind === 'learning_video_audio' || item.mimeType?.toLowerCase().startsWith('video/')); }
function checksumSpec(value?: string | null): { algorithm: 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'; digest: string } | null {
  if (!value) return null; const digest = value.trim().toLowerCase().replace(/^sha(?:-|_)?256:/, '').replace(/^md5:/, '');
  if (/^[a-f0-9]{32}$/.test(digest)) return { algorithm: 'MD5', digest }; if (/^[a-f0-9]{40}$/.test(digest)) return { algorithm: 'SHA-1', digest };
  if (/^[a-f0-9]{64}$/.test(digest)) return { algorithm: 'SHA-256', digest }; if (/^[a-f0-9]{96}$/.test(digest)) return { algorithm: 'SHA-384', digest };
  if (/^[a-f0-9]{128}$/.test(digest)) return { algorithm: 'SHA-512', digest }; return null;
}

class NativeDownloadManager implements OfflineDownloadManager {
  private listeners = new Set<() => void>(); private revision = 0; private activeTransfers = new Map<string, ActiveTransfer>();
  private packageWorkers = new Map<string, Promise<void>>(); private lastProgressWrite = new Map<string, number>();
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getRevision = (): number => this.revision;
  private emit(): void { this.revision += 1; for (const listener of this.listeners) listener(); }
  private async waitForWorker(packageKey: string): Promise<void> { const worker = this.packageWorkers.get(packageKey); if (worker) try { await worker; } catch { /* worker persists failure */ } }

  async enqueue(request: OfflineDownloadRequest): Promise<void> {
    await assertDownloadNetworkAllowed(hasVideo(request));
    const current = await getDownloadProgress(request.packageKey);
    if (current?.status === 'complete' && await isDownloadRequestStale(request)) { await this.update(request); return; }
    await saveDownloadRequest(request);
    if ((await getDownloadProgress(request.packageKey))?.status === 'complete') { this.emit(); return; }
    await setPackageState(request.packageKey, 'queued'); this.emit(); this.startWorker(request.packageKey);
  }
  async update(request: OfflineDownloadRequest): Promise<void> { await assertDownloadNetworkAllowed(hasVideo(request)); await this.remove(request.packageKey); await saveDownloadRequest(request); await setPackageState(request.packageKey, 'queued'); this.emit(); this.startWorker(request.packageKey); }
  checkForUpdate(request: OfflineDownloadRequest): Promise<boolean> { return isDownloadRequestStale(request); }
  async pause(packageKey: string): Promise<void> { const active = this.activeTransfers.get(packageKey); await setPackageState(packageKey, 'paused'); if (active) { await active.task.pauseAsync(); await updateOfflineFile(active.fileKey, { status: 'paused', resumeJson: JSON.stringify(active.task.savable()) }); } await refreshPackageProgress(packageKey); this.emit(); }
  async resume(packageKey: string): Promise<void> { const request = await getStoredDownloadRequest(packageKey); if (!request) throw new Error('This download is no longer available to resume.'); await assertDownloadNetworkAllowed(hasVideo(request)); await this.waitForWorker(packageKey); await setPackageState(packageKey, 'queued'); this.emit(); this.startWorker(packageKey); }
  async cancel(packageKey: string): Promise<void> { await setPackageState(packageKey, 'cancelled'); const active = this.activeTransfers.get(packageKey); if (active) { active.task.cancel(); await updateOfflineFile(active.fileKey, { status: 'cancelled', resumeJson: null }); } await refreshPackageProgress(packageKey); this.emit(); }
  async retry(packageKey: string): Promise<void> { const request = await getStoredDownloadRequest(packageKey); if (!request) throw new Error('This download is no longer available to retry.'); await assertDownloadNetworkAllowed(hasVideo(request)); await this.waitForWorker(packageKey); for (const file of await getPackageFiles(packageKey)) if (file.status === 'failed' || file.status === 'cancelled') await updateOfflineFile(file.file_key, { status: 'queued', error: null, resumeJson: null }); await setPackageState(packageKey, 'queued'); this.emit(); this.startWorker(packageKey); }
  async remove(packageKey: string): Promise<void> { const active = this.activeTransfers.get(packageKey); if (active) active.task.cancel(); await this.waitForWorker(packageKey); for (const row of await removeOfflinePackage(packageKey)) if (row.local_uri) try { const file = new File(row.local_uri); if (file.exists) file.delete(); } catch { /* database removal is authoritative */ } this.emit(); }
  async removeAll(): Promise<void> { for (const uri of await removeAllDownloadRecords()) try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* database removal is authoritative */ } this.emit(); }
  async cleanupIncomplete(): Promise<number> { const count = await cleanupIncompleteDownloads(); this.emit(); return count; }
  async validateIntegrity() { const result = await validateDownloadedFiles(); this.emit(); return result; }
  getStorageSummary() { return getDownloadStorageSummary(); }
  listDownloads() { return listDownloads(); }
  getProgress(packageKey: string): Promise<OfflineDownloadProgress | null> { return getDownloadProgress(packageKey); }
  isDownloaded(entityType: OfflineDownloadRequest['entityType'], entityId: string): Promise<boolean> { return isEntityDownloaded(entityType, entityId); }
  async resolvePlaybackUri(playableKind: PlaybackEntityKind, playableId: string, remoteUri?: string | null): Promise<string | null> { const localUri = await findPlayableLocalUri(playableKind, playableId); return localUri && isUsableLocalFile(localUri) ? localUri : remoteUri?.trim() || null; }

  private startWorker(packageKey: string): void {
    if (this.packageWorkers.has(packageKey)) return;
    const worker = this.processPackage(packageKey).catch(async (cause) => { const state = await getDownloadProgress(packageKey); if (state?.status === 'paused' || state?.status === 'cancelled') return; await setPackageState(packageKey, 'failed', cause instanceof Error ? cause.message : 'Download failed.'); await refreshPackageProgress(packageKey); this.emit(); })
      .finally(() => { this.packageWorkers.delete(packageKey); this.activeTransfers.delete(packageKey); });
    this.packageWorkers.set(packageKey, worker);
  }
  private async processPackage(packageKey: string): Promise<void> {
    const request = await getStoredDownloadRequest(packageKey); if (!request) throw new Error('Download metadata is missing.'); await setPackageState(packageKey, 'downloading'); this.emit();
    for (const row of await getPackageFiles(packageKey)) {
      const state = await getDownloadProgress(packageKey); if (state?.status === 'paused' || state?.status === 'cancelled') return;
      if (row.status === 'complete' && isUsableLocalFile(row.local_uri, row.file_size_bytes)) continue;
      if (row.status === 'complete') await updateOfflineFile(row.file_key, { localUri: null, status: 'queued', bytesWritten: 0, resumeJson: null });
      await this.downloadFile(packageKey, row); const after = await getDownloadProgress(packageKey); if (after?.status === 'paused' || after?.status === 'cancelled') return;
    }
    await setPackageState(packageKey, 'complete'); await refreshPackageProgress(packageKey); this.emit();
  }
  private async downloadFile(packageKey: string, row: OfflineFileRow): Promise<void> {
    const request = await getStoredDownloadRequest(packageKey); const resource = request?.resources.find((item) => item.fileKey === row.file_key); if (!resource) throw new Error(`Missing resource metadata for ${row.file_key}.`);
    const destination = destinationFor(resource); if (destination.exists && row.status !== 'paused') try { destination.delete(); } catch { /* transfer will report failure */ }
    const onProgress = (progress: DownloadProgress) => { const now = Date.now(); const last = this.lastProgressWrite.get(row.file_key) ?? 0; if (now - last < 250 && progress.bytesWritten < progress.totalBytes) return; this.lastProgressWrite.set(row.file_key, now); void updateOfflineFile(row.file_key, { status: 'downloading', bytesWritten: Math.max(0, progress.bytesWritten), totalBytes: progress.totalBytes >= 0 ? progress.totalBytes : null }).then(() => refreshPackageProgress(packageKey)).then(() => this.emit()); };
    let task: DownloadTask;
    if (row.resume_json) try { task = DownloadTask.fromSavable(JSON.parse(row.resume_json) as DownloadPauseState, { onProgress, headers: resource.headers ?? undefined }); } catch { if (destination.exists) try { destination.delete(); } catch { /* noop */ } task = File.createDownloadTask(resource.remoteUri, destination, { headers: resource.headers ?? undefined, onProgress, sessionType: 'background' }); }
    else task = File.createDownloadTask(resource.remoteUri, destination, { headers: resource.headers ?? undefined, onProgress, sessionType: 'background' });
    this.activeTransfers.set(packageKey, { fileKey: row.file_key, task }); await updateOfflineFile(row.file_key, { status: 'downloading', error: null }); this.emit();
    try {
      const downloaded = task.state === 'paused' ? await task.resumeAsync() : await task.downloadAsync();
      if (!downloaded) { if ((await getDownloadProgress(packageKey))?.status === 'paused') await updateOfflineFile(row.file_key, { status: 'paused', resumeJson: JSON.stringify(task.savable()) }); return; }
      if (resource.fileSizeBytes != null && resource.fileSizeBytes > 0 && downloaded.size !== resource.fileSizeBytes) throw new Error('Downloaded file size does not match the published media.');
      const checksum = checksumSpec(resource.checksum); if (checksum && (await new File(downloaded.uri).digest(checksum.algorithm)).toLowerCase() !== checksum.digest) throw new Error('Downloaded file checksum does not match the published media.');
      await updateOfflineFile(row.file_key, { localUri: downloaded.uri, status: 'complete', bytesWritten: downloaded.size, totalBytes: downloaded.size, resumeJson: null, error: null }); await refreshPackageProgress(packageKey); this.emit();
    } catch (cause) { const state = await getDownloadProgress(packageKey); if (state?.status === 'cancelled' || state?.status === 'paused') return; const message = cause instanceof Error ? cause.message : 'Unable to download media.'; await updateOfflineFile(row.file_key, { status: 'failed', error: message, resumeJson: null }); await refreshPackageProgress(packageKey); this.emit(); throw cause; }
    finally { this.activeTransfers.delete(packageKey); if (task.state !== 'paused') try { task.release(); } catch { /* native runtime may already release */ } }
  }
}
export const downloadManager: OfflineDownloadManager = new NativeDownloadManager();
