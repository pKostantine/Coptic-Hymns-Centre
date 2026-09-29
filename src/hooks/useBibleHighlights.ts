import { useCallback, useEffect, useRef, useState } from 'react';

import {
  loadCloudBibleHighlights,
  loadLocalBibleHighlights,
  saveCloudBibleHighlights,
  saveLocalBibleHighlights,
} from '@/services/bibleHighlightsService';
import type { BibleHighlight, BibleHighlightBook, BibleHighlightColor } from '@/types/bibleHighlights';
import { emptyBibleHighlightBook, mergeBibleHighlightBooks } from '@/utils/bibleHighlights';

/**
 * One Bible book's highlights: kept on the device, and — when signed in —
 * merged with and saved back to the account's copy, the way the Sermon
 * Planner's notes sync (useSermonPlanner).
 */
export function useBibleHighlights(bookKey: string | undefined, userId?: string | null) {
  const identity = `${bookKey || ''}:${userId || 'local'}`;
  const [book, setBook] = useState<BibleHighlightBook>(() => emptyBibleHighlightBook(bookKey || ''));
  const [loadedIdentity, setLoadedIdentity] = useState<string | null>(null);
  const cloudSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!bookKey) return undefined;
    let cancelled = false;
    const load = async () => {
      const local = await loadLocalBibleHighlights(bookKey);
      let next = local;
      if (userId) {
        try {
          const cloud = await loadCloudBibleHighlights(bookKey);
          next = cloud ? mergeBibleHighlightBooks(local, cloud) : local;
          await saveLocalBibleHighlights(next);
          if (!cloud || JSON.stringify(next) !== JSON.stringify(cloud)) await saveCloudBibleHighlights(userId, next);
        } catch (error) {
          console.warn('Unable to synchronize Bible highlights:', error);
        }
      }
      if (cancelled) return;
      setBook(next);
      setLoadedIdentity(identity);
    };
    void load();
    return () => { cancelled = true; };
  }, [bookKey, identity, userId]);

  useEffect(() => {
    if (!bookKey || loadedIdentity !== identity) return undefined;
    void saveLocalBibleHighlights(book);
    if (!userId) return undefined;
    const snapshot = book;
    const timer = setTimeout(() => {
      cloudSaveQueueRef.current = cloudSaveQueueRef.current
        .catch(() => undefined)
        .then(() => saveCloudBibleHighlights(userId, snapshot))
        .catch((error) => console.warn('Unable to save Bible highlights:', error));
    }, 700);
    return () => clearTimeout(timer);
  }, [book, bookKey, identity, loadedIdentity, userId]);

  const update = useCallback((updater: (current: BibleHighlightBook) => BibleHighlightBook) => {
    setBook((current) => ({ ...updater(current), updatedAt: new Date().toISOString() }));
  }, []);

  const addHighlights = useCallback((highlights: BibleHighlight[]) => {
    if (!highlights.length) return;
    update((current) => {
      const highlightDeletions = { ...current.highlightDeletions };
      highlights.forEach((highlight) => delete highlightDeletions[highlight.id]);
      return { ...current, highlights: [...current.highlights, ...highlights], highlightDeletions };
    });
  }, [update]);

  const setHighlightColor = useCallback((id: string, color: BibleHighlightColor) => {
    const updatedAt = new Date().toISOString();
    update((current) => ({
      ...current,
      highlights: current.highlights.map((highlight) => (highlight.id === id ? { ...highlight, color, updatedAt } : highlight)),
    }));
  }, [update]);

  const deleteHighlight = useCallback((id: string) => {
    const deletedAt = new Date().toISOString();
    update((current) => ({
      ...current,
      highlights: current.highlights.filter((highlight) => highlight.id !== id),
      highlightDeletions: { ...current.highlightDeletions, [id]: deletedAt },
    }));
  }, [update]);

  return {
    highlights: loadedIdentity === identity ? book.highlights : [],
    addHighlights,
    setHighlightColor,
    deleteHighlight,
  };
}
