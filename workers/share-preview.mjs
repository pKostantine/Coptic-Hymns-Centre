const SUPABASE_URL = 'https://wtuujmeinzqfikvuofmh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_H0lG0vRL6io4Uy0htd77Cw_dlNbwx0n';
const MEDIA_BASE_URL = 'https://chc-media-resolver.hrmpdd8d6c.workers.dev';
const SITE_ORIGIN = 'https://coptichymnscentre.com';
const DEFAULT_IMAGE = SITE_ORIGIN + '/apple-touch-icon.png';

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

function resolveImage(asset) {
  if (!asset || typeof asset !== 'object') return DEFAULT_IMAGE;
  if (asset.provider === 'external' && typeof asset.path === 'string') return asset.path;
  const route = PUBLIC_BUCKET_ROUTES[asset.bucket];
  if (asset.provider !== 'cloudflare_r2' || !route || typeof asset.path !== 'string') return DEFAULT_IMAGE;
  const encodedPath = asset.path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${MEDIA_BASE_URL}/${route}/${encodedPath}`;
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

function previewTags({ title, description, image, url }) {
  const pageTitle = title || 'Coptic Hymns Centre';
  const fullTitle = pageTitle.includes('Coptic Hymns Centre')
    ? pageTitle
    : pageTitle + ' — Coptic Hymns Centre';
  const summary = description || 'Coptic hymns, liturgical books, music, and structured learning.';
  const safeTitle = escapeHtml(fullTitle);
  const safeSummary = escapeHtml(summary);
  const safeImage = escapeHtml(image || DEFAULT_IMAGE);
  const safeUrl = escapeHtml(url);

  return [
    '<meta name="description" content="' + safeSummary + '" />',
    '<link rel="canonical" href="' + safeUrl + '" />',
    '<meta property="og:site_name" content="Coptic Hymns Centre" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:title" content="' + safeTitle + '" />',
    '<meta property="og:description" content="' + safeSummary + '" />',
    '<meta property="og:url" content="' + safeUrl + '" />',
    '<meta property="og:image" content="' + safeImage + '" />',
    '<meta property="og:image:alt" content="' + escapeHtml(pageTitle) + '" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + safeTitle + '" />',
    '<meta name="twitter:description" content="' + safeSummary + '" />',
    '<meta name="twitter:image" content="' + safeImage + '" />',
  ].join('\n');
}

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') return response;

    const accept = request.headers.get('accept') || '';
    const contentType = response.headers.get('content-type') || '';
    if (!accept.includes('text/html') && !contentType.includes('text/html')) return response;

    const url = new URL(request.url);
    const preview = await loadPreview(url.pathname);
    const title = preview?.title || 'Coptic Hymns Centre';
    const description = preview?.description || 'Coptic hymns, liturgical books, music, and structured learning.';
    const image = resolveImage(preview?.imageAsset);
    const canonicalUrl = SITE_ORIGIN + url.pathname;
    const tags = previewTags({ title, description, image, url: canonicalUrl });

    const html = await response.text();
    const withTitle = html.replace(
      /<title>[^<]*<\/title>/i,
      '<title>' + escapeHtml(title.includes('Coptic Hymns Centre') ? title : title + ' — Coptic Hymns Centre') + '</title>',
    );
    const shareBlock = /<!-- CHC_SHARE_META_START -->[\s\S]*?<!-- CHC_SHARE_META_END -->/i;
    const markedTags = '<!-- CHC_SHARE_META_START -->\n' + tags + '\n<!-- CHC_SHARE_META_END -->';
    const transformed = shareBlock.test(withTitle)
      ? withTitle.replace(shareBlock, markedTags)
      : withTitle.includes('</head>')
        ? withTitle.replace('</head>', markedTags + '\n</head>')
        : withTitle;

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('Cache-Control', url.pathname === '/' ? 'public, max-age=300' : 'public, max-age=120');

    return new Response(request.method === 'HEAD' ? null : transformed, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
