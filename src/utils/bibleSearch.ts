import { BibleBook, getBibleBooks } from './bibleService';
import { contentDataClient as supabase } from '../services/contentDataClient';

/**
 * Search over the Bible.
 *
 * The matching itself is Postgres's, through bible.search_verses — stemmed,
 * ranked and indexed per rendering. This module is the typed way in, plus the
 * two things that belong on the client: reading a reference someone typed, and
 * cutting a snippet into its highlighted and unhighlighted pieces.
 */

/** One searchable rendering. These are exactly the columns a reader can see in a chapter. */
export type BibleSearchLanguage =
  | 'english'
  | 'english_nkjv'
  | 'english_from_coptic'
  | 'coptic'
  | 'greek'
  | 'arabic'
  | 'arabic_from_coptic'
  | 'french';

export const BIBLE_SEARCH_LANGUAGES: BibleSearchLanguage[] = [
  'english',
  'english_nkjv',
  'english_from_coptic',
  'coptic',
  'greek',
  'arabic',
  'arabic_from_coptic',
  'french',
];

export const BIBLE_SEARCH_LANGUAGE_LABELS: Record<BibleSearchLanguage, { english: string; arabic: string }> = {
  english: { english: 'English', arabic: 'الإنجليزية' },
  english_nkjv: { english: 'English (NKJV)', arabic: 'الإنجليزية (NKJV)' },
  english_from_coptic: { english: 'English from Coptic', arabic: 'الإنجليزية عن القبطية' },
  coptic: { english: 'Coptic', arabic: 'القبطية' },
  greek: { english: 'Greek', arabic: 'اليونانية' },
  arabic: { english: 'Arabic', arabic: 'العربية' },
  arabic_from_coptic: { english: 'Arabic from Coptic', arabic: 'العربية عن القبطية' },
  french: { english: 'French', arabic: 'الفرنسية' },
};

/**
 * How the words someone typed are joined.
 *
 * `all` and `any` are the two obvious ones; `phrase` requires the words
 * adjacent and in order; `websearch` is Postgres's own search-box grammar,
 * where "quoted words" are a phrase, a leading - excludes, and `or` alternates.
 */
export type BibleSearchMode = 'all' | 'any' | 'phrase' | 'websearch';
export type BibleSearchSort = 'relevance' | 'canonical';
export type BibleTestament = 'OT' | 'NT';

export interface BibleSearchOptions {
  query: string;
  languages?: BibleSearchLanguage[];
  mode?: BibleSearchMode;
  /** Match words by their beginning, so "bapti" finds "baptism" and "baptized". */
  prefix?: boolean;
  testament?: BibleTestament | null;
  bookKeys?: string[] | null;
  sort?: BibleSearchSort;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export interface BibleSearchResult {
  bookKey: string;
  bookOrder: number;
  testament: BibleTestament;
  titleEnglish: string;
  titleArabic: string;
  chapterNumber: number;
  /** Text, because some verses are "1a" and a Psalm heading is "i". */
  verseNumber: string;
  /** Which renderings this verse matched in, in display order. */
  matchedLanguages: BibleSearchLanguage[];
  /** Per matched rendering, the surrounding words with the matches marked. */
  snippets: Partial<Record<BibleSearchLanguage, string>>;
  rank: number;
}

export interface BibleSearchResponse {
  results: BibleSearchResult[];
  /** Every verse that matched, not just this page. */
  total: number;
}

interface SearchRow {
  book_key: string;
  book_order: number;
  testament: string;
  title_english: string | null;
  title_arabic: string | null;
  chapter_number: number;
  verse_number: string;
  matched_languages: string[] | null;
  snippets: Record<string, string> | null;
  rank: number | null;
  total_count: number | string | null;
}

export async function searchBible(options: BibleSearchOptions): Promise<BibleSearchResponse> {
  const query = String(options.query || '').trim();
  if (!query) return { results: [], total: 0 };

  let request = supabase.schema('bible').rpc('search_verses', {
    p_query: query,
    p_languages: options.languages?.length ? options.languages : null,
    p_mode: options.mode || 'all',
    p_prefix: Boolean(options.prefix),
    p_testament: options.testament || null,
    p_book_keys: options.bookKeys?.length ? options.bookKeys : null,
    p_sort: options.sort || 'relevance',
    p_limit: options.limit ?? 25,
    p_offset: options.offset ?? 0,
  });
  if (options.signal) request = request.abortSignal(options.signal);

  const { data, error } = await request;
  if (error) throw new Error(`Unable to search the Bible: ${error.message}`);

  const rows = (data || []) as SearchRow[];
  return {
    // Every row carries the same total; with no rows at all there were none.
    total: rows.length ? Number(rows[0].total_count) || 0 : 0,
    results: rows.map((row) => ({
      bookKey: row.book_key,
      bookOrder: row.book_order,
      testament: row.testament === 'NT' ? 'NT' : 'OT',
      titleEnglish: row.title_english || row.book_key,
      titleArabic: row.title_arabic || '',
      chapterNumber: row.chapter_number,
      verseNumber: String(row.verse_number),
      matchedLanguages: (row.matched_languages || []) as BibleSearchLanguage[],
      snippets: (row.snippets || {}) as Partial<Record<BibleSearchLanguage, string>>,
      rank: Number(row.rank) || 0,
    })),
  };
}

// ─── Snippets ──────────────────────────────────────────────────────────────

/**
 * The markers bible.search_verses wraps matched words in. Triple braces
 * because they occur nowhere in any rendering of any verse, where the single
 * brackets and angle brackets that translations use editorially do.
 */
const MATCH_OPEN = '{{{';
const MATCH_CLOSE = '}}}';

export interface SnippetSegment {
  text: string;
  /** True for the words that actually matched — the ones worth marking. */
  match: boolean;
}

/**
 * Cuts a snippet into plain and matched runs, so the marking survives into a
 * Text tree without the markers ever being shown.
 *
 * Deliberately tolerant: an unclosed marker yields the rest of the snippet as
 * a match rather than swallowing it or leaking braces into the page.
 */
export function splitSnippet(snippet: string | undefined | null): SnippetSegment[] {
  const source = String(snippet || '');
  if (!source) return [];

  const segments: SnippetSegment[] = [];
  let index = 0;

  while (index < source.length) {
    const open = source.indexOf(MATCH_OPEN, index);
    if (open < 0) {
      segments.push({ text: source.slice(index), match: false });
      break;
    }
    if (open > index) segments.push({ text: source.slice(index, open), match: false });

    const close = source.indexOf(MATCH_CLOSE, open + MATCH_OPEN.length);
    if (close < 0) {
      segments.push({ text: source.slice(open + MATCH_OPEN.length), match: true });
      break;
    }
    segments.push({ text: source.slice(open + MATCH_OPEN.length, close), match: true });
    index = close + MATCH_CLOSE.length;
  }

  return segments.filter((segment) => segment.text.length > 0);
}

// ─── Reading a reference someone typed ─────────────────────────────────────

export interface BibleReference {
  bookKey: string;
  titleEnglish: string;
  titleArabic: string;
  chapter: number;
  /** Absent when only a chapter was named. */
  verse?: number;
  /** The far end of "3:16-18". */
  endVerse?: number;
}

const EASTERN_ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

/**
 * English ordinals as they get typed, folded to the digit the book lists use,
 * so "1 John", "I John" and "First John" are one name.
 *
 * English only, and deliberately. English puts the ordinal before the name —
 * "3 John" — where Arabic puts it after — "يوحنا الثالثة". Folding the Arabic
 * word to a digit would turn 3 John into "يوحنا 3", which is exactly what
 * someone typing John chapter 3 writes, and the book match being greedy would
 * take the epistle every time.
 */
const ORDINAL_WORDS: Record<string, string> = {
  i: '1', ii: '2', iii: '3',
  first: '1', second: '2', third: '3',
  '1st': '1', '2nd': '2', '3rd': '3',
};

/**
 * Folds a name to something comparable: one case, Western digits, no
 * punctuation or Arabic diacritics, ordinals as digits, and the Arabic letter
 * forms that vary by keyboard settled on one spelling.
 */
function normalizeName(value: string): string {
  const folded = String(value || '')
    .toLowerCase()
    .replace(/[٠-٩]/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit)
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    // "John3:16" is a reference too. Split where a letter runs straight into a
    // digit, which only ever happens between a name and a chapter — never
    // inside one. Written as a capture rather than a lookbehind, which Hermes
    // has not always had, and one-directional so "1st" and "3rd" survive.
    .replace(/(\p{L})(\p{N})/gu, '$1 $2')
    .trim();

  return folded
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ORDINAL_WORDS[word] ?? word)
    // "the book of genesis" and "genesis" are the same book.
    .filter((word) => word !== 'the' && word !== 'book' && word !== 'of')
    .join(' ');
}

function referenceNamesFor(book: BibleBook): string[] {
  return [book.titleEnglish, book.titleArabic, book.bookKey, ...(book.aliases || [])]
    .map(normalizeName)
    .filter(Boolean);
}

/**
 * Reads "John 3:16", "1 Cor 13", "Jn 3:16-18", "مزمور ٥٠" and the like.
 *
 * The book name is taken greedily from the front — longest run of words that
 * names a book — because the name itself can begin with a number ("1 Samuel")
 * and can be several words long ("Song of Songs"). Whatever is left has to be
 * a chapter, optionally a verse, optionally a range; anything else means this
 * was not a reference at all and the text should just be searched for.
 */
export function parseBibleReference(input: string, books: BibleBook[]): BibleReference | null {
  const raw = String(input || '').trim();
  if (!raw || !books.length) return null;

  const normalized = normalizeName(raw);
  if (!normalized) return null;

  const byName = new Map<string, BibleBook>();
  for (const book of books) {
    for (const name of referenceNamesFor(book)) {
      if (!byName.has(name)) byName.set(name, book);
    }
  }

  const words = normalized.split(' ');
  for (let take = Math.min(words.length, 6); take >= 1; take -= 1) {
    const book = byName.get(words.slice(0, take).join(' '));
    if (!book) continue;

    const rest = words.slice(take).join(' ').trim();
    // A bare book name is a reference to its first chapter.
    if (!rest) {
      return { bookKey: book.bookKey, titleEnglish: book.titleEnglish, titleArabic: book.titleArabic, chapter: 1 };
    }

    // chapter, then an optional verse, then an optional end of a range. The
    // separators are whatever anyone actually types between them.
    const match = /^(\d+)(?:\s*(\d+)(?:\s*(\d+))?)?$/.exec(rest);
    if (!match) return null;

    const chapter = Number(match[1]);
    if (!Number.isFinite(chapter) || chapter < 0) return null;

    const verse = match[2] ? Number(match[2]) : undefined;
    const endVerse = match[3] ? Number(match[3]) : undefined;
    if (verse !== undefined && endVerse !== undefined && endVerse < verse) return null;

    return {
      bookKey: book.bookKey,
      titleEnglish: book.titleEnglish,
      titleArabic: book.titleArabic,
      chapter,
      verse,
      endVerse,
    };
  }

  return null;
}

/** The same, against the book list the rest of the app already has cached. */
export async function resolveBibleReference(input: string): Promise<BibleReference | null> {
  const books = await getBibleBooks();
  return parseBibleReference(input, books);
}

/** "John 3:16", "John 3:16-18", "John 3" — for showing what a reference was read as. */
export function formatBibleReference(reference: BibleReference, appLanguage: 'en' | 'ar' = 'en'): string {
  const title = appLanguage === 'ar' ? reference.titleArabic || reference.titleEnglish : reference.titleEnglish;
  if (reference.verse === undefined) return `${title} ${reference.chapter}`;
  if (reference.endVerse === undefined) return `${title} ${reference.chapter}:${reference.verse}`;
  return `${title} ${reference.chapter}:${reference.verse}-${reference.endVerse}`;
}
