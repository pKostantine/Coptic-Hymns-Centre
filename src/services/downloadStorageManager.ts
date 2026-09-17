import { File } from 'expo-file-system';

import { getOfflineDatabase, getPackageFiles, getStoredDownloadRequest, removeOfflinePackage } from '@/services/offlineDatabase';
import type { OfflineDownloadProgress, OfflineDownloadRequest } from '@/types/offlineDownloads';

export interface DownloadStorageSummary {
  packageCount: number;
  completeCount: number;
  staleCount: number;
  failedCount: number;
  totalBytes: number;
  musicBytes: number;
  learningBytes: number;
}

export interface DownloadIntegrityResult {
  checked: number;
  invalid: number;
  repaired: number;
}

function normalizedChecksum(value: string | null | undefined): { algorithm: 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'; digest: string } | null {
  if (!value) return null;
  const clean = value.trim().toLowerCase().replace(/^sha(?:-|_)?256:/, '').replace(/^md5:/, '');
  if (/^[a-f0-9]{32}$/.test(clean)) return { algorithm: 'MD5', digest: clean };
  if (/^[a-f0-9]{40}$/.test(clean)) return { algorithm: 'SHA-1', digest: clean };
  if (/^[a-f0-9]{64}$/.test(clean)) return { algorithm: 'SHA-256', digest: clean };
  if (/^[a-f0-9]{96}$/.test(clean)) return { algorithm: 'SHA-384', digest: clean };
  if (/^[a-f0-9]{128}$/.test(clean)) return { algorithm: 'SHA-512', digest: clean };
  return null;
}

function resourceIdentity(resource: OfflineDownloadRequest['resources'][number]): string {
  return [resource.fileKey, resource.remoteUri, resource.version ?? '', resource.checksum ?? '', resource.fileSizeBytes ?? ''].join('|');
}

export async function isDownloadRequestStale(request: OfflineDownloadRequest): Promise<boolean> {
  const stored = await getStoredDownloadRequest(request.packageKey);
  if (!stored) return false;
  const before = stored.resources.map(resourceIdentity).sort();
  const after = request.resources.map(resourceIdentity).sort();
  return before.length !== after.length || before.some((value, index) => value !== after[index]);
}

export async function listDownloads(): Promise<OfflineDownloadProgress[]> {
  const db = await getOfflineDatabase();
  const rows = await db.getAllAsync<{
    package_key: string; domain: 'music' | 'learning'; entity_type: OfflineDownloadProgress['entityType']; entity_id: string;
    title: string; status: OfflineDownloadProgress['status']; progress: number; bytes_written: number; total_bytes: number | null;
    error: string | null; updated_at: string;
  }>('SELECT package_key, domain, entity_type, entity_id, title, status, progress, bytes_written, total_bytes, error, updated_at FROM offline_packages ORDER BY updated_at DESC');
  return rows.map((row) => ({
    packageKey: row.package_key, domain: row.domain, entityType: row.entity_type, entityId: row.entity_id, title: row.title,
    status: row.status, progress: row.progress, bytesWritten: row.bytes_written, totalBytes: row.total_bytes,
    error: row.error, updatedAt: row.updated_at,
  }));
}

export async function getDownloadStorageSummary(): Promise<DownloadStorageSummary> {
  const db = await getOfflineDatabase();
  const packages = await listDownloads();
  const sizes = await db.getAllAsync<{ domain: 'music' | 'learning'; bytes: number }>(
    `SELECT p.domain, COALESCE(SUM(f.bytes_written), 0) AS bytes
       FROM offline_files f
       JOIN offline_package_files pf ON pf.file_key = f.file_key
       JOIN offline_packages p ON p.package_key = pf.package_key
      WHERE f.status = 'complete'
      GROUP BY p.domain`,
  );
  const musicBytes = sizes.find((row) => row.domain === 'music')?.bytes ?? 0;
  const learningBytes = sizes.find((row) => row.domain === 'learning')?.bytes ?? 0;
  return {
    packageCount: packages.length,
    completeCount: packages.filter((item) => item.status === 'complete').length,
    staleCount: 0,
    failedCount: packages.filter((item) => item.status === 'failed' || item.status === 'cancelled').length,
    totalBytes: musicBytes + learningBytes,
    musicBytes,
    learningBytes,
  };
}

export async function validateDownloadedFiles(): Promise<DownloadIntegrityResult> {
  const db = await getOfflineDatabase();
  const rows = await db.getAllAsync<{ file_key: string; local_uri: string | null; checksum: string | null; file_size_bytes: number | null }>(
    `SELECT file_key, local_uri, checksum, file_size_bytes FROM offline_files WHERE status = 'complete'`,
  );
  let invalid = 0;
  for (const row of rows) {
    let valid = false;
    try {
      if (row.local_uri) {
        const file = new File(row.local_uri);
        valid = file.exists && file.size > 0 && (row.file_size_bytes == null || row.file_size_bytes <= 0 || file.size === row.file_size_bytes);
        const checksum = normalizedChecksum(row.checksum);
        if (valid && checksum) valid = (await file.digest(checksum.algorithm)).toLowerCase() === checksum.digest;
      }
    } catch { valid = false; }
    if (!valid) {
      invalid += 1;
      await db.runAsync(
        `UPDATE offline_files SET status = 'failed', local_uri = NULL, bytes_written = 0, resume_json = NULL,
          error = 'Downloaded file failed integrity validation.', updated_at = ? WHERE file_key = ?`,
        new Date().toISOString(), row.file_key,
      );
      await db.runAsync(
        `UPDATE offline_packages SET status = 'failed', error = 'One or more downloaded files need to be downloaded again.', updated_at = ?
          WHERE package_key IN (SELECT package_key FROM offline_package_files WHERE file_key = ?)`,
        new Date().toISOString(), row.file_key,
      );
    }
  }
  return { checked: rows.length, invalid, repaired: 0 };
}

export async function cleanupIncompleteDownloads(): Promise<number> {
  const db = await getOfflineDatabase();
  const rows = await db.getAllAsync<{ file_key: string; local_uri: string | null }>(
    `SELECT file_key, local_uri FROM offline_files WHERE status IN ('failed', 'cancelled')`,
  );
  for (const row of rows) {
    if (row.local_uri) {
      try { const file = new File(row.local_uri); if (file.exists) file.delete(); } catch { /* database cleanup remains authoritative */ }
    }
    await db.runAsync('UPDATE offline_files SET local_uri = NULL, bytes_written = 0, total_bytes = file_size_bytes, resume_json = NULL WHERE file_key = ?', row.file_key);
  }
  return rows.length;
}

export async function removeAllDownloadRecords(): Promise<string[]> {
  const packages = await listDownloads();
  const uris: string[] = [];
  for (const pkg of packages) {
    const files = await getPackageFiles(pkg.packageKey);
    for (const file of files) if (file.local_uri) uris.push(file.local_uri);
    await removeOfflinePackage(pkg.packageKey);
  }
  return [...new Set(uris)];
}
