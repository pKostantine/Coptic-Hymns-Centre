import type { DocumentSection } from '../components/chc/documentHtml';
import { toIsoDate as toIsoDateString } from './dateUtils';
import { FIXED_FEASTS } from './fixedFeasts';
import { hydrateSupabaseServiceHymn } from './hymnLibrary';
import { stripAlleluiaFromPsalmVerse } from './psalmReadingText';
import { NESI_MONTH, shouldUseNesiSundayReadings } from './readingCalendarRules';
import { supabase } from './supabase';
import { formatVerses } from './verseFormatting';

// calendar.reading_rules stores Psalm references (calendar book number 19)
// in Septuagint (LXX) chapter/verse numbering, matching bible.verses directly.
// No conversion is needed at query time.
const PSALMS_CALENDAR_NUMBER = 19;
const BIBLE_VERSE_FIELDS = 'chapter_number, verse_number, english, coptic, arabic';
const PSALM_VERSE_FIELDS = 'chapter_number, verse_number, english:english_from_coptic, coptic, arabic:arabic_from_coptic';
const BIBLE_VERSE_PART_FIELDS = 'english, coptic, arabic';
const PSALM_VERSE_PART_FIELDS = 'english:english_from_coptic, coptic, arabic:arabic_from_coptic';

function getBibleVerseSelectFields(bookNum: number): string {
  return bookNum === PSALMS_CALENDAR_NUMBER ? PSALM_VERSE_FIELDS : BIBLE_VERSE_FIELDS;
}

function getBibleVersePartSelectFields(bookNum: number): string {
  return bookNum === PSALMS_CALENDAR_NUMBER ? PSALM_VERSE_PART_FIELDS : BIBLE_VERSE_PART_FIELDS;
}

// ─── Gospel author substitution (Coptic Gospel Rite's "[AUTHOR]" placeholder) ─

const GOSPEL_AUTHORS: Record<string, { english: string; coptic: string; arabic: string }> = {
  matthew: { english: 'Matthew', coptic: 'ⲙⲁⲧⲑⲉⲟⲛ', arabic: 'متى' },
  mark: { english: 'Mark', coptic: 'ⲙⲁⲣⲕⲟⲛ', arabic: 'مرقس' },
  luke: { english: 'Luke', coptic: 'ⲗⲟⲩⲕⲁⲛ', arabic: 'لوقا' },
  john: { english: 'John', coptic: 'ⲓⲱⲁⲛⲛⲏⲛ', arabic: 'يوحنا' },
};

function substituteAuthor(text: string, language: 'english' | 'coptic' | 'arabic', bookKey: string | null): string {
  if (!text || !text.includes('[AUTHOR]')) return text;
  const author = bookKey ? GOSPEL_AUTHORS[bookKey] : null;
  return text.split('[AUTHOR]').join(author ? author[language] : '');
}

function substituteAuthorInSections(sections: DocumentSection[], bookKey: string | null): DocumentSection[] {
  return sections.map((section) => ({
    ...section,
    verses: section.verses.map((verse) => ({
      ...verse,
      english: substituteAuthor(verse.english, 'english', bookKey),
      coptic: substituteAuthor(verse.coptic, 'coptic', bookKey),
      arabic: substituteAuthor(verse.arabic, 'arabic', bookKey),
    })),
  }));
}

// ─── Step 1: what applies today ────────────────────────────────────────────

async function getActiveFlags(isoDate: string): Promise<Set<string>> {
  const { data, error } = await supabase.schema('calendar').rpc('get_active_flags_for_date', { p_gregorian_date: isoDate });
  if (error) throw new Error(`Unable to load active flags: ${error.message}`);
  return new Set(((data || []) as { flag_key: string }[]).map((row) => row.flag_key));
}

interface CopticDateInfo {
  copticYear: number;
  copticMonth: number;
  copticMonthName: string;
  copticDay: number;
  weekdayNumber: number;
  sundayOrdinalInCopticMonth: number | null;
}

async function getCopticDateInfo(isoDate: string): Promise<CopticDateInfo> {
  const { data, error } = await supabase
    .schema('calendar')
    .from('coptic_date_conversions')
    .select('coptic_year, coptic_month, coptic_month_name, coptic_day, weekday_number, sunday_ordinal_in_coptic_month')
    .eq('gregorian_date', isoDate)
    .maybeSingle();
  if (error) throw new Error(`Unable to load Coptic date info: ${error.message}`);
  if (!data) throw new Error(`No Coptic date conversion found for ${isoDate}`);
  return {
    copticYear: data.coptic_year,
    copticMonth: data.coptic_month,
    copticMonthName: data.coptic_month_name,
    copticDay: data.coptic_day,
    weekdayNumber: data.weekday_number,
    sundayOrdinalInCopticMonth: data.sunday_ordinal_in_coptic_month,
  };
}

async function getSeasonRange(isoDate: string, activeSeason: 'Great Fast' | 'Holy 50 Days'): Promise<{ startDate: string; endDate: string } | null> {
  const { data, error } = await supabase
    .schema('calendar')
    .from('season_ranges')
    .select('start_date, end_date')
    .eq('active_season', activeSeason)
    .lte('start_date', isoDate)
    .gte('end_date', isoDate)
    .maybeSingle();
  if (error) throw new Error(`Unable to load season range: ${error.message}`);
  return data ? { startDate: data.start_date, endDate: data.end_date } : null;
}

function daysBetween(startIso: string, endIso: string): number {
  const start = Date.UTC(...(startIso.split('-').map(Number) as [number, number, number]));
  const end = Date.UTC(...(endIso.split('-').map(Number) as [number, number, number]));
  return Math.round((end - start) / 86400000);
}

/** Monday of the same week as `isoDate` (week 1 of Lent starts on the first Monday of Lent, not the day Lent starts). */
function nextMonday(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.getUTCDay(); // 0=Sunday
  const offset = weekday === 1 ? 0 : weekday === 0 ? 1 : 8 - weekday;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function getLentWeek(isoDate: string, activeFlags: Set<string>): Promise<number | null> {
  if (!activeFlags.has('Lent')) return null;
  const range = await getSeasonRange(isoDate, 'Great Fast');
  if (!range) return null;
  const lentWeek1Monday = nextMonday(range.startDate);
  if (isoDate < lentWeek1Monday) return null;
  return Math.floor(daysBetween(lentWeek1Monday, isoDate) / 7) + 1;
}

async function getPentecostWeek(isoDate: string, activeFlags: Set<string>): Promise<number | null> {
  if (!activeFlags.has('PentecostPeriod')) return null;
  const range = await getSeasonRange(isoDate, 'Holy 50 Days');
  if (!range) return null;
  return Math.floor(daysBetween(range.startDate, isoDate) / 7) + 1;
}

// ─── Step 2: resolve calendar.reading_rules ────────────────────────────────

export interface ReadingRule {
  reading_rule_id: string;
  cycle_type: string;
  priority: number;
  service: string;
  reading_type: string;
  reading_code: string;
  reading_reference: string;
  sunday_message: string | null;
}

const READING_RULE_FIELDS = 'reading_rule_id, cycle_type, priority, service, reading_type, reading_code, reading_reference, sunday_message';

async function queryReadingRules(filters: Record<string, string | number>): Promise<ReadingRule[]> {
  let query = supabase.schema('calendar').from('reading_rules').select(READING_RULE_FIELDS);
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Unable to load reading rules: ${error.message}`);
  return (data || []) as unknown as ReadingRule[];
}

/** Highest-priority rule per (service, reading_type) within a single already-chosen tier — a defensive dedupe in case a tier's query ever returns more than one row for the same reading, never a cross-tier comparison. */
function pickHighestPriorityPerServiceType(rules: ReadingRule[]): ReadingRule[] {
  const resolved = new Map<string, ReadingRule>();
  for (const rule of rules) {
    const key = `${rule.service}|${rule.reading_type}`;
    const existing = resolved.get(key);
    if (!existing || rule.priority > existing.priority) {
      resolved.set(key, rule);
    }
  }
  return Array.from(resolved.values());
}

/**
 * The 4 katameros (lectionary) books are checked in a strict priority chain
 * — not merged by the in-DB `priority` column across cycle_types — only the
 * one winning tier's rules are ever queried/used:
 *   1. Holy 50 Days (Pascha through Pentecost) — if today falls anywhere in
 *      it, that's the only book referenced, full stop.
 *   2. A fixed-date Feast of the Lord, Nayrouz, or the Feast of the Cross
 *      (see FIXED_FEASTS) — that day's own Daily reading overrides Lent/
 *      Sunday even if today would otherwise fall within one of those. The
 *      Feast of the Cross is a 3-day feast (Thoout 17-19), but FIXED_FEASTS
 *      only lists day 17 (the feast's first day) — days 18-19 fall straight
 *      through to the normal chain below, exactly as intended (e.g. if day
 *      18 is a Sunday, the Sunday katameros takes priority as usual).
 *   3. Great Lent.
 *   4. An annual Sunday — only actual Sundays have a Sunday-katameros entry.
 *      In a Coptic year with no Sunday during Nesi, the final Mesore Sunday
 *      uses Nesi's Sunday readings. If no matching entry exists, this falls
 *      through to the Daily book below rather than returning nothing.
 *   5. The plain Daily katameros — the fallback everything else lands on.
 */
async function resolveReadingRules(isoDate: string, activeFlags: Set<string>): Promise<ReadingRule[]> {
  const copticDate = await getCopticDateInfo(isoDate);
  const [lentWeek, pentecostWeek] = await Promise.all([
    getLentWeek(isoDate, activeFlags),
    getPentecostWeek(isoDate, activeFlags),
  ]);

  let rules: ReadingRule[];

  if (pentecostWeek != null) {
    rules = await queryReadingRules({ cycle_type: 'Pentecost', pentecost_week: pentecostWeek, day_of_week: copticDate.weekdayNumber });
  } else if (
    FIXED_FEASTS.some((feast) => {
      if (feast.monthName !== copticDate.copticMonthName || feast.day !== copticDate.copticDay) return false;
      // Suppressed (e.g. Annunciation falling in Holy Week some years) means
      // it isn't actually being celebrated today — don't grant feast priority.
      if (feast.key === 'annunciation' && activeFlags.has('AnnunciationFeastNotCelebratedThisYear')) return false;
      return true;
    })
  ) {
    rules = await queryReadingRules({ cycle_type: 'AnnualDaily', coptic_month: copticDate.copticMonth, coptic_day: copticDate.copticDay });
  } else if (lentWeek != null) {
    rules = await queryReadingRules({ cycle_type: 'GreatLent', lent_week: lentWeek, day_of_week: copticDate.weekdayNumber });
  } else {
    rules = [];
    if (copticDate.sundayOrdinalInCopticMonth != null) {
      const useNesiSundayReadings = await shouldUseNesiSundayReadings(copticDate);
      rules = await queryReadingRules({
        cycle_type: 'AnnualSunday',
        coptic_month: useNesiSundayReadings ? NESI_MONTH : copticDate.copticMonth,
        sunday_ordinal: useNesiSundayReadings ? 1 : copticDate.sundayOrdinalInCopticMonth,
        day_of_week: copticDate.weekdayNumber,
      });
    }
    if (!rules.length) {
      rules = await queryReadingRules({ cycle_type: 'AnnualDaily', coptic_month: copticDate.copticMonth, coptic_day: copticDate.copticDay });
    }
  }

  // Belt-and-braces: even within the winning tier, never let a suppressed
  // Annunciation reading slip through.
  if (activeFlags.has('AnnunciationFeastNotCelebratedThisYear')) {
    rules = rules.filter((rule) => !rule.reading_rule_id.toLowerCase().includes('annunciation'));
  }

  return pickHighestPriorityPerServiceType(rules);
}

// ─── Book-specific condition flags for readings.hymn_texts introductions ───
// readings.hymn_texts's introductionToThePaulineEpistle/introductionToTheCatholicEpistle
// rows each carry a condition like "PaulineEpistleRomans"/"CatholicEpistle1Peter"
// selecting the one line matching today's actual epistle. These flags don't
// come from any calendar RPC — they're derived here from the same
// reading_rules resolution as everything else, converting the winning rule's
// book_key (e.g. "first_corinthians") into the PascalCase suffix the DB's
// condition strings use ("1Corinthians"). Praxis has no book-specific intro
// (always "the Acts of our fathers the apostles"), so it needs no flag.
const BOOK_KEY_NUMERAL_WORDS: Record<string, string> = { first: '1', second: '2', third: '3' };

function bookKeyToConditionSuffix(bookKey: string): string {
  return bookKey
    .split('_')
    .map((part) => BOOK_KEY_NUMERAL_WORDS[part] || part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** Shared by getEpistleConditionFlags (fetches its own rules) and getReadingsForDate (already has rules resolved, so it calls this directly instead of re-fetching). */
async function computeEpistleConditionFlagsFromRules(rules: ReadingRule[]): Promise<Record<string, boolean>> {
  const flags: Record<string, boolean> = {};
  await Promise.all(
    [
      { rule: rules.find((r) => r.service === 'Pauline' && r.reading_type === 'Pauline Epistle'), prefix: 'PaulineEpistle' },
      { rule: rules.find((r) => r.service === 'Catholic' && r.reading_type === 'Catholic Epistle'), prefix: 'CatholicEpistle' },
    ].map(async ({ rule, prefix }) => {
      if (!rule) return;
      const firstSegment = splitReadingReference(rule.reading_reference)[0];
      if (!firstSegment) return;
      const { bookNum } = parseSegment(firstSegment);
      const bookKey = await getBookKeyByCalendarNumber(bookNum);
      if (!bookKey) return;
      flags[`${prefix}${bookKeyToConditionSuffix(bookKey)}`] = true;
    }),
  );
  return flags;
}

/** Resolves the day's { PaulineEpistleRomans: true } / { CatholicEpistle1Peter: true } -style condition flags — pass straight through as extraContext to hydrateSupabaseServiceHymn so readings.hymn_texts's book-specific introduction lines pick the right one. */
export async function getEpistleConditionFlags(date: Date): Promise<Record<string, boolean>> {
  const isoDate = toIsoDateString(date);
  const activeFlags = await getActiveFlags(isoDate);
  const rules = await resolveReadingRules(isoDate, activeFlags);
  return computeEpistleConditionFlagsFromRules(rules);
}

// ─── Step 3: parse reading_reference and fetch verses ──────────────────────

interface ReadingSegmentRange {
  kind: 'range';
  bookNum: number;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
}

// A verse token like "14" or "14a" — the trailing lowercase letter (never
// present on range boundaries, only in discrete/single-verse tokens) selects
// one editorial "part" of that verse from bible.verse_parts instead of the
// verse's own full text, e.g. Psalm 101:11a is just the first clause of
// 101:11. `partLabel` is always exactly one lowercase letter (matching the
// DB column's own constraint) or null for an ordinary whole-verse token.
interface VerseToken {
  verseNum: number;
  partLabel: string | null;
}

function parseVerseToken(token: string): VerseToken {
  const match = token.match(/^(\d+)([a-z])?$/);
  if (!match) throw new Error(`Malformed verse token "${token}" in reading_reference`);
  return { verseNum: Number(match[1]), partLabel: match[2] ?? null };
}

function parseVerseList(versePart: string): VerseToken[] {
  const tokens = versePart.split(',').flatMap((token) => {
    const cleaned = token.trim();
    const rangeMatch = cleaned.match(/^(\d+)-(\d+)$/);
    if (!rangeMatch) return [parseVerseToken(cleaned)];

    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (end < start) throw new Error(`Malformed verse range "${token}" in reading_reference`);
    return Array.from({ length: end - start + 1 }, (_, index) => ({ verseNum: start + index, partLabel: null }));
  });
  const seen = new Set<string>();
  return tokens.filter((token) => {
    const key = `${token.verseNum}${token.partLabel ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseNumericVerseNumber(value: unknown): number | null {
  const match = String(value ?? '').trim().match(/^\d+$/);
  return match ? Number(match[0]) : null;
}

interface ReadingSegmentVerses {
  kind: 'verses';
  bookNum: number;
  chapter: number;
  verses: VerseToken[];
}

type ReadingSegment = ReadingSegmentRange | ReadingSegmentVerses;

function splitReadingReference(ref: string): string[] {
  return ref.split(/\*@\+|@/).map((s) => s.trim()).filter(Boolean);
}

function parseSegment(segment: string): ReadingSegment {
  const separatorIndex = segment.indexOf(':');
  const bookPart = separatorIndex === -1 ? segment : segment.slice(0, separatorIndex);
  const versePart = separatorIndex === -1 ? '' : segment.slice(separatorIndex + 1);
  const [bookNumStr, startChapterStr] = bookPart.split('.');
  const bookNum = Number(bookNumStr);
  const startChapter = Number(startChapterStr);

  if (versePart.includes(',')) {
    return { kind: 'verses', bookNum, chapter: startChapter, verses: parseVerseList(versePart) };
  }

  if (versePart.includes('-')) {
    const [startVerseStr, endPart] = versePart.split('-');
    if (endPart.includes(':')) {
      const [endChapterStr, endVerseStr] = endPart.split(':');
      return {
        kind: 'range',
        bookNum,
        startChapter,
        startVerse: Number(startVerseStr),
        endChapter: Number(endChapterStr),
        endVerse: Number(endVerseStr),
      };
    }
    return { kind: 'range', bookNum, startChapter, startVerse: Number(startVerseStr), endChapter: startChapter, endVerse: Number(endPart) };
  }

  // A single bare token can itself carry a part label ("19.102:11a", no
  // comma) — route that case through the 'verses' kind (as a one-item list)
  // so it reaches the part-lookup path below; an ordinary bare number keeps
  // today's 'range' shape (start == end) unchanged.
  const token = parseVerseToken(versePart);
  if (token.partLabel) {
    return { kind: 'verses', bookNum, chapter: startChapter, verses: [token] };
  }
  return { kind: 'range', bookNum, startChapter, startVerse: token.verseNum, endChapter: startChapter, endVerse: token.verseNum };
}

export interface ReadingVerse {
  /** The chapter:verse cited by reading_reference — in Septuagint numbering for Psalms, matching bible.verses directly. */
  displayChapter: number;
  displayVerse: number;
  /** Set when this is one editorial part of a verse (bible.verse_parts), e.g. "a" for 101:11a — append straight after displayVerse for the citation/badge, never shown on its own. */
  partLabel: string | null;
  english: string;
  coptic: string | null;
  arabic: string;
}

type ReadingVerseRow = { chapter_number: number; verse_number: number | string; english: string; coptic: string | null; arabic: string };
type ReadingVersePartRow = { english: string; coptic: string | null; arabic: string };

async function loadBookKeyByCalendarNumber(bookNum: number): Promise<string | null> {
  const { data, error } = await supabase.schema('bible').rpc('get_book_key_by_calendar_number', { p_calendar_number: bookNum });
  if (error) throw new Error(`Unable to resolve book number ${bookNum}: ${error.message}`);
  return (data as string) || null;
}

const bookKeyByCalendarNumberCache = new Map<number, Promise<string | null>>();

function getBookKeyByCalendarNumber(bookNum: number): Promise<string | null> {
  let cached = bookKeyByCalendarNumberCache.get(bookNum);
  if (!cached) {
    cached = loadBookKeyByCalendarNumber(bookNum);
    bookKeyByCalendarNumberCache.set(bookNum, cached);
  }
  return cached;
}

async function fetchVersePartByCalendar(bookKey: string, bookNum: number, chapter: number, verse: number, partLabel: string): Promise<ReadingVersePartRow | null> {
  if (bookNum === PSALMS_CALENDAR_NUMBER) {
    const { data, error } = await supabase
      .schema('bible')
      .from('verse_parts')
      .select(getBibleVersePartSelectFields(bookNum))
      .eq('book_key', bookKey)
      .eq('chapter_number', chapter)
      .eq('verse_number', verse)
      .eq('part_label', partLabel)
      .maybeSingle();
    if (error) throw new Error(`Unable to load verse part ${chapter}:${verse}${partLabel}: ${error.message}`);
    return (data as ReadingVersePartRow | null) ?? null;
  }

  const { data, error } = await supabase.schema('bible').rpc('get_verse_part_by_calendar', {
    p_calendar_book_number: bookNum,
    p_chapter: chapter,
    p_verse: verse,
    p_part_label: partLabel,
  });
  if (error) throw new Error(`Unable to load verse part ${chapter}:${verse}${partLabel}: ${error.message}`);
  return ((data || [])[0] as ReadingVersePartRow | undefined) ?? null;
}

async function fetchSegmentVerses(segment: ReadingSegment): Promise<ReadingVerse[]> {
  if (segment.kind === 'range') {
    const bookKey = await getBookKeyByCalendarNumber(segment.bookNum);
    if (!bookKey) return [];

    const { data, error } = await supabase
      .schema('bible')
      .from('verses')
      .select(getBibleVerseSelectFields(segment.bookNum))
      .eq('book_key', bookKey)
      .gte('chapter_number', segment.startChapter)
      .lte('chapter_number', segment.endChapter);
    if (error) throw new Error(`Unable to load reading verses: ${error.message}`);
    return ((data || []) as unknown as ReadingVerseRow[])
      .map((row): ReadingVerse | null => {
        const verseNumber = parseNumericVerseNumber(row.verse_number);
        if (verseNumber === null) return null;
        return {
          displayChapter: row.chapter_number,
          displayVerse: verseNumber,
          partLabel: null,
          english: row.english || '',
          coptic: row.coptic,
          arabic: row.arabic || '',
        };
      })
      .filter((verse): verse is ReadingVerse => {
        if (!verse) return false;
        if (verse.displayChapter < segment.startChapter || verse.displayChapter > segment.endChapter) return false;
        if (verse.displayChapter === segment.startChapter && verse.displayVerse < segment.startVerse) return false;
        if (verse.displayChapter === segment.endChapter && verse.displayVerse > segment.endVerse) return false;
        return true;
      })
      .sort((a, b) => a.displayChapter - b.displayChapter || a.displayVerse - b.displayVerse);
  }

  const bookKey = await getBookKeyByCalendarNumber(segment.bookNum);
  if (!bookKey) return [];

  // A part-labeled token ("11a") names one editorial excerpt of a verse
  // (bible.verse_parts), not the whole verse.
  const plainTokens = segment.verses.filter((v) => !v.partLabel);
  const partTokens = segment.verses
    .map((v, index) => ({ ...v, index }))
    .filter((v) => v.partLabel);

  const targets = plainTokens.map((v) => ({ chapter: segment.chapter, verse: v.verseNum }));
  const verseNumbersByChapter = new Map<number, string[]>();
  for (const t of targets) {
    const list = verseNumbersByChapter.get(t.chapter) || [];
    list.push(String(t.verse));
    verseNumbersByChapter.set(t.chapter, list);
  }

  const [plainResults, partResults] = await Promise.all([
    Promise.all(
      Array.from(verseNumbersByChapter.entries()).map(async ([chapter, verseNumbers]) => {
        const { data, error } = await supabase
          .schema('bible')
          .from('verses')
          .select(getBibleVerseSelectFields(segment.bookNum))
          .eq('book_key', bookKey)
          .eq('chapter_number', chapter)
          .in('verse_number', verseNumbers);
        if (error) throw new Error(`Unable to load reading verses: ${error.message}`);
        return ((data || []) as unknown as ReadingVerseRow[])
          .map((row): ReadingVerse | null => {
            const verseNumber = parseNumericVerseNumber(row.verse_number);
            if (verseNumber === null) return null;
            return {
              displayChapter: row.chapter_number,
              displayVerse: verseNumber,
              partLabel: null,
              english: row.english || '',
              coptic: row.coptic,
              arabic: row.arabic || '',
            };
          })
          .filter((verse): verse is ReadingVerse => Boolean(verse));
      }),
    ),
    Promise.all(
      partTokens.map(async (v): Promise<ReadingVerse | null> => {
        const versePart = await fetchVersePartByCalendar(bookKey, segment.bookNum, segment.chapter, v.verseNum, v.partLabel!);
        if (!versePart) return null;
        return {
          displayChapter: segment.chapter,
          displayVerse: v.verseNum,
          partLabel: v.partLabel,
          english: versePart.english || '',
          coptic: versePart.coptic,
          arabic: versePart.arabic || '',
        };
      }),
    ),
  ]);

  const plainRowsByVerse = new Map<number, ReadingVerse>();
  for (const verse of plainResults.flat()) plainRowsByVerse.set(verse.displayVerse, verse);
  const partRowsByIndex = new Map<number, ReadingVerse>(
    partResults
      .map((verse, index) => (verse ? [partTokens[index].index, verse] as const : null))
      .filter((entry): entry is readonly [number, ReadingVerse] => entry !== null),
  );

  return segment.verses
    .map((token, index) => (token.partLabel ? partRowsByIndex.get(index) : plainRowsByVerse.get(token.verseNum)))
    .filter((verse): verse is ReadingVerse => Boolean(verse));
}

async function fetchReadingReferenceVerses(reference: string): Promise<{ verses: ReadingVerse[]; firstBookNum: number | null }> {
  const segments = splitReadingReference(reference).map(parseSegment);
  const verseLists = await Promise.all(segments.map(fetchSegmentVerses));
  return { verses: verseLists.flat(), firstBookNum: segments[0]?.bookNum ?? null };
}

/**
 * Builds the citation-style title for a reading ("Matthew 25:1-13",
 * "Philippians 1:27-2:11", "Psalm 131:7,12-13") from reading_reference's own
 * segments. calendar.reading_rules joins discrete/non-contiguous verses with
 * "@", one segment per verse (e.g. Psalm 131:7,12-13 is written as three
 * separate one-verse segments) — every verse actually present, across every
 * segment, is what the citation is built from (via formatVerses), never
 * just the first segment's start and the last segment's end collapsed into
 * a min-max range: 7,12,13 is not the same reading as 7-13, which would
 * also silently claim verses 8-11 that were never part of it. The one
 * exception is a genuine cross-chapter span (e.g. "1:27-2:11"), always a
 * single continuous passage in this data model, never a discrete list —
 * detected below and kept as its own start-end dash citation.
 */
function buildReadingCitation(reference: string, bookTitle: { english: string; arabic: string }, isPsalm: boolean): { english: string; arabic: string } | null {
  if (!bookTitle.english && !bookTitle.arabic) return null;
  // A citation cites ONE psalm chapter, so it reads "Psalm 67:11" — the book
  // title itself ("Psalms"/"المزامير") is the whole-book plural, wrong here.
  const citationBookTitle = isPsalm ? { english: 'Psalm', arabic: 'مزمور' } : bookTitle;
  const segments = splitReadingReference(reference).map(parseSegment);
  if (!segments.length) return null;
  const first = segments[0];
  const last = segments[segments.length - 1];

  const firstStart = first.kind === 'range' ? { chapter: first.startChapter, verse: first.startVerse } : { chapter: first.chapter, verse: first.verses[0].verseNum };
  const lastEnd = last.kind === 'range' ? { chapter: last.endChapter, verse: last.endVerse } : { chapter: last.chapter, verse: last.verses[last.verses.length - 1].verseNum };

  if (firstStart.chapter !== lastEnd.chapter) {
    // A single range segment spanning chapters is a genuine continuous passage
    // ("Matthew 1:27-2:11") — cite as start-end. Multiple @-separated segments
    // across chapters are discrete verses; list each chapter separately.
    if (segments.length === 1 && first.kind === 'range') {
      const citation = `${firstStart.chapter}:${firstStart.verse}-${lastEnd.chapter}:${lastEnd.verse}`;
      return {
        english: `${citationBookTitle.english} ${citation}`.trim(),
        arabic: `${citationBookTitle.arabic} ${citation}`.trim(),
      };
    }

    const chapterGroups = new Map<number, { verse: number; partLabel: null }[]>();
    const chapterOrder: number[] = [];
    for (const segment of segments) {
      if (segment.kind === 'verses') {
        for (const v of segment.verses) {
          if (!chapterGroups.has(segment.chapter)) {
            chapterOrder.push(segment.chapter);
            chapterGroups.set(segment.chapter, []);
          }
          chapterGroups.get(segment.chapter)!.push({ verse: v.verseNum, partLabel: null });
        }
      } else {
        for (let ch = segment.startChapter; ch <= segment.endChapter; ch++) {
          if (!chapterGroups.has(ch)) { chapterOrder.push(ch); chapterGroups.set(ch, []); }
          const vStart = ch === segment.startChapter ? segment.startVerse : 1;
          const vEnd = ch === segment.endChapter ? segment.endVerse : 999;
          for (let v = vStart; v <= vEnd; v++) chapterGroups.get(ch)!.push({ verse: v, partLabel: null });
        }
      }
    }
    const citation = chapterOrder.map((ch) => `${ch}:${formatVerses(chapterGroups.get(ch)!)}`).join(', ');
    return {
      english: `${citationBookTitle.english} ${citation}`.trim(),
      arabic: `${citationBookTitle.arabic} ${citation}`.trim(),
    };
  }

  const entries: { verse: number; partLabel: null }[] = [];
  for (const segment of segments) {
    if (segment.kind === 'verses') {
      for (const v of segment.verses) {
        entries.push({ verse: v.verseNum, partLabel: null });
      }
    } else {
      for (let verse = segment.startVerse; verse <= segment.endVerse; verse++) entries.push({ verse, partLabel: null });
    }
  }

  const verseList = formatVerses(entries);
  return {
    english: `${citationBookTitle.english} ${firstStart.chapter}:${verseList}`.trim(),
    arabic: `${citationBookTitle.arabic} ${firstStart.chapter}:${verseList}`.trim(),
  };
}

const bookTitleCache = new Map<number, Promise<{ english: string; arabic: string; bookKey: string | null } | null>>();

function getReadingBookTitle(bookNum: number): Promise<{ english: string; arabic: string; bookKey: string | null } | null> {
  let cached = bookTitleCache.get(bookNum);
  if (!cached) {
    cached = (async () => {
      const bookKey = await getBookKeyByCalendarNumber(bookNum);
      if (!bookKey) return null;
      const { data, error } = await supabase.schema('bible').from('books').select('title_english, title_arabic').eq('book_key', bookKey).maybeSingle();
      if (error) throw new Error(`Unable to load book title: ${error.message}`);
      return data ? { english: data.title_english || '', arabic: data.title_arabic || '', bookKey } : { english: '', arabic: '', bookKey };
    })();
    bookTitleCache.set(bookNum, cached);
  }
  return cached;
}

// ─── Step 5: build a DocumentSection per reading ───────────────────────────

// Pauline/Catholic Epistle and Praxis are no longer built here — see
// pushReadingsTable in getReadingsForDate — so only the reading types still
// resolved through buildReadingSection need a label.
const READING_TYPE_LABELS: Record<string, { english: string; arabic: string }> = {
  Psalm: { english: 'Psalm', arabic: 'مزمور' },
  Gospel: { english: 'Gospel', arabic: 'إنجيل' },
  Prophecy: { english: 'Prophecy', arabic: 'النبوخة' },
};

// A reading is treated like its own hymn for Coptic casing purposes: one
// capitalized opening letter for the whole reading (its single Psalm
// paragraph, or its first verse), not per individual verse. Mirrors
// buildReadingVerses/applyCopticCaseToReadingVerses in hymnLibrary.js and
// bibleDocumentHtml.ts's lowercaseCopticCharacters (the standalone Bible
// reader) — all three read the same bible.verses data and case convention.
const COPTIC_CHARACTER_PATTERN = /[Ϣ-ϯⲀ-⳿ⲭⲬϭϮ]/u;
const COPTIC_CHARACTER_GLOBAL_PATTERN = /[Ϣ-ϯⲀ-⳿ⲭⲬϭϮ]/gu;
const COPTIC_TO_LOWER: Record<string, string> = { Ⲭ: 'ⲭ', Ϭ: 'ϭ', Ϯ: 'ϯ' };
const COPTIC_TO_UPPER: Record<string, string> = { ⲭ: 'Ⲭ', ϭ: 'Ϭ', ϯ: 'Ϯ' };

function lowercaseBibleCoptic(text: string): string {
  return text.replace(COPTIC_CHARACTER_GLOBAL_PATTERN, (ch) => COPTIC_TO_LOWER[ch] ?? ch.toLocaleLowerCase());
}

function uppercaseFirstBibleCopticCharacter(text: string): string {
  const index = text.search(COPTIC_CHARACTER_PATTERN);
  if (index === -1) return text;
  const upper = COPTIC_TO_UPPER[text[index]] ?? text[index].toLocaleUpperCase();
  return text.slice(0, index) + upper + text.slice(index + 1);
}

function applyCopticCaseToReadingVerses<T extends { coptic?: string }>(verses: T[]): T[] {
  const normalized = verses.map((verse) => (verse.coptic ? { ...verse, coptic: lowercaseBibleCoptic(verse.coptic) } : verse));
  const firstIndex = normalized.findIndex((verse) => verse.coptic && verse.coptic.trim());
  if (firstIndex !== -1) {
    normalized[firstIndex] = { ...normalized[firstIndex], coptic: uppercaseFirstBibleCopticCharacter(normalized[firstIndex].coptic!) };
  }
  return normalized;
}

/**
 * Every reading shows a plain verse-number gold badge (bibleVerseNumber),
 * same as the Bible reader — never a chapter number, even when the reading
 * spans multiple chapters. The Psalm reading is the one exception: it's
 * forced into a single unbroken paragraph with no verse numbers or line
 * breaks at all, regardless of how many verses it spans — mirrors
 * buildReadingVerses in hymnLibrary.js, which applies the exact same rule
 * to readings resolved through a READING_SENTINEL_MAP sentinel.
 */
async function buildReadingSection(rule: ReadingRule): Promise<{ section: DocumentSection; bookKey: string | null }> {
  const { verses, firstBookNum } = await fetchReadingReferenceVerses(rule.reading_reference);
  const bookTitle = firstBookNum != null ? await getReadingBookTitle(firstBookNum) : null;
  const label = READING_TYPE_LABELS[rule.reading_type] || { english: rule.reading_type, arabic: rule.reading_type };
  const isPsalm = rule.reading_type === 'Psalm';

  const psalmVerses = isPsalm && verses.length
    ? applyCopticCaseToReadingVerses([
        stripAlleluiaFromPsalmVerse({
          english: verses.map((v) => v.english).filter(Boolean).join(' '),
          coptic: verses.map((v) => v.coptic || '').filter(Boolean).join(' '),
          arabic: verses.map((v) => v.arabic).filter(Boolean).join(' '),
          type: 'text',
        }),
      ])
    : null;

  // The citation ("Matthew 25:1-13") sits right before the actual verse
  // content, inside `verses` — never merged into `section.title` ("Gospel
  // according to Mark"), which is a separate header rendered in its own slot.
  const citation = bookTitle && verses.length ? buildReadingCitation(rule.reading_reference, bookTitle, isPsalm) : null;
  const citationVerse = citation ? [{ type: 'readingReference', english: citation.english, coptic: '', arabic: citation.arabic }] : [];

  // "X according to Y" only makes sense when the book varies by day (Gospel/
  // Prophecy) — a Psalm reading is always from the Psalms, so naming the
  // book too would just read "Psalm according to Psalms".
  const section: DocumentSection = {
    id: rule.reading_rule_id,
    title: {
      english: bookTitle && !isPsalm ? `${label.english} according to ${bookTitle.english}` : label.english,
      arabic: bookTitle && !isPsalm ? `${label.arabic} ${bookTitle.arabic}` : label.arabic,
    },
    verses: [
      ...citationVerse,
      ...(psalmVerses ??
        applyCopticCaseToReadingVerses(
          verses.map((v) => ({
            english: v.english,
            coptic: v.coptic || '',
            arabic: v.arabic,
            type: 'text',
            bibleChapterNumber: String(v.displayChapter),
            bibleVerseNumber: String(v.displayVerse),
          })),
        )),
    ],
    forceWhiteVerses: true,
  };

  return { section, bookKey: bookTitle?.bookKey ?? null };
}

// ─── Step 4: gospel rite hymns (reuses the app's own condition-aware hydration) ─

async function getGospelRiteSections(date: Date, serviceFlag: 'Vespers' | 'Matins' | 'Liturgy', gospelBookKey: string | null): Promise<DocumentSection[]> {
  // BishopPresent: true forces the same dual-evaluation ServiceDocument.tsx
  // always uses — the hydrated result carries both the bishop-present and
  // priest-only variants (tagged bishopOnly/priestOnly), so the readings
  // screen's own Bishop Present toggle is a pure client-side re-render here too.
  const sections = (await hydrateSupabaseServiceHymn('gospel_rite', 'gospel_rite', date, {
    BishopPresent: true,
    [serviceFlag]: true,
  })) as DocumentSection[];
  const authoredSections = substituteAuthorInSections(sections, gospelBookKey);
  // Vespers/Matins/Liturgy each hydrate the same gospel_rite.gospel_rite
  // table, so their sections carry the same hymn_key-derived ids — this
  // function runs 3 times into one flat document, so namespace by
  // serviceFlag or React (Slideshow's keys) and the WebView's
  // data-section-id both end up with duplicates across the 3 calls.
  return authoredSections.map((section) => ({ ...section, id: `${serviceFlag}-${section.id}` }));
}

// ─── Home-page Sunday message ────────────────────────────────────────────────

/**
 * Resolves the same winning katameros tier used by the Books Lectionary and
 * reads the home-page message from that Sunday's Liturgy Gospel row only.
 * This deliberately shares resolveReadingRules(), so fixed feasts, Great Lent,
 * Holy 50 Days, annual Sundays, and the Mesore/Nesi edge case cannot drift
 * from what the user actually sees in the Lectionary.
 */
export async function getSundayMessageForDate(date: Date): Promise<string | null> {
  const isoDate = toIsoDateString(date);
  const activeFlags = await getActiveFlags(isoDate);
  const rules = await resolveReadingRules(isoDate, activeFlags);
  const gospel = rules.find((rule) => rule.service === 'Liturgy' && rule.reading_type === 'Gospel');
  const message = gospel?.sunday_message?.trim();
  return message || null;
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

export interface ReadingsResult {
  sections: DocumentSection[];
  isEmpty: boolean;
}

/**
 * Resolves and assembles the complete daily-readings document for `date`:
 * Vespers (Psalm, Gospel Rite, Gospel), Matins (Psalm, Gospel Rite, Gospel,
 * Prophecy if Lent), then the Liturgy of the Word (Pauline, Catholic,
 * Praxis, Liturgy Psalm, Gospel Rite, Liturgy Gospel) — each reading and
 * gospel-rite splice rendered as its own DocumentSection, ready to feed
 * straight into DocumentSurface exactly like any other service document.
 */
export async function getReadingsForDate(date: Date): Promise<ReadingsResult> {
  const isoDate = toIsoDateString(date);
  const activeFlags = await getActiveFlags(isoDate);
  const rules = await resolveReadingRules(isoDate, activeFlags);

  const byKey = new Map<string, ReadingRule>();
  for (const rule of rules) byKey.set(`${rule.service}|${rule.reading_type}`, rule);

  const sections: DocumentSection[] = [];

  async function pushReading(service: string, readingType: string): Promise<string | null> {
    const rule = byKey.get(`${service}|${readingType}`);
    if (!rule) return null;
    const { section, bookKey } = await buildReadingSection(rule);
    sections.push(section);
    return bookKey;
  }

  async function pushGospelRite(date_: Date, serviceFlag: 'Vespers' | 'Matins' | 'Liturgy', gospelBookKey: string | null) {
    const riteSections = await getGospelRiteSections(date_, serviceFlag, gospelBookKey);
    sections.push(...riteSections);
  }

  // Pauline/Catholic Epistle and Praxis now come from the readings schema's
  // own order tables (intro + live scripture text + conclusion) via the
  // standard hydration pipeline, same as any other document — see
  // SUBDOCUMENT_MAP/READING_SENTINEL_MAP in hymnLibrary.js. This replaces
  // the old bare-verse-list buildReadingSection path for just these three;
  // Psalm/Gospel/Prophecy have no readings-schema table yet and stay on it.
  const epistleFlags = await computeEpistleConditionFlagsFromRules(rules);
  async function pushReadingsTable(table: 'pauline_epistle' | 'catholic_epistle' | 'praxis') {
    const tableSections = (await hydrateSupabaseServiceHymn('readings', table, date, epistleFlags)) as DocumentSection[];
    sections.push(...tableSections);
  }

  await pushReading('Vespers', 'Psalm');
  const vespersGospelBook = await (async () => {
    // Gospel Rite must be spliced in *before* the Gospel text, so resolve the
    // Gospel's book first (for [AUTHOR]) without pushing its section yet.
    const rule = byKey.get('Vespers|Gospel');
    return rule ? (await getReadingBookTitle(parseSegment(splitReadingReference(rule.reading_reference)[0]).bookNum))?.bookKey ?? null : null;
  })();
  await pushGospelRite(date, 'Vespers', vespersGospelBook);
  await pushReading('Vespers', 'Gospel');

  await pushReading('Matins', 'Psalm');
  const matinsGospelBook = await (async () => {
    const rule = byKey.get('Matins|Gospel');
    return rule ? (await getReadingBookTitle(parseSegment(splitReadingReference(rule.reading_reference)[0]).bookNum))?.bookKey ?? null : null;
  })();
  await pushGospelRite(date, 'Matins', matinsGospelBook);
  await pushReading('Matins', 'Gospel');
  await pushReading('Matins', 'Prophecy');

  await pushReadingsTable('pauline_epistle');
  await pushReadingsTable('catholic_epistle');
  await pushReadingsTable('praxis');
  await pushReading('Liturgy', 'Psalm');
  const liturgyGospelBook = await (async () => {
    const rule = byKey.get('Liturgy|Gospel');
    return rule ? (await getReadingBookTitle(parseSegment(splitReadingReference(rule.reading_reference)[0]).bookNum))?.bookKey ?? null : null;
  })();
  await pushGospelRite(date, 'Liturgy', liturgyGospelBook);
  await pushReading('Liturgy', 'Gospel');

  return { sections, isEmpty: sections.length === 0 };
}
