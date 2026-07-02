/**
 * CHC design tokens — ported 1:1 from the predecessor app's
 * `constants/theme.js` (Coptic-Hymns-Centre-Old) plus the literal color/size
 * values hardcoded throughout its components (Header.js, CategoryCard.js,
 * HymnCard.js, HymnDisplayScreen.js, LanguageToggleBar.js,
 * CalendarDatePicker.js, SeasonSelector.js). This file is the single source
 * of truth for CHC styling; there is no light mode.
 */

export const COLORS = {
  // Brand palette (base) — exact old-app COLORS.primary/primaryDark/etc.
  navy: '#003566',
  navyDark: '#001D3D',
  gold: '#C9A227',
  black: '#000000',
  surface: '#071A2A',
  surfaceSoft: '#0D2740',
  white: '#FFFFFF',
  muted: '#C9D3DC',
  border: '#262626',
  rowBlue: '#8EC5FF',
  shadow: '#000000',

  // Gold tints (derived, used verbatim throughout the old app's inline styles)
  goldSoft: 'rgba(201, 162, 39, 0.13)',
  goldLine: 'rgba(201, 162, 39, 0.45)',
  goldBright: '#D8C77A',

  // Liturgical speaker & verse colors (from HymnDisplayScreen.js constants)
  priest: '#D64545',
  bishop: '#D64545',
  deacon: '#FFFF00',
  reader: '#FFFF00',
  people: '#E28A2E',
  comment: '#8FD19E',
  silent: '#C5CBD2',
  silentTitle: '#AEB7C0',
  refrain: '#8EEAFF',

  // theme.colors.* shape expected by SlideshowContainer/VerseBlock
  text: '#FFFFFF',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/**
 * The old app has no shared radius scale — each component hardcodes its own
 * literal (8, 16, 18, 20, 24...). These four are the ones reused often enough
 * to name; anywhere else, components hardcode the old app's literal directly
 * to stay exact.
 */
export const RADII = {
  sm: 8, // buttons, toggle rows, selector items
  md: 16, // icon chips
  lg: 18, // CategoryCard / HymnCard
  pill: 999, // switches, pills
} as const;

export const SHADOWS = {
  card: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  hymnCard: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
} as const;

export const MOTION = {
  durFast: 120,
  durMed: 220,
  pressOpacity: 0.82,
} as const;

/**
 * Exactly the old app's font set (constants/theme.js: title:"Georgia",
 * body:"System") — no Cormorant Garamond, no Amiri. The old app never
 * special-cases Android/web font fallback; we don't either, so the rendered
 * typeface matches on every platform this runs next to the old app on.
 * Arabic text uses "Arial" (hardcoded inline in the old app's Arabic styles
 * and its generated document HTML), not a bundled font.
 */
export const TYPOGRAPHY = {
  title: 'Georgia',
  body: 'System',
  coptic: 'CopticCHC-Regular',
  arabic: 'Arial',
} as const;

/** Reader-only liturgical rubric colors, keyed by DB `Person Type` values. */
export const RUBRIC_COLORS: Record<string, string> = {
  Priest: COLORS.priest,
  'Bishop/Priest': COLORS.priest,
  Deacon: COLORS.deacon,
  Reader: COLORS.reader,
  People: COLORS.people,
  Comment: COLORS.comment,
};

/** `theme` prop shape expected by SlideshowContainer/VerseBlock (ported from stuff for claude/). */
export const CHC_SLIDESHOW_THEME = {
  colors: {
    text: COLORS.white,
    gold: COLORS.gold,
    rowBlue: COLORS.rowBlue,
  },
};
