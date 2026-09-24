interface R2ObjectBody {
  body: ReadableStream;
  httpEtag: string;
  text(): Promise<string>;
  writeHttpMetadata(headers: Headers): void;
}
interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: string | ArrayBuffer, options?: { httpMetadata?: Record<string, string>; customMetadata?: Record<string, string> }): Promise<unknown>;
}
interface ScheduledEvent {}
interface ExecutionContext { waitUntil(promise: Promise<unknown>): void }

interface Env {
  CHC_CONTENT: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PUBLISH_TOKEN: string;
}

interface SnapshotResource { id: string; version: string }
interface RegistryResource extends SnapshotResource {}
interface RegistryBook { key: string; title: string; titleArabic: string; roots: string[] }
interface Dependency { resource: string; dependency: string }
interface SnapshotRow { row_id: number; row_kind: 'table' | 'rpc'; schema_name: string; object_name: string; args_json: Record<string, unknown> | null; payload: Record<string, unknown> }
interface ChunkManifest { id: string; url: string; size: number; sha256: string; rowCount: number }
interface ResourceManifest { id: string; version: string; dependencies: string[]; size: number; sha256: string; chunks: ChunkManifest[] }

const TARGET_CHUNK_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return hex(await crypto.subtle.digest('SHA-256', buffer));
}

async function gzip(bytes: Uint8Array): Promise<ArrayBuffer> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([buffer]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

async function rpc<T>(env: Env, name: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${name} failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return response.json() as Promise<T>;
}

function resolveGraph(roots: string[], dependencies: Map<string, string[]>): string[] {
  const result: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id) || visiting.has(id)) return;
    visiting.add(id);
    for (const dependency of dependencies.get(id) || []) visit(dependency);
    visiting.delete(id); visited.add(id); result.push(id);
  };
  visit('public');
  for (const root of roots) visit(root);
  return result;
}

async function loadExistingManifest(env: Env): Promise<any | null> {
  const object = await env.CHC_CONTENT.get('manifest.json');
  if (!object) return null;
  try { return JSON.parse(await object.text()); } catch { return null; }
}

function emptyPayload(resource: SnapshotResource, chunkId: string) {
  // Snapshot and resource revisions belong to the signed root manifest, not
  // the immutable row payload. Keeping payload bytes revision-neutral makes
  // unchanged chunks reusable by the next resource version.
  return { formatVersion: 1, snapshotId: '', resourceId: resource.id, version: '', chunkId, tables: [] as { schema: string; table: string; rows: unknown[] }[], rpcResults: [] as unknown[] };
}

function appendRow(target: ReturnType<typeof emptyPayload>, row: SnapshotRow) {
  if (row.row_kind === 'rpc') {
    target.rpcResults.push({ schema: row.schema_name, function: row.object_name, args: row.args_json || {}, data: row.payload });
    return;
  }
  let table = target.tables.find((candidate) => candidate.schema === row.schema_name && candidate.table === row.object_name);
  if (!table) { table = { schema: row.schema_name, table: row.object_name, rows: [] }; target.tables.push(table); }
  table.rows.push(row.payload);
}

function bibleBucket(row: SnapshotRow): string {
  if (row.row_kind !== 'table') return `rpc:${row.schema_name}:${row.object_name}`;
  if (row.object_name === 'books') return 'books';
  const book = String(row.payload.book_key ?? 'unknown');
  const chapter = String(row.payload.chapter_number ?? 'metadata');
  return `${row.object_name}:${book}:${chapter}`;
}

async function stableChunkId(bucket: string, part: number): Promise<string> {
  return `${(await sha256(encoder.encode(bucket))).slice(0, 20)}-${String(part).padStart(3, '0')}`;
}

async function buildResource(
  env: Env,
  snapshotId: string,
  resource: SnapshotResource,
  dependencies: string[],
  previous?: ResourceManifest,
): Promise<ResourceManifest> {
  const chunks: ChunkManifest[] = [];
  let payload = emptyPayload(resource, '');
  let estimate = 0;
  let rowCount = 0;
  let after = 0;
  let bucket = '';
  let bucketPart = 0;

  const flush = async () => {
    if (!rowCount) return;
    payload.chunkId = resource.id === 'bible'
      ? await stableChunkId(bucket, bucketPart)
      : String(chunks.length).padStart(5, '0');
    const raw = encoder.encode(JSON.stringify(payload));
    const digest = await sha256(raw);
    const reusable = previous?.chunks.find((chunk) => chunk.id === payload.chunkId
      && chunk.sha256 === digest && chunk.size === raw.byteLength && chunk.rowCount === rowCount);
    let url = reusable?.url;
    if (!url) {
      const key = `packages/${snapshotId}/${resource.id}/${payload.chunkId}.json`;
      const compressed = await gzip(raw);
      await env.CHC_CONTENT.put(key, compressed, {
        httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip', cacheControl: 'public, max-age=31536000, immutable' },
        customMetadata: { sha256: digest, decodedSize: String(raw.byteLength), rowCount: String(rowCount), resourceVersion: resource.version },
      });
      url = `/${key}`;
    }
    chunks.push({ id: payload.chunkId, url, size: raw.byteLength, sha256: digest, rowCount });
    payload = emptyPayload(resource, ''); estimate = 0; rowCount = 0;
  };

  while (true) {
    const rows = await rpc<SnapshotRow[]>(env, 'get_offline_snapshot_rows', { p_snapshot_id: snapshotId, p_resource_key: resource.id, p_after_row_id: after, p_limit: 1000 });
    if (!rows.length) break;
    for (const row of rows) {
      const rowBytes = JSON.stringify(row.payload).length + JSON.stringify(row.args_json || {}).length + 160;
      const nextBucket = resource.id === 'bible' ? bibleBucket(row) : '';
      const bucketChanged = resource.id === 'bible' && rowCount > 0 && nextBucket !== bucket;
      const sizeExceeded = rowCount > 0 && estimate + rowBytes > TARGET_CHUNK_BYTES;
      if (bucketChanged || sizeExceeded) {
        await flush();
        bucketPart = bucketChanged ? 0 : bucketPart + 1;
      }
      if (!rowCount) bucket = nextBucket;
      appendRow(payload, row); estimate += rowBytes; rowCount += 1; after = row.row_id;
    }
  }
  await flush();
  if (!chunks.length) throw new Error(`Resource ${resource.id} produced no package rows.`);
  const aggregate = encoder.encode(JSON.stringify(chunks.map((chunk) => [chunk.id, chunk.sha256, chunk.rowCount])));
  const manifest: ResourceManifest = { id: resource.id, version: resource.version, dependencies, size: chunks.reduce((sum, chunk) => sum + chunk.size, 0), sha256: await sha256(aggregate), chunks };
  await env.CHC_CONTENT.put(`packages/${snapshotId}/${resource.id}/manifest.json`, JSON.stringify(manifest), { httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=31536000, immutable' } });
  return manifest;
}

async function publish(env: Env): Promise<{ published: boolean; snapshotId: string | null }> {
  const begun = await rpc<{ snapshotId: string | null; resources: SnapshotResource[] }>(env, 'begin_offline_package_snapshot');
  if (!begun.snapshotId || !begun.resources.length) return { published: false, snapshotId: null };
  const snapshotId = begun.snapshotId;
  try {
    const registry = await rpc<{ books: RegistryBook[]; dependencies: Dependency[]; resources: RegistryResource[] }>(env, 'get_offline_package_registry', { p_snapshot_id: snapshotId });
    const dependencyMap = new Map<string, string[]>();
    for (const item of registry.dependencies) dependencyMap.set(item.resource, [...(dependencyMap.get(item.resource) || []), item.dependency]);
    const existing = await loadExistingManifest(env);
    const resourceManifests: Record<string, ResourceManifest> = { ...(existing?.resources || {}) };
    for (const resource of begun.resources) {
      resourceManifests[resource.id] = await buildResource(
        env, snapshotId, resource, dependencyMap.get(resource.id) || [], resourceManifests[resource.id],
      );
    }
    for (const resource of registry.resources) {
      if (!resourceManifests[resource.id] || resourceManifests[resource.id].version !== resource.version) throw new Error(`No published package exists for ${resource.id}@${resource.version}.`);
    }
    const books = Object.fromEntries(registry.books.map((book) => [book.key, { key: book.key, title: book.title, titleArabic: book.titleArabic, resources: resolveGraph(book.roots, dependencyMap) }]));
    const manifest = { formatVersion: 1, snapshotId, publishedAt: new Date().toISOString(), books, resources: resourceManifests };
    // This final single-object write is the publication point. Until it
    // succeeds every client continues to see the preceding consistent root.
    await env.CHC_CONTENT.put('manifest.json', JSON.stringify(manifest), { httpMetadata: { contentType: 'application/json', cacheControl: 'no-cache' } });
    await rpc(env, 'finish_offline_package_snapshot', { p_snapshot_id: snapshotId, p_success: true, p_error: null });
    return { published: true, snapshotId };
  } catch (error) {
    await rpc(env, 'finish_offline_package_snapshot', { p_snapshot_id: snapshotId, p_success: false, p_error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
    throw error;
  }
}

async function serveObject(env: Env, key: string): Promise<Response> {
  const object = await env.CHC_CONTENT.get(key);
  if (!object) return json({ error: 'not_found' }, 404);
  const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('etag', object.httpEtag);
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/manifest.json') return serveObject(env, 'manifest.json');
    if (request.method === 'GET' && url.pathname.startsWith('/packages/')) return serveObject(env, url.pathname.slice(1));
    if (request.method === 'POST' && url.pathname === '/publish') {
      if (request.headers.get('authorization') !== `Bearer ${env.PUBLISH_TOKEN}`) return json({ error: 'unauthorized' }, 401);
      try { return json(await publish(env)); } catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 500); }
    }
    return json({ error: 'not_found' }, 404);
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(publish(env).catch((error) => console.error('Content publication failed', error)));
  },
};
