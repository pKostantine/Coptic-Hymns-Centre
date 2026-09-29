import { getSeasonRanges } from './calendarService';
import { addUtcDays, toIsoDate } from './dateUtils';
import { getCurrentAppLanguage } from './preferencesStorage';

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
  /** Palm Sunday of the Holy Week in progress. */
  palmSunday: Date;
  /** The day or eve being prayed right now (liturgical time). */
  currentDayId: string;
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

/**
 * The Holy Week in progress at a liturgical moment, or null outside it. Only
 * the current Pascha is ever shown — there is no looking ahead to the next.
 */
export async function loadHolyWeekSchedule(effectiveDate: Date, isEvening: boolean): Promise<HolyWeekSchedule | null> {
  const day = toIsoDate(effectiveDate);
  const ranges = await getSeasonRanges(day, day);
  const range = ranges.find((entry) => entry.rangeKey === 'holy-week');
  if (!range) return null;
  const palmSunday = addUtcDays(parseIsoDate(range.startDate), 1) as Date;
  const currentDayId = currentHolyWeekDayId(palmSunday, effectiveDate, isEvening);
  return currentDayId ? { palmSunday, currentDayId } : null;
}

const WEEKDAYS = {
  english: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  arabic: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  french: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
  frenchShort: ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'],
};
const MONTHS = {
  english: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  englishLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  arabic: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  french: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  frenchLong: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
};

/** Not Arabic: French when that is the App Language. */
function isFrench(arabic: boolean): boolean {
  return !arabic && getCurrentAppLanguage() === 'fr';
}
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
  if (isFrench(arabic)) return `${WEEKDAYS.frenchShort[weekday]} · ${date.getUTCDate()} ${MONTHS.french[date.getUTCMonth()]}`.toUpperCase();
  return `${WEEKDAYS.english[weekday].slice(0, 3)} · ${MONTHS.english[date.getUTCMonth()]} ${date.getUTCDate()}`.toUpperCase();
}

/** "Sunday, April 25" / "الأحد ٢٥ أبريل". */
export function formatLongDate(date: Date, arabic: boolean): string {
  const weekday = date.getUTCDay();
  if (arabic) return `${WEEKDAYS.arabic[weekday]} ${toArabicDigits(date.getUTCDate())} ${MONTHS.arabic[date.getUTCMonth()]}`;
  if (isFrench(arabic)) return `${WEEKDAYS.french[weekday]} ${date.getUTCDate()} ${MONTHS.frenchLong[date.getUTCMonth()]}`;
  return `${WEEKDAYS.english[weekday]}, ${MONTHS.englishLong[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** "April 25" / "25 avril". */
export function formatMonthDay(date: Date): string {
  if (isFrench(false)) return `${date.getUTCDate()} ${MONTHS.frenchLong[date.getUTCMonth()]}`;
  return `${MONTHS.englishLong[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

export function weekdayName(index: number, arabic: boolean): string {
  const names = arabic ? WEEKDAYS.arabic : isFrench(arabic) ? WEEKDAYS.french : WEEKDAYS.english;
  return names[index % 7];
}
