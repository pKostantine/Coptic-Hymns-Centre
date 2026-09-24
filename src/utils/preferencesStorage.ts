import * as Device from 'expo-device';
import { Dimensions, Platform } from 'react-native';

import {
  classifyReadingDevice,
  DEFAULT_READING_FONT_LEVEL,
  MAX_READING_FONT_LEVEL,
  migrateReadingFontLevel,
  MIN_READING_FONT_LEVEL,
  readingFontSizeForLevel,
} from './readingFontSize';

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
  french: boolean;
}

export interface SermonPlannerVisibleLanguages {
  english: boolean;
  arabic: boolean;
}

export type OrientationMode = 'auto' | 'landscape' | 'reverseLandscape' | 'portrait';

export type AppLanguage = 'en' | 'ar';

export interface ReadingPreferences {
  visibleLanguages: VisibleLanguages;
  bibleVisibleLanguages: BibleVisibleLanguages;
  sermonPlannerVisibleLanguages: SermonPlannerVisibleLanguages;
  fontScale: number; // integer 1-10, see MIN_FONT_SCALE/MAX_FONT_SCALE
  /** Persisted range marker used to migrate earlier CHC font-size scales. */
  fontScaleRangeMax: number;
  orientationMode: OrientationMode;
  selectText: boolean;
  slideshowMode: boolean;
  displayComments: boolean;
  displaySilentPrayers: boolean;
  displayNowPlayingBar: boolean;
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

export type SyncedReadingPreferences = Pick<ReadingPreferences,
  | 'visibleLanguages'
  | 'bibleVisibleLanguages'
  | 'sermonPlannerVisibleLanguages'
  | 'displayComments'
  | 'displaySilentPrayers'
  | 'bishopPresent'
  | 'copticGospelRite'
  | 'selectedSaintHymns'
  | 'inMonastery'
  | 'appLanguage'
>;

// New installations start at the comfortable middle of the 1-10 scale.
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
    french: false,
  },
  sermonPlannerVisibleLanguages: {
    english: true,
    arabic: true,
  },
  fontScale: DEFAULT_READING_FONT_LEVEL,
  fontScaleRangeMax: MAX_READING_FONT_LEVEL,
  orientationMode: 'auto',
  selectText: false,
  slideshowMode: false,
  displayComments: false,
  displaySilentPrayers: false,
  displayNowPlayingBar: true,
  bishopPresent: false,
  copticGospelRite: false,
  appLanguage: 'en',
  selectedSaintHymns: [],
  inMonastery: false,
};

let currentAppLanguage: AppLanguage = DEFAULT_READING_PREFERENCES.appLanguage;

/** Current menu/chrome language for synchronous label helpers outside React components. */
export function getCurrentAppLanguage(): AppLanguage {
  return currentAppLanguage;
}

/** Lowest selectable font scale. */
export const MIN_FONT_SCALE = MIN_READING_FONT_LEVEL;
/** Highest selectable font scale. */
export const MAX_FONT_SCALE = MAX_READING_FONT_LEVEL;

const screen = Dimensions.get('screen');
export type ReadingDeviceClass = 'phone' | 'tablet' | 'desktop';

// Capture the physical device class once. Rotation can change the live window
// dimensions used for wrapping and pagination, but never this font-size input.
export const READING_DEVICE_CLASS = classifyReadingDevice({
  platform: Platform.OS,
  deviceType: Device.deviceType,
  osName: Device.osName,
  screenWidth: screen.width,
  screenHeight: screen.height,
  userAgent: Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  maxTouchPoints: Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
}) as ReadingDeviceClass;

/** Maps the selected 1-10 level to a stable logical pixel size for this device. */
export function fontScaleToPx(fontScale: number) {
  return readingFontSizeForLevel(fontScale, READING_DEVICE_CLASS);
}

const STORAGE_KEY = 'chc-reading-preferences';

function normalizeSermonPlannerVisibleLanguages(
  value: unknown,
  fallback: SermonPlannerVisibleLanguages,
): SermonPlannerVisibleLanguages {
  const record = recordValue(value);
  const normalized = {
    english: booleanValue(record.english, fallback.english),
    arabic: booleanValue(record.arabic, fallback.arabic),
  };
  return Object.values(normalized).some(Boolean) ? normalized : { ...fallback };
}

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
    sermonPlannerVisibleLanguages: normalizeSermonPlannerVisibleLanguages(
      stored?.sermonPlannerVisibleLanguages,
      DEFAULT_READING_PREFERENCES.sermonPlannerVisibleLanguages,
    ),
  };
  if (!ORIENTATION_MODES.includes(merged.orientationMode)) {
    merged.orientationMode = 'auto';
  }
  const storedFontScale = stored?.fontScale;
  merged.fontScale = stored && typeof storedFontScale === 'number' && Number.isFinite(storedFontScale)
    ? migrateReadingFontLevel(storedFontScale, stored.fontScaleRangeMax, READING_DEVICE_CLASS)
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

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** The content choices that belong to a person rather than a particular screen. */
export function syncedReadingPreferences(preferences: ReadingPreferences): SyncedReadingPreferences {
  return {
    visibleLanguages: preferences.visibleLanguages,
    bibleVisibleLanguages: preferences.bibleVisibleLanguages,
    sermonPlannerVisibleLanguages: preferences.sermonPlannerVisibleLanguages,
    displayComments: preferences.displayComments,
    displaySilentPrayers: preferences.displaySilentPrayers,
    bishopPresent: preferences.bishopPresent,
    copticGospelRite: preferences.copticGospelRite,
    selectedSaintHymns: preferences.selectedSaintHymns,
    inMonastery: preferences.inMonastery,
    appLanguage: preferences.appLanguage,
  };
}

/** Applies a cloud payload without touching display choices that are device-specific. */
export function applySyncedReadingPreferences(
  local: ReadingPreferences,
  cloudValue: unknown,
): ReadingPreferences {
  const cloud = recordValue(cloudValue);
  const visible = recordValue(cloud.visibleLanguages);
  const bible = recordValue(cloud.bibleVisibleLanguages);
  const sermonPlannerVisibleLanguages = normalizeSermonPlannerVisibleLanguages(
    cloud.sermonPlannerVisibleLanguages,
    local.sermonPlannerVisibleLanguages,
  );
  const saintTokens = Array.isArray(cloud.selectedSaintHymns)
    ? [...new Set(cloud.selectedSaintHymns.filter((token): token is string => (
      typeof token === 'string' && token.includes(':') && token.length <= 256
    )))].slice(0, 250)
    : local.selectedSaintHymns;

  return {
    ...local,
    visibleLanguages: {
      english: booleanValue(visible.english, local.visibleLanguages.english),
      coptic: booleanValue(visible.coptic, local.visibleLanguages.coptic),
      copticRecitedPrayers: booleanValue(visible.copticRecitedPrayers, local.visibleLanguages.copticRecitedPrayers),
      arabic: booleanValue(visible.arabic, local.visibleLanguages.arabic),
    },
    bibleVisibleLanguages: {
      english: booleanValue(bible.english, local.bibleVisibleLanguages.english),
      englishNkjv: booleanValue(bible.englishNkjv, local.bibleVisibleLanguages.englishNkjv),
      englishFromCoptic: booleanValue(bible.englishFromCoptic, local.bibleVisibleLanguages.englishFromCoptic),
      coptic: booleanValue(bible.coptic, local.bibleVisibleLanguages.coptic),
      greek: booleanValue(bible.greek, local.bibleVisibleLanguages.greek),
      arabic: booleanValue(bible.arabic, local.bibleVisibleLanguages.arabic),
      arabicFromCoptic: booleanValue(bible.arabicFromCoptic, local.bibleVisibleLanguages.arabicFromCoptic),
      french: booleanValue(bible.french, local.bibleVisibleLanguages.french),
    },
    sermonPlannerVisibleLanguages,
    displayComments: booleanValue(cloud.displayComments, local.displayComments),
    displaySilentPrayers: booleanValue(cloud.displaySilentPrayers, local.displaySilentPrayers),
    bishopPresent: booleanValue(cloud.bishopPresent, local.bishopPresent),
    copticGospelRite: booleanValue(cloud.copticGospelRite, local.copticGospelRite),
    selectedSaintHymns: saintTokens,
    inMonastery: booleanValue(cloud.inMonastery, local.inMonastery),
    appLanguage: cloud.appLanguage === 'en' || cloud.appLanguage === 'ar'
      ? cloud.appLanguage
      : local.appLanguage,
  };
}

export async function loadReadingPreferences(): Promise<ReadingPreferences> {
  try {
    if (Platform.OS === 'web') {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const preferences = mergePreferences(raw ? JSON.parse(raw) : null);
      currentAppLanguage = preferences.appLanguage;
      return preferences;
    }

    const FileSystem = await import('expo-file-system/legacy');
    const fileUri = `${FileSystem.documentDirectory}${STORAGE_KEY}.json`;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      const preferences = mergePreferences(null);
      currentAppLanguage = preferences.appLanguage;
      return preferences;
    }
    const raw = await FileSystem.readAsStringAsync(fileUri);
    const preferences = mergePreferences(JSON.parse(raw));
    currentAppLanguage = preferences.appLanguage;
    return preferences;
  } catch {
    const preferences = mergePreferences(null);
    currentAppLanguage = preferences.appLanguage;
    return preferences;
  }
}

export async function saveReadingPreferences(preferences: ReadingPreferences): Promise<void> {
  currentAppLanguage = preferences.appLanguage;
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
