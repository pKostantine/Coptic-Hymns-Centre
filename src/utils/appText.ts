import { getCurrentAppLanguage, type AppLanguage } from './preferencesStorage';

/**
 * Menu and chrome text in the App Language. The current language is set by
 * ReadingPreferencesProvider as it renders, so these are safe to call while
 * rendering anything beneath it.
 *
 * The React Compiler can't see that read as a dependency: it would keep a
 * component's first-rendered text and never show the new language (English
 * and French differ in nothing else it can see). So every component file
 * that renders text through these — or through the date and season helpers
 * built on them — opts out with 'use no memo' and re-renders as plain React.
 */

/** A label in each app language. Text without a French translation shows its English. */
export interface AppText {
  english: string;
  arabic: string;
  french?: string;
}

/** The English, French or Arabic of an inline label, by the App Language. */
export function tr(english: string, french: string, arabic: string, language: AppLanguage = getCurrentAppLanguage()): string {
  if (language === 'ar') return arabic;
  if (language === 'fr') return french;
  return english;
}

/** A label object's text in the App Language, falling back to whichever language it has. */
export function appText(text: AppText | string | null | undefined, language: AppLanguage = getCurrentAppLanguage()): string {
  if (!text) return '';
  if (typeof text === 'string') return text;
  if (language === 'ar') return text.arabic || text.english || text.french || '';
  if (language === 'fr') return text.french || text.english || text.arabic || '';
  return text.english || text.arabic || text.french || '';
}

/** A menu entry's name ({ title, arabic, french? }, as the manifest keeps them) in the App Language. */
export function entryLabel(entry: { title: string; arabic: string; french?: string }, language: AppLanguage = getCurrentAppLanguage()): string {
  return appText({ english: entry.title, arabic: entry.arabic, french: entry.french }, language);
}

/** Whether appText would show this label's Arabic — for right-to-left styling. */
export function appTextIsArabic(text: AppText | string | null | undefined, language: AppLanguage = getCurrentAppLanguage()): boolean {
  if (!text || typeof text === 'string') return false;
  return language === 'ar' && Boolean(text.arabic);
}

/** The BCP 47 locale for dates and numbers in the App Language. */
export function appLocale(language: AppLanguage = getCurrentAppLanguage()): string {
  if (language === 'ar') return 'ar';
  if (language === 'fr') return 'fr';
  return 'en';
}
