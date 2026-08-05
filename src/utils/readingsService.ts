import { supabase } from './supabase';
import { hydrateSupabaseServiceHymn } from './hymnLibrary';
import { mapHebrewPsalmReferenceToSeptuagint, mapSeptuagintPsalmReferenceToHebrew } from './bibleService';
import { FIXED_FEASTS } from './fixedFeasts';
import type { DocumentSection } from '../components/chc/documentHtml';

// calendar.reading_rules' Psalm references (calendar book number 19) use
// traditional Masoretic chapter/verse numbering, but bible.verses stores
// Psalms in Septuagint numbering (confirmed empirically — see bibleService.ts
// for the same crosswalk already relied on by the Bible reader's Masoretic
// toggle). Every Psalm reference must be converted before it's queried.
const PSALMS_CALENDAR_NUMBER = 19;

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
    .select('coptic_month, coptic_month_name, coptic_day, weekday_number, sunday_ordinal_in_coptic_month')
    .eq('gregorian_date', isoDate)
    .maybeSingle();
  if (error) throw new Error(`Unable to load Coptic date info: ${error.message}`);
  if (!data) throw new Error(`No Coptic date conversion found for ${isoDate}`);
  return {
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
  inline_hymn_key: string | null;
  seasonal_tune: string | null;
}

const READING_RULE_FIELDS = 'reading_rule_id, cycle_type, priority, service, reading_type, reading_code, reading_reference, inline_hymn_key, seasonal_tune';

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
 *   4. An annual Sunday — only actual Sundays have a Sunday-katameros entry;
 *      if today is a Sunday with no matching entry, this falls through to
 *      the Daily book below rather than returning nothing.
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
      rules = await queryReadingRules({
        cycle_type: 'AnnualSunday',
        coptic_month: copticDate.copticMonth,
        sunday_ordinal: copticDate.sundayOrdinalInCopticMonth,
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

interface ReadingSegmentVerses {
  kind: 'verses';
  bookNum: number;
  chapter: number;
  verses: number[];
}

type ReadingSegment = ReadingSegmentRange | ReadingSegmentVerses;

function splitReadingReference(ref: string): string[] {
  return ref.split(/\*@\+|@/).map((s) => s.trim()).filter(Boolean);
}

function parseSegment(segment: string): ReadingSegment {
  const [bookPart, versePart] = segment.split(':');
  const [bookNumStr, startChapterStr] = bookPart.split('.');
  const bookNum = Number(bookNumStr);
  const startChapter = Number(startChapterStr);

  if (versePart.includes(',')) {
    return { kind: 'verses', bookNum, chapter: startChapter, verses: versePart.split(',').map(Number) };
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

  const verseNum = Number(versePart);
  return { kind: 'range', bookNum, startChapter, startVerse: verseNum, endChapter: startChapter, endVerse: verseNum };
}

export interface ReadingVerse {
  /** The chapter:verse actually cited by reading_reference — always in the reading's own (Masoretic, for Psalms) numbering, for display. */
  displayChapter: number;
  displayVerse: number;
  english: string;
  coptic: string | null;
  arabic: string;
}

/** For Psalms, maps a fetched Septuagint (chapter,verse) back to the Masoretic numbering reading_reference actually cited — for every other book this is the identity. */
function toDisplayReference(isPsalms: boolean, chapterNumber: number, verseNumber: number): { chapter: number; verse: number } | null {
  if (!isPsalms) return { chapter: chapterNumber, verse: verseNumber };
  const hebrew = mapSeptuagintPsalmReferenceToHebrew(chapterNumber, verseNumber);
  return hebrew;
}

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

async function fetchSegmentVerses(segment: ReadingSegment): Promise<ReadingVerse[]> {
  const isPsalms = segment.bookNum === PSALMS_CALENDAR_NUMBER;

  if (segment.kind === 'range') {
    const start = isPsalms ? mapHebrewPsalmReferenceToSeptuagint(segment.startChapter, segment.startVerse) : { chapter: segment.startChapter, verse: segment.startVerse };
    const end = isPsalms ? mapHebrewPsalmReferenceToSeptuagint(segment.endChapter, segment.endVerse) : { chapter: segment.endChapter, verse: segment.endVerse };
    const { data, error } = await supabase.schema('bible').rpc('get_verses_by_calendar_range', {
      p_calendar_book_number: segment.bookNum,
      p_start_chapter: start.chapter,
      p_start_verse: start.verse,
      p_end_chapter: end.chapter,
      p_end_verse: end.verse,
    });
    if (error) throw new Error(`Unable to load reading verses: ${error.message}`);
    return ((data || []) as { chapter_number: number; verse_number: number; english: string; coptic: string | null; arabic: string }[])
      .map((row) => {
        const display = toDisplayReference(isPsalms, row.chapter_number, row.verse_number);
        if (!display) return null;
        return {
          displayChapter: display.chapter,
          displayVerse: display.verse,
          english: row.english || '',
          coptic: row.coptic,
          arabic: row.arabic || '',
        };
      })
      .filter((v): v is ReadingVerse => v !== null);
  }

  const bookKey = await getBookKeyByCalendarNumber(segment.bookNum);
  if (!bookKey) return [];

  // Discrete verses can each land in a different Septuagint chapter (only
  // possible right at the Psalm 9/10 merge point) — convert individually and
  // group by the resulting chapter rather than assuming they stay together.
  const targets = isPsalms
    ? segment.verses.map((v) => mapHebrewPsalmReferenceToSeptuagint(segment.chapter, v))
    : segment.verses.map((v) => ({ chapter: segment.chapter, verse: v }));
  const verseNumbersByChapter = new Map<number, number[]>();
  for (const t of targets) {
    const list = verseNumbersByChapter.get(t.chapter) || [];
    list.push(t.verse);
    verseNumbersByChapter.set(t.chapter, list);
  }

  const results = await Promise.all(
    Array.from(verseNumbersByChapter.entries()).map(async ([chapter, verseNumbers]) => {
      const { data, error } = await supabase
        .schema('bible')
        .from('verses')
        .select('chapter_number, verse_number, english, coptic, arabic')
        .eq('book_key', bookKey)
        .eq('chapter_number', chapter)
        .in('verse_number', verseNumbers)
        .order('verse_number');
      if (error) throw new Error(`Unable to load reading verses: ${error.message}`);
      return (data || [])
        .map((row) => {
          const display = toDisplayReference(isPsalms, row.chapter_number, row.verse_number);
          if (!display) return null;
          return {
            displayChapter: display.chapter,
            displayVerse: display.verse,
            english: row.english || '',
            coptic: row.coptic,
            arabic: row.arabic || '',
          };
        })
        .filter((v): v is ReadingVerse => v !== null);
    }),
  );
  // The per-chapter groups above resolve in Promise.all order, not
  // necessarily display order — re-sort by the reference's own numbering
  // (discrete verses are always within one requested reading, never spread
  // across the multi-segment @ separators that must stay in their own order).
  return results.flat().sort((a, b) => a.displayChapter - b.displayChapter || a.displayVerse - b.displayVerse);
}

async function fetchReadingReferenceVerses(reference: string): Promise<{ verses: ReadingVerse[]; firstBookNum: number | null }> {
  const segments = splitReadingReference(reference).map(parseSegment);
  const verseLists = await Promise.all(segments.map(fetchSegmentVerses));
  return { verses: verseLists.flat(), firstBookNum: segments[0]?.bookNum ?? null };
}

/**
 * Builds the citation-style title for a reading ("Matthew 25:1-13",
 * "Philippians 1:27-2:11") straight from reading_reference's own segments —
 * the FIRST segment's start through the LAST segment's end, so a reading
 * spanning multiple chapters/segments still gets exactly ONE citation, never
 * one per chapter. For Psalms, the cited chapter:verse is converted to
 * Septuagint numbering (mapHebrewPsalmReferenceToSeptuagint) rather than the
 * Masoretic numbering reading_reference itself uses — matching the
 * Septuagint numbering already native to bible.verses, and deliberately NOT
 * the Masoretic toDisplayReference conversion used elsewhere in this file
 * for per-verse display.
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

  if (segments.length === 1 && first.kind === 'verses') {
    const converted = isPsalm
      ? first.verses.map((v) => mapHebrewPsalmReferenceToSeptuagint(first.chapter, v))
      : first.verses.map((v) => ({ chapter: first.chapter, verse: v }));
    const chapter = converted[0]?.chapter ?? first.chapter;
    const verseList = converted.map((c) => c.verse).join(',');
    return {
      english: `${citationBookTitle.english} ${chapter}:${verseList}`.trim(),
      arabic: `${citationBookTitle.arabic} ${chapter}:${verseList}`.trim(),
    };
  }

  const startRaw = first.kind === 'range' ? { chapter: first.startChapter, verse: first.startVerse } : { chapter: first.chapter, verse: first.verses[0] };
  const endRaw = last.kind === 'range' ? { chapter: last.endChapter, verse: last.endVerse } : { chapter: last.chapter, verse: last.verses[last.verses.length - 1] };
  const start = isPsalm ? mapHebrewPsalmReferenceToSeptuagint(startRaw.chapter, startRaw.verse) : startRaw;
  const end = isPsalm ? mapHebrewPsalmReferenceToSeptuagint(endRaw.chapter, endRaw.verse) : endRaw;

  const citation =
    start.chapter === end.chapter
      ? start.verse === end.verse
        ? `${start.chapter}:${start.verse}`
        : `${start.chapter}:${start.verse}-${end.verse}`
      : `${start.chapter}:${start.verse}-${end.chapter}:${end.verse}`;

  return {
    english: `${citationBookTitle.english} ${citation}`.trim(),
    arabic: `${citationBookTitle.arabic} ${citation}`.trim(),
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
    ? [
        {
          english: verses.map((v) => v.english).filter(Boolean).join(' '),
          coptic: verses.map((v) => v.coptic || '').filter(Boolean).join(' '),
          arabic: verses.map((v) => v.arabic).filter(Boolean).join(' '),
          type: 'text',
        },
      ]
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
        verses.map((v) => ({
          english: v.english,
          coptic: v.coptic || '',
          arabic: v.arabic,
          type: 'text',
          bibleVerseNumber: String(v.displayVerse),
        }))),
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

// ─── Prophecy placeholder (Lenten Matins only — content not in the DB yet) ──

function buildProphecyPlaceholderSection(rule: ReadingRule): DocumentSection {
  return {
    id: rule.reading_rule_id,
    title: { english: 'Prophecy', arabic: 'النبوخة' },
    verses: [
      {
        english: 'The Prophecy reading for this day is not yet available.',
        coptic: '',
        arabic: 'قراءة النبوخة لهذا اليوم غير متوفرة بعد.',
        type: 'comment',
      },
    ],
    forceWhiteVerses: true,
  };
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

export interface ReadingsResult {
  sections: DocumentSection[];
  isEmpty: boolean;
}

function toIsoDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
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
    if (rule.inline_hymn_key === 'PROPHECIES') {
      sections.push(buildProphecyPlaceholderSection(rule));
      return null;
    }
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
