import { Platform } from 'react-native';

export interface VisibleLanguages {
  english: boolean;
  coptic: boolean;
  copticRecitedPrayers: boolean;
  arabic: boolean;
}

export interface BibleVisibleLanguages {
  english: boolean;
  englishNkjv: boolean;
  englishFromCoptic: boolean;
  coptic: boolean;
  greek: boolean;
  arabic: boolean;
  arabicFromCoptic: boolean;
}

export type OrientationMode = 'auto' | 'landscape' | 'reverseLandscape' | 'portrait';

export type AppLanguage = 'en' | 'ar';

export interface ReadingPreferences {
  visibleLanguages: VisibleLanguages;
  bibleVisibleLanguages: BibleVisibleLanguages;
  fontScale: number; // integer 0-10, see MIN_FONT_SCALE/MAX_FONT_SCALE
  orientationMode: OrientationMode;
  selectText: boolean;
  slideshowMode: boolean;
  displayComments: boolean;
  displaySilentPrayers: boolean;
  bishopPresent: boolean;
  copticGospelRite: boolean;
  /** Menu-chrome-only language (main menu + submenus/list screens) — never affects the text rendered inside an actual document, which is governed by visibleLanguages instead. */
  appLanguage: AppLanguage;
}

// Matches the old app's DEFAULT_READING_PREFERENCES exactly (preferencesStorage.js).
export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  visibleLanguages: {
    english: true,
    coptic: true,
    copticRecitedPrayers: true,
    arabic: true,
  },
  bibleVisibleLanguages: {
    english: true,
    englishNkjv: false,
    englishFromCoptic: false,
    coptic: false,
    greek: false,
    arabic: true,
    arabicFromCoptic: false,
  },
  fontScale: 1,
  orientationMode: 'auto',
  selectText: false,
  slideshowMode: false,
  displayComments: false,
  displaySilentPrayers: false,
  bishopPresent: false,
  copticGospelRite: false,
  appLanguage: 'en',
};

/** Lowest selectable font scale. */
export const MIN_FONT_SCALE = 0;
/** Highest selectable font scale. */
export const MAX_FONT_SCALE = 10;

// The scale used to be 1-10 over a 25-61px range. It now runs 0-10 over a wider
// 18-78px range, so the small end is genuinely small and the large end is large
// enough to read a hymn off a projector. Step size is a round 6px, and the
// anchor is deliberate: scale 1 still lands on 24px, within a pixel of the 25px
// it produced before, so an already-stored preference keeps rendering at the
// size its owner chose. Scale 0 is the new step below that.
const MIN_FONT_SIZE = 18;
const MAX_FONT_SIZE = 78;

/** Maps the 0-10 integer font scale onto a pixel size for the document WebView. */
export function fontScaleToPx(fontScale: number) {
  const clamped = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, fontScale));
  return Math.round(
    MIN_FONT_SIZE + (clamped * (MAX_FONT_SIZE - MIN_FONT_SIZE)) / (MAX_FONT_SCALE - MIN_FONT_SCALE),
  );
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
    bibleVisibleLanguages: {
      ...DEFAULT_READING_PREFERENCES.bibleVisibleLanguages,
      ...stored?.bibleVisibleLanguages,
    },
  };
  if (!ORIENTATION_MODES.includes(merged.orientationMode)) {
    merged.orientationMode = 'auto';
  }
  const roundedFontScale = Math.round(merged.fontScale);
  merged.fontScale = Number.isFinite(roundedFontScale)
    ? Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, roundedFontScale))
    : DEFAULT_READING_PREFERENCES.fontScale;
  if (merged.appLanguage !== 'en' && merged.appLanguage !== 'ar') {
    merged.appLanguage = 'en';
  }
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
