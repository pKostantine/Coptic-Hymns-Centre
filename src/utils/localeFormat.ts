import { getCurrentAppLanguage } from './preferencesStorage';

export const EASTERN_ARABIC_DIGITS: Record<string, string> = {
  '0': '٠',
  '1': '١',
  '2': '٢',
  '3': '٣',
  '4': '٤',
  '5': '٥',
  '6': '٦',
  '7': '٧',
  '8': '٨',
  '9': '٩',
};

export const GREGORIAN_MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const GREGORIAN_MONTHS_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

export const GREGORIAN_MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
const GREGORIAN_MONTHS_FR_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Not Arabic: French when that is the App Language. The helpers below take only an Arabic flag. */
function isFrench(isArabic: boolean): boolean {
  return !isArabic && getCurrentAppLanguage() === 'fr';
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// One canonical spelling per Coptic month, matching what every month-name
// column in the database now stores (calendar.coptic_date_conversions,
// calendar.fixed_coptic_day_flags, calendar.calendar_event_instances,
// synaxarium.coptic_days) and what the hymn conditions' MonthName.Day tokens
// are matched against. The alternate spellings this map used to also accept
// (Tout, Baba, Toba, Paremoude, Mesori, Nasie) no longer occur in any data, so
// carrying them would only invite a variant back in.
const COPTIC_MONTHS_AR: Record<string, string> = {
  Thoout: 'توت',
  Paope: 'بابه',
  Hathor: 'هاتور',
  Kiahk: 'كيهك',
  Tobe: 'طوبه',
  Meshir: 'أمشير',
  Paremhotep: 'برمهات',
  Parmoute: 'برموده',
  Pashons: 'بشنس',
  Paone: 'بؤونه',
  Epep: 'أبيب',
  Mesore: 'مسرى',
  Nesi: 'النسيء',
};

export const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WEEKDAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** A date-only value (UTC midnight) as "Saturday, September 26" / "Samedi 26 septembre" / "السبت ٢٦ سبتمبر". */
export function formatWeekdayDate(date: Date, isArabic: boolean) {
  const weekday = date.getUTCDay();
  if (isArabic) return `${WEEKDAYS_AR[weekday]} ${toEasternArabicDigits(date.getUTCDate())} ${GREGORIAN_MONTHS_AR[date.getUTCMonth()]}`;
  if (isFrench(isArabic)) return `${capitalize(WEEKDAYS_FR[weekday])} ${date.getUTCDate()} ${GREGORIAN_MONTHS_FR[date.getUTCMonth()]}`;
  return `${WEEKDAYS_EN[weekday]}, ${GREGORIAN_MONTHS_EN[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** "Wednesday, 30 September" / "Mercredi 30 septembre" / "الأربعاء ٣٠ سبتمبر" — the Home hero's date, day before month as the CHC design writes it. */
export function formatDayMonthDate(date: Date, isArabic: boolean) {
  const weekday = date.getUTCDay();
  if (isArabic) return `${WEEKDAYS_AR[weekday]} ${toEasternArabicDigits(date.getUTCDate())} ${GREGORIAN_MONTHS_AR[date.getUTCMonth()]}`;
  if (isFrench(isArabic)) return `${capitalize(WEEKDAYS_FR[weekday])} ${date.getUTCDate()} ${GREGORIAN_MONTHS_FR[date.getUTCMonth()]}`;
  return `${WEEKDAYS_EN[weekday]}, ${date.getUTCDate()} ${GREGORIAN_MONTHS_EN[date.getUTCMonth()]}`;
}

/** The same with the year: "Wednesday, 30 September 2026" — the Books day block's Gregorian line. */
export function formatDayMonthYearDate(date: Date, isArabic: boolean) {
  const year = isArabic ? toEasternArabicDigits(date.getUTCFullYear()) : String(date.getUTCFullYear());
  return `${formatDayMonthDate(date, isArabic)} ${year}`;
}

/** "25 April – 1 May 2027" / "25 avril – 1 mai 2027" / "٢٥ أبريل – ١ مايو ٢٠٢٧": a span of days, the year said once. */
export function formatDayMonthRange(start: Date, end: Date, isArabic: boolean) {
  const months = isArabic ? GREGORIAN_MONTHS_AR : isFrench(isArabic) ? GREGORIAN_MONTHS_FR : GREGORIAN_MONTHS_EN;
  const digits = (value: number) => (isArabic ? toEasternArabicDigits(value) : String(value));
  const dayMonth = (date: Date) => `${digits(date.getUTCDate())} ${months[date.getUTCMonth()]}`;
  const year = digits(end.getUTCFullYear());
  if (start.getUTCFullYear() !== end.getUTCFullYear()) return `${dayMonth(start)} ${digits(start.getUTCFullYear())} – ${dayMonth(end)} ${year}`;
  if (start.getUTCMonth() === end.getUTCMonth()) return `${digits(start.getUTCDate())} – ${dayMonth(end)} ${year}`;
  return `${dayMonth(start)} – ${dayMonth(end)} ${year}`;
}

/** A Coptic day and month: "Thoout 20" / "20 Thoout" / "٢٠ توت". */
export function formatCopticDayMonth(monthName: string, day: number, isArabic: boolean) {
  if (isArabic) return `${toEasternArabicDigits(day)} ${formatCopticMonthName(monthName, true)}`;
  if (isFrench(isArabic)) return `${day} ${monthName}`;
  return `${monthName} ${day}`;
}

/** A Coptic date as "Thoout 16, 1743" / "16 Thoout 1743" / "١٦ توت ١٧٤٣". */
export function formatCopticDate(monthName: string, day: number, year: number, isArabic: boolean) {
  if (isArabic) return `${toEasternArabicDigits(day)} ${formatCopticMonthName(monthName, true)} ${toEasternArabicDigits(year)}`;
  if (isFrench(isArabic)) return `${day} ${monthName} ${year}`;
  return `${monthName} ${day}, ${year}`;
}

export function toEasternArabicDigits(value: number | string) {
  return String(value).replace(/\d/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit);
}

export function formatGregorianMonthTitle(month: number, year: number, isArabic: boolean) {
  const monthName = isArabic
    ? GREGORIAN_MONTHS_AR[month - 1]
    : isFrench(isArabic) ? capitalize(GREGORIAN_MONTHS_FR[month - 1]) : GREGORIAN_MONTHS_EN[month - 1];
  const yearText = isArabic ? toEasternArabicDigits(year) : String(year);
  return `${monthName} ${yearText}`;
}

export function formatCopticMonthName(monthName: string, isArabic: boolean) {
  return isArabic ? COPTIC_MONTHS_AR[monthName] || monthName : monthName;
}

export function formatCopticYear(year: number, isArabic: boolean) {
  return isArabic ? `${toEasternArabicDigits(year)} ش` : isFrench(isArabic) ? `${year} A.M.` : `${year} AM`;
}

export function formatCalendarDay(value: number | string, isArabic: boolean) {
  return isArabic ? toEasternArabicDigits(value) : String(value);
}

export function formatGregorianDate(isoDate: string, isArabic: boolean) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (isFrench(isArabic)) {
    return `${date.getUTCDate()} ${GREGORIAN_MONTHS_FR_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  }
  if (!isArabic) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  const day = toEasternArabicDigits(date.getUTCDate());
  const month = GREGORIAN_MONTHS_AR[date.getUTCMonth()];
  const year = toEasternArabicDigits(date.getUTCFullYear());
  return `${day} ${month} ${year}`;
}

// `calendar.season_ranges.end_date` is the last calendar day the season is
// still active — inclusive, same as start_date — confirmed against the
// Nativity Fast row (end_date 2026-01-06, the day *before* Nativity itself
// on Jan 7, i.e. the fast's actual last day) and matched by fixedFeasts.ts's
// own `addDaysIso(endDate, 1)` to land on the feast day right after. This
// must never be treated as a half-open/exclusive boundary (that was the bug:
// subtracting a day here made every season display one day short — e.g.
// Jonah's Fast's real Feb 2–4 showing as Feb 2–3).
export function formatGregorianDateRange(startDate: string, endDate: string, isArabic: boolean) {
  if (endDate <= startDate) return formatGregorianDate(startDate, isArabic);

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();

  if (isFrench(isArabic)) {
    const startLabel = `${start.getUTCDate()} ${GREGORIAN_MONTHS_FR_SHORT[start.getUTCMonth()]}`;
    const endLabel = formatGregorianDate(endDate, false);
    return sameYear ? `${startLabel} – ${endLabel}` : `${formatGregorianDate(startDate, false)} – ${endLabel}`;
  }

  if (!isArabic) {
    const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const endLabel = formatGregorianDate(endDate, false);
    return sameYear ? `${startLabel} – ${endLabel}` : `${formatGregorianDate(startDate, false)} – ${endLabel}`;
  }

  const startLabel = `${toEasternArabicDigits(start.getUTCDate())} ${GREGORIAN_MONTHS_AR[start.getUTCMonth()]}`;
  const endLabel = formatGregorianDate(endDate, true);
  return sameYear ? `${startLabel} – ${endLabel}` : `${formatGregorianDate(startDate, true)} – ${endLabel}`;
}
