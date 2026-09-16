import { mediaService } from '@/services/mediaService';
import type {
  MusicConsumerArtist,
  MusicConsumerAsset,
  MusicConsumerRelease,
  MusicHomePayload,
  MusicSearchPayload,
  PublishedTrackLyricsPayload,
} from '@/types/musicConsumer';
import type { MusicLyricKind } from '@/types/mediaPlatform';
import { supabase } from '@/utils/supabase';

function assertRpcData<T>(data: T | null, error: { message: string } | null, operation: string): T {
  if (error) {
    throw new Error(`${operation}: ${error.message}`);
  }
  if (data == null) {
    throw new Error(`${operation}: no data returned.`);
  }
  return data;
}

export function resolveMusicAsset(asset: MusicConsumerAsset | null | undefined): string | null {
  if (!asset || !mediaService.canResolve(asset)) return null;
  return mediaService.resolve(asset);
}

export async function getMusicHome(locale = 'en'): Promise<MusicHomePayload> {
  const { data, error } = await supabase.rpc('get_music_home', { p_locale: locale });
  return assertRpcData(data as MusicHomePayload | null, error, 'Load music home');
}

export async function getMusicRelease(releaseId: string): Promise<MusicConsumerRelease> {
  const { data, error } = await supabase.rpc('get_published_music_release', { p_release_id: releaseId });
  return assertRpcData(data as MusicConsumerRelease | null, error, 'Load release');
}

export async function getMusicArtist(artistId: string, locale = 'en'): Promise<MusicConsumerArtist> {
  const { data, error } = await supabase.rpc('get_published_music_artist', {
    p_artist_id: artistId,
    p_locale: locale,
  });
  return assertRpcData(data as MusicConsumerArtist | null, error, 'Load artist');
}

export async function searchMusic(query: string, locale = 'en'): Promise<MusicSearchPayload> {
  const normalized = query.trim();
  if (!normalized) return { artists: [], releases: [], tracks: [] };

  const { data, error } = await supabase.rpc('search_published_music', {
    p_query: normalized,
    p_locale: locale,
  });
  return assertRpcData(data as MusicSearchPayload | null, error, 'Search music');
}

export async function getTrackLyrics(
  trackId: string,
  locale?: string | null,
  kind?: MusicLyricKind | null,
): Promise<PublishedTrackLyricsPayload> {
  const { data, error } = await supabase.rpc('get_published_track_lyrics', {
    p_track_id: trackId,
    p_locale: locale ?? null,
    p_kind: kind ?? null,
  });
  return assertRpcData(data as PublishedTrackLyricsPayload | null, error, 'Load synchronized lyrics');
}

export const musicService = {
  getHome: getMusicHome,
  getRelease: getMusicRelease,
  getArtist: getMusicArtist,
  search: searchMusic,
  getLyrics: getTrackLyrics,
  resolveAsset: resolveMusicAsset,
} as const;
