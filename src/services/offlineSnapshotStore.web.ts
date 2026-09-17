import type { OfflineSnapshotEntityType } from '@/types/offlineDownloads';

export async function getOfflineSnapshot<T>(
  _entityType: OfflineSnapshotEntityType,
  _entityId: string,
  _locale: string,
): Promise<T | null> {
  return null;
}

export async function listOfflineSnapshots<T>(
  _entityType: OfflineSnapshotEntityType,
  _locale: string,
): Promise<T[]> {
  return [];
}
