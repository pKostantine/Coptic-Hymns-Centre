/**
 * CHC design tokens — ported from the CHC Design System (Claude Design
 * project "CHC Design System") tokens/colors.css, tokens/spacing.css,
 * tokens/typography.css. Dark, elegant liturgical theme: navy + gold on
 * near-black surfaces. This is the single source of truth for CHC styling;
 * there is no light mode.
 */

import { Platform } from 'react-native';

export const COLORS = {
  // Brand palette (base)
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

  // Gold tints (derived)
  goldSoft: 'rgba(201, 162, 39, 0.13)',
  goldLine: 'rgba(201, 162, 39, 0.45)',
  goldBright: '#D8C77A',

  // Liturgical speaker & verse colors
  priest: '#D64545',
  bishop: '#D64545',
  deacon: '#FFFF00',
  reader: '#FFFF00',
  people: '#E28A2E',
  comment: '#8FD19E',
  silent: '#C5CBD2',
  refrain: '#D8C77A',

  // Semantic aliases
  bgApp: '#000000',
  bgChrome: '#003566',
  bgChromeDeep: '#001D3D',

  // theme.colors.* shape expected by SlideshowContainer/VerseBlock
  text: '#FFFFFF',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const RADII = {
  sm: 8, // action buttons
  md: 16, // icon chips
  lg: 18, // cards
  pill: 999,
} as const;

export const SHADOWS = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  raised: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
} as const;

export const MOTION = {
  durFast: 120,
  durMed: 220,
  pressOpacity: 0.82,
} as const;

/**
 * Title font: Georgia is a native system serif on iOS but not on Android,
 * so Android/web fall back to the bundled Cormorant Garamond (loaded via
 * @expo-google-fonts/cormorant-garamond in the root layout).
 */
export const TYPOGRAPHY = {
  title: Platform.select({ ios: 'Georgia', default: 'CormorantGaramond_700Bold' }) as string,
  titleMedium: Platform.select({ ios: 'Georgia', default: 'CormorantGaramond_600SemiBold' }) as string,
  body: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: 'System',
  }) as string,
  coptic: 'CopticCHC-Regular',
  arabic: 'Amiri_400Regular',
  arabicBold: 'Amiri_700Bold',

  // Type scale (px)
  fsDisplay: 34,
  fsH1: 26,
  fsH2: 22,
  fsTitle: 21,
  fsBody: 17,
  fsSm: 15,
  fsXs: 13,
  fsCoptic: 21,

  // Line heights (multipliers)
  lhTight: 1.15,
  lhTitle: 1.25,
  lhBody: 1.5,
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
