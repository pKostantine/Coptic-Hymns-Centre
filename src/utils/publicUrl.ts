import { Platform } from 'react-native';

export const DEFAULT_PUBLIC_ORIGIN = 'https://chc.pierrek.ca';

export function getPublicOrigin(): string {
  if (Platform.OS === 'web') {
    const webGlobal = globalThis as typeof globalThis & {
      location?: { origin?: string };
    };
    const origin = webGlobal.location?.origin;
    if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/$/, '');
  }
  return DEFAULT_PUBLIC_ORIGIN;
}

export function publicUrl(path = '/'): string {
  const normalized = path.startsWith('/') ? path : '/' + path;
  return getPublicOrigin() + normalized;
}
