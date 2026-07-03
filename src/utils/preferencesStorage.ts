import { Platform } from 'react-native';

export interface VisibleLanguages {
  english: boolean;
  coptic: boolean;
  copticRecitedPrayers: boolean;
  arabic: boolean;
}

export type OrientationMode = 'auto' | 'landscape' | 'reverseLandscape' | 'portrait';

export interface ReadingPreferences {
  visibleLanguages: VisibleLanguages;
  fontScale: number; // integer 1-10
  orientationMode: OrientationMode;
  selectText: boolean;
  slideshowMode: boolean;
  displayComments: boolean;
  displaySilentPrayers: boolean;
  bishopPresent: boolean;
}

// Matches the old app's DEFAULT_READING_PREFERENCES exactly (preferencesStorage.js).
export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  visibleLanguages: {
    english: true,
    coptic: true,
    copticRecitedPrayers: true,
    arabic: true,
  },
  fontScale: 1,
  orientationMode: 'auto',
  selectText: false,
  slideshowMode: false,
  displayComments: false,
  displaySilentPrayers: false,
  bishopPresent: false,
};

// Old app's getRenderedFontSize clamps to roughly a 20-41px range on a typical
// ~390px-wide mobile viewport; we approximate that with a simple linear map.
const MIN_FONT_SIZE = 25;
const MAX_FONT_SIZE = 61;

/** Maps the old app's 1-10 integer font scale onto a pixel size for the document WebView. */
export function fontScaleToPx(fontScale: number) {
  return Math.round(MIN_FONT_SIZE + ((fontScale - 1) * (MAX_FONT_SIZE - MIN_FONT_SIZE)) / 9);
}

const STORAGE_KEY = 'chc-reading-preferences';

function mergePreferences(stored: Partial<ReadingPreferences> | null | undefined): ReadingPreferences {
  const ORIENTATION_MODES: OrientationMode[] = ['auto', 'landscape', 'reverseLandscape', 'portrait'];
  const merged: ReadingPreferences = {
    ...DEFAULT_READING_PREFERENCES,
    ...stored,
    visibleLanguages: {
      ...DEFAULT_READING_PREFERENCES.visibleLanguages,
      ...stored?.visibleLanguages,
    },
  };
  if (!ORIENTATION_MODES.includes(merged.orientationMode)) {
    merged.orientationMode = 'auto';
  }
  merged.fontScale = Math.min(10, Math.max(1, Math.round(merged.fontScale) || 1));
  return merged;
}

export async function loadReadingPreferences(): Promise<ReadingPreferences> {
  try {
    if (Platform.OS === 'web') {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return mergePreferences(raw ? JSON.parse(raw) : null);
    }

    const FileSystem = await import('expo-file-system/legacy');
    const fileUri = `${FileSystem.documentDirectory}${STORAGE_KEY}.json`;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return mergePreferences(null);
    const raw = await FileSystem.readAsStringAsync(fileUri);
    return mergePreferences(JSON.parse(raw));
  } catch {
    return mergePreferences(null);
  }
}

export async function saveReadingPreferences(preferences: ReadingPreferences): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      return;
    }

    const FileSystem = await import('expo-file-system/legacy');
    const fileUri = `${FileSystem.documentDirectory}${STORAGE_KEY}.json`;
    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(preferences));
  } catch {
    // Best-effort persistence — a failed write just means the next session falls back to defaults.
  }
}
