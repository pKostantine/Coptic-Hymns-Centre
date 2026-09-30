// ─── Shared Coptic feast-calendar data ─────────────────────────────────────
// Single source of truth for fixed-Coptic-date feasts and season-boundary-
// relative movable feasts, used by both calendarService.ts (Season
// Selector display) and conditionEngine.js (per-hymn condition flags) so
// the two can never disagree about when a feast actually falls.

/** Coptic month name spellings exactly as stored in `coptic_date_conversions.coptic_month_name`. */
export interface FixedFeast {
  monthName: string;
  day: number;
  key: string;
  title: string;
  /**
   * Whether this feast's own Daily katameros outranks Great Lent / the Sunday
   * book on its date — the tier-2 test in readingsService's priority chain.
   *
   * True for every Feast of the Lord, which is why the field exists at all:
   * Paremhotep 10's Feast of the Cross is the one entry that is false. It
   * falls inside Great Lent every year (the DB flags it `GreatLent` and
   * `LentWeekdays` alongside `ParemhotepFeastOfTheCross`), and the Lenten
   * readings hold that day. It is listed here so the Season Selector and the
   * hymn conditions can see it, not to redirect the lectionary.
   */
  overridesSeasonalReadings: boolean;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface SingleDayFeast {
  key: string;
  title: string;
  date: string;
}

export const FIXED_FEASTS: FixedFeast[] = [
  { monthName: 'Thoout', day: 1, key: 'nayrouz', title: 'Nayrouz (Coptic New Year)', overridesSeasonalReadings: true },
  { monthName: 'Thoout', day: 17, key: 'feast-of-the-cross', title: 'Feast of the Cross', overridesSeasonalReadings: true },
  { monthName: 'Kiahk', day: 29, key: 'nativity', title: 'Nativity', overridesSeasonalReadings: true },
  { monthName: 'Tobe', day: 6, key: 'circumcision', title: 'Circumcision', overridesSeasonalReadings: true },
  { monthName: 'Tobe', day: 11, key: 'theophany', title: 'Theophany', overridesSeasonalReadings: true },
  { monthName: 'Tobe', day: 12, key: 'second-day-of-theophany', title: 'Second Day of Theophany', overridesSeasonalReadings: true },
  { monthName: 'Tobe', day: 13, key: 'wedding-at-cana', title: 'Wedding at Cana', overridesSeasonalReadings: true },
  { monthName: 'Meshir', day: 8, key: 'entry-into-temple', title: 'Entry into the Temple', overridesSeasonalReadings: true },
  // The Cross is kept twice a year: Thoout 17 above (three days, in the open
  // season after the Nayrouz period) and Paremhotep 10 here, St. Helen's
  // finding of the Cross, which always lands inside Great Lent.
  { monthName: 'Paremhotep', day: 10, key: 'feast-of-the-cross-paremhotep', title: 'Feast of the Cross', overridesSeasonalReadings: false },
  { monthName: 'Paremhotep', day: 29, key: 'annunciation', title: 'Annunciation', overridesSeasonalReadings: true },
  { monthName: 'Pashons', day: 24, key: 'entry-into-egypt', title: 'Entry into Egypt', overridesSeasonalReadings: true },
  { monthName: 'Mesore', day: 13, key: 'transfiguration', title: 'Transfiguration', overridesSeasonalReadings: true },
];

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
type WeekdayName = (typeof WEEKDAY_NAMES)[number];

/**
 * Paramoun ("eve") days for Nativity/Theophany are NOT simply "the day
 * before" the feast — Coptic practice never observes Paramoun on a
 * Saturday or Sunday, so when the feast itself falls on one of those days
 * (or the following Monday), the observance shifts back to cover the
 * preceding weekday(s) instead — sometimes 2 or 3 days. Ported 1:1 from
 * the old app's resolveTodayContent.js PARAMOUN_DAYS_BY_FEAST_WEEKDAY.
 */
const PARAMOUN_DAYS_BY_FEAST_WEEKDAY: Record<WeekdayName, WeekdayName[]> = {
  Sunday: ['Friday', 'Saturday'],
  Monday: ['Friday', 'Saturday', 'Sunday'],
  Tuesday: ['Monday'],
  Wednesday: ['Tuesday'],
  Thursday: ['Wednesday'],
  Friday: ['Thursday'],
  Saturday: ['Friday'],
};

export function addDaysIso(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function weekdayNameForIso(isoDate: string): WeekdayName {
  return WEEKDAY_NAMES[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
}

function findPreviousWeekdayIso(fromIsoDate: string, weekdayName: WeekdayName): string {
  const targetIndex = WEEKDAY_NAMES.indexOf(weekdayName);
  let cursor = fromIsoDate;
  do {
    cursor = addDaysIso(cursor, -1);
  } while (WEEKDAY_NAMES.indexOf(weekdayNameForIso(cursor)) !== targetIndex);
  return cursor;
}

/** Every date Paramoun is actually observed on, given the feast's own Gregorian date. */
export function computeParamounDates(feastIsoDate: string): string[] {
  const feastWeekday = weekdayNameForIso(feastIsoDate);
  const paramounWeekdays = PARAMOUN_DAYS_BY_FEAST_WEEKDAY[feastWeekday] || [];
  return paramounWeekdays.map((weekdayName) => findPreviousWeekdayIso(feastIsoDate, weekdayName));
}

/**
 * Movable single-day feasts computed from season-range boundaries.
 * `ranges` is a map keyed by range_key to {startDate, endDate}, exactly as
 * returned by calendar.season_ranges (endDate is exclusive per that table's
 * convention, matching calendarService.ts's existing usage).
 */
export function computeMovableFeastDates(ranges: Record<string, DateRange | undefined>): SingleDayFeast[] {
  const holyWeek = ranges['holy-week'];
  const holy50Days = ranges['holy-50-days'];
  const lent = ranges['lent'];
  const jonahsFast = ranges['jonahs-fast'];
  const apostlesFast = ranges['apostles-fast'];
  const stMaryFast = ranges['st-mary-fast'];

  return [
    holyWeek && { key: 'lazarus-saturday', title: 'Lazarus Saturday', date: holyWeek.startDate },
    holyWeek && { key: 'palm-sunday', title: 'Palm Sunday', date: addDaysIso(holyWeek.startDate, 1) },
    holyWeek && { key: 'holy-thursday', title: 'Holy Thursday', date: addDaysIso(holyWeek.startDate, 5) },
    holyWeek && { key: 'good-friday', title: 'Good Friday', date: addDaysIso(holyWeek.startDate, 6) },
    holyWeek && { key: 'bright-saturday', title: 'Bright Saturday', date: addDaysIso(holyWeek.startDate, 7) },
    holy50Days && { key: 'resurrection', title: 'Glorious Feast of the Resurrection', date: holy50Days.startDate },
    holy50Days && { key: 'thomas-sunday', title: 'Thomas Sunday', date: addDaysIso(holy50Days.startDate, 7) },
    holy50Days && { key: 'ascension', title: 'Ascension', date: addDaysIso(holy50Days.startDate, 39) },
    holy50Days && { key: 'pentecost', title: 'Feast of Pentecost', date: holy50Days.endDate },
    lent && { key: 'lent-sunday-1', title: 'First Sunday of Lent', date: addDaysIso(lent.startDate, 6) },
    lent && { key: 'lent-sunday-2', title: 'Second Sunday of Lent', date: addDaysIso(lent.startDate, 13) },
    lent && { key: 'lent-sunday-3', title: 'Third Sunday of Lent', date: addDaysIso(lent.startDate, 20) },
    lent && { key: 'lent-sunday-4', title: 'Fourth Sunday of Lent', date: addDaysIso(lent.startDate, 27) },
    lent && { key: 'lent-sunday-5', title: 'Fifth Sunday of Lent', date: addDaysIso(lent.startDate, 34) },
    lent && { key: 'lent-sunday-6', title: 'Sixth Sunday of Lent', date: addDaysIso(lent.startDate, 41) },
    lent && { key: 'last-friday-of-lent', title: 'Last Friday of Lent', date: lent.endDate },
    jonahsFast && { key: 'jonahs-feast', title: "Jonah's Feast", date: addDaysIso(jonahsFast.endDate, 1) },
    apostlesFast && { key: 'apostles-feast', title: "Apostles' Feast", date: addDaysIso(apostlesFast.endDate, 1) },
    stMaryFast && { key: 'st-marys-feast', title: "St. Mary's Feast", date: addDaysIso(stMaryFast.endDate, 1) },
  ].filter((feast): feast is SingleDayFeast => Boolean(feast));
}
