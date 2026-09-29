export type PsalmReadingLanguage = 'english' | 'french' | 'coptic' | 'arabic';

type PsalmReadingText = Record<Exclude<PsalmReadingLanguage, 'french'>, string> & { french?: string };

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
  // Matched against decomposed text (see below), so "Alléluia" fits too.
  french: makeAlleluiaPatterns(['Alleluia']),
  coptic: makeAlleluiaPatterns(['ⲁⲗⲗⲏⲗⲟⲩⲓⲁ']),
  arabic: makeAlleluiaPatterns(['هلليلويا', 'الليلويا', 'هللويا']),
};

const FRENCH_SPACED_PUNCTUATION = new RegExp(`(${makeDiacriticTolerantWord('Alleluia')})[\\s\\u00a0\\u202f]+([!?;:])`, 'giu');

/** Removes Psalm-source Alleluia text without changing diacritics elsewhere. */
export function stripAlleluiaFromPsalmText(text: string, language: PsalmReadingLanguage): string {
  if (!text) return text;

  // A precomposed "é" isn't "e" plus a mark, so French is matched decomposed
  // and put back together afterwards.
  let result = language === 'french' ? text.normalize('NFD') : text;
  // French sets a space before ! ? ; : — join it to the word so the
  // punctuation goes with it rather than being left behind.
  if (language === 'french') result = result.replace(FRENCH_SPACED_PUNCTUATION, '$1$2');
  const [decoratedPattern, fallbackPattern] = ALLELUIA_PATTERNS[language];
  result = result.replace(decoratedPattern, (_match, boundary: string) => boundary || '');
  result = result.replace(fallbackPattern, (_match, boundary: string) => boundary || '');
  // French keeps its space before ! ? ; : — only a stray one before , or .
  // is closed up.
  result = result
    .replace(language === 'french' ? /\s+([,.])/gu : /\s+([,.;:!?،؛؟])/gu, '$1')
    .replace(/\s{2,}/gu, ' ')
    .replace(/\s+\p{S}+\s*$/u, '')
    .trim();
  if (language === 'french') result = result.normalize('NFC');

  return /[\p{L}\p{N}]/u.test(result) ? result : '';
}

export function stripAlleluiaFromPsalmVerse<T extends PsalmReadingText>(verse: T): T {
  return {
    ...verse,
    english: stripAlleluiaFromPsalmText(verse.english, 'english'),
    ...(verse.french === undefined ? {} : { french: stripAlleluiaFromPsalmText(verse.french, 'french') }),
    coptic: stripAlleluiaFromPsalmText(verse.coptic, 'coptic'),
    arabic: stripAlleluiaFromPsalmText(verse.arabic, 'arabic'),
  } as T;
}
