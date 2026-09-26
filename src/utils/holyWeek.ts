import { contentDataClient as supabase } from '../services/contentDataClient';
import { getSeasonRanges } from './calendarService';
import { addUtcDays, toIsoDate } from './dateUtils';

/**
 * Holy Week dates and per-hour reading summaries for the Holy Week menus.
 *
 * calendar.season_ranges' `holy-week` row runs from Lazarus Saturday to Bright
 * Saturday, so Palm Sunday is the day after its start. The menu's seven rows
 * (see HOLY_WEEK_ROWS) are the seven days from Palm Sunday on, and the eve in
 * each row is prayed on that same evening — Monday Eve on Sunday night.
 */

/** Row index (0 = Palm Sunday … 6 = Bright Saturday) → the menu's day id, and the eve prayed that evening. */
export const HOLY_WEEK_DAY_IDS = ['palm-sunday', 'monday', 'tuesday', 'wednesday', 'holy-thursday', 'good-friday', 'bright-saturday'] as const;
const EVE_IDS_BY_DAY_INDEX: (string | null)[] = [null, 'monday-eve', 'tuesday-eve', 'wednesday-eve', 'thursday-eve', 'friday-eve', null];

export interface HolyWeekSchedule {
  /** Palm Sunday of the Holy Week shown — the current one while it runs, otherwise the next. */
  palmSunday: Date;
  /** The day or eve being prayed right now (liturgical time), or null outside Holy Week. */
  currentDayId: string | null;
  /** Whole days from the liturgical date to Palm Sunday; negative once it has begun. */
  daysUntil: number;
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dayDifference(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Which day or eve is being prayed at a liturgical moment. After 5pm the
 * app's effective date has already rolled to tomorrow, and the service being
 * prayed that night is tomorrow's eve (Sunday night → Monday Eve).
 */
export function currentHolyWeekDayId(palmSunday: Date, effectiveDate: Date, isEvening: boolean): string | null {
  const index = dayDifference(palmSunday, effectiveDate);
  if (index < 0 || index > 6) return null;
  if (!isEvening) return HOLY_WEEK_DAY_IDS[index];
  // Friday night is Bright Saturday's own night service; Saturday night before
  // Palm Sunday has no eve in this book, so the day itself is what's next.
  return EVE_IDS_BY_DAY_INDEX[index] ?? HOLY_WEEK_DAY_IDS[index];
}

/** The Holy Week the menus should show for a liturgical date: the one in progress, else the next. */
export async function loadHolyWeekSchedule(effectiveDate: Date, isEvening: boolean): Promise<HolyWeekSchedule | null> {
  const from = toIsoDate(addUtcDays(effectiveDate, -8));
  const to = toIsoDate(addUtcDays(effectiveDate, 400));
  const ranges = await getSeasonRanges(from, to);
  const range = ranges
    .filter((entry) => entry.rangeKey === 'holy-week')
    .find((entry) => parseIsoDate(entry.endDate).getTime() >= effectiveDate.getTime());
  if (!range) return null;
  const palmSunday = addUtcDays(parseIsoDate(range.startDate), 1) as Date;
  return {
    palmSunday,
    currentDayId: currentHolyWeekDayId(palmSunday, effectiveDate, isEvening),
    daysUntil: dayDifference(effectiveDate, palmSunday),
  };
}

const WEEKDAYS = {
  english: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  arabic: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};
const MONTHS = {
  english: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  englishLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  arabic: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
};
const EASTERN_ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function toArabicDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => EASTERN_ARABIC_DIGITS[Number(digit)]);
}

/** Row `index` of the menu (0 = Palm Sunday). */
export function holyWeekRowDate(palmSunday: Date, index: number): Date {
  return addUtcDays(palmSunday, index) as Date;
}

/** "SUN · APR 25" / "الأحد ٢٥ أبريل" — the compact label over each menu row. */
export function formatRowDate(date: Date, arabic: boolean): string {
  const weekday = date.getUTCDay();
  if (arabic) return `${WEEKDAYS.arabic[weekday]} ${toArabicDigits(date.getUTCDate())} ${MONTHS.arabic[date.getUTCMonth()]}`;
  return `${WEEKDAYS.english[weekday].slice(0, 3)} · ${MONTHS.english[date.getUTCMonth()]} ${date.getUTCDate()}`.toUpperCase();
}

/** "Sunday, April 25" / "الأحد ٢٥ أبريل". */
export function formatLongDate(date: Date, arabic: boolean): string {
  const weekday = date.getUTCDay();
  if (arabic) return `${WEEKDAYS.arabic[weekday]} ${toArabicDigits(date.getUTCDate())} ${MONTHS.arabic[date.getUTCMonth()]}`;
  return `${WEEKDAYS.english[weekday]}, ${MONTHS.englishLong[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** "April 25". */
export function formatMonthDay(date: Date): string {
  return `${MONTHS.englishLong[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

export function weekdayName(index: number, arabic: boolean): string {
  return (arabic ? WEEKDAYS.arabic : WEEKDAYS.english)[index % 7];
}

export interface HourGospelSummary {
  english: string;
  arabic: string;
}

/** Drops the verse reference: "Matthew 27:27-45" → "Matthew". */
function bookOf(citation: string): string {
  return citation.replace(/\s+[\d:,\-–\s]+$/, '').trim();
}

/** "Matthew, Mark, Luke & John" / "متى، مرقس، لوقا ويوحنا" — the Arabic "و" attaches to the word after it. */
function joinNames(names: string[], comma: string, and: string): string {
  if (names.length <= 1) return names[0] || '';
  const conjunction = and === 'و' ? ' و' : ` ${and} `;
  return `${names.slice(0, -1).join(comma)}${conjunction}${names[names.length - 1]}`;
}

/**
 * Each hour's Gospel, for the hour lists: the citation when there is one
 * ("Mark 11:12-24"), or the evangelists when several are read ("Matthew,
 * Mark, Luke & John"). Keyed by reading_rules.hour_key, which is every Holy
 * Week hour's own id.
 */
export async function loadHourGospelSummaries(hourKeys: string[]): Promise<Record<string, HourGospelSummary>> {
  if (!hourKeys.length) return {};
  const { data, error } = await supabase
    .schema('holy_week')
    .from('reading_rules')
    .select('hour_key, title_english, title_arabic, sort_order')
    .in('hour_key', hourKeys)
    .eq('reading_type', 'Gospel')
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  const byHour = new Map<string, { english: string; arabic: string }[]>();
  for (const row of (data || []) as { hour_key: string; title_english: string | null; title_arabic: string | null }[]) {
    const list = byHour.get(row.hour_key) || [];
    list.push({ english: row.title_english || '', arabic: row.title_arabic || '' });
    byHour.set(row.hour_key, list);
  }
  const summaries: Record<string, HourGospelSummary> = {};
  for (const [hourKey, gospels] of byHour) {
    summaries[hourKey] = gospels.length === 1
      ? { english: gospels[0].english, arabic: toArabicDigits(gospels[0].arabic || gospels[0].english) }
      : {
        english: joinNames(gospels.map((gospel) => bookOf(gospel.english)), ', ', '&'),
        arabic: joinNames(gospels.map((gospel) => bookOf(gospel.arabic || gospel.english)), '، ', 'و'),
      };
  }
  return summaries;
}
