import { callRpc, deleteObject, listStorageObjects } from './processor.mjs';

export const STORAGE_BUCKETS = [
  'chc-submissions',
  'chc-music',
  'chc-learning',
  'chc-images',
];

export async function scanStorageGc(config) {
  if (config.r2Driver !== 's3') {
    return {
      skipped: true,
      reason: 'storage_gc_requires_s3_inventory',
      scannedCount: 0,
      candidateCount: 0,
      dueCount: 0,
    };
  }

  const objects = [];
  for (const bucket of STORAGE_BUCKETS) {
    objects.push(...await listStorageObjects(config, bucket));
  }

  const rows = await callRpc(config, 'sync_storage_gc_candidates', {
    p_worker_token: config.mediaWorkerToken,
    p_objects: objects,
  });
  const result = rows[0] || {};

  return {
    skipped: false,
    scannedCount: Number(result.scanned_count || objects.length),
    candidateCount: Number(result.candidate_count || 0),
    dueCount: Number(result.due_count || 0),
  };
}

export async function purgeUnusedStorage(config, { dueOnly = true } = {}) {
  const scan = await scanStorageGc(config);
  if (scan.skipped) {
    return {
      ...scan,
      deletedObjectCount: 0,
      deletedBytes: 0,
      databaseRowsRemoved: 0,
      errors: [],
    };
  }

  let deletedObjectCount = 0;
  let deletedBytes = 0;
  let databaseRowsRemoved = 0;
  const errors = [];
  const failedKeys = new Set();

  // Candidates are removed from the DB as each object succeeds, so fetching
  // another batch naturally advances beyond the previous one. Failed objects
  // remain candidates and are skipped for the rest of this run.
  for (let page = 0; page < 1000; page += 1) {
    const rows = await callRpc(config, 'get_storage_gc_candidates', {
      p_worker_token: config.mediaWorkerToken,
      p_due_only: dueOnly,
      p_limit: 250,
    });

    const candidates = rows.filter((candidate) => {
      const key = `${candidate.bucket}/${candidate.path}`;
      return !failedKeys.has(key);
    });

    if (!candidates.length) break;

    let successThisPage = 0;
    for (const candidate of candidates) {
      const key = `${candidate.bucket}/${candidate.path}`;
      try {
        const preparedRows = await callRpc(config, 'prepare_storage_gc_candidate', {
          p_worker_token: config.mediaWorkerToken,
          p_bucket: candidate.bucket,
          p_path: candidate.path,
        });
        const prepared = preparedRows[0];

        if (!prepared?.authorized) {
          failedKeys.add(key);
          continue;
        }

        // Database metadata is detached first so no new catalog/submission
        // reference can race in while the physical object is being removed.
        await deleteObject(config, candidate.bucket, candidate.path);

        await callRpc(config, 'complete_storage_gc_candidate', {
          p_worker_token: config.mediaWorkerToken,
          p_bucket: candidate.bucket,
          p_path: candidate.path,
        });

        successThisPage += 1;
        deletedObjectCount += 1;
        deletedBytes += Number(candidate.file_size_bytes || 0);
        databaseRowsRemoved += Number(prepared.database_rows_removed || 0);
      } catch (error) {
        failedKeys.add(key);
        errors.push({
          bucket: candidate.bucket,
          path: candidate.path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (successThisPage === 0) break;
  }

  return {
    ...scan,
    deletedObjectCount,
    deletedBytes,
    databaseRowsRemoved,
    errors,
  };
}
