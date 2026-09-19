type MediaType = 'audio' | 'video' | 'image';

interface Env {
  CHC_SUBMISSIONS: R2Bucket;
  CHC_MUSIC: R2Bucket;
  CHC_LEARNING: R2Bucket;
  CHC_IMAGES: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  MAX_UPLOAD_BYTES?: string;
  CORS_ALLOWED_ORIGIN?: string;
}

interface R2Bucket {
  put(key: string, value: R2PutValue, options?: R2PutOptions): Promise<R2Object>;
  delete(key: string): Promise<void>;
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | R2Object | null>;
  head(key: string): Promise<R2Object | null>;
  createMultipartUpload(key: string, options?: R2PutOptions): Promise<R2MultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload;
}

interface R2UploadedPart {
  partNumber: number;
  etag: string;
}

interface R2MultipartUpload {
  key: string;
  uploadId: string;
  uploadPart(partNumber: number, value: R2PutValue): Promise<R2UploadedPart>;
  complete(parts: R2UploadedPart[]): Promise<R2Object>;
  abort(): Promise<void>;
}

type R2PutValue = ReadableStream | ArrayBuffer | ArrayBufferView | string | null;

interface R2GetOptions {
  range?: Headers;
}

interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}

interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
  };
  customMetadata?: Record<string, string>;
}

interface R2Object {
  key: string;
  size: number;
  httpEtag?: string;
  etag?: string;
  range?: R2Range;
}

interface R2ObjectBody extends R2Object {
  body: ReadableStream;
}

interface AuthorizeUploadBody {
  creatorAccountId: string;
  originalFilename: string;
  contentType: string;
  contentLength: number;
  mediaType?: MediaType;
  checksumSha256?: string | null;
}

interface SupabaseUploadIntentRow {
  upload_intent_id: string;
  creator_account_id?: string;
  bucket: 'chc-submissions';
  object_path: string;
  expires_at: string;
  content_type: string;
  content_length: number;
  media_type: MediaType;
  checksum_sha256?: string | null;
}

interface SupabaseCompletedUploadRow {
  upload_intent_id: string;
  status: 'uploaded';
  bucket: 'chc-submissions';
  object_path: string;
  uploaded_at: string;
}

interface AdminPreviewItemRow {
  item_id: string;
  submission_id: string;
  bucket: 'chc-submissions';
  object_path: string;
  content_type: string;
  content_length: number;
  original_filename: string;
}

interface AdminDeleteObject {
  bucket: string;
  path: string;
}

interface AdminDeletePrepareRow {
  job_id: string;
  upload_intent_id?: string | null;
  media_asset_id?: string | null;
  related_job_count: number;
  objects: AdminDeleteObject[];
}

interface AdminDeleteFinalizeRow {
  job_id: string;
  deleted: boolean;
  deleted_job_count: number;
  deleted_submission_item_count: number;
  deleted_media_asset_id?: string | null;
  deleted_upload_intent_id?: string | null;
}

interface SupabaseErrorBody {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

interface MultipartRoute {
  uploadIntentId: string;
  uploadId?: string;
  partNumber?: number;
  action: 'create' | 'part' | 'complete' | 'abort';
}

interface CompleteMultipartBody {
  parts: R2UploadedPart[];
}

const RECOMMENDED_MULTIPART_PART_BYTES = 32 * 1024 * 1024;
const MAX_MULTIPART_PART_BYTES = 64 * 1024 * 1024;
const MAX_MULTIPART_PARTS = 10_000;

class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const DEFAULT_MAX_UPLOAD_BYTES = 21_474_836_480;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTENT_TYPE_PATTERN = /^(audio|video|image)\/[a-z0-9.+-]+$/i;

function corsHeaders(env: Env): Headers {
  return new Headers({
    'access-control-allow-origin': env.CORS_ALLOWED_ORIGIN ?? '*',
    'access-control-allow-methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type, Content-Length, Range',
    'access-control-expose-headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag',
    'access-control-max-age': '86400',
  });
}

function withCors(headers: Headers, env: Env): Headers {
  for (const [name, value] of corsHeaders(env)) {
    headers.set(name, value);
  }

  return headers;
}

function json(body: unknown, env: Env, init?: ResponseInit): Response {
  const headers = withCors(new Headers(init?.headers), env);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function requireBearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    throw new HttpError(401, 'auth_required', 'A Supabase bearer token is required.');
  }

  return match[1].trim();
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, 'invalid_json', 'Expected a JSON object request body.');
    }

    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(400, 'invalid_json', 'Could not parse the JSON request body.');
  }
}

function parseAuthorizeBody(body: Record<string, unknown>, env: Env): AuthorizeUploadBody {
  const creatorAccountId = readString(body.creatorAccountId);
  const originalFilename = readString(body.originalFilename);
  const contentType = normalizeContentType(readString(body.contentType));
  const contentLength = readPositiveInteger(body.contentLength);
  const mediaType = parseMediaType(body.mediaType, contentType);
  const checksumSha256 = readOptionalChecksum(body.checksumSha256);
  const maxUploadBytes = getMaxUploadBytes(env);

  if (!UUID_PATTERN.test(creatorAccountId)) {
    throw new HttpError(400, 'invalid_creator_account_id', 'creatorAccountId must be a UUID.');
  }

  if (!originalFilename.trim()) {
    throw new HttpError(400, 'invalid_filename', 'originalFilename is required.');
  }

  if (!CONTENT_TYPE_PATTERN.test(contentType)) {
    throw new HttpError(400, 'unsupported_content_type', 'Only audio, video, and image uploads are supported.');
  }

  if (contentLength > maxUploadBytes) {
    throw new HttpError(413, 'upload_too_large', 'The requested upload exceeds the maximum allowed size.');
  }

  return {
    creatorAccountId,
    originalFilename: originalFilename.trim(),
    contentType,
    contentLength,
    mediaType,
    checksumSha256,
  };
}

function readString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'invalid_request', 'A required string field is missing.');
  }

  return value;
}

function readPositiveInteger(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, 'invalid_content_length', 'contentLength must be a positive integer.');
  }

  return parsed;
}

function readOptionalChecksum(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new HttpError(400, 'invalid_checksum', 'checksumSha256 must be a 64-character hex string.');
  }

  return value.toLowerCase();
}

function parseMediaType(value: unknown, contentType: string): MediaType {
  if (value === undefined || value === null || value === '') {
    return contentType.split('/')[0] as MediaType;
  }

  if (value === 'audio' || value === 'video' || value === 'image') {
    return value;
  }

  throw new HttpError(400, 'invalid_media_type', 'mediaType must be audio, video, or image.');
}

function normalizeContentType(value: string): string {
  return value.split(';')[0]?.trim().toLowerCase() ?? '';
}

function getMaxUploadBytes(env: Env): number {
  const parsed = Number(env.MAX_UPLOAD_BYTES);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_BYTES;
}

async function callSupabaseRpc<T>(
  env: Env,
  bearerToken: string,
  rpcName: string,
  payload: Record<string, unknown>,
): Promise<T[]> {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${bearerToken}`,
      'accept-profile': 'public',
      'content-profile': 'public',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    const supabaseError = isSupabaseErrorBody(responseBody) ? responseBody : null;
    const upstreamStatus = response.status >= 400 && response.status < 500 ? response.status : 502;

    throw new HttpError(
      upstreamStatus,
      supabaseError?.code ?? 'supabase_rpc_failed',
      supabaseError?.message ?? `Supabase RPC ${rpcName} failed.`,
    );
  }

  if (!Array.isArray(responseBody)) {
    throw new HttpError(502, 'invalid_supabase_response', `Supabase RPC ${rpcName} returned an unexpected response.`);
  }

  return responseBody as T[];
}

function isSupabaseErrorBody(value: unknown): value is SupabaseErrorBody {
  return Boolean(value && typeof value === 'object' && 'message' in value);
}

async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  const bearerToken = requireBearerToken(request);
  const body = parseAuthorizeBody(await readJsonObject(request), env);

  const rows = await callSupabaseRpc<SupabaseUploadIntentRow>(env, bearerToken, 'create_media_upload_intent', {
    p_creator_account_id: body.creatorAccountId,
    p_original_filename: body.originalFilename,
    p_content_type: body.contentType,
    p_content_length: body.contentLength,
    p_media_type: body.mediaType,
    p_checksum_sha256: body.checksumSha256,
  });

  const intent = rows[0];

  if (!intent) {
    throw new HttpError(403, 'not_authorized', 'No upload authorization was created.');
  }

  const uploadUrl = new URL(`/uploads/${intent.upload_intent_id}`, request.url);

  return json(
    {
      uploadIntentId: intent.upload_intent_id,
      bucket: intent.bucket,
      objectPath: intent.object_path,
      uploadUrl: uploadUrl.toString(),
      expiresAt: intent.expires_at,
      contentType: intent.content_type,
      contentLength: Number(intent.content_length),
      mediaType: intent.media_type,
    },
    env,
  );
}

async function getActiveUploadIntent(
  env: Env,
  bearerToken: string,
  uploadIntentId: string,
): Promise<SupabaseUploadIntentRow> {
  const rows = await callSupabaseRpc<SupabaseUploadIntentRow>(
    env,
    bearerToken,
    'get_media_upload_intent_for_upload',
    { p_upload_intent_id: uploadIntentId },
  );

  const intent = rows[0];
  if (!intent) {
    throw new HttpError(404, 'upload_intent_not_found', 'The upload intent is not active or available to this user.');
  }

  return intent;
}

function parseMultipartRoute(pathname: string): MultipartRoute | null {
  const create = pathname.match(/^\/uploads\/([0-9a-f-]+)\/multipart$/i);
  if (create?.[1] && UUID_PATTERN.test(create[1])) {
    return { uploadIntentId: create[1], action: 'create' };
  }

  const complete = pathname.match(/^\/uploads\/([0-9a-f-]+)\/multipart\/([^/]+)\/complete$/i);
  if (complete?.[1] && complete?.[2] && UUID_PATTERN.test(complete[1])) {
    return {
      uploadIntentId: complete[1],
      uploadId: decodeURIComponent(complete[2]),
      action: 'complete',
    };
  }

  const part = pathname.match(/^\/uploads\/([0-9a-f-]+)\/multipart\/([^/]+)\/parts\/(\d+)$/i);
  if (part?.[1] && part?.[2] && part?.[3] && UUID_PATTERN.test(part[1])) {
    const partNumber = Number(part[3]);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > MAX_MULTIPART_PARTS) {
      throw new HttpError(400, 'invalid_part_number', 'Multipart part number is invalid.');
    }
    return {
      uploadIntentId: part[1],
      uploadId: decodeURIComponent(part[2]),
      partNumber,
      action: 'part',
    };
  }

  const abort = pathname.match(/^\/uploads\/([0-9a-f-]+)\/multipart\/([^/]+)$/i);
  if (abort?.[1] && abort?.[2] && UUID_PATTERN.test(abort[1])) {
    return {
      uploadIntentId: abort[1],
      uploadId: decodeURIComponent(abort[2]),
      action: 'abort',
    };
  }

  return null;
}

async function handleMultipartCreate(request: Request, env: Env, route: MultipartRoute): Promise<Response> {
  const bearerToken = requireBearerToken(request);
  const intent = await getActiveUploadIntent(env, bearerToken, route.uploadIntentId);

  const multipart = await env.CHC_SUBMISSIONS.createMultipartUpload(intent.object_path, {
    httpMetadata: { contentType: intent.content_type },
    customMetadata: {
      uploadIntentId: intent.upload_intent_id,
      creatorAccountId: intent.creator_account_id ?? '',
      uploadedAt: new Date().toISOString(),
    },
  });

  return json({
    uploadIntentId: intent.upload_intent_id,
    uploadId: multipart.uploadId,
    partSize: RECOMMENDED_MULTIPART_PART_BYTES,
    maxPartSize: MAX_MULTIPART_PART_BYTES,
    maxParallel: 4,
  }, env);
}

async function handleMultipartPart(request: Request, env: Env, route: MultipartRoute): Promise<Response> {
  const bearerToken = requireBearerToken(request);
  const intent = await getActiveUploadIntent(env, bearerToken, route.uploadIntentId);
  const contentLength = Number(request.headers.get('content-length'));

  if (!request.body) {
    throw new HttpError(400, 'empty_part', 'Multipart part body is required.');
  }

  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    throw new HttpError(411, 'content_length_required', 'Content-Length is required for multipart parts.');
  }

  if (contentLength > MAX_MULTIPART_PART_BYTES) {
    throw new HttpError(413, 'multipart_part_too_large', 'Multipart part exceeds the CHC part-size limit.');
  }

  const multipart = env.CHC_SUBMISSIONS.resumeMultipartUpload(intent.object_path, route.uploadId!);
  const uploaded = await multipart.uploadPart(route.partNumber!, request.body);

  return json({
    partNumber: uploaded.partNumber,
    etag: uploaded.etag,
  }, env);
}

function parseCompleteMultipartBody(body: Record<string, unknown>): CompleteMultipartBody {
  if (!Array.isArray(body.parts) || !body.parts.length || body.parts.length > MAX_MULTIPART_PARTS) {
    throw new HttpError(400, 'invalid_parts', 'Multipart completion requires a non-empty parts list.');
  }

  const parts = body.parts.map((value) => {
    if (!value || typeof value !== 'object') {
      throw new HttpError(400, 'invalid_parts', 'Multipart completion contains an invalid part.');
    }

    const record = value as Record<string, unknown>;
    const partNumber = Number(record.partNumber);
    const etag = typeof record.etag === 'string' ? record.etag : '';

    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > MAX_MULTIPART_PARTS || !etag) {
      throw new HttpError(400, 'invalid_parts', 'Multipart completion contains an invalid part.');
    }

    return { partNumber, etag };
  });

  parts.sort((a, b) => a.partNumber - b.partNumber);
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index].partNumber !== index + 1) {
      throw new HttpError(400, 'invalid_parts', 'Multipart parts must be complete and sequential.');
    }
  }

  return { parts };
}

async function handleMultipartComplete(request: Request, env: Env, route: MultipartRoute): Promise<Response> {
  const bearerToken = requireBearerToken(request);
  const intent = await getActiveUploadIntent(env, bearerToken, route.uploadIntentId);
  const body = parseCompleteMultipartBody(await readJsonObject(request));
  const multipart = env.CHC_SUBMISSIONS.resumeMultipartUpload(intent.object_path, route.uploadId!);
  const object = await multipart.complete(body.parts);

  if (object.size !== Number(intent.content_length)) {
    await env.CHC_SUBMISSIONS.delete(intent.object_path).catch(() => undefined);
    throw new HttpError(400, 'content_length_mismatch', 'Multipart upload size does not match the authorized upload.');
  }

  try {
    const completedRows = await callSupabaseRpc<SupabaseCompletedUploadRow>(
      env,
      bearerToken,
      'complete_media_upload_intent',
      {
        p_upload_intent_id: intent.upload_intent_id,
        p_uploaded_size: object.size,
        p_r2_http_etag: object.httpEtag ?? object.etag ?? '',
      },
    );

    const completed = completedRows[0];
    if (!completed) {
      throw new HttpError(502, 'completion_failed', 'The upload was stored but could not be finalized.');
    }

    return json({
      uploadIntentId: completed.upload_intent_id,
      status: completed.status,
      bucket: completed.bucket,
      objectPath: completed.object_path,
      uploadedAt: completed.uploaded_at,
    }, env);
  } catch (error) {
    await env.CHC_SUBMISSIONS.delete(intent.object_path).catch(() => undefined);
    throw error;
  }
}

async function handleMultipartAbort(request: Request, env: Env, route: MultipartRoute): Promise<Response> {
  const bearerToken = requireBearerToken(request);
  const intent = await getActiveUploadIntent(env, bearerToken, route.uploadIntentId);
  const multipart = env.CHC_SUBMISSIONS.resumeMultipartUpload(intent.object_path, route.uploadId!);
  await multipart.abort();
  return json({ aborted: true }, env);
}

async function handleUpload(request: Request, env: Env, uploadIntentId: string): Promise<Response> {
  const bearerToken = requireBearerToken(request);
  const requestContentLength = Number(request.headers.get('content-length'));
  const requestContentType = normalizeContentType(request.headers.get('content-type') ?? '');

  if (!request.body) {
    throw new HttpError(400, 'empty_upload', 'The upload request body is required.');
  }

  if (!Number.isSafeInteger(requestContentLength) || requestContentLength <= 0) {
    throw new HttpError(411, 'content_length_required', 'Content-Length is required for uploads.');
  }

  if (requestContentLength > getMaxUploadBytes(env)) {
    throw new HttpError(413, 'upload_too_large', 'The upload exceeds the maximum allowed size.');
  }

  const intent = await getActiveUploadIntent(env, bearerToken, uploadIntentId);

  if (requestContentLength !== Number(intent.content_length)) {
    throw new HttpError(400, 'content_length_mismatch', 'Content-Length does not match the authorized upload.');
  }

  if (requestContentType !== intent.content_type) {
    throw new HttpError(400, 'content_type_mismatch', 'Content-Type does not match the authorized upload.');
  }

  const object = await env.CHC_SUBMISSIONS.put(intent.object_path, request.body, {
    httpMetadata: {
      contentType: intent.content_type,
    },
    customMetadata: {
      uploadIntentId: intent.upload_intent_id,
      creatorAccountId: intent.creator_account_id ?? '',
      uploadedAt: new Date().toISOString(),
    },
  });

  try {
    const completedRows = await callSupabaseRpc<SupabaseCompletedUploadRow>(env, bearerToken, 'complete_media_upload_intent', {
      p_upload_intent_id: intent.upload_intent_id,
      p_uploaded_size: requestContentLength,
      p_r2_http_etag: object.httpEtag ?? object.etag ?? '',
    });

    const completed = completedRows[0];

    if (!completed) {
      throw new HttpError(502, 'completion_failed', 'The upload was stored but could not be finalized.');
    }

    return json(
      {
        uploadIntentId: completed.upload_intent_id,
        status: completed.status,
        bucket: completed.bucket,
        objectPath: completed.object_path,
        uploadedAt: completed.uploaded_at,
      },
      env,
      {
        headers: object.httpEtag ? { etag: object.httpEtag } : undefined,
      },
    );
  } catch (error) {
    await env.CHC_SUBMISSIONS.delete(intent.object_path).catch(() => undefined);
    throw error;
  }
}


function getRangeContentLength(object: R2Object): number {
  if (!object.range) return object.size;
  if (typeof object.range.length === 'number') return object.range.length;
  if (typeof object.range.suffix === 'number') return Math.min(object.range.suffix, object.size);
  if (typeof object.range.offset === 'number') return Math.max(object.size - object.range.offset, 0);
  return object.size;
}

function getContentRange(object: R2Object): string | null {
  if (!object.range) return null;

  const length = getRangeContentLength(object);
  const offset =
    typeof object.range.offset === 'number'
      ? object.range.offset
      : Math.max(object.size - length, 0);

  if (length === 0) return `bytes */${object.size}`;

  const end = Math.min(offset + length - 1, object.size - 1);
  return `bytes ${offset}-${end}/${object.size}`;
}

function parseAdminPreviewItemId(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/submission-items\/([0-9a-f-]+)\/preview$/i);
  const itemId = match?.[1];
  return itemId && UUID_PATTERN.test(itemId) ? itemId : null;
}

function safeInlineFilename(filename: string): string {
  return filename.replace(/[\r\n"]/g, '_').slice(0, 180) || 'preview';
}

async function handleAdminPreview(request: Request, env: Env, itemId: string): Promise<Response> {
  const bearerToken = requireBearerToken(request);
  const rows = await callSupabaseRpc<AdminPreviewItemRow>(
    env,
    bearerToken,
    'get_admin_submission_preview_item',
    { p_item_id: itemId },
  );

  const item = rows[0];
  if (!item) {
    throw new HttpError(404, 'preview_item_not_found', 'Submission item is not available for preview.');
  }

  if (item.bucket !== 'chc-submissions') {
    throw new HttpError(409, 'unsupported_preview_bucket', 'This submission item is not stored in the private submissions bucket.');
  }

  const headers = withCors(new Headers(), env);
  headers.set('content-type', item.content_type);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'private, no-store');
  // This route streams bytes a creator uploaded. Without nosniff a file stored
  // as audio but sniffed as HTML would execute in the Worker's own origin.
  headers.set('x-content-type-options', 'nosniff');
  // The quoted form cannot carry a Coptic or Arabic filename; filename* can, and
  // browsers that do not understand it fall back to the quoted one.
  headers.set(
    'content-disposition',
    `inline; filename="${safeInlineFilename(item.original_filename)}"; `
      + `filename*=UTF-8''${encodeURIComponent(item.original_filename)}`,
  );

  if (request.method === 'HEAD') {
    const object = await env.CHC_SUBMISSIONS.head(item.object_path);
    if (!object) throw new HttpError(404, 'preview_object_not_found', 'The uploaded file could not be found.');

    if (object.httpEtag || object.etag) headers.set('etag', object.httpEtag ?? object.etag ?? '');
    headers.set('content-length', String(object.size));
    return new Response(null, { headers });
  }

  const object = await env.CHC_SUBMISSIONS.get(item.object_path, { range: request.headers });
  if (!object) throw new HttpError(404, 'preview_object_not_found', 'The uploaded file could not be found.');
  if (object.httpEtag || object.etag) headers.set('etag', object.httpEtag ?? object.etag ?? '');

  const contentRange = getContentRange(object);
  headers.set('content-length', String(getRangeContentLength(object)));
  if (contentRange) headers.set('content-range', contentRange);

  if (!('body' in object) || !object.body) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(object.body, { status: contentRange ? 206 : 200, headers });
}

function parseAdminProcessingDeleteJobId(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/processing-jobs\/([0-9a-f-]+)\/file$/i);
  const jobId = match?.[1];
  return jobId && UUID_PATTERN.test(jobId) ? jobId : null;
}

function isValidDeleteObjectPath(path: string): boolean {
  return path.length > 0
    && path.length <= 1024
    && !path.startsWith('/')
    && !path.includes('..')
    && !path.includes('\\');
}

function bucketForAdminDelete(env: Env, bucketName: string): R2Bucket {
  switch (bucketName) {
    case 'chc-submissions':
      return env.CHC_SUBMISSIONS;
    case 'chc-music':
      return env.CHC_MUSIC;
    case 'chc-learning':
      return env.CHC_LEARNING;
    case 'chc-images':
      return env.CHC_IMAGES;
    default:
      throw new HttpError(409, 'unsupported_delete_bucket', `Cannot permanently delete objects from bucket ${bucketName}.`);
  }
}

async function handleAdminProcessingFileDelete(
  request: Request,
  env: Env,
  jobId: string,
): Promise<Response> {
  const bearerToken = requireBearerToken(request);
  const preparedRows = await callSupabaseRpc<AdminDeletePrepareRow>(
    env,
    bearerToken,
    'prepare_admin_processing_file_deletion',
    { p_job_id: jobId },
  );

  const prepared = preparedRows[0];
  if (!prepared) {
    throw new HttpError(404, 'processing_job_not_found', 'Processing job not found.');
  }

  const objects = Array.isArray(prepared.objects) ? prepared.objects : [];
  const deletedObjects: AdminDeleteObject[] = [];
  for (const object of objects) {
    const bucketName = typeof object?.bucket === 'string' ? object.bucket.trim() : '';
    const objectPath = typeof object?.path === 'string' ? object.path.trim() : '';

    if (!bucketName || !isValidDeleteObjectPath(objectPath)) {
      throw new HttpError(409, 'invalid_delete_manifest', 'The processing job contains an invalid storage object path.');
    }

    await bucketForAdminDelete(env, bucketName).delete(objectPath);
    deletedObjects.push({ bucket: bucketName, path: objectPath });
  }

  const finalizedRows = await callSupabaseRpc<AdminDeleteFinalizeRow>(
    env,
    bearerToken,
    'finalize_admin_processing_file_deletion',
    { p_job_id: jobId },
  );
  const finalized = finalizedRows[0];

  if (!finalized?.deleted) {
    throw new HttpError(409, 'delete_finalize_failed', 'The storage objects were deleted, but database cleanup could not be finalized.');
  }

  return json({
    jobId,
    deleted: true,
    deletedObjectCount: deletedObjects.length,
    deletedObjects,
    deletedJobCount: Number(finalized.deleted_job_count || 0),
    deletedSubmissionItemCount: Number(finalized.deleted_submission_item_count || 0),
    deletedMediaAssetId: finalized.deleted_media_asset_id ?? null,
    deletedUploadIntentId: finalized.deleted_upload_intent_id ?? null,
  }, env);
}

function parseUploadIntentId(pathname: string): string | null {
  const match = pathname.match(/^\/uploads\/([0-9a-f-]+)$/i);
  const uploadIntentId = match?.[1];

  if (!uploadIntentId || !UUID_PATTERN.test(uploadIntentId)) {
    return null;
  }

  return uploadIntentId;
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(env) });
  }

  const url = new URL(request.url);

  if (url.pathname === '/health' && request.method === 'GET') {
    return json({ ok: true, service: 'chc-upload-authorizer' }, env);
  }

  if (url.pathname === '/uploads/authorize') {
    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, env, { status: 405, headers: { allow: 'POST, OPTIONS' } });
    }

    return handleAuthorize(request, env);
  }

  const multipartRoute = parseMultipartRoute(url.pathname);
  if (multipartRoute) {
    if (multipartRoute.action === 'create') {
      if (request.method !== 'POST') {
        return json({ error: 'method_not_allowed' }, env, { status: 405, headers: { allow: 'POST, OPTIONS' } });
      }
      return handleMultipartCreate(request, env, multipartRoute);
    }

    if (multipartRoute.action === 'part') {
      if (request.method !== 'PUT') {
        return json({ error: 'method_not_allowed' }, env, { status: 405, headers: { allow: 'PUT, OPTIONS' } });
      }
      return handleMultipartPart(request, env, multipartRoute);
    }

    if (multipartRoute.action === 'complete') {
      if (request.method !== 'POST') {
        return json({ error: 'method_not_allowed' }, env, { status: 405, headers: { allow: 'POST, OPTIONS' } });
      }
      return handleMultipartComplete(request, env, multipartRoute);
    }

    if (request.method !== 'DELETE') {
      return json({ error: 'method_not_allowed' }, env, { status: 405, headers: { allow: 'DELETE, OPTIONS' } });
    }
    return handleMultipartAbort(request, env, multipartRoute);
  }

  const adminPreviewItemId = parseAdminPreviewItemId(url.pathname);
  if (adminPreviewItemId) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'method_not_allowed' }, env, { status: 405, headers: { allow: 'GET, HEAD, OPTIONS' } });
    }
    return handleAdminPreview(request, env, adminPreviewItemId);
  }

  const adminDeleteJobId = parseAdminProcessingDeleteJobId(url.pathname);
  if (adminDeleteJobId) {
    if (request.method !== 'DELETE') {
      return json({ error: 'method_not_allowed' }, env, { status: 405, headers: { allow: 'DELETE, OPTIONS' } });
    }
    return handleAdminProcessingFileDelete(request, env, adminDeleteJobId);
  }

  const uploadIntentId = parseUploadIntentId(url.pathname);

  if (uploadIntentId) {
    if (request.method !== 'PUT') {
      return json({ error: 'method_not_allowed' }, env, { status: 405, headers: { allow: 'PUT, OPTIONS' } });
    }

    return handleUpload(request, env, uploadIntentId);
  }

  return json({ error: 'not_found' }, env, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.code, message: error.message }, env, { status: error.status });
      }

      return json({ error: 'internal_error', message: 'Unexpected upload authorizer error.' }, env, { status: 500 });
    }
  },
};
