/**
 * The Books menus' jewel palette. Each book has its own deep liturgical
 * colour — the cover on the Books shelf and the band at the top of its own
 * menu — so a book is recognisable by colour before its name is read, with no
 * pictures. `gradient` runs from the lit top of a cover to its shadowed foot;
 * `accent` is a light tint of the same hue for small text and marks on it.
 */
export interface BookTheme {
  gradient: [string, string, string];
  accent: string;
}

export const BOOK_THEMES: Record<string, BookTheme> = {
  psalmody: { gradient: ['#1A4C8C', '#0B2350', '#07132B'], accent: '#BCD4F5' }, // royal blue
  liturgy: { gradient: ['#7A1B30', '#3E0B18', '#1E050B'], accent: '#F2C2CC' }, // burgundy
  veneration: { gradient: ['#13695A', '#0A3A33', '#051C19'], accent: '#B8E8DD' }, // emerald
  lectionary: { gradient: ['#0E6379', '#073645', '#041C24'], accent: '#B5E3EF' }, // teal
  agpeya: { gradient: ['#5E2C7A', '#331744', '#1A0A24'], accent: '#E4CCF5' }, // plum
  bible: { gradient: ['#7A5A12', '#3F2E08', '#1E1604'], accent: '#F2DFA8' }, // bronze
  'holy-week': { gradient: ['#4A0D12', '#230608', '#0E0203'], accent: '#E3B53B' }, // crimson
};

const FALLBACK_THEME: BookTheme = { gradient: ['#0B3D70', '#062443', '#040E1C'], accent: '#BCD4F5' };

export function getBookTheme(categoryId: string): BookTheme {
  return BOOK_THEMES[categoryId] ?? FALLBACK_THEME;
}

/** Holy Week's own tiles: crimson for the day hours, midnight blue for the eves, and the two days that stand apart. */
export const PASCHA_TILE_THEMES = {
  day: { gradient: ['#6B1520', '#3A0B12', '#2A080C'], accent: '#F0C9A0' },
  dayNow: { gradient: ['#9A2230', '#5A1019', '#3A0A10'], accent: '#FFE0B0' },
  eve: { gradient: ['#1A2A5A', '#0F1838', '#080E22'], accent: '#9CC9FF' },
  eveNow: { gradient: ['#27418A', '#152452', '#0B1430'], accent: '#CFE4FF' },
  goodFriday: { gradient: ['#4A0D12', '#1A0406', '#000000'], accent: '#E3B53B' },
  brightSaturday: { gradient: ['#6E5213', '#2E2107', '#0A0702'], accent: '#FFE9A8' },
} satisfies Record<string, BookTheme>;

