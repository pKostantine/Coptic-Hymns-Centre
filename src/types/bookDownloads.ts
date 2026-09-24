export type DownloadableBookKey = 'psalmody' | 'liturgy' | 'veneration' | 'agpeya' | 'bible';

export type BookDownloadStatus =
  | 'not_downloaded'
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'installed'
  | 'update_available'
  | 'failed';

export interface ContentPackageChunk {
  id: string;
  url: string;
  size: number;
  sha256: string;
  rowCount: number;
}

export interface ContentResourceManifest {
  id: string;
  version: string;
  dependencies: string[];
  size: number;
  sha256: string;
  chunks: ContentPackageChunk[];
}

export interface ContentBookManifest {
  key: DownloadableBookKey;
  title: string;
  titleArabic: string;
  resources: string[];
}

export interface ContentRootManifest {
  formatVersion: 1;
  snapshotId: string;
  publishedAt: string;
  books: Record<DownloadableBookKey, ContentBookManifest>;
  resources: Record<string, ContentResourceManifest>;
}

export interface ContentPackagePayload {
  formatVersion: 1;
  snapshotId: string;
  resourceId: string;
  version: string;
  chunkId: string;
  tables: { schema: string; table: string; rows: Record<string, unknown>[] }[];
  rpcResults?: {
    schema: string;
    function: string;
    args: Record<string, unknown>;
    data: unknown;
  }[];
}

export interface BookDownloadProgress {
  bookKey: DownloadableBookKey;
  title: string;
  status: BookDownloadStatus;
  progress: number;
  bytesWritten: number;
  totalBytes: number | null;
  error: string | null;
  installedAt: string | null;
  updatedAt: string;
}

export interface ManagedContentResource {
  resourceId: string;
  activeVersion: string | null;
  state: BookDownloadStatus;
  systemOwned: boolean;
  bytes: number;
  error: string | null;
  updatedAt: string;
}

export interface BookDownloadManager {
  install(bookKey: DownloadableBookKey): Promise<void>;
  pause(bookKey: DownloadableBookKey): Promise<void>;
  resume(bookKey: DownloadableBookKey): Promise<void>;
  retry(bookKey: DownloadableBookKey): Promise<void>;
  remove(bookKey: DownloadableBookKey): Promise<void>;
  checkForUpdates(manual?: boolean): Promise<void>;
  ensureCalendar(): Promise<void>;
  listBooks(): Promise<BookDownloadProgress[]>;
  listResources(): Promise<ManagedContentResource[]>;
  getBook(bookKey: DownloadableBookKey): Promise<BookDownloadProgress>;
  subscribe(listener: () => void): () => void;
  getRevision(): number;
}
