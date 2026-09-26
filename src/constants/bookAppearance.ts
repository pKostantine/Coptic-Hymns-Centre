import type { IconName } from '../components/chc/ui/Icon';
import { COLORS } from './theme';

/**
 * How each book on the Books menu presents itself.
 *
 * Every card used to carry the same gold book glyph, so the menu was seven
 * identical rows and you had to read each one to find anything. A book is now
 * recognisable by its shape before its name is read.
 *
 * The colour is deliberately only two families, not seven. Gold is CHC's own
 * accent and carries the liturgical books; scripture — the Bible and the day's
 * readings from it — takes the blue already used elsewhere for "a document to
 * open". That groups the menu at a glance without turning it into a paint box.
 */
export interface BookAppearance {
  icon: IconName;
  accent: string;
  /** Background of the icon chip: the accent at low opacity. */
  accentSoft: string;
  accentLine: string;
}

const GOLD: Omit<BookAppearance, 'icon'> = {
  accent: COLORS.gold,
  accentSoft: COLORS.goldSoft,
  accentLine: COLORS.goldLine,
};

const SCRIPTURE: Omit<BookAppearance, 'icon'> = {
  accent: COLORS.subdoc,
  accentSoft: COLORS.subdocSoft,
  accentLine: COLORS.subdocLine,
};

const BOOK_APPEARANCE: Record<string, BookAppearance> = {
  psalmody: { icon: 'musical-notes', ...GOLD },
  liturgy: { icon: 'chalice', ...GOLD },
  veneration: { icon: 'sparkle', ...GOLD },
  'holy-week': { icon: 'cross', ...GOLD },
  agpeya: { icon: 'time-outline', ...GOLD },
  lectionary: { icon: 'document-text-outline', ...SCRIPTURE },
  bible: { icon: 'book', ...SCRIPTURE },
};

const FALLBACK: BookAppearance = { icon: 'book', ...GOLD };

/** A book's icon and accent. Anything not listed falls back to the old gold book. */
export function getBookAppearance(categoryId: string): BookAppearance {
  return BOOK_APPEARANCE[categoryId] ?? FALLBACK;
}
