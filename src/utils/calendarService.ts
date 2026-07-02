import { supabase } from './supabase';

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

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
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
