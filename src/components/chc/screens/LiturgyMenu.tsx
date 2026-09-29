'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useRouter } from 'expo-router';

import BookMenuScaffold, { MenuSectionLabel, TileRow } from './BookMenuScaffold';
import JewelTile from '../ui/JewelTile';
import { getBookTheme } from '../../../constants/bookTheme';
import type { IconName } from '../ui/Icon';
import { bookmarkKeyFor, DIVINE_LITURGY_SERVICES, RAISING_OF_INCENSE_OPTIONS, type ServiceDef } from '../../../constants/manifest';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';

import { appText, entryLabel, tr } from '../../../utils/appText';
type Gradient = readonly [string, string, string];

const INCENSE: Record<string, { gradient: Gradient; accent: string; icon: IconName; hour: { english: string; arabic: string; french?: string } }> = {
  vespers: { gradient: ['#6B1A3A', '#3A0C22', '#1A0510'], accent: '#F5C6D6', icon: 'sunset', hour: { english: 'Evening', arabic: 'المساء', french: 'Soir' } },
  matins: { gradient: ['#94303A', '#52141C', '#22070B'], accent: '#FFD8B0', icon: 'sunrise', hour: { english: 'Morning', arabic: 'الصباح', french: 'Matin' } },
};
const STEP_GRADIENT: Gradient = ['#7A1B30', '#3E0B18', '#1E050B'];
const STEP_ACCENT = '#F2C2CC';
const ANAPHORA_GRADIENT: Gradient = ['#8A2338', '#46101C', '#20060C'];
const ANAPHORA_ACCENT = '#F7D08A';

/** The three anaphoras, one to choose. */
const ANAPHORAS = ['liturgy_of_st_basil', 'liturgy_of_st_gregory', 'liturgy_of_st_cyril'];

/**
 * The Liturgy, laid out in the order it is prayed: the Raising of Incense as
 * its evening and morning pair, then the Divine Liturgy step by step — the
 * Offering of the Lamb, the Liturgy of the Word, the anaphora (three
 * liturgies, one to choose), and the Distribution.
 *
 * `section` shows just one half, for the Raising of Incense and Divine
 * Liturgy routes.
 */
export default function LiturgyMenu({ section }: { section?: 'raising-of-incense' | 'divine-liturgy' }) {
  const router = useRouter();
  const { preferences, isBookmarked } = useReadingPreferences();
  const arabic = preferences.appLanguage === 'ar';
  const bookmarked = (service: ServiceDef) => isBookmarked(bookmarkKeyFor(service.schema, service.table, service.id));
  const divine = (id: string) => DIVINE_LITURGY_SERVICES.find((service) => service.id === id);
  const openDivine = (service: ServiceDef) => router.push(`/liturgy/divine-liturgy/${service.id}` as never);

  const showIncense = section !== 'divine-liturgy';
  const showDivine = section !== 'raising-of-incense';
  const title = section === 'raising-of-incense'
    ? { english: 'Raising of Incense', arabic: 'رفع بخور', french: 'Offrande de l’encens' }
    : section === 'divine-liturgy'
      ? { english: 'The Divine Liturgy', arabic: 'القداس الإلهي', french: 'La divine liturgie' }
      : { english: 'Liturgy', arabic: 'القداس', french: 'Liturgie' };

  const step = (id: string) => {
    const service = divine(id);
    if (!service) return null;
    return (
      <JewelTile
        key={id}
        layout="row"
        gradient={id === 'distribution' ? ['#5A1426', '#2E0913', '#140407'] : STEP_GRADIENT}
        accent={STEP_ACCENT}
        title={entryLabel(service)}
        arabic={arabic}
        bookmarked={bookmarked(service)}
        onPress={() => openDivine(service)}
      />
    );
  };

  return (
    <BookMenuScaffold
      theme={getBookTheme('liturgy')}
      title={title}
      overline={section ? (tr('LITURGY', 'LITURGIE', 'القداس')) : undefined}
      arabic={arabic}
      backHref={section ? '/liturgy' : '/books'}
    >
      {showIncense ? (
        <>
          {!section ? <MenuSectionLabel text={tr('Raising of Incense', 'Offrande de l’encens', 'رفع البخور')} arabic={arabic} /> : null}
          <TileRow arabic={arabic}>
            {RAISING_OF_INCENSE_OPTIONS.map((option) => {
              const look = INCENSE[option.id];
              return (
                <JewelTile
                  key={option.id}
                  gradient={look.gradient}
                  accent={look.accent}
                  icon={look.icon}
                  overline={(arabic ? look.hour.arabic : appText(look.hour).toUpperCase())}
                  title={entryLabel(option)}
                  titleSize={22}
                  minHeight={118}
                  arabic={arabic}
                  bookmarked={bookmarked(option)}
                  onPress={() => router.push(`/liturgy/raising-of-incense/${option.id}` as never)}
                />
              );
            })}
          </TileRow>
        </>
      ) : null}

      {showDivine ? (
        <>
          {!section ? <MenuSectionLabel text={tr('The Divine Liturgy', 'La divine liturgie', 'القداس الإلهي')} arabic={arabic} /> : null}
          {step('offering_of_the_lamb')}
          {step('liturgy_of_the_word')}
          <MenuSectionLabel text={tr('The Anaphora', 'L’anaphore', 'الأنافورا')} arabic={arabic} accent={ANAPHORA_ACCENT} />
          {ANAPHORAS.map((id) => {
            const service = divine(id);
            if (!service) return null;
            return (
              <JewelTile
                key={id}
                layout="row"
                gradient={ANAPHORA_GRADIENT}
                accent={ANAPHORA_ACCENT}
                title={entryLabel(service)}
                arabic={arabic}
                outlined
                bookmarked={bookmarked(service)}
                onPress={() => openDivine(service)}
              />
            );
          })}
          {step('distribution')}
        </>
      ) : null}
    </BookMenuScaffold>
  );
}
