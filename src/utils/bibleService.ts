import { supabase } from './supabase';

export interface BibleBook {
  bookKey: string;
  bookOrder: number;
  testament: 'OT' | 'NT';
  titleEnglish: string;
  titleArabic: string;
  titleCoptic: string;
  aliases: string[];
}

export interface BibleChapterMeta {
  chapterNumber: number;
  verseCount: number;
}

export interface BibleVerse {
  verseNumber: number;
  english: string;
  coptic: string;
  arabic: string;
}

export type PsalmNumbering = 'septuagint' | 'masoretic';

const PSALMS_KEY = 'psalms';

// ─── Book metadata (small, cached for the whole session) ──────────────────

let booksPromise: Promise<BibleBook[]> | null = null;

async function loadBibleBooks(): Promise<BibleBook[]> {
  const { data, error } = await supabase.rpc('get_bible_books');
  if (error) throw new Error(`Unable to load Bible books: ${error.message}`);
  return ((data || []) as any[]).map((row) => ({
    bookKey: row.book_key,
    bookOrder: row.book_order,
    testament: row.testament,
    titleEnglish: row.title_english || '',
    titleArabic: row.title_arabic || '',
    titleCoptic: row.title_coptic || '',
    aliases: row.aliases_json || [],
  }));
}

export function getBibleBooks(): Promise<BibleBook[]> {
  if (!booksPromise) {
    booksPromise = loadBibleBooks().catch((err) => {
      booksPromise = null;
      throw err;
    });
  }
  return booksPromise;
}

export async function getBibleBook(bookKey: string): Promise<BibleBook | null> {
  const books = await getBibleBooks();
  return books.find((book) => book.bookKey === bookKey) || null;
}

// ─── Chapter verse cache (per book:chapter, in the DB's own — Septuagint for
// Psalms — numbering) ───────────────────────────────────────────────────────

const chapterCache = new Map<string, Promise<BibleVerse[]>>();

async function loadChapterVerses(bookKey: string, chapterNumber: number): Promise<BibleVerse[]> {
  const { data, error } = await supabase.rpc('get_bible_chapter', { p_book_key: bookKey, p_chapter_number: chapterNumber });
  if (error) throw new Error(`Unable to load ${bookKey} ${chapterNumber}: ${error.message}`);
  return ((data || []) as any[])
    .map((row) => ({
      verseNumber: row.verse_number,
      english: row.english || '',
      coptic: row.coptic || '',
      arabic: row.arabic || '',
    }))
    .sort((a, b) => a.verseNumber - b.verseNumber);
}

function fetchChapterVerses(bookKey: string, chapterNumber: number): Promise<BibleVerse[]> {
  const cacheKey = `${bookKey}:${chapterNumber}`;
  let promise = chapterCache.get(cacheKey);
  if (!promise) {
    promise = loadChapterVerses(bookKey, chapterNumber).catch((err) => {
      chapterCache.delete(cacheKey);
      throw err;
    });
    chapterCache.set(cacheKey, promise);
  }
  return promise;
}

// ─── Psalm numbering (pure math, ported 1:1 from the old app — Septuagint is
// the DB's native numbering, matching Coptic Orthodox tradition) ───────────

export function mapHebrewPsalmReferenceToSeptuagint(chapter: number, verse: number): { chapter: number; verse: number } {
  if (chapter <= 8) return { chapter, verse };
  if (chapter === 9) return { chapter: 9, verse };
  if (chapter === 10) return { chapter: 9, verse: verse + 20 };
  if (chapter >= 11 && chapter <= 113) return { chapter: chapter - 1, verse };
  if (chapter === 114) return { chapter: 113, verse };
  if (chapter === 115) return { chapter: 113, verse: verse + 8 };
  if (chapter === 116) {
    if (verse <= 9) return { chapter: 114, verse };
    const m: Record<number, number> = { 10: 1, 11: 2, 12: 3, 13: 4, 14: 8, 15: 5, 16: 6, 17: 7, 18: 8, 19: 9 };
    return { chapter: 115, verse: m[verse] || verse - 9 };
  }
  if (chapter >= 117 && chapter <= 146) return { chapter: chapter - 1, verse };
  if (chapter === 147) return verse <= 11 ? { chapter: 146, verse } : { chapter: 147, verse: verse - 11 };
  return { chapter, verse };
}

export function mapSeptuagintPsalmReferenceToHebrew(chapter: number, verse: number): { chapter: number; verse: number } | null {
  if (chapter <= 8) return { chapter, verse };
  if (chapter === 9) return verse <= 20 ? { chapter: 9, verse } : { chapter: 10, verse: verse - 20 };
  if (chapter >= 10 && chapter <= 112) return { chapter: chapter + 1, verse };
  if (chapter === 113) return verse <= 8 ? { chapter: 114, verse } : { chapter: 115, verse: verse - 8 };
  if (chapter === 114) return { chapter: 116, verse };
  if (chapter === 115) {
    const m: Record<number, number> = { 1: 10, 2: 11, 3: 12, 4: 13, 5: 15, 6: 16, 7: 17, 8: 18, 9: 19 };
    return m[verse] ? { chapter: 116, verse: m[verse] } : null;
  }
  if (chapter >= 116 && chapter <= 145) return { chapter: chapter + 1, verse };
  if (chapter === 146) return { chapter: 147, verse };
  if (chapter === 147) return { chapter: 147, verse: verse + 11 };
  if (chapter >= 148 && chapter <= 150) return { chapter, verse };
  return null;
}

/** Which Septuagint (DB-native) chapter(s) a given Masoretic Psalm chapter's verses are drawn from — mirrors the two crosswalk functions' boundary structure. */
function septuagintChaptersForMasoreticChapter(masoreticChapter: number): number[] {
  if (masoreticChapter <= 8) return [masoreticChapter];
  if (masoreticChapter === 9 || masoreticChapter === 10) return [9];
  if (masoreticChapter >= 11 && masoreticChapter <= 113) return [masoreticChapter - 1];
  if (masoreticChapter === 114 || masoreticChapter === 115) return [113];
  if (masoreticChapter === 116) return [114, 115];
  if (masoreticChapter >= 117 && masoreticChapter <= 146) return [masoreticChapter - 1];
  if (masoreticChapter === 147) return [146, 147];
  if (masoreticChapter >= 148 && masoreticChapter <= 150) return [masoreticChapter];
  return [masoreticChapter];
}

// ─── Public: chapter list for a book, in the requested numbering ──────────

export async function getBibleChapterKeys(bookKey: string, psalmNumbering: PsalmNumbering = 'septuagint'): Promise<number[]> {
  if (bookKey === PSALMS_KEY && psalmNumbering === 'masoretic') {
    // Masoretic Psalms always has exactly 150 chapters — a fixed, well-known count.
    return Array.from({ length: 150 }, (_, i) => i + 1);
  }

  const { data, error } = await supabase.rpc('get_bible_chapter_list', { p_book_key: bookKey });
  if (error) throw new Error(`Unable to load chapters for ${bookKey}: ${error.message}`);
  return ((data || []) as BibleChapterMeta[])
    .map((row: any) => row.chapter_number as number)
    .sort((a, b) => a - b);
}

// ─── Public: verses for a chapter, in the requested display numbering ─────

export async function getDisplayedChapterVerses(
  bookKey: string,
  displayChapter: number,
  psalmNumbering: PsalmNumbering = 'septuagint',
): Promise<BibleVerse[]> {
  if (bookKey !== PSALMS_KEY || psalmNumbering === 'septuagint') {
    return fetchChapterVerses(bookKey, displayChapter);
  }

  // Masoretic display: pull the 1-2 Septuagint chapters this Masoretic
  // chapter's verses are drawn from, then remap each verse forward.
  const sourceChapters = septuagintChaptersForMasoreticChapter(displayChapter);
  const sourceVerseLists = await Promise.all(sourceChapters.map((ch) => fetchChapterVerses(bookKey, ch)));

  const mapped: BibleVerse[] = [];
  sourceChapters.forEach((sourceChapter, index) => {
    sourceVerseLists[index].forEach((verse) => {
      const hebrew = mapSeptuagintPsalmReferenceToHebrew(sourceChapter, verse.verseNumber);
      if (hebrew && hebrew.chapter === displayChapter) {
        mapped.push({ ...verse, verseNumber: hebrew.verse });
      }
    });
  });

  return mapped.sort((a, b) => a.verseNumber - b.verseNumber);
}

/** The Coptic-only "preface" line some Psalms carry (e.g. Psalm 50's "Have mercy on me, O God") — stored as Septuagint chapter 0-index verse in some datasets; the live schema doesn't have a dedicated column for this yet, so this always returns null until that's added. */
export function getDisplayedPsalmPreface(): { english: string; arabic: string; coptic: string } | null {
  return null;
}
