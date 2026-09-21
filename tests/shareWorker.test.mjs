import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { afterEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';

const workerSource = await readFile(new URL('../workers/web-app/src/index.js', import.meta.url), 'utf8');
const workerModule = await import(
  'data:text/javascript;base64,' + Buffer.from(workerSource).toString('base64')
);
const worker = workerModule.default;

const RELEASE_ID = 'bab96e57-727c-43a9-af88-36a7e6535b4a';
const PLAYLIST_ID = 'a2c69b08-2d9c-4f40-a13c-940f5031b7de';
const ASSET_ID = 'c439ccf6-1662-4bcd-909a-0d24433c6282';
const ASSET_PATH = 'processed/release/version/cover.jpg';
const PREVIEW = {
  title: 'Liturgy with Cantor Ibrahim Ayad',
  description: 'Cantor Ibrahim Ayad',
  imageAsset: {
    id: ASSET_ID,
    provider: 'cloudflare_r2',
    bucket: 'chc-images',
    path: ASSET_PATH,
    mimeType: 'image/jpeg',
  },
};
const APP_SHELL = `<!doctype html>
<html><head>
<title>Coptic Hymns Centre</title>
<!-- CHC_SHARE_META_START -->
<meta property="og:title" content="Coptic Hymns Centre" />
<meta property="og:image" content="https://chc.pierrek.ca/apple-touch-icon.png" />
<!-- CHC_SHARE_META_END -->
</head><body><div id="root"></div></body></html>`;

const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
});

function makeEnv(assetResponse = new Response(APP_SHELL, {
  headers: { 'Content-Type': 'text/html; charset=UTF-8' },
})) {
  const requests = [];
  return {
    requests,
    env: {
      ASSETS: {
        async fetch(request) {
          requests.push(request);
          return assetResponse.clone();
        },
      },
    },
  };
}

function mockPreview(preview = PREVIEW, expectedPath = `/music/release/${RELEASE_ID}`) {
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://wtuujmeinzqfikvuofmh.supabase.co/rest/v1/rpc/get_share_preview');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('accept-profile'), 'public');
    assert.equal(new Headers(init?.headers).get('content-profile'), 'public');
    assert.deepEqual(JSON.parse(init?.body), {
      p_path: expectedPath,
      p_locale: 'en',
    });
    return new Response(JSON.stringify(preview), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

test('dedicated share route returns crawler-ready entity metadata without touching static assets', async () => {
  mockPreview();
  const { env, requests } = makeEnv();
  const request = new Request(
    `https://chc.pierrek.ca/share/music/release/${RELEASE_ID}?v=${ASSET_ID}`,
  );

  const response = await worker.fetch(request, env);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-chc-share-preview'), 'dedicated');
  assert.equal(requests.length, 0);
  assert.match(html, /<meta property="og:type" content="music\.album" \/>/);
  assert.match(html, /<meta property="og:title" content="Liturgy with Cantor Ibrahim Ayad — Coptic Hymns Centre" \/>/);
  assert.match(
    html,
    new RegExp('<meta property="og:image" content="https://chc\\.pierrek\\.ca/__share-image\\?bucket=chc-images&amp;path='),
  );
  assert.doesNotMatch(html, /<meta property="og:image" content="[^"]*apple-touch-icon\.png"/);
  assert.match(html, new RegExp(`window\\.location\\.replace\\("https://chc\\.pierrek\\.ca/music/release/${RELEASE_ID}"\\)`));
});

test('artist and track share routes select their entity-specific Open Graph types and images', async () => {
  const cases = [
    {
      path: '/music/artist/17fb29e5-bb89-4dc3-88c9-139db65371c3',
      title: 'Cantor Tharwat Nady',
      type: 'profile',
    },
    {
      path: '/music/track/41b174ac-e066-4736-92a7-268d581700b6',
      title: 'Taishouri and Hiten',
      type: 'music.song',
    },
  ];

  for (const item of cases) {
    mockPreview({ ...PREVIEW, title: item.title }, item.path);
    const { env, requests } = makeEnv();

    const response = await worker.fetch(
      new Request('https://chc.pierrek.ca/share' + item.path + '?v=' + ASSET_ID),
      env,
    );
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(requests.length, 0);
    assert.match(html, new RegExp(`<meta property="og:type" content="${item.type.replace('.', '\\.')}" \\/>`));
    assert.match(html, new RegExp(`<meta property="og:title" content="${item.title} — Coptic Hymns Centre" \\/>`));
    assert.match(html, /<meta property="og:image" content="https:\/\/chc\.pierrek\.ca\/__share-image\?/);
  }
});

test('public playlist share routes use the visibility-safe playlist preview RPC', async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://wtuujmeinzqfikvuofmh.supabase.co/rest/v1/rpc/get_music_playlist_share_preview');
    assert.deepEqual(JSON.parse(init?.body), { p_playlist_id: PLAYLIST_ID });
    return new Response(JSON.stringify({ ...PREVIEW, title: 'Sunday Liturgy' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const { env, requests } = makeEnv();

  const response = await worker.fetch(
    new Request(`https://chc.pierrek.ca/share/music/playlist/${PLAYLIST_ID}`),
    env,
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(requests.length, 0);
  assert.match(html, /<meta property="og:type" content="music\.playlist" \/>/);
  assert.match(html, /<meta property="og:title" content="Sunday Liturgy — Coptic Hymns Centre" \/>/);
  assert.match(html, new RegExp(`window\\.location\\.replace\\("https://chc\\.pierrek\\.ca/music/playlist/${PLAYLIST_ID}"\\)`));
});

test('private playlist direct route falls back to the SPA shell when no public preview exists', async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://wtuujmeinzqfikvuofmh.supabase.co/rest/v1/rpc/get_music_playlist_share_preview');
    assert.deepEqual(JSON.parse(init?.body), { p_playlist_id: PLAYLIST_ID });
    return new Response('null', {
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const requests = [];
  const env = {
    ASSETS: {
      async fetch(request) {
        const pathname = new URL(request.url).pathname;
        requests.push(pathname);
        if (pathname === '/index.html') {
          return new Response(APP_SHELL, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=UTF-8' },
          });
        }
        return new Response('not found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
        });
      },
    },
  };

  const response = await worker.fetch(
    new Request(`https://chc.pierrek.ca/music/playlist/${PLAYLIST_ID}`),
    env,
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.deepEqual(requests, [
    `/music/playlist/${PLAYLIST_ID}`,
    '/index.html',
  ]);
  assert.match(html, /<div id="root"><\/div>/);
  assert.equal(response.headers.get('x-chc-share-preview'), null);
});

test('direct entity route replaces the generic SPA Open Graph block', async () => {
  mockPreview();
  const { env, requests } = makeEnv();
  const request = new Request(`https://chc.pierrek.ca/music/release/${RELEASE_ID}`);

  const response = await worker.fetch(request, env);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-chc-share-preview'), 'entity');
  assert.equal(requests.length, 1);
  assert.match(html, /<title>Liturgy with Cantor Ibrahim Ayad — Coptic Hymns Centre<\/title>/);
  assert.match(html, /<meta property="og:type" content="music\.album" \/>/);
  assert.doesNotMatch(html, /<meta property="og:title" content="Coptic Hymns Centre" \/>/);
  assert.doesNotMatch(html, /<meta property="og:image" content="https:\/\/chc\.pierrek\.ca\/apple-touch-icon\.png" \/>/);
});

test('share image route proxies the published entity artwork as an inline image', async () => {
  const expectedBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      'https://chc-media-resolver.hrmpdd8d6c.workers.dev/images/processed/release/version/cover.jpg',
    );
    assert.equal(init?.method, 'GET');
    return new Response(expectedBytes, {
      headers: {
        'Content-Length': String(expectedBytes.byteLength),
        'Content-Type': 'image/jpeg',
        ETag: '"art-v1"',
      },
    });
  };
  const { env, requests } = makeEnv();
  const url = new URL('https://chc.pierrek.ca/__share-image');
  url.searchParams.set('bucket', 'chc-images');
  url.searchParams.set('path', ASSET_PATH);
  url.searchParams.set('v', ASSET_ID);

  const response = await worker.fetch(new Request(url), env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('content-disposition'), 'inline');
  assert.equal(response.headers.get('x-chc-share-image'), 'proxied');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), expectedBytes);
  assert.equal(requests.length, 0);
});

test('dedicated share route returns a non-cacheable error instead of poisoning previews with the app logo', async () => {
  console.error = () => {};
  globalThis.fetch = async () => new Response('upstream unavailable', { status: 503 });
  const { env, requests } = makeEnv();

  const response = await worker.fetch(
    new Request(`https://chc.pierrek.ca/share/music/release/${RELEASE_ID}`),
    env,
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-chc-share-preview'), 'error');
  assert.equal(requests.length, 0);
  assert.doesNotMatch(await response.text(), /apple-touch-icon/);
});

test('unrelated routes remain ordinary static asset requests', async () => {
  globalThis.fetch = async () => {
    throw new Error('The metadata API should not run for a static route.');
  };
  const staticResponse = new Response('static asset', { status: 200 });
  const { env, requests } = makeEnv(staticResponse);

  const response = await worker.fetch(new Request('https://chc.pierrek.ca/bible'), env);

  assert.equal(await response.text(), 'static asset');
  assert.equal(requests.length, 1);
});
