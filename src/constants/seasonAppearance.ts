/**
 * The colour the Season Spotlight wears for the day it is showing, keyed by
 * the winning indicator key (see getSeasonIndicatorKey in seasonNames.ts).
 *
 * A season is not just an accent here: the Holy 50 Days is a white card with
 * dark text on it, so every text colour on the card comes from the theme
 * rather than being fixed. `gradient[0]` is the corner the text column sits
 * in, which is why `heading`, `muted` and `accent` are checked against the
 * first two stops only — the third is the far corner, and Bright Saturday
 * deliberately puts white there, opposite its black.
 */
export interface SeasonTheme {
  gradient: [string, string, string];
  /** Where the gradient runs from and to. Defaults to the top-left → bottom-right sweep every other card uses. */
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  /** Chip text, card border, calendar button, and the date line above the heading. */
  accent: string;
  /** The Coptic date, the card's largest text. */
  heading: string;
  /** The year-of-the-martyrs line beneath it. */
  muted: string;
  /** Behind the chip, the calendar button and the pills, so they read on a white card as well as a black one. */
  scrim: string;
  /**
   * The index of a gradient stop the text column never reaches, exempt from
   * the contrast floor. Only Bright Saturday has one: its sweep runs away from
   * the text, so the white lands in the opposite corner behind the watermark.
   */
  farStop?: number;
}

/** Text for a card dark enough to carry white type. */
const ON_DARK = { heading: '#FFFFFF', muted: '#F8F5ED', scrim: 'rgba(0, 0, 0, 0.3)' };
/** Text for a light card — the Holy 50 Days, and Bright Saturday's white corner. */
const ON_LIGHT = { heading: '#101820', muted: '#3B4652', scrim: 'rgba(255, 255, 255, 0.55)' };

const FAMILIES = {
  /** Light red. */
  nayrouz: { gradient: ['#9E4047', '#4E1A1F', '#180708'], accent: '#FFD6D9', ...ON_DARK },
  /** Bright red. */
  nativityFast: { gradient: ['#B02020', '#5A0D0D', '#190303'], accent: '#FFC4BE', ...ON_DARK },
  /** Dark red. */
  nativity: { gradient: ['#5C0F16', '#300409', '#110102'], accent: '#E7A3AA', ...ON_DARK },
  /** Sky blue. */
  theophany: { gradient: ['#1D6FA6', '#0C3552', '#04141F'], accent: '#D5EEFF', ...ON_DARK },
  /** Dark green. */
  lent: { gradient: ['#14452B', '#092516', '#030E08'], accent: '#8ED3A4', ...ON_DARK },
  /** Light green — Palm Sunday and both feasts of the Cross. */
  hosanna: { gradient: ['#3C7A33', '#1C3F18', '#081405'], accent: '#DEF5D3', ...ON_DARK },
  /** Black — Monday Eve, prayed on Palm Sunday night, through Good Friday. */
  holyWeek: { gradient: ['#1A1A1A', '#0B0B0B', '#000000'], accent: '#CFC8B8', ...ON_DARK },
  /**
   * Black and white together: the mourning of the week just ended and the
   * light of the night to come. The sweep runs bottom-left to top-right so the
   * black sits under the text column and the white breaks in at the far
   * corner, rather than washing out the heading.
   */
  brightSaturday: {
    gradient: ['#050505', '#1E1E1E', '#F4F4F4'],
    start: { x: 0, y: 1 },
    end: { x: 1, y: 0 },
    accent: '#F2F2F2',
    farStop: 2,
    ...ON_DARK,
  },
  /** White. An actually white card, so its text goes dark. */
  holyFifty: { gradient: ['#FFFFFF', '#F3F6FA', '#DCE4EE'], accent: '#2A3542', ...ON_LIGHT },
  /** Royal blue. */
  stMary: { gradient: ['#1F3391', '#101A47', '#05081A'], accent: '#A9BEFF', ...ON_DARK },
  /** Violet — nothing else in the year claims it, so the Apostles get it. */
  apostles: { gradient: ['#4A2470', '#26103C', '#0D0516'], accent: '#D6AEF5', ...ON_DARK },
  /** Gold — every feast without a season of its own. */
  feast: { gradient: ['#8E6B1A', '#4A330A', '#120C03'], accent: '#FFF5D6', ...ON_DARK },
  /** Dark blue — an ordinary day, and the fallback for an unmapped key. */
  annual: { gradient: ['#0E2A4A', '#071728', '#02080F'], accent: '#93B9E0', ...ON_DARK },
} satisfies Record<string, SeasonTheme>;

const SEASON_APPEARANCE: Record<string, SeasonTheme> = {
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

  // Lazarus Saturday is an ordinary day that happens to carry a feast's name:
  // Lent has ended and Pascha has not begun (currentHolyWeekDayId returns null
  // for it, a day before Palm Sunday), so it keeps the annual colours.
  'lazarus-saturday': FAMILIES.annual,

  'palm-sunday': FAMILIES.hosanna,
  'feast-of-the-cross': FAMILIES.hosanna,
  'feast-of-the-cross-paremhotep': FAMILIES.hosanna,

  'holy-week': FAMILIES.holyWeek,
  'holy-thursday': FAMILIES.holyWeek,
  'good-friday': FAMILIES.holyWeek,

  'bright-saturday': FAMILIES.brightSaturday,

  // The Resurrection and the fifty days it opens share one white.
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

/** Where the gradient runs when a season does not say otherwise. */
export const DEFAULT_GRADIENT_START = { x: 0, y: 0 };
export const DEFAULT_GRADIENT_END = { x: 0.7, y: 1 };

/** The day's colours. An unmapped or absent key is an ordinary day. */
export function getSeasonAppearance(key: string | null | undefined): SeasonTheme {
  return (key ? SEASON_APPEARANCE[key] : undefined) ?? FAMILIES.annual;
}

export { FAMILIES as SEASON_COLOUR_FAMILIES, SEASON_APPEARANCE };
