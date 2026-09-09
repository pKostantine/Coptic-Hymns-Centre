export type PsalmReadingLanguage = 'english' | 'coptic' | 'arabic';

type PsalmReadingText = Record<PsalmReadingLanguage, string>;

const COMBINING_MARK = /\p{M}/u;
const DIACRITICS = String.raw`\p{M}*`;
const DECORATIVE_SIGN = String.raw`[^\p{L}\p{N}\s,.;:!?،؛؟]`;
const REGEX_CHARACTER = /[.*+?^${}()|[\]\\]/g;

function escapeRegexCharacter(character: string): string {
  return character.replace(REGEX_CHARACTER, '\\$&');
}

function makeDiacriticTolerantWord(form: string): string {
  return (
    Array.from(form.normalize('NFD'))
      .filter((character) => !COMBINING_MARK.test(character))
      .map(escapeRegexCharacter)
      .join(DIACRITICS) + DIACRITICS
  );
}

function makeAlleluiaPatterns(forms: string[]): RegExp[] {
  const core = `(?:${forms.map(makeDiacriticTolerantWord).join('|')})`;
  const wordEnd = `(?![\\p{L}\\p{N}\\p{M}])`;
  const leadingDecoration = `(?:${DECORATIVE_SIGN}+\\s*)*`;
  const trailingDecoration = `[\\p{P}\\p{S}]*(?:\\s*${DECORATIVE_SIGN}+(?=\\s|$))*\\s*`;

  return [
    new RegExp(`(^|\\s)${leadingDecoration}${core}${wordEnd}${trailingDecoration}`, 'giu'),
    new RegExp(`(^|[^\\p{L}\\p{N}\\p{M}])${core}${wordEnd}${trailingDecoration}`, 'giu'),
  ];
}

const ALLELUIA_PATTERNS: Record<PsalmReadingLanguage, RegExp[]> = {
  english: makeAlleluiaPatterns(['Alleluia']),
  coptic: makeAlleluiaPatterns(['ⲁⲗⲗⲏⲗⲟⲩⲓⲁ']),
  arabic: makeAlleluiaPatterns(['هلليلويا', 'الليلويا', 'هللويا']),
};

/** Removes Psalm-source Alleluia text without changing diacritics elsewhere. */
export function stripAlleluiaFromPsalmText(text: string, language: PsalmReadingLanguage): string {
  if (!text) return text;

  let result = text;
  const [decoratedPattern, fallbackPattern] = ALLELUIA_PATTERNS[language];
  result = result.replace(decoratedPattern, (_match, boundary: string) => boundary || '');
  result = result.replace(fallbackPattern, (_match, boundary: string) => boundary || '');
  result = result
    .replace(/\s+([,.;:!?،؛؟])/gu, '$1')
    .replace(/\s{2,}/gu, ' ')
    .replace(/\s+\p{S}+\s*$/u, '')
    .trim();

  return /[\p{L}\p{N}]/u.test(result) ? result : '';
}

export function stripAlleluiaFromPsalmVerse<T extends PsalmReadingText>(verse: T): T {
  return {
    ...verse,
    english: stripAlleluiaFromPsalmText(verse.english, 'english'),
    coptic: stripAlleluiaFromPsalmText(verse.coptic, 'coptic'),
    arabic: stripAlleluiaFromPsalmText(verse.arabic, 'arabic'),
  } as T;
}
