import { File } from 'expo-file-system';
import * as Network from 'expo-network';

import {
  DOWNLOADABLE_BOOK_KEYS,
  DOWNLOADABLE_BOOKS,
  resourcesForBook,
  validatePublishedManifest,
} from '@/constants/bookDependencyRegistry';
import {
  activateBookResources,
  activateSystemResource,
  cleanupObsoleteResourceVersions,
  getActiveResourceVersion,
  getBook as getStoredBook,
  getContentSetting,
  getResourcePackageKeys,
  importContentChunk,
  isContentChunkImported,
  listBooks as listStoredBooks,
  listResources as listStoredResources,
  removeBookReferences,
  seedBookRows,
  setPendingBookResources,
  setBookState,
  setContentSetting,
  setResourceState,
} from '@/services/bookContentDatabase';
import { downloadManager } from '@/services/downloadManager';
import { getPackageFiles, refreshPackageProgress, setPackageState, updateOfflineFile, type OfflineFileRow } from '@/services/offlineDatabase';
import type {
  BookDownloadManager,
  BookDownloadProgress,
  ContentPackagePayload,
  ContentResourceManifest,
  ContentRootManifest,
  DownloadableBookKey,
} from '@/types/bookDownloads';
import type { OfflineDownloadRequest } from '@/types/offlineDownloads';

const MANIFEST_BASE_URL = (process.env.EXPO_PUBLIC_CONTENT_PACKAGES_URL || '').replace(/\/+$/, '');
const MANIFEST_CACHE_MS = 60_000;
const AUTO_UPDATE_SETTING = 'automatic_book_updates_wifi';

class PausedDownloadError extends Error {}

function absoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (!MANIFEST_BASE_URL) throw new Error('Book package service is not configured.');
  return `${MANIFEST_BASE_URL}/${url.replace(/^\/+/, '')}`;
}

function packageKey(resource: ContentResourceManifest): string {
  return `book-resource:${resource.id}:${resource.version}`;
}

function resourceRequest(resource: ContentResourceManifest): OfflineDownloadRequest {
  return {
    packageKey: packageKey(resource),
    domain: 'books',
    entityType: 'book_resource',
    entityId: resource.id,
    locale: 'all',
    title: resource.id === 'calendar' ? 'Calendar' : resource.id.replaceAll('_', ' '),
    subtitle: resource.version,
    resources: resource.chunks.map((chunk) => ({
      // Content-addressing lets an unchanged chapter/chunk be linked into a
      // newer resource package without transferring it again.
      fileKey: `content:${resource.id}:${chunk.sha256}`,
      remoteUri: absoluteUrl(chunk.url),
      role: 'content',
      mimeType: 'application/json',
      fileSizeBytes: chunk.size,
      checksum: `sha256:${chunk.sha256}`,
      version: resource.version,
      extension: 'json',
    })),
    snapshots: [],
  };
}

async function invalidateDownloadedChunk(row: OfflineFileRow, key: string, message: string): Promise<never> {
  if (row.local_uri) {
    try { const file = new File(row.local_uri); if (file.exists) file.delete(); } catch { /* database state remains authoritative */ }
  }
  await updateOfflineFile(row.file_key, { localUri: null, status: 'failed', bytesWritten: 0, resumeJson: null, error: message });
  await setPackageState(key, 'failed', message);
  await refreshPackageProgress(key);
  throw new Error(message);
}

function resolvePublishedResources(manifest: ContentRootManifest, bookKey: DownloadableBookKey): string[] {
  const roots = new Set([...resourcesForBook(bookKey), ...manifest.books[bookKey].resources]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: string[] = [];
  const visit = (id: string) => {
    if (visited.has(id) || visiting.has(id)) return;
    const resource = manifest.resources[id];
    if (!resource) throw new Error(`Published book dependency ${id} is unavailable.`);
    visiting.add(id);
    for (const dependency of resource.dependencies || []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    ordered.push(id);
  };
  for (const root of roots) visit(root);
  return ordered;
}

async function waitForMediaPackage(key: string): Promise<void> {
  const current = await downloadManager.getProgress(key);
  if (current?.status === 'complete') return;
  if (current?.status === 'failed' || current?.status === 'cancelled') throw new Error(current.error || 'Package download failed.');
  if (current?.status === 'paused') throw new PausedDownloadError('Download paused.');
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const inspect = () => {
      void downloadManager.getProgress(key).then((progress) => {
        if (settled) return;
        if (progress?.status === 'complete') { settled = true; unsubscribe(); resolve(); }
        else if (progress?.status === 'paused') { settled = true; unsubscribe(); reject(new PausedDownloadError('Download paused.')); }
        else if (progress?.status === 'failed' || progress?.status === 'cancelled') {
          settled = true; unsubscribe(); reject(new Error(progress.error || 'Package download failed.'));
        }
      }).catch((error) => { settled = true; unsubscribe(); reject(error); });
    };
    const unsubscribe = downloadManager.subscribe(inspect);
    inspect();
  });
}

export async function getAutomaticBookUpdatesEnabled(): Promise<boolean> {
  return (await getContentSetting(AUTO_UPDATE_SETTING)) !== 'false';
}

export async function setAutomaticBookUpdatesEnabled(enabled: boolean): Promise<void> {
  await setContentSetting(AUTO_UPDATE_SETTING, enabled ? 'true' : 'false');
}

class NativeBookDownloadManager implements BookDownloadManager {
  private listeners = new Set<() => void>();
  private revision = 0;
  private manifestCache: { at: number; value: ContentRootManifest } | null = null;
  private bookWorkers = new Map<DownloadableBookKey, Promise<void>>();
  private resourceWorkers = new Map<string, Promise<void>>();
  private activeBookResources = new Map<DownloadableBookKey, ContentResourceManifest[]>();
  private initialized: Promise<void> | null = null;

  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getRevision = (): number => this.revision;
  private emit() { this.revision += 1; for (const listener of this.listeners) listener(); }
  private async cleanupActivatedVersions() {
    for (const resource of await listStoredResources()) {
      if (!resource.activeVersion) continue;
      const obsoletePackages = await getResourcePackageKeys(resource.resourceId, resource.activeVersion);
      await cleanupObsoleteResourceVersions(resource.resourceId);
      for (const oldPackage of obsoletePackages) await downloadManager.remove(oldPackage);
    }
  }
  private async initialize() {
    if (!this.initialized) {
      this.initialized = seedBookRows(DOWNLOADABLE_BOOK_KEYS.map((key) => ({ key, title: DOWNLOADABLE_BOOKS[key].title })))
        .then(() => this.cleanupActivatedVersions())
        .catch((error) => { this.initialized = null; throw error; });
    }
    await this.initialized;
  }

  private async fetchManifest(force = false): Promise<ContentRootManifest> {
    if (!force && this.manifestCache && Date.now() - this.manifestCache.at < MANIFEST_CACHE_MS) return this.manifestCache.value;
    if (!MANIFEST_BASE_URL) throw new Error('Set EXPO_PUBLIC_CONTENT_PACKAGES_URL to the CHC content package Worker.');
    const response = await fetch(`${MANIFEST_BASE_URL}/manifest.json`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Unable to check book packages (${response.status}).`);
    const manifest = await response.json() as ContentRootManifest;
    validatePublishedManifest(manifest);
    this.manifestCache = { at: Date.now(), value: manifest };
    return manifest;
  }

  private async stageResource(resource: ContentResourceManifest): Promise<void> {
    const key = `${resource.id}@${resource.version}`;
    const active = await getActiveResourceVersion(resource.id);
    if (active === resource.version) return;
    const running = this.resourceWorkers.get(key);
    if (running) return running;
    const worker = (async () => {
      await setResourceState(resource.id, active ? 'update_available' : 'downloading', { bytes: resource.size, error: null, systemOwned: resource.id === 'calendar' });
      this.emit();
      const request = resourceRequest(resource);
      await downloadManager.enqueue(request);
      await waitForMediaPackage(request.packageKey);
      const files = await getPackageFiles(request.packageKey);
      for (const chunk of resource.chunks) {
        if (await isContentChunkImported(resource.id, resource.version, chunk.id)) continue;
        const row = files.find((file) => file.file_key === `content:${resource.id}:${chunk.sha256}`);
        if (!row?.local_uri) throw new Error(`Downloaded chunk ${chunk.id} is missing.`);
        let payload: ContentPackagePayload | null = null;
        try { payload = JSON.parse(await new File(row.local_uri).text()) as ContentPackagePayload; }
        catch { await invalidateDownloadedChunk(row, request.packageKey, `Package JSON is invalid for ${resource.id}/${chunk.id}.`); }
        if (!payload) {
          await invalidateDownloadedChunk(row, request.packageKey, `Package JSON is empty for ${resource.id}/${chunk.id}.`);
          throw new Error('Unreachable package validation state.');
        }
        if (payload.formatVersion !== 1 || payload.resourceId !== resource.id || payload.chunkId !== chunk.id) {
          await invalidateDownloadedChunk(row, request.packageKey, `Package identity check failed for ${resource.id}/${chunk.id}.`);
        }
        // The immutable payload is deliberately revision-neutral. Importing
        // it under the manifest's resource version enables cross-version
        // reuse while SQLite activation remains version-atomic.
        const versionedPayload = { ...payload, version: resource.version };
        try { await importContentChunk(versionedPayload, request.packageKey, chunk.rowCount); }
        catch { await invalidateDownloadedChunk(row, request.packageKey, `Package row count check failed for ${resource.id}/${chunk.id}.`); }
      }
      await setResourceState(resource.id, active ? 'update_available' : 'queued', { bytes: resource.size, error: null, systemOwned: resource.id === 'calendar' });
      this.emit();
    })().catch(async (cause) => {
      if (cause instanceof PausedDownloadError) {
        await setResourceState(resource.id, active ? 'update_available' : 'paused', { error: null, systemOwned: resource.id === 'calendar' });
      } else {
        await setResourceState(resource.id, active ? 'update_available' : 'failed', { error: cause instanceof Error ? cause.message : 'Package installation failed.', systemOwned: resource.id === 'calendar' });
      }
      this.emit();
      throw cause;
    }).finally(() => this.resourceWorkers.delete(key));
    this.resourceWorkers.set(key, worker);
    return worker;
  }

  private async installBook(bookKey: DownloadableBookKey): Promise<void> {
    await this.initialize();
    const previousBook = await getStoredBook(bookKey);
    const manifest = await this.fetchManifest(true);
    const resourceIds = resolvePublishedResources(manifest, bookKey);
    const resources = resourceIds.map((id) => manifest.resources[id]);
    this.activeBookResources.set(bookKey, resources);
    await setPendingBookResources(bookKey, resourceIds);
    const totalBytes = resources.reduce((sum, resource) => sum + resource.size, 0);
    await setBookState(bookKey, 'downloading', { progress: 0, bytesWritten: 0, totalBytes, error: null });
    this.emit();
    let completedBytes = 0;
    try {
      for (const resource of resources) {
        const unsubscribe = downloadManager.subscribe(() => {
          void downloadManager.getProgress(packageKey(resource)).then((progress) => {
            if (!progress || progress.status === 'complete') return;
            const resourceProgress = progress.totalBytes && progress.totalBytes > 0
              ? Math.min(resource.size, resource.size * progress.progress)
              : resource.size * progress.progress;
            void setBookState(bookKey, 'downloading', {
              progress: totalBytes ? (completedBytes + resourceProgress) / totalBytes : 0,
              bytesWritten: Math.round(completedBytes + resourceProgress), totalBytes,
            }).then(() => this.emit());
          });
        });
        try { await this.stageResource(resource); }
        finally { unsubscribe(); }
        completedBytes += resource.size;
        await setBookState(bookKey, 'downloading', { progress: totalBytes ? completedBytes / totalBytes : 1, bytesWritten: completedBytes, totalBytes });
        this.emit();
      }
      const graphOrphans = await activateBookResources(bookKey, resources.map((resource) => ({ id: resource.id, version: resource.version, bytes: resource.size })));
      for (const resource of resources) {
        const obsoletePackages = await getResourcePackageKeys(resource.id, resource.version);
        await cleanupObsoleteResourceVersions(resource.id);
        for (const oldPackage of obsoletePackages) await downloadManager.remove(oldPackage);
      }
      if (graphOrphans.length) {
        const downloads = await downloadManager.listDownloads();
        for (const item of downloads.filter((download) => download.domain === 'books' && graphOrphans.includes(download.entityId))) {
          await downloadManager.remove(item.packageKey);
        }
      }
      this.emit();
    } catch (cause) {
      if (cause instanceof PausedDownloadError) await setBookState(bookKey, 'paused', { error: null });
      else await setBookState(bookKey, previousBook?.installedAt ? 'update_available' : 'failed', {
        error: cause instanceof Error ? cause.message : 'Book download failed.',
      });
      this.emit();
      throw cause;
    }
  }

  install(bookKey: DownloadableBookKey): Promise<void> {
    const existing = this.bookWorkers.get(bookKey);
    if (existing) return existing;
    const worker = this.installBook(bookKey).finally(() => this.bookWorkers.delete(bookKey));
    this.bookWorkers.set(bookKey, worker);
    return worker;
  }

  async pause(bookKey: DownloadableBookKey): Promise<void> {
    const resources = this.activeBookResources.get(bookKey) || [];
    for (const resource of resources) {
      const progress = await downloadManager.getProgress(packageKey(resource));
      if (progress && ['queued', 'downloading'].includes(progress.status)) await downloadManager.pause(progress.packageKey);
    }
    await setBookState(bookKey, 'paused', { error: null });
    this.emit();
  }

  resume(bookKey: DownloadableBookKey): Promise<void> { return this.install(bookKey); }
  retry(bookKey: DownloadableBookKey): Promise<void> { return this.install(bookKey); }

  async remove(bookKey: DownloadableBookKey): Promise<void> {
    await this.pause(bookKey).catch(() => undefined);
    const worker = this.bookWorkers.get(bookKey);
    if (worker) try { await worker; } catch { /* paused/failed state is removed below */ }
    const orphaned = await removeBookReferences(bookKey);
    const downloads = await downloadManager.listDownloads();
    for (const resourceId of orphaned) {
      for (const item of downloads.filter((download) => download.domain === 'books' && download.entityId === resourceId)) {
        await downloadManager.remove(item.packageKey);
      }
    }
    this.activeBookResources.delete(bookKey);
    this.emit();
  }

  async ensureCalendar(): Promise<void> {
    await this.initialize();
    const manifest = await this.fetchManifest();
    const resource = manifest.resources.calendar;
    if (await getActiveResourceVersion('calendar') === resource.version) return;
    await this.stageResource(resource);
    await activateSystemResource('calendar', resource.version, resource.size);
    const obsoletePackages = await getResourcePackageKeys('calendar', resource.version);
    await cleanupObsoleteResourceVersions('calendar');
    for (const oldPackage of obsoletePackages) await downloadManager.remove(oldPackage);
    this.emit();
  }

  async checkForUpdates(manual = false): Promise<void> {
    await this.initialize();
    const manifest = await this.fetchManifest(true);
    const books = await listStoredBooks();
    const updates: DownloadableBookKey[] = [];
    for (const book of books.filter((item) => ['installed', 'update_available'].includes(item.status))) {
      const resourceIds = resolvePublishedResources(manifest, book.bookKey);
      const stale = (await Promise.all(resourceIds.map(async (id) => (await getActiveResourceVersion(id)) !== manifest.resources[id].version))).some(Boolean);
      if (stale) { await setBookState(book.bookKey, 'update_available'); updates.push(book.bookKey); }
    }
    const network = await Network.getNetworkStateAsync();
    const wifi = network.isConnected !== false && [Network.NetworkStateType.WIFI, Network.NetworkStateType.ETHERNET].includes(network.type as any);
    const automatic = await getAutomaticBookUpdatesEnabled();
    if (manual || (wifi && automatic)) {
      await this.ensureCalendar();
      for (const bookKey of updates) await this.install(bookKey);
    }
    this.emit();
  }

  async listBooks(): Promise<BookDownloadProgress[]> { await this.initialize(); return listStoredBooks(); }
  async listResources() { await this.initialize(); return listStoredResources(); }
  async getBook(bookKey: DownloadableBookKey): Promise<BookDownloadProgress> {
    await this.initialize();
    return (await getStoredBook(bookKey)) || { bookKey, title: DOWNLOADABLE_BOOKS[bookKey].title,
      status: 'not_downloaded', progress: 0, bytesWritten: 0, totalBytes: null,
      error: null, installedAt: null, updatedAt: '' };
  }
}

export const bookDownloadManager: BookDownloadManager = new NativeBookDownloadManager();
