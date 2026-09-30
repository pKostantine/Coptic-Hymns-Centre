
import { appText } from '../utils/appText';
/**
 * Two naming systems for the same underlying season/feast data:
 * - "Selector" names are the full, formal English + Arabic names shown
 *   inside the Season Selector screen's cards.
 * - "Indicator" names are short English + Arabic names shown in the
 *   calendar screen's small season pill.
 * Keyed by `calendar.season_ranges.range_key` (seasons) and the
 * `SingleDayEvent.key` values produced by calendarService.ts (feast days).
 */

export interface FormalName {
  english: string;
  arabic: string;
  french?: string;
}

export const SEASON_FORMAL_NAMES: Record<string, FormalName> = {
  'apostles-fast': { english: 'Fast of the Apostles', arabic: 'صوم الرسل', french: 'Jeûne des Apôtres' },
  'apostles-feast': { english: 'Feast of the Apostles', arabic: 'عيد الرسل', french: 'Fête des Apôtres' },
  lent: { english: 'Great Lent', arabic: 'الصوم الكبير', french: 'Grand Carême' },
  'holy-week': { english: 'Holy Week', arabic: 'أسبوع الآلام', french: 'Semaine sainte' },
  'jonahs-fast': { english: "Jonah's Fast", arabic: 'صوم يونان', french: 'Jeûne de Jonas' },
  'nativity-fast': { english: 'Fast of the Nativity (Advent)', arabic: 'صوم الميلاد', french: 'Jeûne de la Nativité (Avent)' },
  'holy-50-days': { english: 'Holy 50 Days', arabic: 'الخمسين المقدسة', french: 'Les cinquante jours saints' },
  'st-mary-fast': { english: "Fast of the Virgin Mary", arabic: 'صوم العذراء مريم', french: 'Jeûne de la Vierge Marie' },
};

export const SEASON_SHORT_NAMES: Record<string, FormalName> = {
  'apostles-fast': { english: "Apostles' Fast", arabic: 'صوم الرسل', french: 'Jeûne des Apôtres' },
  'apostles-feast': { english: "Apostles' Feast", arabic: 'عيد الرسل', french: 'Fête des Apôtres' },
  lent: { english: 'Great Lent', arabic: 'الصوم الكبير', french: 'Grand Carême' },
  'holy-week': { english: 'Holy Week', arabic: 'أسبوع الآلام', french: 'Semaine sainte' },
  'jonahs-fast': { english: "Jonah's Fast", arabic: 'صوم يونان', french: 'Jeûne de Jonas' },
  'nativity-fast': { english: 'Nativity Fast', arabic: 'صوم الميلاد', french: 'Jeûne de la Nativité' },
  'holy-50-days': { english: "Holy 50's", arabic: 'الخمسين المقدسة', french: 'Cinquante jours saints' },
  'st-mary-fast': { english: "St. Mary's Fast", arabic: 'صوم العذراء', french: 'Jeûne de la Vierge' },
  'nayrouz-period': { english: 'Nayrouz Period', arabic: 'فترة النيروز', french: 'Temps du Nayrouz' },
  'nativity-period': { english: 'Nativity Period', arabic: 'فترة الميلاد', french: 'Temps de la Nativité' },
  'theophany-period': { english: 'Theophany Period', arabic: 'فترة الغطاس', french: 'Temps de la Théophanie' },
  'second-day-of-theophany': { english: '2nd Day of Theophany', arabic: 'ثاني أيام الغطاس', french: '2e jour de la Théophanie' },
  annual: { english: 'Annual', arabic: 'سنوي', french: 'Annuel' },
};

export const EVENT_FORMAL_NAMES: Record<string, FormalName> = {
  annunciation: { english: 'Feast of the Annunciation', arabic: 'عيد البشارة', french: 'Fête de l’Annonciation' },
  'palm-sunday': { english: 'Feast of Palm Sunday', arabic: 'عيد أحد الشعانين', french: 'Fête des Rameaux' },
  resurrection: { english: 'Glorious Feast of the Resurrection', arabic: 'عيد القيامة المجيد', french: 'Glorieuse fête de la Résurrection' },
  'jonahs-feast': { english: "Jonah's Passover", arabic: 'وفصح يونان', french: 'Pâque de Jonas' },
  'first-monday-of-lent': { english: 'First Monday of Lent', arabic: 'اثنين الصوم الكبير الأول', french: 'Premier lundi du Carême' },
  'lent-sunday-1': { english: 'First Sunday of  Lent', arabic: 'أحد الصوم الكبير الأول', french: 'Premier dimanche du Carême' },
  'lent-sunday-2': { english: 'Second Sunday of Lent', arabic: 'أحد الصوم الكبير الثاني', french: 'Deuxième dimanche du Carême' },
  'lent-sunday-3': { english: 'Third Sunday of Lent', arabic: 'أحد الصوم الكبير الثالث', french: 'Troisième dimanche du Carême' },
  'lent-sunday-4': { english: 'Fourth Sunday of Lent', arabic: 'أحد الصوم الكبير الرابع', french: 'Quatrième dimanche du Carême' },
  'lent-sunday-5': { english: 'Fifth Sunday of Lent', arabic: 'أحد الصوم الكبير الخامس', french: 'Cinquième dimanche du Carême' },
  'lent-sunday-6': { english: 'Sixth Sunday of Lent', arabic: 'أحد الصوم الكبير السادس', french: 'Sixième dimanche du Carême' },
  'last-friday-of-lent': { english: 'Last Friday of Lent', arabic: 'جمعة ختام الصوم', french: 'Dernier vendredi du Carême' },
  'lazarus-saturday': { english: 'Lazarus Saturday', arabic: 'سبت لعازر', french: 'Samedi de Lazare' },
  'apostles-feast': { english: 'Feast of the Apostles', arabic: 'عيد الرسل', french: 'Fête des Apôtres' },
  'feast-of-the-cross': { english: 'Feast of the Cross', arabic: 'عيد الصليب', french: 'Fête de la Croix' },
  theophany: { english: 'Glorious Feast of the Theophany', arabic: 'عيد الغطاس المجيد', french: 'Glorieuse fête de la Théophanie' },
  ascension: { english: 'Feast of the Ascension', arabic: 'عيد الصعود', french: 'Fête de l’Ascension' },
  nativity: { english: 'Glorious Feast of the Nativity', arabic: 'عيد الميلاد المجيد', french: 'Glorieuse fête de la Nativité' },
  pentecost: { english: 'Feast of Pentecost', arabic: 'عيد العنصرة', french: 'Fête de la Pentecôte' },
  nayrouz: { english: 'Feast of Nayrouz', arabic: 'عيد النيروز', french: 'Fête du Nayrouz' },
  'entry-into-egypt': { english: 'Feast of the Entry of the Holy Family into Egypt', arabic: 'عيد دخول العائلة المقدسة أرض مصر', french: 'Fête de l’entrée de la Sainte Famille en Égypte' },
  'wedding-at-cana': { english: 'Feast of the Wedding at Cana of Galilee', arabic: 'عيد عرس قانا الجليل', french: 'Fête des noces de Cana en Galilée' },
  'entry-into-temple': { english: 'Feast of the Entry of Christ into the Temple', arabic: 'عيد دخول المسيح الهيكل', french: 'Fête de la Présentation du Christ au Temple' },
  circumcision: { english: 'Feast of the Circumcision', arabic: 'عيد الختان', french: 'Fête de la Circoncision' },
  transfiguration: { english: 'Feast of the Transfiguration', arabic: 'عيد التجلي', french: 'Fête de la Transfiguration' },
  'holy-thursday': { english: 'Holy Thursday', arabic: 'خميس العهد', french: 'Jeudi saint' },
  'good-friday': { english: 'Good Friday', arabic: 'جمعة العظيمة', french: 'Vendredi saint' },
  'thomas-sunday': { english: 'Thomas Sunday', arabic: 'أحد توما', french: 'Dimanche de Thomas' },
  'bright-saturday': { english: 'Bright Saturday', arabic: 'سبت النور', french: 'Samedi de la joie' },
  'st-marys-feast': { english: "Feast of the Virgin Mary", arabic: 'عيد العذراء مريم', french: 'Fête de la Vierge Marie' },
  'joyful-29': { english: 'Joyful 29th of the Coptic Month', arabic: 'التاسع والعشرين من الشهر القبطي', french: 'Joyeux 29 du mois copte' },
  'kiahk-sunday-1': { english: 'First Sunday of Kiahk', arabic: 'أحد كيهك الأول', french: 'Premier dimanche de Kiahk' },
  'kiahk-sunday-2': { english: 'Second Sunday of Kiahk', arabic: 'أحد كيهك الثاني', french: 'Deuxième dimanche de Kiahk' },
  'kiahk-sunday-3': { english: 'Third Sunday of Kiahk', arabic: 'أحد كيهك الثالث', french: 'Troisième dimanche de Kiahk' },
  'kiahk-sunday-4': { english: 'Fourth Sunday of Kiahk', arabic: 'أحد كيهك الرابع', french: 'Quatrième dimanche de Kiahk' },
};

export const EVENT_SHORT_NAMES: Record<string, FormalName> = {
  annunciation: { english: 'Annunciation', arabic: 'البشارة', french: 'Annonciation' },
  'palm-sunday': { english: 'Palm Sunday', arabic: 'أحد الشعانين', french: 'Rameaux' },
  resurrection: { english: 'Resurrection', arabic: 'القيامة', french: 'Résurrection' },
  'jonahs-feast': { english: "Jonah's Feast", arabic: 'فصح يونان', french: 'Fête de Jonas' },
  'lazarus-saturday': { english: 'Lazarus Saturday', arabic: 'سبت لعازر', french: 'Samedi de Lazare' },
  'apostles-feast': { english: "Apostles' Feast", arabic: 'عيد الرسل', french: 'Fête des Apôtres' },
  'feast-of-the-cross': { english: 'Cross', arabic: 'الصليب', french: 'Croix' },
  'theophany-paramoun': { english: 'Theophany Paramoun', arabic: 'برامون الغطاس', french: 'Paramoun de la Théophanie' },
  theophany: { english: 'Theophany', arabic: 'الغطاس', french: 'Théophanie' },
  ascension: { english: 'Ascension', arabic: 'الصعود', french: 'Ascension' },
  'nativity-paramoun': { english: 'Nativity Paramoun', arabic: 'برامون الميلاد', french: 'Paramoun de la Nativité' },
  nativity: { english: 'Nativity', arabic: 'الميلاد', french: 'Nativité' },
  pentecost: { english: 'Pentecost', arabic: 'العنصرة', french: 'Pentecôte' },
  nayrouz: { english: 'Nayrouz', arabic: 'النيروز', french: 'Nayrouz' },
  'entry-into-egypt': { english: 'Entry into Egypt', arabic: 'دخول مصر', french: 'Entrée en Égypte' },
  'wedding-at-cana': { english: 'Wedding at Cana', arabic: 'عرس قانا', french: 'Noces de Cana' },
  'entry-into-temple': { english: 'Entry into Temple', arabic: 'دخول الهيكل', french: 'Présentation au Temple' },
  circumcision: { english: 'Circumcision', arabic: 'الختان', french: 'Circoncision' },
  transfiguration: { english: 'Transfiguration', arabic: 'التجلي', french: 'Transfiguration' },
  'holy-thursday': { english: 'Holy Thursday', arabic: 'خميس العهد', french: 'Jeudi saint' },
  'good-friday': { english: 'Good Friday', arabic: 'الجمعة العظيمة', french: 'Vendredi saint' },
  'thomas-sunday': { english: 'Thomas Sunday', arabic: 'أحد توما', french: 'Dimanche de Thomas' },
  'first-monday-of-lent': { english: 'First Monday Lent', arabic: 'اثنين الصوم الأول', french: '1er lundi du Carême' },
  'lent-sunday-1': { english: 'Lent Sunday 1', arabic: 'أحد الصوم ١', french: '1er dimanche du Carême' },
  'lent-sunday-2': { english: 'Lent Sunday 2', arabic: 'أحد الصوم ٢', french: '2e dimanche du Carême' },
  'lent-sunday-3': { english: 'Lent Sunday 3', arabic: 'أحد الصوم ٣', french: '3e dimanche du Carême' },
  'lent-sunday-4': { english: 'Lent Sunday 4', arabic: 'أحد الصوم ٤', french: '4e dimanche du Carême' },
  'lent-sunday-5': { english: 'Lent Sunday 5', arabic: 'أحد الصوم ٥', french: '5e dimanche du Carême' },
  'lent-sunday-6': { english: 'Lent Sunday 6', arabic: 'أحد الصوم ٦', french: '6e dimanche du Carême' },
  'last-friday-of-lent': { english: 'Last Friday Lent', arabic: 'جمعة ختام الصوم', french: 'Dernier vendredi du Carême' },
  'bright-saturday': { english: 'Bright Saturday', arabic: 'سبت النور', french: 'Samedi de la joie' },
  'st-marys-feast': { english: "St. Mary's Feast", arabic: 'عيد العذراء', french: 'Fête de la Vierge' },
  'joyful-29': { english: 'Joyful 29th', arabic: 'التاسع والعشرون', french: 'Joyeux 29' },
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
  'nativity-period': 40,
  'theophany-period': 40,
  'holy-50-days': 60,
  'holy-week': 50,
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
  annunciation: 70,
  'palm-sunday': 80,
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
  'lazarus-saturday': 60,
};

// Precedence no number can hold, because it goes round in a circle: the
// Annunciation outranks Lazarus Saturday, Lazarus Saturday outranks Holy Week,
// and Holy Week outranks the Annunciation. The numbers above give the first
// two (70 > 60 > 50); each entry here adds one more. `key` gives way to `to`
// when both fall on the day — unless `unless` does too: it outranks `to`, so
// `to` has no claim left. Holy Week's range opens on Lazarus Saturday, which
// is how the Annunciation on that day still shows.
const INDICATOR_YIELDS: { key: string; to: string; unless?: string }[] = [
  { key: 'annunciation', to: 'holy-week', unless: 'lazarus-saturday' },
];

type SeasonIndicatorItem = { key: string; date?: string };

export function getSeasonIndicatorName(
  activeSeasons: SeasonIndicatorItem[],
  activeEvents: SeasonIndicatorItem[],
): string {
  const candidates = [
    ...activeSeasons.map((season) => ({ key: season.key, priority: SEASON_INDICATOR_PRIORITIES[season.key] ?? 0 })),
    ...activeEvents.map((event) => ({ key: event.key, priority: EVENT_INDICATOR_PRIORITIES[event.key] ?? 0 })),
  ].filter((candidate) => candidate.priority > 0);

  const active = new Set(candidates.map((candidate) => candidate.key));
  const yielding = new Set(
    INDICATOR_YIELDS
      .filter(({ key, to, unless }) => active.has(key) && active.has(to) && !(unless && active.has(unless)))
      .map(({ key }) => key),
  );
  const selected = candidates
    .filter((candidate) => !yielding.has(candidate.key))
    .sort((a, b) => b.priority - a.priority)[0];
  if (!selected) return appText(SEASON_SHORT_NAMES.annual);

  const name = EVENT_SHORT_NAMES[selected.key] || SEASON_SHORT_NAMES[selected.key] || SEASON_SHORT_NAMES.annual;
  return appText(name);
}

export function getSeasonFormalName(rangeKey: string, fallbackEnglish: string): FormalName {
  return SEASON_FORMAL_NAMES[rangeKey] ?? { english: fallbackEnglish, arabic: '' };
}

export function getSeasonShortName(rangeKey: string, fallbackEnglish: string, isArabic = false): string {
  const name = SEASON_SHORT_NAMES[rangeKey];
  if (!name) return fallbackEnglish;
  return appText(name);
}

export function getEventFormalName(key: string, fallbackEnglish: string): FormalName {
  return EVENT_FORMAL_NAMES[key] ?? { english: fallbackEnglish, arabic: '' };
}
