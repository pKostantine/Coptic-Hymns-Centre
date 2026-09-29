import { Platform } from 'react-native';

import type { BibleHighlightBook } from '@/types/bibleHighlights';
import { emptyBibleHighlightBook, normalizeBibleHighlightBook } from '@/utils/bibleHighlights';
import { supabase } from '@/utils/supabase';

const STORAGE_PREFIX = 'chc-bible-highlights';

function storageKey(bookKey: string) {
  return `${STORAGE_PREFIX}-${encodeURIComponent(bookKey)}`;
}

/** One book's highlights on this device: localStorage on the web, a JSON file in the app — as bookmarks are kept. */
export async function loadLocalBibleHighlights(bookKey: string): Promise<BibleHighlightBook> {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web') {
      raw = window.localStorage.getItem(storageKey(bookKey));
    } else {
      const FileSystem = await import('expo-file-system/legacy');
      const fileUri = `${FileSystem.documentDirectory}${storageKey(bookKey)}.json`;
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists) raw = await FileSystem.readAsStringAsync(fileUri);
    }
    return normalizeBibleHighlightBook(raw ? JSON.parse(raw) : null, bookKey);
  } catch {
    return emptyBibleHighlightBook(bookKey);
  }
}

export async function saveLocalBibleHighlights(book: BibleHighlightBook): Promise<void> {
  try {
    const serialized = JSON.stringify(book);
    if (Platform.OS === 'web') {
      window.localStorage.setItem(storageKey(book.bookKey), serialized);
      return;
    }
    const FileSystem = await import('expo-file-system/legacy');
    await FileSystem.writeAsStringAsync(`${FileSystem.documentDirectory}${storageKey(book.bookKey)}.json`, serialized);
  } catch {
    // Best-effort persistence; the cloud copy (when signed in) still holds them.
  }
}

export async function loadCloudBibleHighlights(bookKey: string): Promise<BibleHighlightBook | null> {
  const { data, error } = await supabase
    .from('bible_highlights')
    .select('book_key, highlights, highlight_deletions, updated_at')
    .eq('book_key', bookKey)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Unable to load Bible highlights.');
  if (!data) return null;
  return normalizeBibleHighlightBook({
    version: 1,
    bookKey: data.book_key,
    highlights: data.highlights,
    highlightDeletions: data.highlight_deletions,
    updatedAt: data.updated_at,
  }, bookKey);
}

export async function saveCloudBibleHighlights(userId: string, book: BibleHighlightBook): Promise<void> {
  const { error } = await supabase.from('bible_highlights').upsert({
    user_id: userId,
    book_key: book.bookKey,
    highlights: book.highlights,
    highlight_deletions: book.highlightDeletions,
    updated_at: book.updatedAt,
  }, { onConflict: 'user_id,book_key' });
  if (error) throw new Error(error.message || 'Unable to save Bible highlights.');
}
