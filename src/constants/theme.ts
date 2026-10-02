/**
 * Coptic Vine design tokens (Claude Design, "Coptic Vine" design system:
 * tokens.json). Vine green carries the chrome, gold is the one accent, on
 * true black; there is no light mode. The reader's rubric colours below keep
 * the values the services have always been read in.
 */

export const COLORS = {
  // Brand palette — cv-green, cv-green-deep, cv-gold and the surfaces.
  green: '#2B5A30',
  greenDeep: '#14301B',
  // The hero glow's linear fade starts here; the brightest green marks the current season.
  greenMid: '#1D4424',
  greenGlow: '#3A7A3F',
  gold: '#E3B53B',
  black: '#000000',
  surface: '#0B1C10',
  surfaceSoft: '#133020',
  // Top of the book and row cards' fade down to `surface`.
  surfaceDeep: '#10291A',
  white: '#FFFFFF',
  muted: '#CDD8CB',
  border: '#23301F',
  rowBlue: '#8EC5FF',
  shadow: '#000000',

  // Gold tints — cv-gold-soft, cv-gold-line, cv-gold-bright.
  goldSoft: 'rgba(227, 181, 59, 0.13)',
  goldLine: 'rgba(227, 181, 59, 0.45)',
  goldBright: '#ECD48A',

  // Hyperlink (teleport-to-another-service) accent. Deliberately its own trio
  // rather than reusing `refrain` — that green means "this verse is a refrain",
  // and a navigation control must not read as content. Same soft/line/base
  // shape as the gold tints above so the two families behave alike.
  link: '#57C08A',
  linkSoft: 'rgba(87, 192, 138, 0.13)',
  linkLine: 'rgba(87, 192, 138, 0.45)',

  // Learn & Study uses a restrained teal accent so it reads as a focused
  // educational space while keeping the app's green, gold, type, and surfaces.
  learning: '#73C7B5',
  learningBright: '#A8E2D5',
  learningSoft: 'rgba(115, 199, 181, 0.13)',
  learningLine: 'rgba(115, 199, 181, 0.45)',
  learningDeep: '#09282C',

  // Subdocument (open-a-nested-document) accent. Same hue as rowBlue, which is
  // already proven against this background, but given its own trio so the two
  // can move independently. Blue rather than the app's gold because gold is
  // general chrome — the collapse button, section rules, the header — and a
  // button that opens a document should read as its own kind of thing, next to
  // the green that means "leave this document".
  subdoc: '#8EC5FF',
  subdocSoft: 'rgba(142, 197, 255, 0.13)',
  subdocLine: 'rgba(142, 197, 255, 0.45)',

  // Night (eve) accent — Holy Week's eve offices, set against the gold of
  // the daytime hours. Same soft/line/base shape as the other accent
  // families, plus a deeper surface so an eve reads as night at a glance.
  night: '#9CC9FF',
  nightSoft: 'rgba(156, 201, 255, 0.12)',
  nightLine: 'rgba(156, 201, 255, 0.32)',
  nightSurface: '#050E1D',

  // Card outlines: Coptic Vine cards carry only the faint cv-border hairline,
  // which barely shows on black — depth comes from gradients, not outlines.
  cardLine: '#23301F',

  // Liturgical speaker & verse colors (from HymnDisplayScreen.js constants)
  priest: '#D64545',
  bishop: '#D64545',
  deacon: '#FFFF00',
  reader: '#FFFF00',
  people: '#E28A2E',
  // Lighter people orange, for a People LINE's body text rather than its
  // "People:" label. The label is a two-word flag and carries the saturated
  // orange fine; a whole verse in it is punishing to read. This sits at
  // 11.7:1 on black, alongside rowBlue (11.6) and goldBright (12.4), so it
  // belongs to the same family as the other accent text instead of shouting
  // over it. Not `peopleSoft` — in this palette a Soft suffix means an rgba
  // tint used as a background, and this is solid text.
  peopleLight: '#F0B67E',
  comment: '#47627F',
  silent: '#959ba1',
  silentTitle: '#959ba1',
  refrain: '#8FD19E',
  metropolitanBrackets: '#9cfcff',
  
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
  musicCoptic: 'Athanasius',
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
export const SLIDESHOW_THEME = {
  colors: {
    text: COLORS.white,
    gold: COLORS.gold,
    rowBlue: COLORS.rowBlue,
  },
};
