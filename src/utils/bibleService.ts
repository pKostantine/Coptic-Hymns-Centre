import { contentDataClient as supabase } from '../services/contentDataClient';

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
  verseNumber: BibleVerseNumber;
  english: string;
  /** NKJV rendering — Old Testament protocanon only. Empty for the New Testament, the deuterocanon, and the LXX-only chapters/verses the NKJV has no counterpart for (Susanna, Bel, the Esther additions, Psalm 151, the LXX Jeremiah surplus). */
  englishNkjv: string;
  englishFromCoptic: string;
  coptic: string;
  greek: string;
  arabic: string;
  arabicFromCoptic: string;
  /** French rendering — present for nearly every verse of every book, but not quite all of them. */
  french: string;
  isLxxAddition?: boolean;
  isPsalmIntroduction?: boolean;
}

export type PsalmNumbering = 'septuagint' | 'masoretic';
export type BibleVerseNumber = number | string;

const PSALMS_KEY = 'psalms';
const ESTHER_KEY = 'esther';
const DANIEL_KEY = 'daniel';
const BIBLE_CHAPTER_VERSE_FIELDS = 'verse_number, english, english_nkjv, coptic, greek, arabic, french';
const PSALM_CHAPTER_VERSE_FIELDS = 'verse_number, english, english_nkjv, english_from_coptic, coptic, greek, arabic, arabic_from_coptic, french';
const ESTHER_ADDITION_CHAPTER_LABELS: Record<number, string> = { 0: 'A', 11: 'B', 12: 'C' };
const ESTHER_ADDITION_CHAPTER_ARABIC_LABELS: Record<number, string> = { 0: 'أ', 11: 'ب', 12: 'ت' };
const DANIEL_ADDITION_CHAPTERS = new Set([0, 13, 14]);
const ARABIC_LETTER_SUFFIXES = ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'];
const EASTERN_ARABIC_DIGITS: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩',
};

export interface BibleChapterTitle {
  english: string;
  arabic: string;
}

const SPECIAL_CHAPTER_TITLES: Record<string, Record<number, BibleChapterTitle>> = {
  daniel: {
    0: { english: 'Susanna', arabic: 'سوسنة' },
    13: { english: 'Bel and the Dragon', arabic: 'بيل والتنين' },
    14: { english: '14th Vision of Daniel', arabic: 'رؤيا دانيال الرابعة عشرة' },
  },
  second_chronicles: {
    37: { english: 'Prayer of Manasseh', arabic: 'صلاة منسى' },
  },
};

function normalizeBookKey(bookKey: string): string {
  const normalized = bookKey.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (['2_chronicles', 'ii_chronicles', 'chronicles_2', 'chronicles_ii'].includes(normalized)) return 'second_chronicles';
  return normalized;
}

function normalizeVerseNumber(value: unknown): BibleVerseNumber {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return /^\d+$/.test(text) ? Number(text) : text;
}

function formatArabicDigits(text: string): string {
  return String(text || '').replace(/\d/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit);
}

function formatArabicLetterSuffixes(text: string): string {
  return String(text || '').replace(/[a-z]/gi, (letter) => {
    const index = letter.toLowerCase().charCodeAt(0) - 97;
    return ARABIC_LETTER_SUFFIXES[index] || letter;
  });
}

export function getBibleVerseDisplayLabel(verseNumber: BibleVerseNumber, appLanguage: 'en' | 'ar' = 'en'): string {
  const text = String(verseNumber);
  if (appLanguage !== 'ar') return text;
  return formatArabicLetterSuffixes(formatArabicDigits(text));
}

export function isPsalmIntroductionVerseNumber(verseNumber: BibleVerseNumber): boolean {
  return String(verseNumber).trim().toLowerCase() === 'i';
}

function compareBibleVerseNumbers(a: BibleVerseNumber, b: BibleVerseNumber, psalmIntroductionsFirst = false): number {
  if (psalmIntroductionsFirst) {
    const aIntroduction = isPsalmIntroductionVerseNumber(a);
    const bIntroduction = isPsalmIntroductionVerseNumber(b);
    if (aIntroduction || bIntroduction) return aIntroduction === bIntroduction ? 0 : aIntroduction ? -1 : 1;
  }

  const aText = String(a);
  const bText = String(b);
  const aMatch = aText.match(/^(\d+)([a-z]*)$/i);
  const bMatch = bText.match(/^(\d+)([a-z]*)$/i);
  const aNumber = aMatch ? Number(aMatch[1]) : Number(a);
  const bNumber = bMatch ? Number(bMatch[1]) : Number(b);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber) && aNumber !== bNumber) return aNumber - bNumber;
  const aSuffix = aMatch?.[2]?.toLowerCase() || '';
  const bSuffix = bMatch?.[2]?.toLowerCase() || '';
  return aSuffix.localeCompare(bSuffix);
}

function compareBibleChapters(bookKey: string, a: number, b: number): number {
  if (normalizeBookKey(bookKey) !== ESTHER_KEY) return a - b;
  const estherOrder = (chapter: number) => {
    if (chapter === 0) return 0;
    if (chapter >= 1 && chapter <= 4) return chapter;
    if (chapter === 11) return 4.5;
    if (chapter >= 5 && chapter <= 10) return chapter;
    if (chapter === 12) return 10.5;
    return chapter;
  };
  return estherOrder(a) - estherOrder(b);
}

export function isEstherAdditionChapter(bookKey: string | null | undefined, chapterNumber: number): boolean {
  return normalizeBookKey(bookKey || '') === ESTHER_KEY && Boolean(ESTHER_ADDITION_CHAPTER_LABELS[chapterNumber]);
}

export function isEstherAdditionVerse(bookKey: string | null | undefined, chapterNumber: number, verseNumber: BibleVerseNumber): boolean {
  if (normalizeBookKey(bookKey || '') !== ESTHER_KEY) return false;
  return isEstherAdditionChapter(bookKey, chapterNumber) || /[a-z]/i.test(String(verseNumber));
}

export function isBibleLxxAdditionChapter(bookKey: string | null | undefined, chapterNumber: number): boolean {
  const normalizedBookKey = normalizeBookKey(bookKey || '');
  return isEstherAdditionChapter(bookKey, chapterNumber) || (normalizedBookKey === DANIEL_KEY && DANIEL_ADDITION_CHAPTERS.has(chapterNumber));
}

export function isBibleLxxAdditionVerse(bookKey: string | null | undefined, chapterNumber: number, verseNumber: BibleVerseNumber): boolean {
  return isBibleLxxAdditionChapter(bookKey, chapterNumber) || isEstherAdditionVerse(bookKey, chapterNumber, verseNumber);
}

export function getBibleSpecialChapterTitle(bookKey: string | null | undefined, chapterNumber: number): BibleChapterTitle | null {
  if (!bookKey) return null;
  return SPECIAL_CHAPTER_TITLES[normalizeBookKey(bookKey)]?.[chapterNumber] || null;
}

export function getBibleChapterDisplayLabel(bookKey: string | null | undefined, chapterNumber: number, appLanguage: 'en' | 'ar' = 'en'): string {
  if (normalizeBookKey(bookKey || '') === ESTHER_KEY && ESTHER_ADDITION_CHAPTER_LABELS[chapterNumber]) {
    return appLanguage === 'ar'
      ? ESTHER_ADDITION_CHAPTER_ARABIC_LABELS[chapterNumber]
      : ESTHER_ADDITION_CHAPTER_LABELS[chapterNumber];
  }
  const specialTitle = getBibleSpecialChapterTitle(bookKey, chapterNumber);
  if (!specialTitle) return appLanguage === 'ar' ? formatArabicDigits(String(chapterNumber)) : String(chapterNumber);
  if (appLanguage === 'ar') return specialTitle.arabic;
  return specialTitle.english;
}

export function getBibleChapterMenuLabel(bookKey: string | null | undefined, chapterNumber: number, appLanguage: 'en' | 'ar' = 'en'): string {
  return getBibleChapterDisplayLabel(bookKey, chapterNumber, appLanguage);
}

export function getBibleChapterHeaderTitle(
  book: Pick<BibleBook, 'titleEnglish' | 'titleArabic'> | null | undefined,
  fallbackTitle: string | null | undefined,
  fallbackArabic: string | null | undefined,
  bookKey: string | null | undefined,
  chapterNumber: number,
  appLanguage: 'en' | 'ar' = 'en',
): string {
  const chapterLabel = getBibleChapterMenuLabel(bookKey, chapterNumber, appLanguage);
  const normalizedBookKey = normalizeBookKey(bookKey || '');
  const englishBookTitle = normalizedBookKey === PSALMS_KEY
    ? 'Psalm'
    : book?.titleEnglish || fallbackTitle || bookKey || '';
  const arabicBookTitle = normalizedBookKey === PSALMS_KEY
    ? 'مزمور'
    : book?.titleArabic || fallbackArabic || fallbackTitle || bookKey || '';

  if (appLanguage === 'ar') {
    return `${arabicBookTitle} ${chapterLabel}`.trim();
  }
  return `${englishBookTitle} ${chapterLabel}`.trim();
}

// ─── Book metadata (small, cached for the whole session) ──────────────────

let booksPromise: Promise<BibleBook[]> | null = null;

function isBibleBookToggledOn(value: unknown): boolean {
  if (value === false) return false;
  if (typeof value === 'string' && value.trim().toLowerCase() === 'false') return false;
  return true;
}

async function loadBibleBookToggleMap(): Promise<Map<string, boolean>> {
  const { data, error } = await supabase
    .schema('bible')
    .from('books')
    .select('book_key, toggled');
  if (error) throw new Error(`Unable to load Bible book toggles: ${error.message}`);
  return new Map(((data || []) as any[]).map((row) => [row.book_key, isBibleBookToggledOn(row.toggled)]));
}

async function loadBibleBooks(): Promise<BibleBook[]> {
  const [{ data, error }, toggleMap] = await Promise.all([
    supabase.rpc('get_bible_books'),
    loadBibleBookToggleMap(),
  ]);
  if (error) throw new Error(`Unable to load Bible books: ${error.message}`);
  return ((data || []) as any[])
    .filter((row) => toggleMap.get(row.book_key) !== false)
    .map((row) => ({
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

async function assertBibleBookVisible(bookKey: string): Promise<void> {
  const book = await getBibleBook(bookKey);
  if (!book) throw new Error('This Bible book is not available.');
}

// ─── Chapter verse cache (per book:chapter, in the DB's own — Septuagint for
// Psalms — numbering) ───────────────────────────────────────────────────────

const chapterCache = new Map<string, Promise<BibleVerse[]>>();

async function loadChapterVerses(bookKey: string, chapterNumber: number): Promise<BibleVerse[]> {
  const isPsalms = normalizeBookKey(bookKey) === PSALMS_KEY;
  const { data, error } = await supabase
    .schema('bible')
    .from('verses')
    .select(isPsalms ? PSALM_CHAPTER_VERSE_FIELDS : BIBLE_CHAPTER_VERSE_FIELDS)
    .eq('book_key', bookKey)
    .eq('chapter_number', chapterNumber)
    .order('verse_number');
  if (error) throw new Error(`Unable to load ${bookKey} ${chapterNumber}: ${error.message}`);
  return ((data || []) as any[])
    .map((row) => {
      const verseNumber = normalizeVerseNumber(row.verse_number);
      return {
        verseNumber,
        english: row.english || '',
        englishNkjv: row.english_nkjv || '',
        englishFromCoptic: isPsalms ? row.english_from_coptic || '' : '',
        coptic: row.coptic || '',
        greek: row.greek || '',
        arabic: row.arabic || '',
        arabicFromCoptic: isPsalms ? row.arabic_from_coptic || '' : '',
        french: row.french || '',
        isPsalmIntroduction: isPsalms && isPsalmIntroductionVerseNumber(verseNumber),
      };
    })
    .map((verse) => ({ ...verse, isLxxAddition: isBibleLxxAdditionVerse(bookKey, chapterNumber, verse.verseNumber) }))
    .sort((a, b) => compareBibleVerseNumbers(a.verseNumber, b.verseNumber, isPsalms));
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

const chapterKeysPromises = new Map<string, Promise<number[]>>();
const chapterKeysCache = new Map<string, number[]>();

async function loadBibleChapterKeys(bookKey: string, psalmNumbering: PsalmNumbering): Promise<number[]> {
  await assertBibleBookVisible(bookKey);

  if (bookKey === PSALMS_KEY && psalmNumbering === 'masoretic') {
    // Masoretic Psalms always has exactly 150 chapters — a fixed, well-known count.
    return Array.from({ length: 150 }, (_, i) => i + 1);
  }

  const { data, error } = await supabase.rpc('get_bible_chapter_list', { p_book_key: bookKey });
  if (error) throw new Error(`Unable to load chapters for ${bookKey}: ${error.message}`);
  return ((data || []) as BibleChapterMeta[])
    .map((row: any) => row.chapter_number as number)
    .sort((a, b) => compareBibleChapters(bookKey, a, b));
}

export function getCachedBibleChapterKeys(bookKey: string, psalmNumbering: PsalmNumbering = 'septuagint'): number[] | null {
  return chapterKeysCache.get(`${bookKey}:${psalmNumbering}`) ?? null;
}

export function getBibleChapterKeys(bookKey: string, psalmNumbering: PsalmNumbering = 'septuagint'): Promise<number[]> {
  const cacheKey = `${bookKey}:${psalmNumbering}`;
  let promise = chapterKeysPromises.get(cacheKey);
  if (!promise) {
    promise = loadBibleChapterKeys(bookKey, psalmNumbering)
      .then((keys) => {
        chapterKeysCache.set(cacheKey, keys);
        return keys;
      })
      .catch((err) => {
        chapterKeysPromises.delete(cacheKey);
        throw err;
      });
    chapterKeysPromises.set(cacheKey, promise);
  }
  return promise;
}

// ─── Public: verses for a chapter, in the requested display numbering ─────

export async function getDisplayedChapterVerses(
  bookKey: string,
  displayChapter: number,
  psalmNumbering: PsalmNumbering = 'septuagint',
): Promise<BibleVerse[]> {
  await assertBibleBookVisible(bookKey);

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
      if (typeof verse.verseNumber !== 'number') return;
      const hebrew = mapSeptuagintPsalmReferenceToHebrew(sourceChapter, verse.verseNumber);
      if (hebrew && hebrew.chapter === displayChapter) {
        mapped.push({ ...verse, verseNumber: hebrew.verse });
      }
    });
  });

  return mapped.sort((a, b) => compareBibleVerseNumbers(a.verseNumber, b.verseNumber));
}

/** The Coptic-only "preface" line some Psalms carry (e.g. Psalm 50's "Have mercy on me, O God") — stored as Septuagint chapter 0-index verse in some datasets; the live schema doesn't have a dedicated column for this yet, so this always returns null until that's added. */
export function getDisplayedPsalmPreface(): { english: string; arabic: string; coptic: string } | null {
  return null;
}
