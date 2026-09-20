const MEDIA_BASE_URL = 'https://chc-media-resolver.hrmpdd8d6c.workers.dev';

const PUBLIC_BUCKET_ROUTES = {
  'chc-music': 'music',
  'chc-learning': 'learning',
  'chc-images': 'images',
};

function encodeObjectPath(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const bucket = url.searchParams.get('bucket');
  const objectPath = url.searchParams.get('path');
  const route = PUBLIC_BUCKET_ROUTES[bucket];

  if (!route || !objectPath) {
    return new Response('Not found', { status: 404 });
  }

  const mediaUrl = MEDIA_BASE_URL + '/' + route + '/' + encodeObjectPath(objectPath);
  const upstream = await fetch(mediaUrl, {
    headers: {
      'User-Agent': 'CHC-Link-Preview/2.0',
      Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8,*/*;q=0.5',
    },
  });

  if (!upstream.ok) {
    return new Response('Image unavailable', { status: upstream.status });
  }

  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);
  headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('X-Content-Type-Options', 'nosniff');

  return new Response(context.request.method === 'HEAD' ? null : upstream.body, {
    status: 200,
    headers,
  });
}
