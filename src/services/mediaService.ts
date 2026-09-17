import type { MediaAssetReference } from '@/types/mediaPlatform';

export type PublicMediaBucket = 'chc-music' | 'chc-learning' | 'chc-images';

const PUBLIC_BUCKET_ROUTES: Record<PublicMediaBucket, string> = {
  'chc-music': 'music',
  'chc-learning': 'learning',
  'chc-images': 'images',
};

function getMediaBaseUrl(): string {
  const baseUrl = process.env.EXPO_PUBLIC_CHC_MEDIA_BASE_URL?.replace(/\/+$/, '');

  if (!baseUrl) {
    throw new Error('Missing EXPO_PUBLIC_CHC_MEDIA_BASE_URL for CHC media resolution.');
  }

  return baseUrl;
}

function isPublicMediaBucket(bucket: string): bucket is PublicMediaBucket {
  return bucket === 'chc-music' || bucket === 'chc-learning' || bucket === 'chc-images';
}

function encodeObjectPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function canResolvePublicMediaAsset(asset: MediaAssetReference): boolean {
  return asset.provider === 'external' || (asset.provider === 'cloudflare_r2' && isPublicMediaBucket(asset.bucket));
}

export function resolveMediaAsset(asset: MediaAssetReference): string {
  if (asset.provider === 'external') {
    return asset.path;
  }

  if (asset.provider !== 'cloudflare_r2') {
    throw new Error(`Unsupported media provider: ${asset.provider}`);
  }

  if (!isPublicMediaBucket(asset.bucket)) {
    throw new Error(`R2 bucket is not publicly resolvable through the CHC media service: ${asset.bucket}`);
  }

  return `${getMediaBaseUrl()}/${PUBLIC_BUCKET_ROUTES[asset.bucket]}/${encodeObjectPath(asset.path)}`;
}

export const mediaService = {
  canResolve: canResolvePublicMediaAsset,
  resolve: resolveMediaAsset,
} as const;
