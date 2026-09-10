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
  fontScale: number; // integer 0-20, see MIN_FONT_SCALE/MAX_FONT_SCALE
  /** Persisted range marker used to migrate the former 0-10 scale without changing its rendered size. */
  fontScaleRangeMax: number;
  orientationMode: OrientationMode;
  selectText: boolean;
  slideshowMode: boolean;
  displayComments: boolean;
  displaySilentPrayers: boolean;
  bishopPresent: boolean;
  copticGospelRite: boolean;
  /**
   * Full saint hymn condition tokens the user has chosen by hand, e.g.
   * `StMark:VOC`. Each one is raised as its own condition flag; the bare
   * `StMark` is deliberately never raised, so picking one hymn cannot pull in
   * the saint's whole set — see isConditionAtomSatisfied in conditionEngine.js.
   */
  selectedSaintHymns: string[];
  /**
   * Raises the `Monastery` condition. Only the Prayer of the Veil is gated on
   * it — it is prayed in monasteries and skipped in parishes — so this decides
   * whether that subdocument appears in Offering of the Lamb and Vespers
   * Praises at all.
   */
  inMonastery: boolean;
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
  fontScale: 2,
  fontScaleRangeMax: 20,
  orientationMode: 'auto',
  selectText: false,
  slideshowMode: false,
  displayComments: false,
  displaySilentPrayers: false,
  bishopPresent: false,
  copticGospelRite: false,
  appLanguage: 'en',
  selectedSaintHymns: [],
  inMonastery: false,
};

/** Lowest selectable font scale. */
export const MIN_FONT_SCALE = 0;
/** Highest selectable font scale. */
export const MAX_FONT_SCALE = 20;

// Keep the existing 18-78px bounds while doubling the number of selectable
// intervals. Each step is now 3px instead of 6px, giving the control finer
// adjustment without making its smallest or largest text any smaller/larger.
const MIN_FONT_SIZE = 18;
const MAX_FONT_SIZE = 78;
const LEGACY_MAX_FONT_SCALE = 10;

/** Maps the 0-20 integer font scale onto a pixel size for the document WebView. */
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
  // Values saved before the 0-20 range did not have a range marker. Doubling
  // those 0-10 values preserves the exact rendered size the user selected.
  const storedFontScale = stored?.fontScale;
  const migratedFontScale =
    stored && typeof storedFontScale === 'number' && Number.isFinite(storedFontScale)
      ? stored.fontScaleRangeMax === MAX_FONT_SCALE
        ? storedFontScale
        : (storedFontScale * MAX_FONT_SCALE) / LEGACY_MAX_FONT_SCALE
      : merged.fontScale;
  const roundedFontScale = Math.round(migratedFontScale);
  merged.fontScale = Number.isFinite(roundedFontScale)
    ? Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, roundedFontScale))
    : DEFAULT_READING_PREFERENCES.fontScale;
  merged.fontScaleRangeMax = MAX_FONT_SCALE;
  if (merged.appLanguage !== 'en' && merged.appLanguage !== 'ar') {
    merged.appLanguage = 'en';
  }
  merged.selectedSaintHymns = Array.isArray(merged.selectedSaintHymns)
    ? merged.selectedSaintHymns.filter((token): token is string => typeof token === 'string' && token.includes(':'))
    : [];
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
