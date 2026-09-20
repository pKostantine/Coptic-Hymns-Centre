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

function targetPathFromSegments(segments) {
  if (!Array.isArray(segments) || segments.length < 3) return null;

  const [section, kind, id] = segments;
  const valid = (
    (section === 'music' && ['artist', 'release', 'track'].includes(kind))
    || (section === 'learn' && ['cantor', 'album', 'lesson'].includes(kind))
  );

  if (!valid || !/^[0-9a-fA-F-]{36}$/.test(id)) return null;
  return '/' + section + '/' + kind + '/' + id;
}

async function loadPreview(pathname) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_share_preview', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_path: pathname, p_locale: 'en' }),
  });

  if (!response.ok) {
    throw new Error('preview_rpc_' + response.status);
  }

  return response.json();
}

function resolveDirectImage(asset) {
  if (!asset || typeof asset !== 'object') return null;

  if (asset.provider === 'external' && typeof asset.path === 'string') {
    return asset.path;
  }

  const route = PUBLIC_BUCKET_ROUTES[asset.bucket];
  if (asset.provider !== 'cloudflare_r2' || !route || typeof asset.path !== 'string') {
    return null;
  }

  return MEDIA_BASE_URL + '/' + route + '/' + encodeObjectPath(asset.path);
}

function sameOriginProxy(origin, asset) {
  if (!asset || typeof asset !== 'object') return null;
  if (asset.provider !== 'cloudflare_r2' || !PUBLIC_BUCKET_ROUTES[asset.bucket] || !asset.path) return null;

  const params = new URLSearchParams({
    bucket: asset.bucket,
    path: asset.path,
    v: String(asset.id || asset.version || '1'),
  });

  return origin + '/__share-image?' + params.toString();
}

function htmlResponse({ title, description, targetUrl, canonicalUrl, previewUrl, primaryImage, proxyImage, mimeType }) {
  const fullTitle = title.includes('Coptic Hymns Centre')
    ? title
    : title + ' — Coptic Hymns Centre';
  const safeTitle = escapeHtml(fullTitle);
  const safeDescription = escapeHtml(description || 'Coptic Hymns Centre');
  const safeCanonical = escapeHtml(canonicalUrl);
  const safePreview = escapeHtml(previewUrl);
  const safeTarget = escapeHtml(targetUrl);
  const safePrimary = escapeHtml(primaryImage);
  const safeProxy = proxyImage ? escapeHtml(proxyImage) : null;
  const safeMime = mimeType ? escapeHtml(mimeType) : null;

  const secondaryImageTags = safeProxy && safeProxy !== safePrimary
    ? [
        '<meta property="og:image" content="' + safeProxy + '" />',
        '<meta property="og:image:secure_url" content="' + safeProxy + '" />',
      ].join('\n')
    : '';

  return '<!doctype html>\n'
    + '<html lang="en">\n<head>\n'
    + '<meta charset="utf-8" />\n'
    + '<meta name="viewport" content="width=device-width,initial-scale=1" />\n'
    + '<title>' + safeTitle + '</title>\n'
    + '<meta name="description" content="' + safeDescription + '" />\n'
    + '<meta name="robots" content="noindex,follow" />\n'
    + '<link rel="canonical" href="' + safeCanonical + '" />\n'
    + '<link rel="image_src" href="' + safePrimary + '" />\n'
    + '<link rel="icon" href="' + safePrimary + '" />\n'
    + '<link rel="apple-touch-icon" href="' + safePrimary + '" />\n'
    + '<meta property="og:site_name" content="Coptic Hymns Centre" />\n'
    + '<meta property="og:type" content="website" />\n'
    + '<meta property="og:title" content="' + safeTitle + '" />\n'
    + '<meta property="og:description" content="' + safeDescription + '" />\n'
    + '<meta property="og:url" content="' + safePreview + '" />\n'
    + '<meta property="og:image" content="' + safePrimary + '" />\n'
    + '<meta property="og:image:url" content="' + safePrimary + '" />\n'
    + '<meta property="og:image:secure_url" content="' + safePrimary + '" />\n'
    + (safeMime ? '<meta property="og:image:type" content="' + safeMime + '" />\n' : '')
    + '<meta property="og:image:alt" content="' + escapeHtml(title) + '" />\n'
    + secondaryImageTags + (secondaryImageTags ? '\n' : '')
    + '<meta name="twitter:card" content="summary_large_image" />\n'
    + '<meta name="twitter:title" content="' + safeTitle + '" />\n'
    + '<meta name="twitter:description" content="' + safeDescription + '" />\n'
    + '<meta name="twitter:image" content="' + safePrimary + '" />\n'
    + '<meta itemprop="image" content="' + safePrimary + '" />\n'
    + '</head>\n<body style="margin:0;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif">\n'
    + '<main style="max-width:680px;margin:64px auto;padding:24px;text-align:center">\n'
    + '<img src="' + safePrimary + '" alt="" style="width:min(78vw,420px);aspect-ratio:1;object-fit:cover;border-radius:20px" />\n'
    + '<h1 style="font-size:26px;margin:24px 0 8px">' + escapeHtml(title) + '</h1>\n'
    + '<p style="color:#c9d3dc">' + safeDescription + '</p>\n'
    + '<p><a href="' + safeTarget + '" style="color:#d7ad23">Open in Coptic Hymns Centre</a></p>\n'
    + '</main>\n'
    + '<script>window.location.replace(' + JSON.stringify(targetUrl) + ');</script>\n'
    + '</body>\n</html>';
}

export async function onRequest(context) {
  const targetPath = targetPathFromSegments(context.params.path);
  if (!targetPath) return new Response('Not found', { status: 404 });

  let preview;
  try {
    preview = await loadPreview(targetPath);
  } catch {
    return new Response('Unable to load share preview', { status: 502 });
  }

  const url = new URL(context.request.url);
  const origin = url.origin;
  const targetUrl = origin + targetPath;
  const canonicalUrl = targetUrl;
  // Keep the Open Graph identity on the dedicated share URL itself. This
  // prevents link-preview caches from collapsing it back onto the old SPA URL
  // whose generic CHC icon may already be cached.
  const previewUrl = origin + url.pathname + url.search;
  const directImage = resolveDirectImage(preview?.imageAsset);
  const proxyImage = sameOriginProxy(origin, preview?.imageAsset);
  // Prefer a same-origin JPEG/PNG response for Apple LinkPresentation and
  // messaging crawlers. Keep the public media-resolver URL as a second image
  // candidate in case a crawler does not follow the proxy query URL.
  const primaryImage = proxyImage || directImage || origin + '/apple-touch-icon.png';

  const html = htmlResponse({
    title: preview?.title || 'Coptic Hymns Centre',
    description: preview?.description || 'Coptic Hymns Centre',
    targetUrl,
    canonicalUrl,
    previewUrl,
    primaryImage,
    proxyImage: directImage,
    mimeType: preview?.imageAsset?.mimeType || null,
  });

  return new Response(context.request.method === 'HEAD' ? null : html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'public, max-age=0, s-maxage=120',
      'X-CHC-Share-Preview': 'dedicated',
      'X-Robots-Tag': 'noindex',
    },
  });
}
