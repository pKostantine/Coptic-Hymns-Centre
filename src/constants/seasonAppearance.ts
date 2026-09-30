import type { BookTheme } from './bookTheme';

/**
 * The colour the Season Spotlight wears for the day it is showing, keyed by
 * the winning indicator key (see getSeasonIndicatorKey in seasonNames.ts).
 *
 * Each season's named colour lives in the `accent` — the chip text, the
 * border, the calendar button, the date line above the heading. The gradient
 * is that same hue taken down dark, because the card's heading and footnote
 * are near-white and sit directly on it. So "white" for the Holy 50 Days is a
 * pale accent over a cool graphite, and "black" for Holy Week is a warm grey
 * accent over near-black: the card reads as the colour without turning the
 * text on it to mush.
 */

const FAMILIES = {
  /** Light red. */
  nayrouz: { gradient: ['#9E4047', '#4E1A1F', '#180708'], accent: '#FFC0C4' },
  /** Bright red. */
  nativityFast: { gradient: ['#B02020', '#5A0D0D', '#190303'], accent: '#FF9F95' },
  /** Dark red. */
  nativity: { gradient: ['#5C0F16', '#300409', '#110102'], accent: '#E7A3AA' },
  /** Sky blue. */
  theophany: { gradient: ['#1D6FA6', '#0C3552', '#04141F'], accent: '#A8DBFF' },
  /** Dark green. */
  lent: { gradient: ['#14452B', '#092516', '#030E08'], accent: '#8ED3A4' },
  /** Light green — the two Hosanna days and both feasts of the Cross. */
  hosanna: { gradient: ['#3C7A33', '#1C3F18', '#081405'], accent: '#C3EDAF' },
  /** Black. */
  holyWeek: { gradient: ['#1A1A1A', '#0B0B0B', '#000000'], accent: '#CFC8B8' },
  /** White. */
  holyFifty: { gradient: ['#3A4048', '#1C2026', '#0A0C0F'], accent: '#F5F3EE' },
  /** Royal blue. */
  stMary: { gradient: ['#1F3391', '#101A47', '#05081A'], accent: '#A9BEFF' },
  /** Violet — nothing else in the year claims it, so the Apostles get it. */
  apostles: { gradient: ['#4A2470', '#26103C', '#0D0516'], accent: '#D6AEF5' },
  /** Gold — every feast without a season of its own. */
  feast: { gradient: ['#8E6B1A', '#4A330A', '#120C03'], accent: '#FFE9A8' },
  /** Dark blue — an ordinary day, and the fallback for an unmapped key. */
  annual: { gradient: ['#0E2A4A', '#071728', '#02080F'], accent: '#93B9E0' },
} satisfies Record<string, BookTheme>;

const SEASON_APPEARANCE: Record<string, BookTheme> = {
  'nayrouz-period': FAMILIES.nayrouz,
  nayrouz: FAMILIES.nayrouz,

  'nativity-fast': FAMILIES.nativityFast,

  'nativity-paramoun': FAMILIES.nativity,
  nativity: FAMILIES.nativity,
  'nativity-period': FAMILIES.nativity,
  annunciation: FAMILIES.nativity,

  'theophany-paramoun': FAMILIES.theophany,
  theophany: FAMILIES.theophany,
  'second-day-of-theophany': FAMILIES.theophany,
  'theophany-period': FAMILIES.theophany,

  lent: FAMILIES.lent,
  'first-monday-of-lent': FAMILIES.lent,
  'lent-sunday-1': FAMILIES.lent,
  'lent-sunday-2': FAMILIES.lent,
  'lent-sunday-3': FAMILIES.lent,
  'lent-sunday-4': FAMILIES.lent,
  'lent-sunday-5': FAMILIES.lent,
  'lent-sunday-6': FAMILIES.lent,
  'last-friday-of-lent': FAMILIES.lent,
  'jonahs-fast': FAMILIES.lent,
  'jonahs-feast': FAMILIES.lent,

  // Lazarus Saturday joins Palm Sunday rather than Holy Week: the holy-week
  // range opens on it, but the app already treats both as their own days
  // ahead of Holy Week proper, which starts with Monday Eve (conditionEngine).
  'lazarus-saturday': FAMILIES.hosanna,
  'palm-sunday': FAMILIES.hosanna,
  'feast-of-the-cross': FAMILIES.hosanna,
  'feast-of-the-cross-paremhotep': FAMILIES.hosanna,

  'holy-week': FAMILIES.holyWeek,
  'holy-thursday': FAMILIES.holyWeek,
  'good-friday': FAMILIES.holyWeek,
  'bright-saturday': FAMILIES.holyWeek,

  // The whole stretch from the Resurrection to Pentecost keeps one colour, so
  // the great feasts inside it read as part of the Holy 50 rather than as
  // gold interruptions.
  'holy-50-days': FAMILIES.holyFifty,
  resurrection: FAMILIES.holyFifty,
  'thomas-sunday': FAMILIES.holyFifty,
  ascension: FAMILIES.holyFifty,
  pentecost: FAMILIES.holyFifty,

  'st-mary-fast': FAMILIES.stMary,
  'st-marys-feast': FAMILIES.stMary,

  'apostles-fast': FAMILIES.apostles,
  'apostles-feast': FAMILIES.apostles,

  'joyful-29': FAMILIES.feast,
  circumcision: FAMILIES.feast,
  'wedding-at-cana': FAMILIES.feast,
  'entry-into-temple': FAMILIES.feast,
  transfiguration: FAMILIES.feast,
  'entry-into-egypt': FAMILIES.feast,
  'kiahk-sunday-1': FAMILIES.feast,
  'kiahk-sunday-2': FAMILIES.feast,
  'kiahk-sunday-3': FAMILIES.feast,
  'kiahk-sunday-4': FAMILIES.feast,

  annual: FAMILIES.annual,
};

/** The day's colours. An unmapped or absent key is an ordinary day. */
export function getSeasonAppearance(key: string | null | undefined): BookTheme {
  return (key ? SEASON_APPEARANCE[key] : undefined) ?? FAMILIES.annual;
}

export { FAMILIES as SEASON_COLOUR_FAMILIES, SEASON_APPEARANCE };
