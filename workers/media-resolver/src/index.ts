interface Env {
  CHC_MUSIC: R2Bucket;
  CHC_LEARNING: R2Bucket;
  CHC_IMAGES: R2Bucket;
  PUBLIC_CACHE_CONTROL?: string;
}

interface R2Bucket {
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | R2Object | null>;
  head(key: string): Promise<R2Object | null>;
}

interface R2GetOptions {
  onlyIf?: Headers;
  range?: Headers;
}

interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}

interface R2Object {
  key: string;
  size: number;
  httpEtag: string;
  range?: R2Range;
  writeHttpMetadata(headers: Headers): void;
}

interface R2ObjectBody extends R2Object {
  body: ReadableStream;
}

type PublicBucketSegment = 'music' | 'learning' | 'images';

const PUBLIC_BUCKETS: Record<PublicBucketSegment, keyof Env> = {
  music: 'CHC_MUSIC',
  learning: 'CHC_LEARNING',
  images: 'CHC_IMAGES',
};

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'Range, If-Match, If-None-Match, If-Modified-Since, If-Unmodified-Since',
  'access-control-expose-headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag',
  'access-control-max-age': '86400',
};

function json(body: unknown, init?: ResponseInit): Response {
  const headers = withCors(new Headers(init?.headers));
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function withCors(headers: Headers): Headers {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }

  return headers;
}

function parseRequestPath(pathname: string): { segment: PublicBucketSegment; key: string } | null {
  const [segment, ...keyParts] = pathname.replace(/^\/+/, '').split('/');

  if (!isPublicBucketSegment(segment)) {
    return null;
  }

  const key = keyParts.join('/');

  if (!isValidObjectKey(key)) {
    return null;
  }

  return { segment, key };
}

function isPublicBucketSegment(value: string | undefined): value is PublicBucketSegment {
  return value === 'music' || value === 'learning' || value === 'images';
}

function isValidObjectKey(key: string): boolean {
  return key.length > 0 && key.length <= 1024 && !key.includes('..') && !key.includes('\\') && !key.startsWith('/');
}

function applyObjectHeaders(headers: Headers, object: R2Object, env: Env): void {
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('x-content-type-options', 'nosniff');

  if (!headers.has('cache-control')) {
    headers.set('cache-control', env.PUBLIC_CACHE_CONTROL ?? 'public, max-age=31536000, immutable');
  }
}

function getRangeContentLength(object: R2Object): number {
  if (!object.range) {
    return object.size;
  }

  if (typeof object.range.length === 'number') {
    return object.range.length;
  }

  if (typeof object.range.suffix === 'number') {
    return Math.min(object.range.suffix, object.size);
  }

  if (typeof object.range.offset === 'number') {
    return Math.max(object.size - object.range.offset, 0);
  }

  return object.size;
}

function getContentRange(object: R2Object): string | null {
  if (!object.range) {
    return null;
  }

  const length = getRangeContentLength(object);
  const offset =
    typeof object.range.offset === 'number'
      ? object.range.offset
      : Math.max(object.size - length, 0);

  if (length === 0) {
    return `bytes */${object.size}`;
  }

  const end = Math.min(offset + length - 1, object.size - 1);

  return `bytes ${offset}-${end}/${object.size}`;
}

async function handleMediaRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: withCors(new Headers()) });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'method_not_allowed' }, { status: 405, headers: { allow: 'GET, HEAD, OPTIONS' } });
  }

  const url = new URL(request.url);

  if (url.pathname === '/health') {
    return json({ ok: true, service: 'chc-media-resolver' });
  }

  const resolvedPath = parseRequestPath(url.pathname);

  if (!resolvedPath) {
    return json({ error: 'not_found' }, { status: 404 });
  }

  const bucket = env[PUBLIC_BUCKETS[resolvedPath.segment]] as R2Bucket;

  if (request.method === 'HEAD') {
    const object = await bucket.head(resolvedPath.key);

    if (!object) {
      return json({ error: 'not_found' }, { status: 404 });
    }

    const headers = withCors(new Headers());
    applyObjectHeaders(headers, object, env);
    headers.set('content-length', String(object.size));

    return new Response(null, { headers });
  }

  const object = await bucket.get(resolvedPath.key, {
    onlyIf: request.headers,
    range: request.headers,
  });

  if (!object) {
    return json({ error: 'not_found' }, { status: 404 });
  }

  const headers = withCors(new Headers());
  applyObjectHeaders(headers, object, env);

  if (!('body' in object) || !object.body) {
    return new Response(null, { status: 304, headers });
  }

  const contentRange = getContentRange(object);
  const status = contentRange ? 206 : 200;

  headers.set('content-length', String(getRangeContentLength(object)));

  if (contentRange) {
    headers.set('content-range', contentRange);
  }

  return new Response(object.body, { status, headers });
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleMediaRequest(request, env);
  },
};
