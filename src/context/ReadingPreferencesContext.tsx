import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { loadBookmarks, saveBookmarks } from '../utils/bookmarksStorage';
import {
  DEFAULT_READING_PREFERENCES,
  loadReadingPreferences,
  OrientationMode,
  ReadingPreferences,
  saveReadingPreferences,
  VisibleLanguages,
} from '../utils/preferencesStorage';

interface ReadingPreferencesContextValue {
  preferences: ReadingPreferences;
  ready: boolean;
  toggleLanguage: (key: keyof VisibleLanguages) => void;
  setFontScale: (delta: number) => void;
  setOrientationMode: (mode: OrientationMode) => void;
  toggleSelectText: () => void;
  toggleSlideshowMode: () => void;
  toggleDisplayComments: () => void;
  toggleDisplaySilentPrayers: () => void;
  toggleBishopPresent: () => void;
  bookmarks: string[];
  isBookmarked: (id: string) => boolean;
  toggleBookmark: (id: string) => void;
}

const ReadingPreferencesContext = createContext<ReadingPreferencesContextValue | null>(null);

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

  const setFontScale = useCallback((delta: number) => {
    setPreferences((prev) => ({ ...prev, fontScale: Math.min(10, Math.max(1, prev.fontScale + delta)) }));
  }, []);

  const setOrientationMode = useCallback((mode: OrientationMode) => {
    setPreferences((prev) => ({ ...prev, orientationMode: mode }));
  }, []);

  const toggleSelectText = useCallback(() => {
    setPreferences((prev) => ({ ...prev, selectText: !prev.selectText }));
  }, []);

  const toggleSlideshowMode = useCallback(() => {
    setPreferences((prev) => ({ ...prev, slideshowMode: !prev.slideshowMode }));
  }, []);

  const toggleDisplayComments = useCallback(() => {
    setPreferences((prev) => ({ ...prev, displayComments: !prev.displayComments }));
  }, []);

  const toggleDisplaySilentPrayers = useCallback(() => {
    setPreferences((prev) => ({ ...prev, displaySilentPrayers: !prev.displaySilentPrayers }));
  }, []);

  const toggleBishopPresent = useCallback(() => {
    setPreferences((prev) => ({ ...prev, bishopPresent: !prev.bishopPresent }));
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
      setFontScale,
      setOrientationMode,
      toggleSelectText,
      toggleSlideshowMode,
      toggleDisplayComments,
      toggleDisplaySilentPrayers,
      toggleBishopPresent,
      bookmarks,
      isBookmarked,
      toggleBookmark,
    }),
    [
      preferences,
      ready,
      toggleLanguage,
      setFontScale,
      setOrientationMode,
      toggleSelectText,
      toggleSlideshowMode,
      toggleDisplayComments,
      toggleDisplaySilentPrayers,
      toggleBishopPresent,
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
