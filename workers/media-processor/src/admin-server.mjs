import http from 'node:http';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { purgeUnusedStorage } from './storage-gc.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DELETE_ROUTE = /^\/admin\/processing-jobs\/([0-9a-f-]+)\/file$/i;
const ALLOWED_BUCKETS = new Set(['chc-submissions', 'chc-music', 'chc-learning', 'chc-images']);

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let s3Client = null;

function getS3Client() {
  if (s3Client) return s3Client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new HttpError(503, 'r2_unavailable', 'R2 deletion credentials are not configured.');
  }

  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return s3Client;
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, DELETE, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type',
    'access-control-max-age': '86400',
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    ...corsHeaders(),
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function requireBearerToken(request) {
  const authorization = request.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new HttpError(401, 'auth_required', 'A Supabase bearer token is required.');
  }
  return match[1].trim();
}

async function callUserRpc(config, bearerToken, rpcName, payload) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      apikey: config.supabasePublishableKey,
      authorization: `Bearer ${bearerToken}`,
      'accept-profile': 'public',
      'content-profile': 'public',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    throw new HttpError(
      response.status >= 400 && response.status < 500 ? response.status : 502,
      body?.code || 'supabase_rpc_failed',
      body?.message || text || `Supabase RPC ${rpcName} failed.`,
    );
  }

  if (!Array.isArray(body)) {
    throw new HttpError(502, 'invalid_supabase_response', `Supabase RPC ${rpcName} returned an unexpected response.`);
  }

  return body;
}

function validateDeleteObject(value) {
  const bucket = typeof value?.bucket === 'string' ? value.bucket.trim() : '';
  const path = typeof value?.path === 'string' ? value.path.trim() : '';

  if (!ALLOWED_BUCKETS.has(bucket)) {
    throw new HttpError(409, 'unsupported_delete_bucket', `Cannot permanently delete objects from bucket ${bucket || '(missing)'}.`);
  }

  if (!path || path.length > 1024 || path.startsWith('/') || path.includes('..') || path.includes('\\')) {
    throw new HttpError(409, 'invalid_delete_manifest', 'The processing job contains an invalid storage object path.');
  }

  return { bucket, path };
}

async function deleteObject(bucket, key) {
  await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

async function deleteProcessingFile(request, response, config, jobId) {
  const bearerToken = requireBearerToken(request);

  const preparedRows = await callUserRpc(
    config,
    bearerToken,
    'prepare_admin_processing_file_deletion',
    { p_job_id: jobId },
  );

  const prepared = preparedRows[0];
  if (!prepared) {
    throw new HttpError(404, 'processing_job_not_found', 'Processing job not found.');
  }

  const objects = Array.isArray(prepared.objects)
    ? prepared.objects.map(validateDeleteObject)
    : [];

  const deletedObjects = [];
  for (const object of objects) {
    await deleteObject(object.bucket, object.path);
    deletedObjects.push(object);
  }

  const finalizedRows = await callUserRpc(
    config,
    bearerToken,
    'finalize_admin_processing_file_deletion',
    { p_job_id: jobId },
  );
  const finalized = finalizedRows[0];

  if (!finalized?.deleted) {
    throw new HttpError(
      409,
      'delete_finalize_failed',
      'The R2 objects were deleted, but database cleanup could not be finalized. Retry this deletion.',
    );
  }

  sendJson(response, 200, {
    jobId,
    deleted: true,
    deletedObjectCount: deletedObjects.length,
    deletedObjects,
    deletedJobCount: Number(finalized.deleted_job_count || 0),
    deletedSubmissionItemCount: Number(finalized.deleted_submission_item_count || 0),
    deletedMediaAssetId: finalized.deleted_media_asset_id ?? null,
    deletedUploadIntentId: finalized.deleted_upload_intent_id ?? null,
  });
}

async function deleteAllUnusedStorage(request, response, config) {
  const bearerToken = requireBearerToken(request);
  const authorization = await callUserRpc(
    config,
    bearerToken,
    'authorize_admin_storage_gc',
    {},
  );

  if (!authorization[0]?.authorized) {
    throw new HttpError(403, 'admin_required', 'CHC admin access is required.');
  }

  const result = await purgeUnusedStorage(config, { dueOnly: false });
  sendJson(response, result.errors.length ? 207 : 200, {
    deleted: result.errors.length === 0,
    deletedObjectCount: result.deletedObjectCount,
    deletedBytes: result.deletedBytes,
    databaseRowsRemoved: result.databaseRowsRemoved,
    scannedCount: result.scannedCount,
    candidateCount: result.candidateCount,
    errors: result.errors,
  });
}

async function handleRequest(request, response, config) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  const host = request.headers.host || 'localhost';
  const url = new URL(request.url || '/', `http://${host}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { ok: true, service: 'chc-media-processor' });
    return;
  }

  if (url.pathname === '/admin/storage/unused') {
    if (request.method !== 'DELETE') {
      response.writeHead(405, { ...corsHeaders(), allow: 'DELETE, OPTIONS' });
      response.end();
      return;
    }

    await deleteAllUnusedStorage(request, response, config);
    return;
  }

  const match = url.pathname.match(DELETE_ROUTE);
  const jobId = match?.[1];

  if (jobId && UUID_PATTERN.test(jobId)) {
    if (request.method !== 'DELETE') {
      response.writeHead(405, { ...corsHeaders(), allow: 'DELETE, OPTIONS' });
      response.end();
      return;
    }

    await deleteProcessingFile(request, response, config, jobId);
    return;
  }

  throw new HttpError(404, 'not_found', 'Route not found.');
}

export function startAdminServer(config, { onLog } = {}) {
  // The Railway service domain is explicitly routed to container port 3000.
  // Do not use Railway's injected PORT here; that value can differ from the
  // service-domain target and would make the public admin endpoint unreachable.
  const port = Number(process.env.ADMIN_API_PORT || 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid ADMIN_API_PORT ${process.env.ADMIN_API_PORT}`);
  }

  const server = http.createServer((request, response) => {
    handleRequest(request, response, config).catch((error) => {
      const status = error instanceof HttpError ? error.status : 500;
      const code = error instanceof HttpError ? error.code : 'internal_error';
      const message = error instanceof HttpError
        ? error.message
        : 'Unexpected media processor admin API error';

      onLog?.({
        status: 'admin_api_error',
        method: request.method,
        path: request.url,
        httpStatus: status,
        code,
        error: error instanceof Error ? error.message : String(error),
      });

      sendJson(response, status, { error: code, message });
    });
  });

  server.listen(port, '0.0.0.0', () => {
    onLog?.({ status: 'admin_api_started', port });
  });

  return server;
}
