import { createContext, useCallback, useContext, useEffect, useMemo, useState, type SetStateAction } from 'react';

import { loadBookmarks, saveBookmarks } from '../utils/bookmarksStorage';
import {
    AppLanguage,
    BibleVisibleLanguages,
    DEFAULT_READING_PREFERENCES,
    loadReadingPreferences,
    MAX_FONT_SCALE,
    MIN_FONT_SCALE,
    OrientationMode,
    ReadingPreferences,
    saveReadingPreferences,
    VisibleLanguages,
} from '../utils/preferencesStorage';

interface ReadingPreferencesContextValue {
  preferences: ReadingPreferences;
  ready: boolean;
  toggleLanguage: (key: keyof VisibleLanguages) => void;
  setBibleVisibleLanguages: (updater: SetStateAction<BibleVisibleLanguages>) => void;
  setFontScale: (delta: number) => void;
  /** Sets the font scale outright rather than nudging it — what the slider needs. */
  setFontScaleValue: (value: number) => void;
  setOrientationMode: (mode: OrientationMode) => void;
  toggleSelectText: () => void;
  toggleSlideshowMode: () => void;
  toggleDisplayComments: () => void;
  toggleDisplaySilentPrayers: () => void;
  toggleDisplayNowPlayingBar: () => void;
  toggleBishopPresent: () => void;
  toggleCopticGospelRite: () => void;
  setAppLanguage: (language: AppLanguage) => void;
  /** Turns one saint hymn choice on or off. The token is the full child condition, e.g. `StMark:VOC`. */
  toggleSaintHymn: (token: string) => void;
  /** Clears every saint hymn choice for one saint, given its base token. */
  clearSaintHymns: (base: string) => void;
  toggleInMonastery: () => void;
  bookmarks: string[];
  isBookmarked: (id: string) => boolean;
  toggleBookmark: (id: string) => void;
}

const ReadingPreferencesContext = createContext<ReadingPreferencesContextValue | null>(null);

/** Rounds to a whole step and pins it inside the selectable range. */
function clampFontScale(value: number) {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) return DEFAULT_READING_PREFERENCES.fontScale;
  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, rounded));
}

export function ReadingPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<ReadingPreferences>(DEFAULT_READING_PREFERENCES);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadReadingPreferences(), loadBookmarks()]).then(([storedPreferences, storedBookmarks]) => {
      if (cancelled) return;
      setPreferences(storedPreferences);
      setBookmarks(storedBookmarks);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (ready) saveReadingPreferences(preferences);
  }, [preferences, ready]);

  useEffect(() => {
    if (ready) saveBookmarks(bookmarks);
  }, [bookmarks, ready]);

  const toggleLanguage = useCallback((key: keyof VisibleLanguages) => {
    setPreferences((prev) => ({
      ...prev,
      visibleLanguages: { ...prev.visibleLanguages, [key]: !prev.visibleLanguages[key] },
    }));
  }, []);

  const setBibleVisibleLanguages = useCallback((updater: SetStateAction<BibleVisibleLanguages>) => {
    setPreferences((prev) => {
      const next = typeof updater === 'function' ? updater(prev.bibleVisibleLanguages) : updater;
      return {
        ...prev,
        bibleVisibleLanguages: { ...prev.bibleVisibleLanguages, ...next },
      };
    });
  }, []);

  const setFontScale = useCallback((delta: number) => {
    setPreferences((prev) => ({ ...prev, fontScale: clampFontScale(prev.fontScale + delta) }));
  }, []);

  const setFontScaleValue = useCallback((value: number) => {
    setPreferences((prev) => {
      const fontScale = clampFontScale(value);
      // The slider reports every value it passes through while dragging, and
      // each accepted change repaginates any open document. Bailing out when
      // the step hasn't actually changed keeps a drag to one update per step.
      return prev.fontScale === fontScale ? prev : { ...prev, fontScale };
    });
  }, []);

  const setOrientationMode = useCallback((mode: OrientationMode) => {
    setPreferences((prev) => ({ ...prev, orientationMode: mode }));
  }, []);

  const toggleSelectText = useCallback(() => {
    setPreferences((prev) => (prev.slideshowMode ? prev : { ...prev, selectText: !prev.selectText }));
  }, []);

  const toggleSlideshowMode = useCallback(() => {
    setPreferences((prev) => {
      const slideshowMode = !prev.slideshowMode;
      return {
        ...prev,
        slideshowMode,
        selectText: slideshowMode ? false : prev.selectText,
      };
    });
  }, []);

  const toggleDisplayComments = useCallback(() => {
    setPreferences((prev) => ({ ...prev, displayComments: !prev.displayComments }));
  }, []);

  const toggleDisplaySilentPrayers = useCallback(() => {
    setPreferences((prev) => ({ ...prev, displaySilentPrayers: !prev.displaySilentPrayers }));
  }, []);

  const toggleDisplayNowPlayingBar = useCallback(() => {
    setPreferences((prev) => ({ ...prev, displayNowPlayingBar: !prev.displayNowPlayingBar }));
  }, []);

  const toggleBishopPresent = useCallback(() => {
    setPreferences((prev) => ({ ...prev, bishopPresent: !prev.bishopPresent }));
  }, []);

  const toggleCopticGospelRite = useCallback(() => {
    setPreferences((prev) => ({ ...prev, copticGospelRite: !prev.copticGospelRite }));
  }, []);

  const setAppLanguage = useCallback((language: AppLanguage) => {
    setPreferences((prev) => ({ ...prev, appLanguage: language }));
  }, []);

  const toggleSaintHymn = useCallback((token: string) => {
    setPreferences((prev) => {
      const current = prev.selectedSaintHymns || [];
      return {
        ...prev,
        selectedSaintHymns: current.includes(token)
          ? current.filter((entry) => entry !== token)
          : [...current, token],
      };
    });
  }, []);

  const clearSaintHymns = useCallback((base: string) => {
    setPreferences((prev) => {
      const prefix = `${base}:`;
      const next = (prev.selectedSaintHymns || []).filter((token) => !token.startsWith(prefix));
      return next.length === (prev.selectedSaintHymns || []).length ? prev : { ...prev, selectedSaintHymns: next };
    });
  }, []);

  const toggleInMonastery = useCallback(() => {
    setPreferences((prev) => ({ ...prev, inMonastery: !prev.inMonastery }));
  }, []);

  const isBookmarked = useCallback((id: string) => bookmarks.includes(id), [bookmarks]);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarks((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
  }, []);

  const value = useMemo<ReadingPreferencesContextValue>(
    () => ({
      preferences,
      ready,
      toggleLanguage,
      setBibleVisibleLanguages,
      setFontScale,
      setFontScaleValue,
      setOrientationMode,
      toggleSelectText,
      toggleSlideshowMode,
      toggleDisplayComments,
      toggleDisplaySilentPrayers,
      toggleDisplayNowPlayingBar,
      toggleBishopPresent,
      toggleCopticGospelRite,
      setAppLanguage,
      toggleSaintHymn,
      clearSaintHymns,
      toggleInMonastery,
      bookmarks,
      isBookmarked,
      toggleBookmark,
    }),
    [
      preferences,
      ready,
      toggleLanguage,
      setBibleVisibleLanguages,
      setFontScale,
      setFontScaleValue,
      setOrientationMode,
      toggleSelectText,
      toggleSlideshowMode,
      toggleDisplayComments,
      toggleDisplaySilentPrayers,
      toggleDisplayNowPlayingBar,
      toggleBishopPresent,
      toggleCopticGospelRite,
      setAppLanguage,
      toggleSaintHymn,
      clearSaintHymns,
      toggleInMonastery,
      bookmarks,
      isBookmarked,
      toggleBookmark,
    ],
  );

  return <ReadingPreferencesContext.Provider value={value}>{children}</ReadingPreferencesContext.Provider>;
}

export function useReadingPreferences() {
  const ctx = useContext(ReadingPreferencesContext);
  if (!ctx) throw new Error('useReadingPreferences must be used within a ReadingPreferencesProvider');
  return ctx;
}
