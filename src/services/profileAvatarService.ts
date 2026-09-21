import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/utils/supabase';

const BUCKET = 'profile-avatars';
const AVATAR_OBJECT_NAME = 'avatar';
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function inferredMimeType(uri: string): string {
  const clean = uri.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export async function pickAndUploadProfileAvatar(userId: string): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.88,
    exif: false,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const mimeType = (asset.mimeType || inferredMimeType(asset.uri)).toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new Error('Choose a JPEG, PNG, or WebP image for your profile photo.');
  }

  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error('Unable to read the selected profile photo.');
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('The selected profile photo is empty.');
  if (bytes.byteLength > 5 * 1024 * 1024) {
    throw new Error('Profile photos must be 5 MB or smaller.');
  }

  const objectPath = `${userId}/${AVATAR_OBJECT_NAME}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, bytes, {
      contentType: mimeType,
      cacheControl: '60',
      upsert: true,
    });

  if (error) throw new Error(error.message || 'Unable to upload your profile photo.');

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  if (!data.publicUrl) throw new Error('Unable to create a profile photo URL.');

  // A version query prevents a cached previous avatar from lingering after an
  // in-place replacement of the user's single avatar object.
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function removeProfileAvatar(userId: string): Promise<void> {
  const objectPath = `${userId}/${AVATAR_OBJECT_NAME}`;
  const { error } = await supabase.storage.from(BUCKET).remove([objectPath]);
  if (error && !/not found/i.test(error.message)) {
    throw new Error(error.message || 'Unable to remove your profile photo.');
  }
}
