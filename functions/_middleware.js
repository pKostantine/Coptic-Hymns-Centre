const SUPABASE_URL = 'https://wtuujmeinzqfikvuofmh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_H0lG0vRL6io4Uy0htd77Cw_dlNbwx0n';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isPreviewRoute(pathname) {
  return /^\/music\/(artist|release|track)\/[0-9a-fA-F-]{36}\/?$/.test(pathname)
    || /^\/learn\/(cantor|album|lesson)\/[0-9a-fA-F-]{36}\/?$/.test(pathname);
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

function shareImageUrl(origin, asset) {
  if (!asset || typeof asset !== 'object') return origin + '/apple-touch-icon.png';

  if (asset.provider === 'external' && typeof asset.path === 'string') {
    return asset.path;
  }

  if (
    asset.provider !== 'cloudflare_r2'
    || typeof asset.bucket !== 'string'
    || typeof asset.path !== 'string'
  ) {
    return origin + '/apple-touch-icon.png';
  }

  const params = new URLSearchParams({
    bucket: asset.bucket,
    path: asset.path,
    v: String(asset.id || '1'),
  });

  return origin + '/__share-image?' + params.toString();
}

function buildTags({ title, description, canonicalUrl, imageUrl, imageType }) {
  const pageTitle = title || 'Coptic Hymns Centre';
  const fullTitle = pageTitle.includes('Coptic Hymns Centre')
    ? pageTitle
    : pageTitle + ' — Coptic Hymns Centre';
  const summary = description || 'Coptic Hymns Centre';

  return [
    '<meta name="description" content="' + escapeHtml(summary) + '" />',
    '<link rel="canonical" href="' + escapeHtml(canonicalUrl) + '" />',
    '<meta property="og:site_name" content="Coptic Hymns Centre" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:title" content="' + escapeHtml(fullTitle) + '" />',
    '<meta property="og:description" content="' + escapeHtml(summary) + '" />',
    '<meta property="og:url" content="' + escapeHtml(canonicalUrl) + '" />',
    '<meta property="og:image" content="' + escapeHtml(imageUrl) + '" />',
    '<meta property="og:image:secure_url" content="' + escapeHtml(imageUrl) + '" />',
    imageType ? '<meta property="og:image:type" content="' + escapeHtml(imageType) + '" />' : '',
    '<meta property="og:image:alt" content="' + escapeHtml(pageTitle) + '" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + escapeHtml(fullTitle) + '" />',
    '<meta name="twitter:description" content="' + escapeHtml(summary) + '" />',
    '<meta name="twitter:image" content="' + escapeHtml(imageUrl) + '" />',
  ].filter(Boolean).join('\n');
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (!isPreviewRoute(url.pathname)) {
    return context.next();
  }

  let preview;
  try {
    preview = await loadPreview(url.pathname);
  } catch {
    return context.next();
  }

  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const canonicalUrl = url.origin + url.pathname;
  const imageUrl = shareImageUrl(url.origin, preview?.imageAsset);
  const tags = buildTags({
    title: preview?.title,
    description: preview?.description,
    canonicalUrl,
    imageUrl,
    imageType: preview?.imageAsset?.mimeType || null,
  });

  const html = await response.text();
  const fullTitle = preview?.title
    ? (preview.title.includes('Coptic Hymns Centre')
      ? preview.title
      : preview.title + ' — Coptic Hymns Centre')
    : 'Coptic Hymns Centre';

  let transformed = html.replace(
    /<title>[^<]*<\/title>/i,
    '<title>' + escapeHtml(fullTitle) + '</title>',
  );

  const shareBlock = /<!-- CHC_SHARE_META_START -->[\s\S]*?<!-- CHC_SHARE_META_END -->/i;
  const markedTags = '<!-- CHC_SHARE_META_START -->\n' + tags + '\n<!-- CHC_SHARE_META_END -->';

  transformed = shareBlock.test(transformed)
    ? transformed.replace(shareBlock, markedTags)
    : transformed.replace('</head>', markedTags + '\n</head>');

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('etag');
  headers.set('Cache-Control', 'public, max-age=0, s-maxage=120');
  headers.set('X-CHC-Share-Preview', 'entity');

  return new Response(context.request.method === 'HEAD' ? null : transformed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
