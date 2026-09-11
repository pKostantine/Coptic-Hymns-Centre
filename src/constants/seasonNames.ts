/**
 * Two naming systems for the same underlying season/feast data:
 * - "Selector" names are the full, formal English + Arabic names shown
 *   inside the Season Selector screen's cards.
 * - "Indicator" names are the short English-only names shown in the
 *   calendar screen's small season pill.
 * Keyed by `calendar.season_ranges.range_key` (seasons) and the
 * `SingleDayEvent.key` values produced by calendarService.ts (feast days).
 */

export interface FormalName {
  english: string;
  arabic: string;
}

export const SEASON_FORMAL_NAMES: Record<string, FormalName> = {
  'apostles-fast': { english: 'Fast of the Apostles', arabic: 'صوم الرسل' },
  'apostles-feast': { english: 'Feast of the Apostles', arabic: 'عيد الرسل' },
  lent: { english: 'Great Lent', arabic: 'الصوم الكبير' },
  'holy-week': { english: 'Holy Week', arabic: 'أسبوع الآلام' },
  'jonahs-fast': { english: "Jonah's Fast", arabic: 'صوم يونان' },
  'nativity-fast': { english: 'Fast of the Nativity (Advent)', arabic: 'صوم الميلاد' },
  'holy-50-days': { english: 'Holy 50 Days', arabic: 'الخمسين المقدسة' },
  'st-mary-fast': { english: "Fast of the Virgin Mary", arabic: 'صوم العذراء مريم' },
};

export const SEASON_SHORT_NAMES: Record<string, string> = {
  'apostles-fast': "Apostles' Fast",
  'apostles-feast': "Apostles' Feast",
  lent: 'Great Lent',
  'holy-week': 'Holy Week',
  'jonahs-fast': "Jonah's Fast",
  'nativity-fast': 'Nativity Fast',
  'holy-50-days': "Holy 50's",
  'st-mary-fast': "St. Mary's Fast",
  'nayrouz-period': 'Nayrouz Period',
  'nativity-period': 'Nativity Period',
  'theophany-period': 'Theophany Period',
  'second-day-of-theophany': '2nd Day of Theophany',
  annual: 'Annual',
};

export const EVENT_FORMAL_NAMES: Record<string, FormalName> = {
  annunciation: { english: 'Feast of the Annunciation', arabic: 'عيد البشارة' },
  'palm-sunday': { english: 'Feast of Palm Sunday', arabic: 'عيد أحد الشعانين' },
  resurrection: { english: 'Glorious Feast of the Resurrection', arabic: 'عيد القيامة المجيد' },
  'jonahs-feast': { english: "Jonah's Passover", arabic: 'وفصح يونان' },
  'first-monday-of-lent': { english: 'First Monday of Lent', arabic: 'اثنين الصوم الكبير الأول' },
  'lent-sunday-1': { english: 'First Sunday of  Lent', arabic: 'أحد الصوم الكبير الأول' },
  'lent-sunday-2': { english: 'Second Sunday of Lent', arabic: 'أحد الصوم الكبير الثاني' },
  'lent-sunday-3': { english: 'Third Sunday of Lent', arabic: 'أحد الصوم الكبير الثالث' },
  'lent-sunday-4': { english: 'Fourth Sunday of Lent', arabic: 'أحد الصوم الكبير الرابع' },
  'lent-sunday-5': { english: 'Fifth Sunday of Lent', arabic: 'أحد الصوم الكبير الخامس' },
  'lent-sunday-6': { english: 'Sixth Sunday of Lent', arabic: 'أحد الصوم الكبير السادس' },
  'last-friday-of-lent': { english: 'Last Friday of Lent', arabic: 'جمعة ختام الصوم' },
  'lazarus-saturday': { english: 'Lazarus Saturday', arabic: 'سبت لعازر' },
  'apostles-feast': { english: 'Feast of the Apostles', arabic: 'عيد الرسل' },
  'feast-of-the-cross': { english: 'Feast of the Cross', arabic: 'عيد الصليب' },
  theophany: { english: 'Glorious Feast of the Theophany', arabic: 'عيد الغطاس المجيد' },
  ascension: { english: 'Feast of the Ascension', arabic: 'عيد الصعود' },
  nativity: { english: 'Glorious Feast of the Nativity', arabic: 'عيد الميلاد المجيد' },
  pentecost: { english: 'Feast of Pentecost', arabic: 'عيد العنصرة' },
  nayrouz: { english: 'Feast of Nayrouz', arabic: 'عيد النيروز' },
  'entry-into-egypt': { english: 'Feast of the Entry of the Holy Family into Egypt', arabic: 'عيد دخول العائلة المقدسة أرض مصر' },
  'wedding-at-cana': { english: 'Feast of the Wedding at Cana of Galilee', arabic: 'عيد عرس قانا الجليل' },
  'entry-into-temple': { english: 'Feast of the Entry of Christ into the Temple', arabic: 'عيد دخول المسيح الهيكل' },
  circumcision: { english: 'Feast of the Circumcision', arabic: 'عيد الختان' },
  transfiguration: { english: 'Feast of the Transfiguration', arabic: 'عيد التجلي' },
  'holy-thursday': { english: 'Holy Thursday', arabic: 'خميس العهد' },
  'good-friday': { english: 'Good Friday', arabic: 'جمعة العظيمة' },
  'thomas-sunday': { english: 'Thomas Sunday', arabic: 'أحد توما' },
  'bright-saturday': { english: 'Bright Saturday', arabic: 'سبت النور' },
  'st-marys-feast': { english: "Feast of the Virgin Mary", arabic: 'عيد العذراء مريم' },
  'joyful-29': { english: 'Joyful 29th of the Coptic Month', arabic: 'التاسع والعشرين من الشهر القبطي' },
  'kiahk-sunday-1': { english: 'First Sunday of Kiahk', arabic: 'أحد كيهك الأول' },
  'kiahk-sunday-2': { english: 'Second Sunday of Kiahk', arabic: 'أحد كيهك الثاني' },
  'kiahk-sunday-3': { english: 'Third Sunday of Kiahk', arabic: 'أحد كيهك الثالث' },
  'kiahk-sunday-4': { english: 'Fourth Sunday of Kiahk', arabic: 'أحد كيهك الرابع' },
};

export const EVENT_SHORT_NAMES: Record<string, string> = {
  annunciation: 'Annunciation',
  'palm-sunday': 'Palm Sunday',
  resurrection: 'Resurrection',
  'jonahs-feast': "Jonah's Feast",
  'lazarus-saturday': 'Lazarus Saturday',
  'apostles-feast': "Apostles' Feast",
  'feast-of-the-cross': 'Cross',
  'theophany-paramoun': 'Theophany Paramoun',
  theophany: 'Theophany',
  ascension: 'Ascension',
  'nativity-paramoun': 'Nativity Paramoun',
  nativity: 'Nativity',
  pentecost: 'Pentecost',
  nayrouz: 'Nayrouz',
  'entry-into-egypt': 'Entry into Egypt',
  'wedding-at-cana': 'Wedding at Cana',
  'entry-into-temple': 'Entry into Temple',
  circumcision: 'Circumcision',
  transfiguration: 'Transfiguration',
  'holy-thursday': 'Holy Thursday',
  'good-friday': 'Good Friday',
  'thomas-sunday': 'Thomas Sunday',
  'first-monday-of-lent': 'First Monday Lent',
  'lent-sunday-1': 'Lent Sunday 1',
  'lent-sunday-2': 'Lent Sunday 2',
  'lent-sunday-3': 'Lent Sunday 3',
  'lent-sunday-4': 'Lent Sunday 4',
  'lent-sunday-5': 'Lent Sunday 5',
  'lent-sunday-6': 'Lent Sunday 6',
  'last-friday-of-lent': 'Last Friday Lent',
  'bright-saturday': 'Bright Saturday',
  'st-marys-feast': "St. Mary's Feast",
  'joyful-29': 'Joyful 29th',
};

// Keyed by `calendar.season_ranges.range_key`. A key absent from here scores 0
// and is dropped by getSeasonIndicatorName, so the pill falls back to 'Annual' —
// which is why every key here has to match the database exactly.
//
// The two great fasts sit at 20, deliberately below the 30 used by the feast
// days that fall inside them. A season and an event that tie would resolve to
// the season (sort is stable and seasons are listed first), which would mask
// the Lent Sundays, Annunciation and the rest behind a blanket 'Great Lent'.
// Ranking the span below its own feasts keeps the pill on the more specific of
// the two.
//
// Nativity, Theophany and Nayrouz periods are absent from season_ranges;
// calendarService maps their live context flags into these keys instead.
const SEASON_INDICATOR_PRIORITIES: Record<string, number> = {
  // The three periods rank below the 50 their own feasts use, for the same
  // reason the fasts do: a period is the least specific thing true on a given
  // day, so Circumcision and Wedding at Cana should win inside the Nativity and
  // Theophany periods rather than being flattened into them. Nativity and
  // Theophany themselves sit at 80 and still outrank their periods.
  'nativity-period': 40,
  'theophany-period': 40,
  'holy-50-days': 60,
  'holy-week': 60,
  'nayrouz-period': 40,
  'st-mary-fast': 30,
  'apostles-fast': 30,
  'jonahs-fast': 30,
  lent: 20,
  'nativity-fast': 20,
};

const EVENT_INDICATOR_PRIORITIES: Record<string, number> = {
  nativity: 80,
  'nativity-paramoun': 70,
  theophany: 80,
  'theophany-paramoun': 70,
  'second-day-of-theophany': 60,
  resurrection: 80,
  'holy-thursday': 80,
  'good-friday': 80,
  'bright-saturday': 80,
  ascension: 70,
  pentecost: 70,
  annunciation: 50,
  'palm-sunday': 50,
  'feast-of-the-cross': 50,
  nayrouz: 50,
  'joyful-29': 50,
  circumcision: 50,
  'wedding-at-cana': 50,
  'entry-into-temple': 50,
  transfiguration: 50,
  'entry-into-egypt': 50,
  'st-marys-feast': 30,
  'apostles-feast': 30,
  'jonahs-feast': 30,
  'first-monday-of-lent': 30,
  'last-friday-of-lent': 30,
  'lent-sunday-1': 30,
  'lent-sunday-2': 30,
  'lent-sunday-3': 30,
  'lent-sunday-4': 30,
  'lent-sunday-5': 30,
  'lent-sunday-6': 30,
  'lazarus-saturday': 30,
};

type SeasonIndicatorItem = { key: string; date?: string };

export function getSeasonIndicatorName(
  activeSeasons: SeasonIndicatorItem[],
  activeEvents: SeasonIndicatorItem[],
): string {
  const candidates = [
    ...activeSeasons.map((season) => ({ key: season.key, priority: SEASON_INDICATOR_PRIORITIES[season.key] ?? 0 })),
    ...activeEvents.map((event) => ({ key: event.key, priority: EVENT_INDICATOR_PRIORITIES[event.key] ?? 0 })),
  ].filter((candidate) => candidate.priority > 0);

  const selected = candidates.sort((a, b) => b.priority - a.priority)[0];
  if (!selected) return 'Annual';
  return EVENT_SHORT_NAMES[selected.key] || SEASON_SHORT_NAMES[selected.key] || 'Annual';
}

export function getSeasonFormalName(rangeKey: string, fallbackEnglish: string): FormalName {
  return SEASON_FORMAL_NAMES[rangeKey] ?? { english: fallbackEnglish, arabic: '' };
}

export function getSeasonShortName(rangeKey: string, fallbackEnglish: string): string {
  return SEASON_SHORT_NAMES[rangeKey] ?? fallbackEnglish;
}

export function getEventFormalName(key: string, fallbackEnglish: string): FormalName {
  return EVENT_FORMAL_NAMES[key] ?? { english: fallbackEnglish, arabic: '' };
}
