import { supabase } from './supabase';
import { computeMovableFeastDates, FIXED_FEASTS } from './fixedFeasts';
import { toIsoDate } from './dateUtils';

export interface CalendarDay {
  gregorianDate: string;
  displayDay: number;
  weekday: string;
  isSunday: boolean;
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
    .select('gregorian_date, gregorian_day, weekday, sunday_ordinal_in_coptic_month')
    .gte('gregorian_date', firstDate)
    .lte('gregorian_date', lastDate)
    .order('gregorian_date');

  if (error) throw new Error(`Unable to load calendar month: ${error.message}`);

  return (data || []).map((row) => ({
    gregorianDate: row.gregorian_date,
    displayDay: row.gregorian_day,
    weekday: row.weekday,
    isSunday: row.weekday === 'Sunday',
  }));
}

/** Coptic calendar-month grid: every row for the given Coptic year/month (1-13, 13 = the short month Nasie). */
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
  }));
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
// Three liturgical periods the app knows names for have no data source at all:
// the Nayrouz period (Thoout 1-17), the Nativity period and the Theophany
// period. They are not rows in season_ranges, and unlike the old app — which
// derived the Theophany period client-side from "yesterday was Theophany" —
// nothing recomputes them here. Days inside them therefore fall through to
// 'Annual' unless a single-day feast lands on them. Filling that gap needs
// either new season_ranges rows or a client-side derivation; see
// SEASON_INDICATOR_PRIORITIES in constants/seasonNames.ts.

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
