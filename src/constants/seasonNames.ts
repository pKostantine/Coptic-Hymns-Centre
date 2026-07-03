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
  'great-fast': { english: 'Great Lent', arabic: 'الصوم الكبير' },
  'holy-week': { english: 'Holy Week', arabic: 'أسبوع الآلام' },
  'jonahs-fast': { english: "Jonah's Fast", arabic: 'صوم يونان' },
  'nativity-fast': { english: 'Fast of the Nativity (Advent)', arabic: 'صوم الميلاد' },
  'holy-50-days': { english: 'Holy 50 Days', arabic: 'الخمسين المقدسة' },
  'st-mary-fast': { english: "St. Mary's Fast", arabic: 'صوم العذراء مريم' },
};

export const SEASON_SHORT_NAMES: Record<string, string> = {
  'apostles-fast': "Apostles' Fast",
  'great-fast': 'Great Lent',
  'holy-week': 'Holy Week',
  'jonahs-fast': "Jonah's Fast",
  'nativity-fast': 'Nativity Fast',
  'holy-50-days': "Holy 50's",
  'st-mary-fast': "St. Mary's Fast",
};

export const EVENT_FORMAL_NAMES: Record<string, FormalName> = {
  annunciation: { english: 'Feast of the Annunciation', arabic: 'عيد البشارة' },
  'st-marys-feast': { english: "St. Mary's Feast", arabic: 'عيد العذراء مريم' },
  'palm-sunday': { english: 'Feast of Palm Sunday', arabic: 'عيد أحد الشعانين' },
  resurrection: { english: 'Glorious Feast of the Resurrection', arabic: 'عيد القيامة المجيد' },
  'jonahs-feast': { english: "Jonah's Passover", arabic: 'وفصح يونان' },
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
  'last-friday-of-lent': { english: 'Last Friday of Lent', arabic: 'جمعة ختام الصوم' },
  'bright-saturday': { english: 'Bright Saturday', arabic: 'سبت النور' },
  'kiahk-sunday-1': { english: 'First Sunday of Kiahk', arabic: 'أحد كيهك الأول' },
  'kiahk-sunday-2': { english: 'Second Sunday of Kiahk', arabic: 'أحد كيهك الثاني' },
  'kiahk-sunday-3': { english: 'Third Sunday of Kiahk', arabic: 'أحد كيهك الثالث' },
  'kiahk-sunday-4': { english: 'Fourth Sunday of Kiahk', arabic: 'أحد كيهك الرابع' },
};

export const EVENT_SHORT_NAMES: Record<string, string> = {
  annunciation: 'Annunciation',
  'st-marys-feast': "St. Mary's Feast",
  'palm-sunday': 'Palm Sunday',
  resurrection: 'Resurrection',
  'jonahs-feast': "Jonah's Feast",
  'lazarus-saturday': 'Lazarus Saturday',
  'apostles-feast': "Apostles' Feast",
  'feast-of-the-cross': 'Cross',
  theophany: 'Theophany',
  ascension: 'Ascension',
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
  'last-friday-of-lent': 'Last Friday',
  'bright-saturday': 'Bright Saturday',
  'kiahk-sunday-1': '1st Kiahk',
  'kiahk-sunday-2': '2nd Kiahk',
  'kiahk-sunday-3': '3rd Kiahk',
  'kiahk-sunday-4': '4th Kiahk',
};

export function getSeasonFormalName(rangeKey: string, fallbackEnglish: string): FormalName {
  return SEASON_FORMAL_NAMES[rangeKey] ?? { english: fallbackEnglish, arabic: '' };
}

export function getSeasonShortName(rangeKey: string, fallbackEnglish: string): string {
  return SEASON_SHORT_NAMES[rangeKey] ?? fallbackEnglish;
}

export function getEventFormalName(key: string, fallbackEnglish: string): FormalName {
  return EVENT_FORMAL_NAMES[key] ?? { english: fallbackEnglish, arabic: '' };
}
