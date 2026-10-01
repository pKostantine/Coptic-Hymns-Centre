/**
 * The colours of the Books day block, and of the calendar sheet's header, for
 * the liturgical day it shows — the Coptic Vine design system's "Season
 * colours" (Claude Design, "Coptic Vine": season-colours.md).
 *
 * The theme follows the day's winning indicator key (getSeasonIndicatorKey in
 * seasonNames.ts), which already settles which season or feast a day is named
 * after; getDayThemeKey adds the one thing the name does not say — a minor
 * feast inside a fast keeps the fast's colour. The spec's OKLCH stops are
 * written here as the sRGB hex React Native can draw, the source beside each.
 */

export type SeasonThemeKey =
  | 'annual'
  | 'gold'
  | 'natfast'
  | 'nativity'
  | 'theophany'
  | 'lent'
  | 'palm'
  | 'holyweek'
  | 'resurrection'
  | 'apostles'
  | 'marian';

export interface DayBlockTheme {
  key: SeasonThemeKey;
  /** The block's 160° gradient: `from` at 0, `to` at `toAt`. */
  from: string;
  to: string;
  toAt: number;
  border: string;
  /** The Coptic date, weekday numbers and the next season's name. */
  text: string;
  /** The Gregorian date, weekday letters and the "Next season" label. */
  muted: string;
  /** The week strip's Coptic day numbers and the "· N days" count. */
  strong: string;
  /** The sun button and the season chip's chevron. */
  accent: string;
  /** The sun button's ring. */
  accentBorder: string;
  /** The selected day's pill in the week strip, and the text on it. */
  selected: string;
  selectedText: string;
  /** Behind the season chip. */
  chip: string;
  /** The Live dot sits on red and gold as well as green, so off the annual green it wears a white ring. */
  liveRing: 'halo' | 'white';
}

const GOLD = '#E3B53B';
const GREEN_DEEP = '#14301B';

/** What every theme but Annual shares (spec §1, "Shared rules"). */
const ON_COLOUR = {
  toAt: 0.75,
  border: 'rgba(255, 255, 255, 0.16)',
  text: '#FFFFFF',
  muted: 'rgba(255, 255, 255, 0.72)',
  strong: 'rgba(255, 255, 255, 0.85)',
  accent: GOLD,
  accentBorder: GOLD,
  selected: GOLD,
  selectedText: GREEN_DEEP,
  chip: 'rgba(255, 255, 255, 0.08)',
  liveRing: 'white' as const,
};

export const DAY_BLOCK_THEMES: Record<SeasonThemeKey, DayBlockTheme> = {
  /** Vine green — the design's own block. */
  annual: {
    ...ON_COLOUR,
    key: 'annual',
    from: '#2B5A30',
    to: GREEN_DEEP,
    border: 'rgba(227, 181, 59, 0.30)',
    muted: '#CDD8CB',
    strong: '#ECD48A',
    liveRing: 'halo',
  },
  /** Gold, for feasts: oklch(0.64 0.11 85) → oklch(0.34 0.07 72). The gold accents turn white so they don't sink into it. */
  gold: {
    ...ON_COLOUR,
    key: 'gold',
    from: '#AB8632',
    to: '#4E3104',
    accent: '#FFFFFF',
    accentBorder: '#FFFFFF',
    selected: '#FFFFFF',
  },
  /** Deep rose: oklch(0.48 0.16 352) → oklch(0.22 0.09 345). */
  natfast: { ...ON_COLOUR, key: 'natfast', from: '#9C2A67', to: '#340124', toAt: 0.78 },
  /** Scarlet: oklch(0.50 0.19 26) → oklch(0.22 0.10 22). */
  nativity: { ...ON_COLOUR, key: 'nativity', from: '#B71920', to: '#3D0003', toAt: 0.8 },
  /** Sky blue: oklch(0.62 0.11 232) → oklch(0.35 0.09 240). */
  theophany: { ...ON_COLOUR, key: 'theophany', from: '#2F91BD', to: '#003F64' },
  /** Dark green: oklch(0.36 0.07 155) → oklch(0.17 0.04 155). */
  lent: { ...ON_COLOUR, key: 'lent', from: '#19482C', to: '#011408' },
  /** Light green: oklch(0.68 0.15 130) → oklch(0.46 0.12 140). */
  palm: { ...ON_COLOUR, key: 'palm', from: '#79AA3B', to: '#2E6720' },
  /** Black. */
  holyweek: { ...ON_COLOUR, key: 'holyweek', from: '#141414', to: '#000000', border: 'rgba(227, 181, 59, 0.35)' },
  /** White, with dark text and a darker gold. */
  resurrection: {
    ...ON_COLOUR,
    key: 'resurrection',
    from: '#FFFDF7',
    to: '#E8E2D2',
    border: 'rgba(227, 181, 59, 0.55)',
    text: '#10223A',
    muted: '#5B6573',
    strong: '#8A6A12',
    accent: '#8A6A12',
    accentBorder: '#B08A1C',
    chip: 'rgba(16, 34, 58, 0.07)',
  },
  /** Navy — the old CHC navy, kept for the Apostles. */
  apostles: { ...ON_COLOUR, key: 'apostles', from: '#0C3158', to: '#001D3D' },
  /** Royal blue: oklch(0.46 0.17 262) → oklch(0.24 0.11 262). */
  marian: { ...ON_COLOUR, key: 'marian', from: '#1C50B5', to: '#001852' },
};

/** Every indicator key the day can be named after, and the colour it wears (spec §2). */
const THEME_BY_INDICATOR_KEY: Record<string, SeasonThemeKey> = {
  annual: 'annual',
  // Lazarus Saturday is its own day but keeps the plain annual colour (§2 A3).
  'lazarus-saturday': 'annual',

  nayrouz: 'gold',
  'nayrouz-period': 'gold',

  'feast-of-the-cross': 'palm',
  'feast-of-the-cross-paremhotep': 'palm',
  'palm-sunday': 'palm',

  'nativity-fast': 'natfast',
  'kiahk-sunday-1': 'natfast',
  'kiahk-sunday-2': 'natfast',
  'kiahk-sunday-3': 'natfast',
  'kiahk-sunday-4': 'natfast',

  nativity: 'nativity',
  'nativity-period': 'nativity',

  theophany: 'theophany',
  'second-day-of-theophany': 'theophany',
  'theophany-period': 'theophany',

  // Every Paramoun wears the Lent green (§2 C12, C14).
  'nativity-paramoun': 'lent',
  'theophany-paramoun': 'lent',
  lent: 'lent',
  'first-monday-of-lent': 'lent',
  'lent-sunday-1': 'lent',
  'lent-sunday-2': 'lent',
  'lent-sunday-3': 'lent',
  'lent-sunday-4': 'lent',
  'lent-sunday-5': 'lent',
  'lent-sunday-6': 'lent',
  'last-friday-of-lent': 'lent',
  'jonahs-fast': 'lent',
  'jonahs-feast': 'lent',

  // Holy Saturday is Bright Saturday here (سبت النور), still Holy Week's black.
  'holy-week': 'holyweek',
  'holy-thursday': 'holyweek',
  'good-friday': 'holyweek',
  'bright-saturday': 'holyweek',

  resurrection: 'resurrection',
  'holy-50-days': 'resurrection',
  'thomas-sunday': 'resurrection',
  ascension: 'resurrection',
  pentecost: 'resurrection',

  'apostles-fast': 'apostles',
  'apostles-feast': 'apostles',

  'st-mary-fast': 'marian',
  'st-marys-feast': 'marian',
  annunciation: 'marian',

  circumcision: 'gold',
  'wedding-at-cana': 'gold',
  'entry-into-temple': 'gold',
  transfiguration: 'gold',
  'entry-into-egypt': 'gold',
  'joyful-29': 'gold',
};

/** The fasts, and the colour a lesser feast inside one keeps. */
const FAST_THEMES: Record<string, SeasonThemeKey> = {
  lent: 'lent',
  'jonahs-fast': 'lent',
  'nativity-fast': 'natfast',
  'apostles-fast': 'apostles',
  'st-mary-fast': 'marian',
};

/**
 * Feasts that name the day but, inside a fast, leave it the fast's colour
 * (§2 C10, C19–D21): the Joyful 29th, the lesser feasts of the Lord, and the
 * second Feast of the Cross in Lent.
 */
const KEEPS_FAST_COLOUR = new Set([
  'joyful-29',
  'circumcision',
  'wedding-at-cana',
  'entry-into-temple',
  'transfiguration',
  'entry-into-egypt',
  'feast-of-the-cross-paremhotep',
]);

/**
 * The day's colour. `indicatorKey` is what the day is named after; `activeKeys`
 * is every season and feast running that day, so a lesser feast can find the
 * fast around it. An unmapped or absent key is an ordinary day.
 */
export function getDayThemeKey(indicatorKey: string | null | undefined, activeKeys: readonly string[] = []): SeasonThemeKey {
  if (indicatorKey && KEEPS_FAST_COLOUR.has(indicatorKey)) {
    const fast = activeKeys.find((key) => FAST_THEMES[key]);
    if (fast) return FAST_THEMES[fast];
  }
  return (indicatorKey ? THEME_BY_INDICATOR_KEY[indicatorKey] : undefined) ?? 'annual';
}

export function getDayTheme(indicatorKey: string | null | undefined, activeKeys: readonly string[] = []): DayBlockTheme {
  return DAY_BLOCK_THEMES[getDayThemeKey(indicatorKey, activeKeys)];
}

/** Where the 160° gradient runs, as expo-linear-gradient's unit-square points. */
export const DAY_BLOCK_GRADIENT_START = { x: 0.33, y: 0 };
export const DAY_BLOCK_GRADIENT_END = { x: 0.67, y: 1 };

export { THEME_BY_INDICATOR_KEY };
