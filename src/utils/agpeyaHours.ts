import { toEasternArabicDigits } from './localeFormat';

export interface AgpeyaHourName {
  english: string;
  arabic: string;
  french: string;
}

export interface AgpeyaHour {
  /** The Agpeya service that opens it (SERVICES_BY_CATEGORY.agpeya). */
  id: string;
  /** The clock hour it is prayed from, until the next hour's `from`. */
  from: number;
  /** Its number among the hours of the day; the Midnight hour has none. */
  number: number | null;
  /** The name it traditionally goes by: Prime, Terce, Sext… */
  traditional: AgpeyaHourName;
  /** The same, short enough for the Agpeya's hour strip. */
  short: AgpeyaHourName;
  /** How Home invites the reader to it: "The Third Hour". */
  prayer: AgpeyaHourName;
}

/**
 * The hours of the Agpeya in the order they are prayed through the day, the
 * first at six in the morning: each is prayed from its hour until the next
 * begins, and the Midnight hour carries the night until Prime.
 */
export const AGPEYA_HOURS: AgpeyaHour[] = [
  {
    id: 'first_hour',
    from: 6,
    number: 1,
    traditional: { english: 'Prime', arabic: 'باكر', french: 'Prime' },
    short: { english: 'Prime', arabic: 'باكر', french: 'Prime' },
    prayer: { english: 'The First Hour', arabic: 'صلاة باكر', french: 'La première heure' },
  },
  {
    id: 'third_hour',
    from: 9,
    number: 3,
    traditional: { english: 'Terce', arabic: 'الساعة الثالثة', french: 'Tierce' },
    short: { english: 'Terce', arabic: 'الثالثة', french: 'Tierce' },
    prayer: { english: 'The Third Hour', arabic: 'صلاة الساعة الثالثة', french: 'La troisième heure' },
  },
  {
    id: 'sixth_hour',
    from: 12,
    number: 6,
    traditional: { english: 'Sext', arabic: 'الساعة السادسة', french: 'Sexte' },
    short: { english: 'Sext', arabic: 'السادسة', french: 'Sexte' },
    prayer: { english: 'The Sixth Hour', arabic: 'صلاة الساعة السادسة', french: 'La sixième heure' },
  },
  {
    id: 'ninth_hour',
    from: 15,
    number: 9,
    traditional: { english: 'None', arabic: 'الساعة التاسعة', french: 'None' },
    short: { english: 'None', arabic: 'التاسعة', french: 'None' },
    prayer: { english: 'The Ninth Hour', arabic: 'صلاة الساعة التاسعة', french: 'La neuvième heure' },
  },
  {
    id: 'eleventh_hour',
    from: 17,
    number: 11,
    traditional: { english: 'Vespers', arabic: 'الغروب', french: 'Vêpres' },
    short: { english: 'Vesp.', arabic: 'الغروب', french: 'Vêpr.' },
    prayer: { english: 'The Eleventh Hour', arabic: 'صلاة الغروب', french: 'La onzième heure' },
  },
  {
    id: 'twelfth_hour',
    from: 18,
    number: 12,
    traditional: { english: 'Compline', arabic: 'النوم', french: 'Complies' },
    short: { english: 'Comp.', arabic: 'النوم', french: 'Compl.' },
    prayer: { english: 'The Twelfth Hour', arabic: 'صلاة النوم', french: 'La douzième heure' },
  },
  {
    id: 'midnight_hour',
    from: 0,
    number: null,
    traditional: { english: 'Midnight', arabic: 'نصف الليل', french: 'Minuit' },
    short: { english: 'Night', arabic: 'الليل', french: 'Nuit' },
    prayer: { english: 'The Midnight Hour', arabic: 'صلاة نصف الليل', french: 'L’heure de minuit' },
  },
];

const MIDNIGHT = AGPEYA_HOURS[AGPEYA_HOURS.length - 1];

/** The hour being prayed at a clock hour (0–23). */
export function agpeyaHourAt(clockHour: number): AgpeyaHour {
  if (clockHour < AGPEYA_HOURS[0].from) return MIDNIGHT;
  return [...AGPEYA_HOURS].reverse().find((hour) => hour.from !== 0 && clockHour >= hour.from) ?? MIDNIGHT;
}

/** The hour prayed after this one: Midnight follows the Twelfth, Prime follows Midnight. */
export function nextAgpeyaHour(hour: AgpeyaHour): AgpeyaHour {
  const index = AGPEYA_HOURS.indexOf(hour);
  return AGPEYA_HOURS[(index + 1) % AGPEYA_HOURS.length];
}

/** When the hour after this one begins, as a clock hour — 24 for the Twelfth, which runs to midnight. */
export function agpeyaHourEnd(hour: AgpeyaHour): number {
  const next = nextAgpeyaHour(hour);
  return next.from === 0 ? 24 : next.from;
}

/** "9:00", "0:00" — or "٩:٠٠" in Arabic. The Agpeya's hours are told on the 24-hour clock. */
export function formatAgpeyaClock(clockHour: number, arabic: boolean): string {
  const text = `${clockHour % 24}:00`;
  return arabic ? toEasternArabicDigits(text) : text;
}
