/**
 * Short names for the pills along the top of the Doxologies subdocument.
 *
 * A pill has room for a word or two, and every doxology's title starts the
 * same way, so the row read "Doxology for the…" over and over. The pills
 * drop that and keep what tells them apart: "Feast of the Cross",
 * "Midnight Virgin", "Archangel Michael". A saint with more than one
 * doxology is numbered -- "St. John the Baptist 1", "St. John the Baptist 2"
 * -- from "Another Doxology for…" and "Second Doxology for…" titles. The
 * content selector keeps the full titles.
 */

/**
 * A doxology whose title has nothing short in it, named here instead. Without
 * a French name of its own, a French pill shortens the French title as usual.
 */
const NAMED_BY_HYMN_KEY: Record<string, { english: string; french?: string }> = {
  doxAllTheHeavenlyBeings: { english: 'Angels', french: 'Anges' },
  doxEntryIntoEgypt: { english: 'Entry of the Holy Family into Egypt' },
  doxEntryIntoTheTemple: { english: 'Entry of Christ into the Temple' },
  doxStruggleMantledSaintsTheCrossBearers: { english: 'Cross-bearers' },
  doxSaturdaysAndSundaysOfTheGreatFast: { english: 'Weekends of Lent' },
};

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8,
};

interface ShortName {
  name: string;
  /** Its place among doxologies of the same name, where the title gives one. */
  index?: number;
}

export function shortEnglishDoxologyName(title: string): ShortName {
  const text = title.trim().replace(/\s+/g, ' ');
  let match = text.match(/^another doxology for (?:the )?(.+)$/i);
  if (match) return { name: match[1], index: 2 };
  match = text.match(/^(first|second|third|fourth|fifth|sixth|seventh|eighth) doxology for (?:the )?(.+)$/i);
  if (match) return { name: match[2], index: ORDINALS[match[1].toLowerCase()] };
  match = text.match(/^doxology for (?:the )?(.+)$/i);
  if (match) return { name: match[1] };
  // "The Midnight Doxology for the Virgin", "Kiahk Doxology for Archangel Gabriel".
  match = text.match(/^(?:the )?(.+?) doxology for (?:the )?(.+)$/i);
  if (match) return { name: `${match[1]} ${match[2]}` };
  if (/^introduction to the doxologies$/i.test(text)) return { name: 'Introduction' };
  if (/^(?:the )?conclusion of the doxologies$/i.test(text)) return { name: 'Conclusion' };
  // "Melody for the Feast of Palm Sunday (2)".
  match = text.match(/^(.+?) \((\d+)\)$/);
  if (match) return { name: match[1], index: Number(match[2]) };
  return { name: text };
}

export function shortFrenchDoxologyName(title: string): string {
  // The French titles number a second doxology "(2)"; the numbering comes
  // from the English title instead, which every doxology has.
  let text = title.trim().replace(/\s+/g, ' ').replace(/\s*\(\d+\)$/, '');
  if (/^introduction aux doxologies$/i.test(text)) return 'Introduction';
  if (/^conclusion des doxologies$/i.test(text)) return 'Conclusion';
  const match = text.match(/^doxologie (?:pour|de|du|des) (?:(?:la|le|les) |l['’])?(.+)$/i);
  if (match) text = match[1];
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface DoxologyPillSection {
  hymnKey?: string;
  title: { english: string; french?: string };
}

/**
 * The pill label for each section, in order; null for a section that isn't
 * a doxology (it keeps whatever label it had). Numbered only where two
 * doxologies share a name, or the title itself says which one it is.
 */
export function doxologyPillNames(
  sections: readonly DoxologyPillSection[],
  french: boolean,
): (string | null)[] {
  const entries = sections.map((section) => {
    const hymnKey = section.hymnKey || '';
    if (!hymnKey.startsWith('dox') || !section.title.english) return null;
    const named = NAMED_BY_HYMN_KEY[hymnKey];
    const short = named ? { name: named.english } : shortEnglishDoxologyName(section.title.english);
    const display = french && named?.french
      ? named.french
      : french && section.title.french ? shortFrenchDoxologyName(section.title.french) : short.name;
    return { group: short.name.toLowerCase(), index: short.index, display };
  });

  const groups = new Map<string, NonNullable<(typeof entries)[number]>[]>();
  for (const entry of entries) {
    if (!entry) continue;
    groups.set(entry.group, [...(groups.get(entry.group) || []), entry]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const taken = new Set(group.map((entry) => entry.index).filter((index): index is number => index != null));
    let next = 1;
    for (const entry of group) {
      if (entry.index != null) continue;
      while (taken.has(next)) next += 1;
      entry.index = next;
      taken.add(next);
    }
  }

  return entries.map((entry) => {
    if (!entry) return null;
    return entry.index != null ? `${entry.display} ${entry.index}` : entry.display;
  });
}
