const SUPABASE_URL = 'https://wtuujmeinzqfikvuofmh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_H0lG0vRL6io4Uy0htd77Cw_dlNbwx0n';
const MEDIA_BASE_URL = 'https://chc-media-resolver.hrmpdd8d6c.workers.dev';
const APP_NAME = 'Coptic Hymns Centre';
const DEFAULT_DESCRIPTION = 'Coptic hymns, liturgical books, music, and structured learning.';

const PUBLIC_BUCKET_ROUTES = {
  'chc-music': 'music',
  'chc-learning': 'learning',
  'chc-images': 'images',
};

const ENTITY_KINDS = {
  music: {
    artist: 'profile',
    playlist: 'music.playlist',
    release: 'music.album',
    track: 'music.song',
  },
  learn: {
    cantor: 'profile',
    album: 'website',
    lesson: 'website',
  },
};

const UUID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const ENTITY_PATH_PATTERN = new RegExp(
  '^/(share/)?(music|learn)/([^/]+)/(' + UUID_PATTERN + ')/?$',
);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseEntityPath(pathname) {
  const match = ENTITY_PATH_PATTERN.exec(pathname);
  if (!match) return null;

  const [, sharePrefix, section, kind, id] = match;
  const ogType = ENTITY_KINDS[section]?.[kind];
  if (!ogType) return null;

  return {
    dedicated: Boolean(sharePrefix),
    id,
    kind,
    ogType,
    path: '/' + section + '/' + kind + '/' + id,
    section,
  };
}

function encodeObjectPath(path) {
  const segments = String(path || '').split('/').filter(Boolean);
  if (
    segments.length === 0
    || segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\\') || segment.includes('\0'))
  ) {
    return null;
  }

  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

function previewLocale(url) {
  return url.searchParams.get('lang') === 'ar' ? 'ar' : 'en';
}

async function loadPreview(target, locale) {
  const playlist = target.section === 'music' && target.kind === 'playlist';
  const rpc = playlist ? 'get_music_playlist_share_preview' : 'get_share_preview';
  const body = playlist
    ? { p_playlist_id: target.id }
    : { p_path: target.path, p_locale: locale };
  const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + rpc, {
    method: 'POST',
    headers: {
      'Accept-Profile': 'public',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      'Content-Profile': 'public',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error('preview_rpc_' + response.status);
  }

  const preview = await response.json();
  if (!preview || typeof preview !== 'object') {
    throw new Error('preview_rpc_invalid_payload');
  }

  return preview;
}

function resolveDirectImage(asset) {
  if (!asset || typeof asset !== 'object') return null;

  if (asset.provider === 'external' && typeof asset.path === 'string') {
    try {
      const externalUrl = new URL(asset.path);
      return externalUrl.protocol === 'https:' ? externalUrl.toString() : null;
    } catch {
      return null;
    }
  }

  const route = PUBLIC_BUCKET_ROUTES[asset.bucket];
  const encodedPath = encodeObjectPath(asset.path);
  if (asset.provider !== 'cloudflare_r2' || !route || !encodedPath) return null;

  return MEDIA_BASE_URL + '/' + route + '/' + encodedPath;
}

function sameOriginImage(origin, asset) {
  if (!asset || typeof asset !== 'object') return null;
  if (
    asset.provider !== 'cloudflare_r2'
    || !PUBLIC_BUCKET_ROUTES[asset.bucket]
    || !encodeObjectPath(asset.path)
  ) {
    return null;
  }

  const params = new URLSearchParams({
    bucket: asset.bucket,
    path: asset.path,
    v: String(asset.id || asset.version || '1'),
  });

  return origin + '/__share-image?' + params.toString();
}

function buildMetadata({ canonicalUrl, description, directImage, imageUrl, mimeType, ogType, previewUrl, title }) {
  const pageTitle = title || APP_NAME;
  const fullTitle = pageTitle.includes(APP_NAME) ? pageTitle : pageTitle + ' — ' + APP_NAME;
  const summary = description?.trim() || DEFAULT_DESCRIPTION;
  const safeTitle = escapeHtml(fullTitle);
  const safeSummary = escapeHtml(summary);
  const safeCanonical = escapeHtml(canonicalUrl);
  const safePreview = escapeHtml(previewUrl);
  const safeImage = escapeHtml(imageUrl);
  const safeDirectImage = directImage && directImage !== imageUrl ? escapeHtml(directImage) : null;
  const safeMime = mimeType ? escapeHtml(mimeType) : null;

  const tags = [
    '<meta name="description" content="' + safeSummary + '" />',
    '<link rel="canonical" href="' + safeCanonical + '" />',
    '<link rel="image_src" href="' + safeImage + '" />',
    '<meta property="og:site_name" content="' + APP_NAME + '" />',
    '<meta property="og:type" content="' + escapeHtml(ogType || 'website') + '" />',
    '<meta property="og:title" content="' + safeTitle + '" />',
    '<meta property="og:description" content="' + safeSummary + '" />',
    '<meta property="og:url" content="' + safePreview + '" />',
    '<meta property="og:image" content="' + safeImage + '" />',
    '<meta property="og:image:url" content="' + safeImage + '" />',
    '<meta property="og:image:secure_url" content="' + safeImage + '" />',
    safeMime ? '<meta property="og:image:type" content="' + safeMime + '" />' : '',
    '<meta property="og:image:alt" content="' + escapeHtml(pageTitle) + '" />',
    safeDirectImage ? '<meta property="og:image" content="' + safeDirectImage + '" />' : '',
    safeDirectImage ? '<meta property="og:image:secure_url" content="' + safeDirectImage + '" />' : '',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + safeTitle + '" />',
    '<meta name="twitter:description" content="' + safeSummary + '" />',
    '<meta name="twitter:image" content="' + safeImage + '" />',
    '<meta name="twitter:image:alt" content="' + escapeHtml(pageTitle) + '" />',
    '<meta itemprop="image" content="' + safeImage + '" />',
  ].filter(Boolean).join('\n');

  return { fullTitle, pageTitle, safeSummary, tags };
}

function entityMetadata(url, target, preview) {
  const canonicalUrl = url.origin + target.path;
  const previewUrl = target.dedicated
    ? url.origin + url.pathname + url.search
    : canonicalUrl;
  const directImage = resolveDirectImage(preview.imageAsset);
  const proxiedImage = sameOriginImage(url.origin, preview.imageAsset);
  const imageUrl = proxiedImage || directImage || url.origin + '/apple-touch-icon.png';

  return {
    canonicalUrl,
    directImage,
    imageUrl,
    metadata: buildMetadata({
      canonicalUrl,
      description: preview.description,
      directImage,
      imageUrl,
      mimeType: preview.imageAsset?.mimeType || null,
      ogType: target.ogType,
      previewUrl,
      title: preview.title,
    }),
    previewUrl,
    targetUrl: canonicalUrl,
  };
}

function dedicatedShareResponse(request, entity) {
  const { metadata, imageUrl, targetUrl } = entity;
  const safeTarget = escapeHtml(targetUrl);
  const safeImage = escapeHtml(imageUrl);
  const html = '<!doctype html>\n'
    + '<html lang="en">\n<head>\n'
    + '<meta charset="utf-8" />\n'
    + '<meta name="viewport" content="width=device-width,initial-scale=1" />\n'
    + '<title>' + escapeHtml(metadata.fullTitle) + '</title>\n'
    + '<meta name="robots" content="noindex,follow" />\n'
    + '<link rel="icon" href="' + safeImage + '" />\n'
    + '<link rel="apple-touch-icon" href="' + safeImage + '" />\n'
    + '<!-- CHC_SHARE_META_START -->\n' + metadata.tags + '\n<!-- CHC_SHARE_META_END -->\n'
    + '</head>\n<body style="margin:0;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif">\n'
    + '<main style="max-width:680px;margin:64px auto;padding:24px;text-align:center">\n'
    + '<img src="' + safeImage + '" alt="" style="width:min(78vw,420px);aspect-ratio:1;object-fit:cover;border-radius:20px" />\n'
    + '<h1 style="font-size:26px;margin:24px 0 8px">' + escapeHtml(metadata.pageTitle) + '</h1>\n'
    + '<p style="color:#c9d3dc">' + metadata.safeSummary + '</p>\n'
    + '<p><a href="' + safeTarget + '" style="color:#d7ad23">Open in ' + APP_NAME + '</a></p>\n'
    + '</main>\n'
    + '<script>window.location.replace(' + JSON.stringify(targetUrl) + ');</script>\n'
    + '<noscript><meta http-equiv="refresh" content="0;url=' + safeTarget + '" /></noscript>\n'
    + '</body>\n</html>';

  return new Response(request.method === 'HEAD' ? null : html, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=60',
      'Content-Type': 'text/html; charset=UTF-8',
      'X-CHC-Share-Preview': 'dedicated',
      'X-Robots-Tag': 'noindex',
    },
  });
}

async function getAppShell(request, env) {
  let response = await env.ASSETS.fetch(request);
  const contentType = response.headers.get('content-type') || '';
  if (response.ok && contentType.includes('text/html')) return response;

  const indexUrl = new URL('/index.html', request.url);
  response = await env.ASSETS.fetch(new Request(indexUrl, request));
  return response;
}

async function entityAppResponse(request, env, entity) {
  const response = await getAppShell(request, env);
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('text/html')) return response;

  const html = await response.text();
  const shareBlock = /<!-- CHC_SHARE_META_START -->[\s\S]*?<!-- CHC_SHARE_META_END -->/i;
  const markedTags = '<!-- CHC_SHARE_META_START -->\n'
    + entity.metadata.tags
    + '\n<!-- CHC_SHARE_META_END -->';
  let transformed = html.replace(
    /<title>[^<]*<\/title>/i,
    '<title>' + escapeHtml(entity.metadata.fullTitle) + '</title>',
  );
  transformed = shareBlock.test(transformed)
    ? transformed.replace(shareBlock, markedTags)
    : transformed.replace('</head>', markedTags + '\n</head>');

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('etag');
  headers.set('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=60');
  headers.set('X-CHC-Share-Preview', 'entity');

  return new Response(request.method === 'HEAD' ? null : transformed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function shareImageResponse(request, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const bucket = url.searchParams.get('bucket');
  const route = PUBLIC_BUCKET_ROUTES[bucket];
  const objectPath = encodeObjectPath(url.searchParams.get('path'));
  if (!route || !objectPath) return new Response('Not found', { status: 404 });

  const upstream = await fetch(MEDIA_BASE_URL + '/' + route + '/' + objectPath, {
    method: request.method,
    headers: {
      Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8,*/*;q=0.5',
      'User-Agent': 'CHC-Link-Preview/3.0',
    },
  });

  if (!upstream.ok) {
    return new Response('Image unavailable', {
      status: upstream.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const contentType = upstream.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('image/')) {
    return new Response('Invalid image response', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
  headers.set('Content-Disposition', 'inline');
  headers.set('Content-Type', contentType);
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set('X-CHC-Share-Image', 'proxied');
  headers.set('X-Content-Type-Options', 'nosniff');
  for (const header of ['content-length', 'etag', 'last-modified']) {
    const value = upstream.headers.get(header);
    if (value) headers.set(header, value);
  }

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: 200,
    headers,
  });
}

function previewFailureResponse(error) {
  console.error('Unable to load entity share preview', error);
  return new Response('Unable to load share preview', {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=UTF-8',
      'Retry-After': '30',
      'X-CHC-Share-Preview': 'error',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/__share-image') {
      return shareImageResponse(request, url);
    }

    const target = parseEntityPath(url.pathname);
    if (!target || (request.method !== 'GET' && request.method !== 'HEAD')) {
      return env.ASSETS.fetch(request);
    }

    let preview;
    try {
      preview = await loadPreview(target, previewLocale(url));
    } catch (error) {
      if (target.dedicated) return previewFailureResponse(error);
      return env.ASSETS.fetch(request);
    }

    const entity = entityMetadata(url, target, preview);
    return target.dedicated
      ? dedicatedShareResponse(request, entity)
      : entityAppResponse(request, env, entity);
  },
};
