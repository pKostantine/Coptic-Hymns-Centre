import * as SQLite from 'expo-sqlite';

import type {
  OfflineDownloadEntityType,
  OfflineDownloadProgress,
  OfflineDownloadRequest,
  OfflineDownloadStatus,
  OfflineDownloadResource,
  OfflineSnapshotEntityType,
} from '@/types/offlineDownloads';
import type { PlaybackEntityKind } from '@/types/playback';

const DATABASE_NAME = 'chc-offline.db';
const DATABASE_VERSION = 1;

interface PackageRow {
  package_key: string;
  domain: 'music' | 'learning';
  entity_type: OfflineDownloadEntityType;
  entity_id: string;
  locale: string;
  title: string;
  subtitle: string | null;
  status: OfflineDownloadStatus;
  progress: number;
  bytes_written: number;
  total_bytes: number | null;
  error: string | null;
  request_json: string;
  created_at: string;
  updated_at: string;
}

export interface OfflineFileRow {
  file_key: string;
  remote_uri: string;
  local_uri: string | null;
  role: 'media' | 'artwork';
  mime_type: string | null;
  file_size_bytes: number | null;
  checksum: string | null;
  version: string | null;
  extension: string | null;
  headers_json: string | null;
  playable_kind: PlaybackEntityKind | null;
  playable_id: string | null;
  status: OfflineDownloadStatus;
  bytes_written: number;
  total_bytes: number | null;
  resume_json: string | null;
  error: string | null;
  updated_at: string;
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) return;

  if (currentVersion === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS offline_packages (
        package_key TEXT PRIMARY KEY NOT NULL,
        domain TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        locale TEXT NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        status TEXT NOT NULL,
        progress REAL NOT NULL DEFAULT 0,
        bytes_written INTEGER NOT NULL DEFAULT 0,
        total_bytes INTEGER,
        error TEXT,
        request_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS offline_packages_entity_idx
        ON offline_packages(entity_type, entity_id, status);

      CREATE TABLE IF NOT EXISTS offline_files (
        file_key TEXT PRIMARY KEY NOT NULL,
        remote_uri TEXT NOT NULL,
        local_uri TEXT,
        role TEXT NOT NULL,
        mime_type TEXT,
        file_size_bytes INTEGER,
        checksum TEXT,
        version TEXT,
        extension TEXT,
        headers_json TEXT,
        playable_kind TEXT,
        playable_id TEXT,
        status TEXT NOT NULL,
        bytes_written INTEGER NOT NULL DEFAULT 0,
        total_bytes INTEGER,
        resume_json TEXT,
        error TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS offline_files_playable_idx
        ON offline_files(playable_kind, playable_id, status);

      CREATE TABLE IF NOT EXISTS offline_package_files (
        package_key TEXT NOT NULL REFERENCES offline_packages(package_key) ON DELETE CASCADE,
        file_key TEXT NOT NULL REFERENCES offline_files(file_key) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (package_key, file_key)
      );

      CREATE TABLE IF NOT EXISTS offline_entities (
        entity_key TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        locale TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS offline_entities_lookup_idx
        ON offline_entities(entity_type, entity_id, locale);

      CREATE TABLE IF NOT EXISTS offline_package_entities (
        package_key TEXT NOT NULL REFERENCES offline_packages(package_key) ON DELETE CASCADE,
        entity_key TEXT NOT NULL REFERENCES offline_entities(entity_key) ON DELETE CASCADE,
        PRIMARY KEY (package_key, entity_key)
      );
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

export async function getOfflineDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME, { useNewConnection: true })
      .then(async (db) => {
        await migrate(db);
        // A JavaScript download task cannot survive process death. Preserve the
        // package and resume data, but expose interrupted work as paused.
        const now = nowIso();
        await db.runAsync(
          `UPDATE offline_packages
             SET status = 'paused', updated_at = ?
           WHERE status IN ('queued', 'downloading')`,
          now,
        );
        await db.runAsync(
          `UPDATE offline_files
             SET status = 'paused', updated_at = ?
           WHERE status IN ('queued', 'downloading')`,
          now,
        );
        return db;
      });
  }
  return databasePromise;
}

export async function saveDownloadRequest(request: OfflineDownloadRequest): Promise<void> {
  const db = await getOfflineDatabase();
  const now = nowIso();
  const totalBytes = request.resources.reduce<number | null>((sum, resource) => {
    if (sum == null || resource.fileSizeBytes == null) return null;
    return sum + Math.max(0, resource.fileSizeBytes);
  }, 0);

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO offline_packages (
         package_key, domain, entity_type, entity_id, locale, title, subtitle,
         status, progress, bytes_written, total_bytes, error, request_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, 0, ?, NULL, ?, ?, ?)
       ON CONFLICT(package_key) DO UPDATE SET
         domain = excluded.domain,
         entity_type = excluded.entity_type,
         entity_id = excluded.entity_id,
         locale = excluded.locale,
         title = excluded.title,
         subtitle = excluded.subtitle,
         status = CASE WHEN offline_packages.status = 'complete' THEN 'complete' ELSE 'queued' END,
         total_bytes = excluded.total_bytes,
         error = NULL,
         request_json = excluded.request_json,
         updated_at = excluded.updated_at`,
      request.packageKey,
      request.domain,
      request.entityType,
      request.entityId,
      request.locale,
      request.title,
      request.subtitle ?? null,
      totalBytes,
      JSON.stringify(request),
      now,
      now,
    );

    for (let index = 0; index < request.resources.length; index += 1) {
      const resource = request.resources[index];
      await txn.runAsync(
        `INSERT INTO offline_files (
           file_key, remote_uri, local_uri, role, mime_type, file_size_bytes,
           checksum, version, extension, headers_json, playable_kind, playable_id,
           status, bytes_written, total_bytes, resume_json, error, updated_at
         ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, NULL, NULL, ?)
         ON CONFLICT(file_key) DO UPDATE SET
           remote_uri = excluded.remote_uri,
           role = excluded.role,
           mime_type = excluded.mime_type,
           file_size_bytes = excluded.file_size_bytes,
           checksum = excluded.checksum,
           version = excluded.version,
           extension = excluded.extension,
           headers_json = excluded.headers_json,
           playable_kind = excluded.playable_kind,
           playable_id = excluded.playable_id,
           status = CASE WHEN offline_files.status = 'complete' THEN 'complete' ELSE 'queued' END,
           error = NULL,
           updated_at = excluded.updated_at`,
        resource.fileKey,
        resource.remoteUri,
        resource.role,
        resource.mimeType ?? null,
        resource.fileSizeBytes ?? null,
        resource.checksum ?? null,
        resource.version ?? null,
        resource.extension ?? null,
        resource.headers ? JSON.stringify(resource.headers) : null,
        resource.playableKind ?? null,
        resource.playableId ?? null,
        resource.fileSizeBytes ?? null,
        now,
      );
      await txn.runAsync(
        `INSERT INTO offline_package_files (package_key, file_key, sort_order)
         VALUES (?, ?, ?)
         ON CONFLICT(package_key, file_key) DO UPDATE SET sort_order = excluded.sort_order`,
        request.packageKey,
        resource.fileKey,
        index,
      );
    }

    for (const snapshot of request.snapshots) {
      await txn.runAsync(
        `INSERT INTO offline_entities (entity_key, entity_type, entity_id, locale, metadata_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(entity_key) DO UPDATE SET
           entity_type = excluded.entity_type,
           entity_id = excluded.entity_id,
           locale = excluded.locale,
           metadata_json = excluded.metadata_json,
           updated_at = excluded.updated_at`,
        snapshot.key,
        snapshot.entityType,
        snapshot.entityId,
        snapshot.locale,
        JSON.stringify(snapshot.data),
        now,
      );
      await txn.runAsync(
        `INSERT OR IGNORE INTO offline_package_entities (package_key, entity_key)
         VALUES (?, ?)`,
        request.packageKey,
        snapshot.key,
      );
    }
  });
}

export async function getStoredDownloadRequest(packageKey: string): Promise<OfflineDownloadRequest | null> {
  const db = await getOfflineDatabase();
  const row = await db.getFirstAsync<{ request_json: string }>(
    'SELECT request_json FROM offline_packages WHERE package_key = ?',
    packageKey,
  );
  if (!row) return null;
  try {
    return JSON.parse(row.request_json) as OfflineDownloadRequest;
  } catch {
    return null;
  }
}

export async function getPackageFiles(packageKey: string): Promise<OfflineFileRow[]> {
  const db = await getOfflineDatabase();
  return db.getAllAsync<OfflineFileRow>(
    `SELECT f.*
       FROM offline_package_files pf
       JOIN offline_files f ON f.file_key = pf.file_key
      WHERE pf.package_key = ?
      ORDER BY pf.sort_order ASC`,
    packageKey,
  );
}

export async function updateOfflineFile(
  fileKey: string,
  patch: {
    localUri?: string | null;
    status?: OfflineDownloadStatus;
    bytesWritten?: number;
    totalBytes?: number | null;
    resumeJson?: string | null;
    error?: string | null;
  },
): Promise<void> {
  const db = await getOfflineDatabase();
  const current = await db.getFirstAsync<OfflineFileRow>('SELECT * FROM offline_files WHERE file_key = ?', fileKey);
  if (!current) return;
  await db.runAsync(
    `UPDATE offline_files SET
       local_uri = ?, status = ?, bytes_written = ?, total_bytes = ?,
       resume_json = ?, error = ?, updated_at = ?
     WHERE file_key = ?`,
    patch.localUri !== undefined ? patch.localUri : current.local_uri,
    patch.status ?? current.status,
    patch.bytesWritten ?? current.bytes_written,
    patch.totalBytes !== undefined ? patch.totalBytes : current.total_bytes,
    patch.resumeJson !== undefined ? patch.resumeJson : current.resume_json,
    patch.error !== undefined ? patch.error : current.error,
    nowIso(),
    fileKey,
  );
}

export async function setPackageState(
  packageKey: string,
  status: OfflineDownloadStatus,
  error: string | null = null,
): Promise<void> {
  const db = await getOfflineDatabase();
  await db.runAsync(
    'UPDATE offline_packages SET status = ?, error = ?, updated_at = ? WHERE package_key = ?',
    status,
    error,
    nowIso(),
    packageKey,
  );
}

export async function refreshPackageProgress(packageKey: string): Promise<OfflineDownloadProgress | null> {
  const db = await getOfflineDatabase();
  const rows = await getPackageFiles(packageKey);
  const pkg = await db.getFirstAsync<PackageRow>('SELECT * FROM offline_packages WHERE package_key = ?', packageKey);
  if (!pkg) return null;

  let bytesWritten = 0;
  let knownTotal = 0;
  let allTotalsKnown = rows.length > 0;
  let completeCount = 0;
  for (const row of rows) {
    bytesWritten += Math.max(0, row.bytes_written);
    if (row.total_bytes == null || row.total_bytes < 0) allTotalsKnown = false;
    else knownTotal += row.total_bytes;
    if (row.status === 'complete') completeCount += 1;
  }
  const progress = rows.length === 0
    ? 1
    : allTotalsKnown && knownTotal > 0
      ? Math.min(1, bytesWritten / knownTotal)
      : completeCount / rows.length;
  const totalBytes = allTotalsKnown ? knownTotal : null;

  await db.runAsync(
    `UPDATE offline_packages
        SET progress = ?, bytes_written = ?, total_bytes = ?, updated_at = ?
      WHERE package_key = ?`,
    progress,
    bytesWritten,
    totalBytes,
    nowIso(),
    packageKey,
  );
  return getDownloadProgress(packageKey);
}

export async function getDownloadProgress(packageKey: string): Promise<OfflineDownloadProgress | null> {
  const db = await getOfflineDatabase();
  const row = await db.getFirstAsync<PackageRow>('SELECT * FROM offline_packages WHERE package_key = ?', packageKey);
  if (!row) return null;
  return {
    packageKey: row.package_key,
    domain: row.domain,
    entityType: row.entity_type,
    entityId: row.entity_id,
    title: row.title,
    status: row.status,
    progress: Math.max(0, Math.min(1, row.progress)),
    bytesWritten: Math.max(0, row.bytes_written),
    totalBytes: row.total_bytes,
    error: row.error,
    updatedAt: row.updated_at,
  };
}

export async function isEntityDownloaded(
  entityType: OfflineDownloadEntityType,
  entityId: string,
): Promise<boolean> {
  const db = await getOfflineDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
       FROM offline_packages
      WHERE entity_type = ? AND entity_id = ? AND status = 'complete'`,
    entityType,
    entityId,
  );
  return (row?.count ?? 0) > 0;
}

export async function findPlayableLocalUri(
  playableKind: PlaybackEntityKind,
  playableId: string,
): Promise<string | null> {
  const db = await getOfflineDatabase();
  const row = await db.getFirstAsync<{ local_uri: string | null }>(
    `SELECT f.local_uri
       FROM offline_files f
       JOIN offline_package_files pf ON pf.file_key = f.file_key
       JOIN offline_packages p ON p.package_key = pf.package_key
      WHERE f.playable_kind = ?
        AND f.playable_id = ?
        AND f.status = 'complete'
        AND p.status = 'complete'
        AND f.local_uri IS NOT NULL
      ORDER BY p.updated_at DESC
      LIMIT 1`,
    playableKind,
    playableId,
  );
  return row?.local_uri ?? null;
}

export async function getOfflineSnapshot<T>(
  entityType: OfflineSnapshotEntityType,
  entityId: string,
  locale: string,
): Promise<T | null> {
  const db = await getOfflineDatabase();
  const row = await db.getFirstAsync<{ metadata_json: string }>(
    `SELECT e.metadata_json
       FROM offline_entities e
       JOIN offline_package_entities pe ON pe.entity_key = e.entity_key
       JOIN offline_packages p ON p.package_key = pe.package_key
      WHERE e.entity_type = ?
        AND e.entity_id = ?
        AND p.status = 'complete'
      ORDER BY CASE WHEN e.locale = ? THEN 0 ELSE 1 END, p.updated_at DESC
      LIMIT 1`,
    entityType,
    entityId,
    locale,
  );
  if (!row) return null;
  try {
    return JSON.parse(row.metadata_json) as T;
  } catch {
    return null;
  }
}

export async function listOfflineSnapshots<T>(
  entityType: OfflineSnapshotEntityType,
  locale: string,
): Promise<T[]> {
  const db = await getOfflineDatabase();
  const rows = await db.getAllAsync<{ metadata_json: string }>(
    `SELECT e.metadata_json
       FROM offline_entities e
       JOIN offline_package_entities pe ON pe.entity_key = e.entity_key
       JOIN offline_packages p ON p.package_key = pe.package_key
      WHERE e.entity_type = ?
        AND p.status = 'complete'
        AND e.locale = ?
      GROUP BY e.entity_key
      ORDER BY MAX(p.updated_at) DESC`,
    entityType,
    locale,
  );
  return rows.flatMap((row) => {
    try { return [JSON.parse(row.metadata_json) as T]; }
    catch { return []; }
  });
}

export async function removeOfflinePackage(packageKey: string): Promise<OfflineFileRow[]> {
  const db = await getOfflineDatabase();
  const packageFiles = await getPackageFiles(packageKey);
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM offline_packages WHERE package_key = ?', packageKey);
    await txn.runAsync(
      `DELETE FROM offline_entities
        WHERE NOT EXISTS (
          SELECT 1 FROM offline_package_entities pe WHERE pe.entity_key = offline_entities.entity_key
        )`,
    );
    await txn.runAsync(
      `DELETE FROM offline_files
        WHERE NOT EXISTS (
          SELECT 1 FROM offline_package_files pf WHERE pf.file_key = offline_files.file_key
        )`,
    );
  });

  const orphaned: OfflineFileRow[] = [];
  for (const file of packageFiles) {
    const stillReferenced = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM offline_package_files WHERE file_key = ?',
      file.file_key,
    );
    if ((stillReferenced?.count ?? 0) === 0) orphaned.push(file);
  }
  return orphaned;
}

export function resourceFromRow(row: OfflineFileRow): OfflineDownloadResource {
  return {
    fileKey: row.file_key,
    remoteUri: row.remote_uri,
    role: row.role,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    checksum: row.checksum,
    version: row.version,
    extension: row.extension,
    headers: row.headers_json ? JSON.parse(row.headers_json) as Record<string, string> : null,
    playableKind: row.playable_kind,
    playableId: row.playable_id,
  };
}
