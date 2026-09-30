/**
 * "Next season" in the Books day block's footer: the next time the year turns
 * to one of its great seasons or feasts, with a day count. Lesser feasts, the
 * Sundays inside a season and the Annunciation are passed over, so from Lent
 * the next season is Palm Sunday, and from Theophany it is Jonah's Fast.
 */

export interface NameTriple {
  english: string;
  arabic: string;
  french: string;
}

/** Seasons that begin a new colour of the year, from calendar.season_ranges. */
const SEASON_STARTS = new Set(['nativity-fast', 'jonahs-fast', 'lent', 'apostles-fast', 'st-mary-fast']);

/** Feasts that do the same, from the year's single-day events. */
const GREAT_FEASTS = new Set([
  'nayrouz',
  'feast-of-the-cross',
  'nativity',
  'theophany',
  'palm-sunday',
  'resurrection',
  'pentecost',
  'apostles-feast',
  'st-marys-feast',
]);

export const NEXT_SEASON_NAMES: Record<string, NameTriple> = {
  nayrouz: { english: 'Feast of Nayrouz', arabic: 'عيد النيروز', french: 'Fête du Nayrouz' },
  'feast-of-the-cross': { english: 'Feast of the Cross', arabic: 'عيد الصليب', french: 'Fête de la Croix' },
  'nativity-fast': { english: 'Nativity Fast', arabic: 'صوم الميلاد', french: 'Jeûne de la Nativité' },
  nativity: { english: 'Feast of the Nativity', arabic: 'عيد الميلاد', french: 'Fête de la Nativité' },
  theophany: { english: 'Theophany', arabic: 'عيد الغطاس', french: 'Théophanie' },
  'jonahs-fast': { english: "Jonah's Fast", arabic: 'صوم يونان', french: 'Jeûne de Jonas' },
  lent: { english: 'Great Lent', arabic: 'الصوم الكبير', french: 'Grand Carême' },
  'palm-sunday': { english: 'Palm Sunday', arabic: 'أحد الشعانين', french: 'Dimanche des Rameaux' },
  'holy-week': { english: 'Holy Week', arabic: 'أسبوع الآلام', french: 'Semaine sainte' },
  resurrection: { english: 'Feast of the Resurrection', arabic: 'عيد القيامة', french: 'Fête de la Résurrection' },
  pentecost: { english: 'Pentecost', arabic: 'عيد العنصرة', french: 'Pentecôte' },
  'apostles-fast': { english: "Apostles' Fast", arabic: 'صوم الرسل', french: 'Jeûne des Apôtres' },
  'apostles-feast': { english: 'Feast of the Apostles', arabic: 'عيد الرسل', french: 'Fête des Apôtres' },
  'st-mary-fast': { english: "St. Mary's Fast", arabic: 'صوم العذراء', french: 'Jeûne de la Vierge' },
  'st-marys-feast': { english: 'Feast of the Assumption', arabic: 'عيد صعود جسد العذراء', french: 'Fête de l’Assomption' },
};

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from one ISO date to another. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/**
 * The first great season or feast after `fromIso`. Holy Week is counted from
 * the Monday after Palm Sunday — its season range opens on Lazarus Saturday,
 * a day the block keeps in the annual colour.
 */
export function pickNextSeason(
  fromIso: string,
  seasons: readonly { rangeKey: string; startDate: string }[],
  events: readonly { key: string; date: string }[],
): { key: string; date: string; days: number } | null {
  const marks = [
    ...seasons.filter((season) => SEASON_STARTS.has(season.rangeKey)).map((season) => ({ key: season.rangeKey, date: season.startDate })),
    ...events.filter((event) => GREAT_FEASTS.has(event.key)).map((event) => ({ key: event.key, date: event.date })),
    ...events.filter((event) => event.key === 'palm-sunday').map((event) => ({ key: 'holy-week', date: addDaysIso(event.date, 1) })),
  ]
    .filter((mark) => mark.date > fromIso)
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = marks[0];
  return next ? { ...next, days: daysBetween(fromIso, next.date) } : null;
}
