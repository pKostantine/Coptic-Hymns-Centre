import { contentDataClient as supabase } from '../services/contentDataClient';
import { computeMovableFeastDates, FIXED_FEASTS } from './fixedFeasts';
import { toIsoDate } from './dateUtils';
import { getSeasonIndicatorKey } from '../constants/seasonNames';
import { pickNextSeason } from './nextSeason';

export interface CalendarDay {
  gregorianDate: string;
  displayDay: number;
  weekday: string;
  isSunday: boolean;
  /** The same day in the other calendar, for the small number under each cell. */
  otherDay: number;
  /** Set when `otherDay` is the Coptic first of a month, so the cell can name it ("Thoout 1"). */
  otherMonthName: string | null;
}

export interface SeasonRange {
  rangeKey: string;
  activeSeason: string;
  startDate: string;
  endDate: string;
  startEvent: string;
  endEvent: string;
}

/** Gregorian calendar-month grid: every row in `calendar.coptic_date_conversions` for the given Gregorian year/month. */
export async function getGregorianMonthGrid(year: number, month: number): Promise<CalendarDay[]> {
  const firstDate = toIsoDate(new Date(Date.UTC(year, month - 1, 1)));
  const lastDate = toIsoDate(new Date(Date.UTC(year, month, 0)));

  const { data, error } = await supabase
    .schema('calendar')
    .from('coptic_date_conversions')
    .select('gregorian_date, gregorian_day, weekday, sunday_ordinal_in_coptic_month, coptic_day, coptic_month_name')
    .gte('gregorian_date', firstDate)
    .lte('gregorian_date', lastDate)
    .order('gregorian_date');

  if (error) throw new Error(`Unable to load calendar month: ${error.message}`);

  return (data || []).map((row) => ({
    gregorianDate: row.gregorian_date,
    displayDay: row.gregorian_day,
    weekday: row.weekday,
    isSunday: row.weekday === 'Sunday',
    otherDay: row.coptic_day,
    otherMonthName: row.coptic_day === 1 ? row.coptic_month_name : null,
  }));
}

/** Coptic calendar-month grid: every row for the given Coptic year/month (1-13, 13 = the short month Nesi). */
export async function getCopticMonthGrid(copticYear: number, copticMonth: number): Promise<CalendarDay[]> {
  const { data, error } = await supabase
    .schema('calendar')
    .from('coptic_date_conversions')
    .select('gregorian_date, coptic_day, coptic_month_name, weekday, sunday_ordinal_in_coptic_month')
    .eq('coptic_year', copticYear)
    .eq('coptic_month', copticMonth)
    .order('coptic_day');

  if (error) throw new Error(`Unable to load Coptic calendar month: ${error.message}`);

  return (data || []).map((row) => ({
    gregorianDate: row.gregorian_date,
    displayDay: row.coptic_day,
    weekday: row.weekday,
    isSunday: row.weekday === 'Sunday',
    otherDay: Number(String(row.gregorian_date).slice(8, 10)),
    otherMonthName: null,
  }));
}

export interface CopticDate {
  monthName: string;
  day: number;
  year: number;
}

/**
 * The Coptic date of a day — month name as the database spells it
 * ("Thoout"), day and year — for the Books menu's date line.
 *
 * Returns null rather than throwing when it cannot be read: the menu shows it
 * on top of the Gregorian date it already knows, and an offline phone should
 * still get its menu.
 */
export async function getCopticDate(date: Date): Promise<CopticDate | null> {
  try {
    const { data, error } = await supabase
      .schema('calendar')
      .from('coptic_date_conversions')
      .select('coptic_month_name, coptic_day, coptic_year')
      .eq('gregorian_date', toIsoDate(date))
      .maybeSingle();

    if (error || !data) return null;
    return { monthName: data.coptic_month_name, day: data.coptic_day, year: data.coptic_year };
  } catch {
    return null;
  }
}

/** Looks up the Coptic (year, month, monthName) for a given Gregorian date — used to seed the Coptic month view. */
export async function getCopticMonthForDate(date: Date) {
  const { data, error } = await supabase
    .schema('calendar')
    .from('coptic_date_conversions')
    .select('coptic_year, coptic_month, coptic_month_name')
    .eq('gregorian_date', toIsoDate(date))
    .maybeSingle();

  if (error) throw new Error(`Unable to resolve Coptic month: ${error.message}`);
  return data;
}

/** Finds the (coptic_year, coptic_month) adjacent to the given month, by walking to the nearest day-1 row across the boundary. */
export async function getAdjacentCopticMonth(copticYear: number, copticMonth: number, direction: 1 | -1) {
  const current = await getCopticMonthGrid(copticYear, copticMonth);
  if (!current.length) return null;

  const boundaryDate = direction === 1 ? current[current.length - 1].gregorianDate : current[0].gregorianDate;

  let query = supabase.schema('calendar').from('coptic_date_conversions').select('coptic_year, coptic_month, coptic_month_name');
  query = direction === 1 ? query.gt('gregorian_date', boundaryDate).order('gregorian_date') : query.lt('gregorian_date', boundaryDate).order('gregorian_date', { ascending: false });

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new Error(`Unable to load adjacent Coptic month: ${error.message}`);
  return data;
}

/** The Gregorian [start, end) span of a given Coptic year, via that year's Thoout 1 and the next year's Thoout 1. */
export async function getGregorianRangeForCopticYear(copticYear: number): Promise<{ startDate: string; endDate: string }> {
  const { data: start, error: startError } = await supabase
    .schema('calendar')
    .from('coptic_date_conversions')
    .select('gregorian_date')
    .eq('coptic_year', copticYear)
    .eq('coptic_month', 1)
    .eq('coptic_day', 1)
    .maybeSingle();
  if (startError) throw new Error(`Unable to resolve Coptic year start: ${startError.message}`);

  const { data: end, error: endError } = await supabase
    .schema('calendar')
    .from('coptic_date_conversions')
    .select('gregorian_date')
    .eq('coptic_year', copticYear + 1)
    .eq('coptic_month', 1)
    .eq('coptic_day', 1)
    .maybeSingle();
  if (endError) throw new Error(`Unable to resolve Coptic year end: ${endError.message}`);

  return { startDate: start?.gregorian_date, endDate: end?.gregorian_date };
}

/** Resolves the Coptic year for a given Gregorian date. */
export async function getCopticYearForDate(date: Date): Promise<number | null> {
  const result = await getCopticMonthForDate(date);
  return result?.coptic_year ?? null;
}

// `calendar.season_ranges` currently carries exactly seven range_keys:
// apostles-fast, lent, holy-50-days, holy-week, jonahs-fast,
// nativity-fast and st-mary-fast. Anything keyed off this table has to use
// those spellings verbatim — a key that doesn't match simply never resolves,
// silently, since every lookup here falls back rather than throwing.
//
// Nayrouz, Nativity and Theophany periods are not rows in season_ranges. The
// season indicator resolves them separately from calendar.get_context_flags
// below, keeping the database's hymn conditions and displayed season aligned.

/** All liturgical season/fast ranges overlapping [fromDate, toDate] — from `calendar.season_ranges`. */
export async function getSeasonRanges(fromDate: string, toDate: string): Promise<SeasonRange[]> {
  const { data, error } = await supabase
    .schema('calendar')
    .from('season_ranges')
    .select('range_key, active_season, start_date, end_date, start_event, end_event')
    .lte('start_date', toDate)
    .gte('end_date', fromDate)
    .order('start_date');

  if (error) throw new Error(`Unable to load season ranges: ${error.message}`);

  return (data || []).map((row) => ({
    rangeKey: row.range_key,
    activeSeason: row.active_season,
    startDate: row.start_date,
    endDate: row.end_date,
    startEvent: row.start_event,
    endEvent: row.end_event,
  }));
}

/**
 * Liturgical indicators whose full observed span comes from
 * `calendar.get_context_flags`, mapped onto the indicator-key vocabulary.
 *
 * get_context_flags is the same RPC conditionEngine.js uses to decide which
 * hymns show, and its own comment calls it the single source of truth for
 * every date-derived flag. Reading the periods from it, rather than adding a
 * competing set of season_ranges rows, is what stops the pill and the hymn
 * filtering from becoming two independent definitions of the same season.
 */
const CONTEXT_FLAG_TO_INDICATOR_KEY: Record<string, string> = {
  Nayrouz: 'nayrouz-period',
  NativityPeriod: 'nativity-period',
  TheophanyPeriod: 'theophany-period',
  NativityParamoun: 'nativity-paramoun',
  ParamounNativity: 'nativity-paramoun',
  TheophanyParamoun: 'theophany-paramoun',
  ParamounTheophany: 'theophany-paramoun',
  FeastOfTheCross: 'feast-of-the-cross',
  HolyCross: 'feast-of-the-cross',
  // The observed Joyful 29th only: the calendar leaves it off where a greater
  // feast takes the 29th (Kiahk 29 is the Nativity), which only the Raw flag carries.
  Joyful29thOfTheMonth: 'joyful-29',
};

/** Context-backed periods and feast observances running on the given liturgical date. */
export async function getContextIndicatorKeys(isoDate: string): Promise<string[]> {
  const { data, error } = await supabase
    .schema('calendar')
    .rpc('get_context_flags', { p_date: isoDate, p_extra_context: {} });

  if (error || !data) return [];

  return [
    ...new Set(
      Object.entries(CONTEXT_FLAG_TO_INDICATOR_KEY)
        .filter(([flag]) => (data as Record<string, unknown>)[flag] === true)
        .map(([, indicatorKey]) => indicatorKey),
    ),
  ];
}

// ─── Single-day feast events ────────────────────────────────────────────────
// The old app's Season Selector sourced these from a static local dataset
// that's since been stubbed out to empty during its own migration to a
// live-data model (see Coptic-Hymns-Centre-Old/.claude/memory/project_migration.md).
// There's no live-DB table for named single-day feasts, so this resolves the
// well-established Coptic Orthodox feast calendar directly against
// `calendar.coptic_date_conversions` (fixed Coptic-date feasts) and against
// the `season_ranges` boundaries already fetched above (movable/Easter-relative
// feasts, and the fixed feasts that fall exactly at a fast's end+1 boundary).

export interface SingleDayEvent {
  key: string;
  title: string;
  date: string;
}

async function resolveCopticDate(copticYear: number, monthName: string, day: number): Promise<string | null> {
  const { data, error } = await supabase
    .schema('calendar')
    .from('coptic_date_conversions')
    .select('gregorian_date')
    .eq('coptic_year', copticYear)
    .eq('coptic_month_name', monthName)
    .eq('coptic_day', day)
    .maybeSingle();
  if (error) throw new Error(`Unable to resolve ${monthName} ${day}, ${copticYear} AM: ${error.message}`);
  return data?.gregorian_date ?? null;
}

async function getKiahkSundays(copticYear: number): Promise<SingleDayEvent[]> {
  const { data, error } = await supabase
    .schema('calendar')
    .from('coptic_date_conversions')
    .select('gregorian_date, coptic_day')
    .eq('coptic_year', copticYear)
    .eq('coptic_month_name', 'Kiahk')
    .eq('weekday', 'Sunday')
    .lte('coptic_day', 28)
    .order('coptic_day');
  if (error) throw new Error(`Unable to load Kiahk Sundays: ${error.message}`);

  const ordinals = ['First', 'Second', 'Third', 'Fourth'];
  return (data || []).slice(0, 4).map((row, index) => ({
    key: `kiahk-sunday-${index + 1}`,
    title: `${ordinals[index]} Sunday of Kiahk`,
    date: row.gregorian_date,
  }));
}

/** Every named single-day feast for a Coptic year: fixed Coptic-date feasts, Easter-relative movable feasts, and the Kiahk Sundays. */
export async function getSingleDayEventsForCopticYear(copticYear: number, periods: SeasonRange[]): Promise<SingleDayEvent[]> {
  const rangesByKey: Record<string, { startDate: string; endDate: string }> = {};
  for (const period of periods) {
    rangesByKey[period.rangeKey] = { startDate: period.startDate, endDate: period.endDate };
  }

  const fixed = await Promise.all(
    FIXED_FEASTS.map(async (feast) => {
      const date = await resolveCopticDate(copticYear, feast.monthName, feast.day);
      return date ? { key: feast.key, title: feast.title, date } : null;
    }),
  );

  const movable = computeMovableFeastDates(rangesByKey);

  const kiahkSundays = await getKiahkSundays(copticYear);

  return [...fixed, ...movable, ...kiahkSundays]
    .filter((event): event is SingleDayEvent => Boolean(event))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const yearIndicatorSources = new Map<number, Promise<{ seasons: SeasonRange[]; events: SingleDayEvent[] }>>();

/** A Coptic year's season ranges and single-day feasts, loaded once per year per session. */
function getYearIndicatorSources(copticYear: number) {
  let cached = yearIndicatorSources.get(copticYear);
  if (!cached) {
    cached = (async () => {
      const { startDate, endDate } = await getGregorianRangeForCopticYear(copticYear);
      const seasons = await getSeasonRanges(startDate, endDate);
      const events = await getSingleDayEventsForCopticYear(copticYear, seasons);
      return { seasons, events };
    })();
    cached.catch(() => yearIndicatorSources.delete(copticYear));
    yearIndicatorSources.set(copticYear, cached);
  }
  return cached;
}

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Every season and feast running on a liturgical day, split the way getSeasonIndicatorKey weighs them. */
async function getActiveIndicators(isoDate: string, copticYear: number) {
  const [{ seasons, events }, contextKeys] = await Promise.all([
    getYearIndicatorSources(copticYear),
    getContextIndicatorKeys(isoDate),
  ]);
  const activeSeasons = [
    ...seasons.filter((season) => season.startDate <= isoDate && season.endDate >= isoDate).map((season) => ({ key: season.rangeKey })),
    ...contextKeys.filter((key) => key.endsWith('-period')).map((key) => ({ key })),
  ];
  const activeEvents = [
    ...events.filter((event) => event.date === isoDate).map((event) => ({ key: event.key })),
    ...contextKeys.filter((key) => !key.endsWith('-period')).map((key) => ({ key })),
  ];
  return { activeSeasons, activeEvents };
}

export interface DayOverview {
  /** What the day is named after — the season chip's key, and what chooses the block's colours. Null on an ordinary day. */
  indicatorKey: string | null;
  /** Every season and feast running that day, so a lesser feast can keep the colour of the fast around it. */
  activeKeys: string[];
  /** The next great season or feast (see nextSeason.ts). */
  nextSeason: { key: string; date: string; days: number } | null;
}

/**
 * The Books day block's reading of a liturgical day: the same seasons, feasts
 * and context periods the calendar's pill weighs, so the two always name the
 * day alike. Null when it can't be read (offline without the calendar).
 */
export async function getDayOverview(isoDate: string): Promise<DayOverview | null> {
  try {
    const copticYear = await getCopticYearForDate(new Date(`${isoDate}T00:00:00Z`));
    if (copticYear === null) return null;
    const [{ activeSeasons, activeEvents }, thisYear, nextYear] = await Promise.all([
      getActiveIndicators(isoDate, copticYear),
      getYearIndicatorSources(copticYear),
      // The next season can be next year's: from Mesore it is Nayrouz.
      getYearIndicatorSources(copticYear + 1).catch(() => ({ seasons: [] as SeasonRange[], events: [] as SingleDayEvent[] })),
    ]);
    return {
      indicatorKey: getSeasonIndicatorKey(activeSeasons, activeEvents),
      activeKeys: [...activeSeasons, ...activeEvents].map((item) => item.key),
      nextSeason: pickNextSeason(
        isoDate,
        [...thisYear.seasons, ...nextYear.seasons],
        [...thisYear.events, ...nextYear.events],
      ),
    };
  } catch {
    return null;
  }
}

export interface WeekStripDay {
  isoDate: string;
  gregorianDay: number;
  copticDay: number | null;
  /** A named feast falls on this day — the strip marks it with a gold dot. */
  hasFeast: boolean;
}

/** The Sunday-to-Saturday week around a day, each with its Coptic day number. */
export async function getWeekStrip(isoDate: string): Promise<WeekStripDay[]> {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  const days = Array.from({ length: 7 }, (_, index) => addDaysIso(isoDate, index - weekday));
  const [copticDates, feastDates] = await Promise.all([
    getCopticDatesBetween(days[0], days[6]).catch(() => new Map<string, CopticDate>()),
    getFeastDatesBetween(days[0], days[6]).catch(() => new Set<string>()),
  ]);
  return days.map((day) => ({
    isoDate: day,
    gregorianDay: Number(day.slice(8, 10)),
    copticDay: copticDates.get(day)?.day ?? null,
    hasFeast: feastDates.has(day),
  }));
}

/**
 * The days between two dates (inclusive) that carry a named single-day feast:
 * the gold dots of the week strip and the month grid. The Sundays of Kiahk are
 * left out — they are the season's own Sundays, not feasts of their own.
 */
export async function getFeastDatesBetween(fromDate: string, toDate: string): Promise<Set<string>> {
  const years = new Set<number>();
  for (const date of [fromDate, toDate]) {
    const year = await getCopticYearForDate(new Date(`${date}T00:00:00Z`));
    if (year !== null) years.add(year);
  }
  const sources = await Promise.all([...years].map((year) => getYearIndicatorSources(year)));
  return new Set(
    sources
      .flatMap(({ events }) => events)
      .filter((event) => event.date >= fromDate && event.date <= toDate && !event.key.startsWith('kiahk-sunday'))
      .map((event) => event.date),
  );
}

/** The Coptic date of every day in a span, keyed by Gregorian ISO date. */
export async function getCopticDatesBetween(fromDate: string, toDate: string): Promise<Map<string, CopticDate>> {
  const { data, error } = await supabase
    .schema('calendar')
    .from('coptic_date_conversions')
    .select('gregorian_date, coptic_month_name, coptic_day, coptic_year')
    .gte('gregorian_date', fromDate)
    .lte('gregorian_date', toDate);
  if (error) throw new Error(`Unable to load Coptic dates: ${error.message}`);
  return new Map(
    (data || []).map((row) => [row.gregorian_date as string, { monthName: row.coptic_month_name, day: row.coptic_day, year: row.coptic_year }]),
  );
}
