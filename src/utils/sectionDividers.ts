interface DividerCandidate {
  id: string;
  hymnKey?: string;
  title?: { english?: string; arabic?: string };
}

/**
 * An hour opening that marks where one part of a service gives way to the
 * next: the Midnight Hour's three Watches, and the Agpeya hours prayed inside
 * the Offering of the Lamb ("3rd Hour", "3rd Hour and 6th Hour", "12th Hour
 * and Veil"...).
 *
 * The `(?!Of|To)` is what separates a divider from ordinary content that
 * happens to be named the same way: introductionOfEveryHour is a real prayer
 * (and titled, in agpeya), and introductionToTheCreed, introductionToTheHoosP1
 * and introductionToRaisingOfIncenseP1 are all lead-ins to a hymn rather than
 * headings over a section.
 */
const SECTION_DIVIDER_KEY = /^introduction(?!Of|To)[A-Za-z]*(?:Hour|Watch|Veil)$/;

/** Any `introduction…` row at all — titled or not. These are what close a nest, whether or not they open one. */
const ANY_INTRODUCTION_KEY = /^introduction/i;

export function isDividerSection(section: DividerCandidate): boolean {
  return SECTION_DIVIDER_KEY.test(section.hymnKey || '');
}

/**
 * A divider that actually speaks: it has the shape AND a title in this
 * document's schema, since the same hour opening is titled in
 * liturgy.hymn_titles and null in agpeya.hymn_titles. That matters — an
 * untitled opening renders no heading, so it must not silently gather the
 * rest of the Hour behind something invisible, in the content list or in the
 * document.
 */
export function isSpeakingDivider(section: DividerCandidate): boolean {
  return isDividerSection(section) && Boolean(section.title?.english || section.title?.arabic);
}

/**
 * Which divider gathers each section, by section id — the sections that sit
 * under a heading rather than at the document's outer level.
 *
 * A group opens on a speaking divider and closes on the next `introduction…`
 * row of any kind, whether or not that row is itself visible. In the Offering
 * of the Lamb that is introductionToTheCreed, which carries no title and so
 * never renders a heading — but it is still the point where the Agpeya hours
 * end and the Liturgy resumes, so the Creed and everything after it sit back
 * at the outer level. The Midnight Hour ends its third Watch on the same row.
 *
 * The divider itself is deliberately not in the map: it is the group's
 * heading, not a member of it.
 */
export function mapSectionsToDividers<T extends DividerCandidate>(sections: readonly T[]): Map<string, string> {
  const owners = new Map<string, string>();
  let currentDividerId: string | null = null;

  for (const section of sections) {
    if (ANY_INTRODUCTION_KEY.test(section.hymnKey || '')) {
      currentDividerId = isSpeakingDivider(section) ? section.id : null;
      continue;
    }
    if (currentDividerId) owners.set(section.id, currentDividerId);
  }

  return owners;
}
