const SUPABASE_URL = 'https://wtuujmeinzqfikvuofmh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_H0lG0vRL6io4Uy0htd77Cw_dlNbwx0n';
const MEDIA_BASE_URL = 'https://chc-media-resolver.hrmpdd8d6c.workers.dev';

const PUBLIC_BUCKET_ROUTES = {
  'chc-music': 'music',
  'chc-learning': 'learning',
  'chc-images': 'images',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function encodeObjectPath(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function loadPreview(pathname) {
  try {
    const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_share_preview', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_path: pathname, p_locale: 'en' }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function sameOriginImageUrl(origin, asset) {
  if (!asset || typeof asset !== 'object') {
    return origin + '/apple-touch-icon.png';
  }

  if (asset.provider === 'external' && typeof asset.path === 'string') {
    return asset.path;
  }

  if (
    asset.provider !== 'cloudflare_r2'
    || !PUBLIC_BUCKET_ROUTES[asset.bucket]
    || typeof asset.path !== 'string'
  ) {
    return origin + '/apple-touch-icon.png';
  }

  const params = new URLSearchParams({
    bucket: asset.bucket,
    path: asset.path,
  });
  return origin + '/__share-image?' + params.toString();
}

async function proxyShareImage(requestUrl) {
  const bucket = requestUrl.searchParams.get('bucket');
  const objectPath = requestUrl.searchParams.get('path');
  const route = PUBLIC_BUCKET_ROUTES[bucket];

  if (!route || !objectPath) return new Response('Not found', { status: 404 });

  const mediaUrl = MEDIA_BASE_URL + '/' + route + '/' + encodeObjectPath(objectPath);
  const mediaResponse = await fetch(mediaUrl, {
    headers: {
      'User-Agent': 'CHC-Link-Preview/1.0',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
  });

  if (!mediaResponse.ok) {
    return new Response('Image unavailable', { status: mediaResponse.status });
  }

  const headers = new Headers();
  const contentType = mediaResponse.headers.get('content-type');
  const contentLength = mediaResponse.headers.get('content-length');
  if (contentType) headers.set('Content-Type', contentType);
  if (contentLength) headers.set('Content-Length', contentLength);
  headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(mediaResponse.body, {
    status: 200,
    headers,
  });
}

function previewTags({ title, description, image, canonicalUrl, imageType }) {
  const pageTitle = title || 'Coptic Hymns Centre';
  const fullTitle = pageTitle.includes('Coptic Hymns Centre')
    ? pageTitle
    : pageTitle + ' — Coptic Hymns Centre';
  const summary = description || 'Coptic hymns, liturgical books, music, and structured learning.';
  const safeTitle = escapeHtml(fullTitle);
  const safeSummary = escapeHtml(summary);
  const safeImage = escapeHtml(image);
  const safeUrl = escapeHtml(canonicalUrl);

  return [
    '<meta name="description" content="' + safeSummary + '" />',
    '<link rel="canonical" href="' + safeUrl + '" />',
    '<meta property="og:site_name" content="Coptic Hymns Centre" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:title" content="' + safeTitle + '" />',
    '<meta property="og:description" content="' + safeSummary + '" />',
    '<meta property="og:url" content="' + safeUrl + '" />',
    '<meta property="og:image" content="' + safeImage + '" />',
    '<meta property="og:image:secure_url" content="' + safeImage + '" />',
    imageType ? '<meta property="og:image:type" content="' + escapeHtml(imageType) + '" />' : '',
    '<meta property="og:image:alt" content="' + escapeHtml(pageTitle) + '" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + safeTitle + '" />',
    '<meta name="twitter:description" content="' + safeSummary + '" />',
    '<meta name="twitter:image" content="' + safeImage + '" />',
  ].filter(Boolean).join('\n');
}

export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);

  // Social crawlers are much more reliable when artwork is available from the
  // same host as the shared page, so proxy the published R2 image through CHC.
  if (requestUrl.pathname === '/__share-image') {
    return proxyShareImage(requestUrl);
  }

  const response = await context.next();
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return response;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const preview = await loadPreview(requestUrl.pathname);
  const origin = requestUrl.origin;
  const canonicalUrl = origin + requestUrl.pathname;
  const title = preview?.title || 'Coptic Hymns Centre';
  const description = preview?.description
    || 'Coptic hymns, liturgical books, music, and structured learning.';
  const image = sameOriginImageUrl(origin, preview?.imageAsset);
  const imageType = preview?.imageAsset?.mimeType || null;
  const tags = previewTags({ title, description, image, canonicalUrl, imageType });

  const html = await response.text();
  const fullTitle = title.includes('Coptic Hymns Centre')
    ? title
    : title + ' — Coptic Hymns Centre';

  let transformed = html.replace(
    /<title>[^<]*<\/title>/i,
    '<title>' + escapeHtml(fullTitle) + '</title>',
  );

  const shareBlock = /<!-- CHC_SHARE_META_START -->[\s\S]*?<!-- CHC_SHARE_META_END -->/i;
  const markedTags = '<!-- CHC_SHARE_META_START -->\n' + tags + '\n<!-- CHC_SHARE_META_END -->';

  transformed = shareBlock.test(transformed)
    ? transformed.replace(shareBlock, markedTags)
    : transformed.includes('</head>')
      ? transformed.replace('</head>', markedTags + '\n</head>')
      : transformed;

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('etag');
  headers.set('Cache-Control', 'public, max-age=60, s-maxage=300');

  return new Response(context.request.method === 'HEAD' ? null : transformed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
