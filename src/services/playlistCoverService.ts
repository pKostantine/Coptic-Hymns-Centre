import * as ImagePicker from 'expo-image-picker';

import type { MusicConsumerAsset } from '@/types/musicConsumer';
import { supabase } from '@/utils/supabase';

const BUCKET = 'playlist-covers';
const COVER_OBJECT_NAME = 'cover';
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function inferredMimeType(uri: string): string {
  const clean = uri.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function objectPath(userId: string, playlistId: string): string {
  return `${userId}/${playlistId}/${COVER_OBJECT_NAME}`;
}

export async function pickAndUploadPlaylistCover(
  userId: string,
  playlistId: string,
): Promise<MusicConsumerAsset | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.88,
    exif: false,
  });

  if (result.canceled || !result.assets[0]) return null;

  const selected = result.assets[0];
  const mimeType = (selected.mimeType || inferredMimeType(selected.uri)).toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new Error('Choose a JPEG, PNG, or WebP image for the playlist cover.');
  }

  const response = await fetch(selected.uri);
  if (!response.ok) throw new Error('Unable to read the selected playlist cover.');
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('The selected playlist cover is empty.');
  if (bytes.byteLength > MAX_COVER_BYTES) {
    throw new Error('Playlist covers must be 5 MB or smaller.');
  }

  const path = objectPath(userId, playlistId);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: true,
    });

  if (uploadError) throw new Error(uploadError.message || 'Unable to upload the playlist cover.');

  const { data, error } = await supabase.rpc('set_music_playlist_cover', {
    p_playlist_id: playlistId,
  });
  if (error) throw new Error(error.message || 'Unable to attach the playlist cover.');
  if (!data) throw new Error('Unable to attach the playlist cover.');
  return data as MusicConsumerAsset;
}

export async function removePlaylistCover(userId: string, playlistId: string): Promise<void> {
  const { error } = await supabase.rpc('clear_music_playlist_cover', {
    p_playlist_id: playlistId,
  });
  if (error) throw new Error(error.message || 'Unable to remove the playlist cover.');

  // The database is already back on the dynamic first-track fallback. Object
  // deletion is best-effort; a stale object is detached and will be replaced
  // on the next upload to this deterministic path.
  await supabase.storage.from(BUCKET).remove([objectPath(userId, playlistId)]);
}

export const playlistCoverService = {
  pickAndUpload: pickAndUploadPlaylistCover,
  remove: removePlaylistCover,
} as const;
