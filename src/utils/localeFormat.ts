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

const COPTIC_MONTHS_AR: Record<string, string> = {
  Tout: 'توت',
  Thoout: 'توت',
  Baba: 'بابه',
  Paope: 'بابه',
  Hathor: 'هاتور',
  Kiahk: 'كيهك',
  Toba: 'طوبه',
  Tobe: 'طوبه',
  Meshir: 'أمشير',
  Paremhotep: 'برمهات',
  Parmoute: 'برموده',
  Paremoude: 'برموده',
  Pashons: 'بشنس',
  Paone: 'بؤونه',
  Epep: 'أبيب',
  Mesori: 'مسرى',
  Mesore: 'مسرى',
  Nasie: 'النسيء',
};

export function toEasternArabicDigits(value: number | string) {
  return String(value).replace(/\d/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit);
}

export function formatGregorianMonthTitle(month: number, year: number, isArabic: boolean) {
  const monthName = isArabic ? GREGORIAN_MONTHS_AR[month - 1] : GREGORIAN_MONTHS_EN[month - 1];
  const yearText = isArabic ? toEasternArabicDigits(year) : String(year);
  return `${monthName} ${yearText}`;
}

export function formatCopticMonthName(monthName: string, isArabic: boolean) {
  return isArabic ? COPTIC_MONTHS_AR[monthName] || monthName : monthName;
}

export function formatCopticYear(year: number, isArabic: boolean) {
  return isArabic ? `${toEasternArabicDigits(year)} ش` : `${year} AM`;
}

export function formatCalendarDay(value: number | string, isArabic: boolean) {
  return isArabic ? toEasternArabicDigits(value) : String(value);
}

export function formatGregorianDate(isoDate: string, isArabic: boolean) {
  const date = new Date(`${isoDate}T00:00:00Z`);
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

export function formatGregorianDateRange(startDate: string, endDateExclusive: string, isArabic: boolean) {
  const displayEnd = new Date(`${endDateExclusive}T00:00:00Z`);
  displayEnd.setUTCDate(displayEnd.getUTCDate() - 1);
  const endIso = displayEnd.toISOString().slice(0, 10);
  if (endIso <= startDate) return formatGregorianDate(startDate, isArabic);

  const start = new Date(`${startDate}T00:00:00Z`);
  const sameYear = start.getUTCFullYear() === displayEnd.getUTCFullYear();

  if (!isArabic) {
    const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const endLabel = formatGregorianDate(endIso, false);
    return sameYear ? `${startLabel} – ${endLabel}` : `${formatGregorianDate(startDate, false)} – ${endLabel}`;
  }

  const startLabel = `${toEasternArabicDigits(start.getUTCDate())} ${GREGORIAN_MONTHS_AR[start.getUTCMonth()]}`;
  const endLabel = formatGregorianDate(endIso, true);
  return sameYear ? `${startLabel} – ${endLabel}` : `${formatGregorianDate(startDate, true)} – ${endLabel}`;
}
