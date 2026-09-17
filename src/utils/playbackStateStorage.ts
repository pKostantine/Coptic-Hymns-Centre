import { Platform } from 'react-native';

import type { PlaybackSnapshot } from '@/types/playback';
import { sanitizePlaybackSnapshot } from '@/utils/playbackEngine';

const STORAGE_KEY = 'chc-playback-state-v1';

export async function loadPlaybackSnapshot(): Promise<PlaybackSnapshot | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? sanitizePlaybackSnapshot(JSON.parse(raw)) : null;
    }

    const FileSystem = await import('expo-file-system/legacy');
    const fileUri = `${FileSystem.documentDirectory}${STORAGE_KEY}.json`;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(fileUri);
    return sanitizePlaybackSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function savePlaybackSnapshot(snapshot: PlaybackSnapshot | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (snapshot) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      else window.localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const FileSystem = await import('expo-file-system/legacy');
    const fileUri = `${FileSystem.documentDirectory}${STORAGE_KEY}.json`;
    if (!snapshot) {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists) await FileSystem.deleteAsync(fileUri, { idempotent: true });
      return;
    }
    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(snapshot));
  } catch {
    // Playback persistence is best-effort. Playback itself must never fail
    // simply because the device could not write the resume snapshot.
  }
}

export async function localPlaybackUriExists(uri: string): Promise<boolean> {
  try {
    if (!uri.startsWith('file://')) return true;
    if (Platform.OS === 'web') return true;
    const FileSystem = await import('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}
