'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useRouter } from 'expo-router';

import BookPage, { BookRow, RowList, SectionHeading } from './BookPage';
import type { IconName } from '../ui/Icon';
import { bookmarkKeyFor, DIVINE_LITURGY_SERVICES, RAISING_OF_INCENSE_OPTIONS, type ServiceDef } from '../../../constants/manifest';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { appText, entryLabel, tr } from '../../../utils/appText';

const INCENSE: Record<string, { icon: IconName; hour: { english: string; arabic: string; french?: string } }> = {
  vespers: { icon: 'cloudy-night-outline', hour: { english: 'Evening', arabic: 'المساء', french: 'Soir' } },
  matins: { icon: 'sunny-outline', hour: { english: 'Morning', arabic: 'الصباح', french: 'Matin' } },
};

/** The three anaphoras, one to choose. */
const ANAPHORAS = ['liturgy_of_st_basil', 'liturgy_of_st_gregory', 'liturgy_of_st_cyril'];

/**
 * The Liturgy (Coptic Vine design, "Book Pages"), its parts in the order they are
 * prayed: the Raising of Incense, evening and morning; the Divine Liturgy's
 * Offering of the Lamb and Liturgy of the Word; the anaphora, three
 * liturgies, one to choose; and the Distribution.
 *
 * `section` shows just one half, for the Raising of Incense and Divine
 * Liturgy routes.
 */
export default function LiturgyMenu({ section }: { section?: 'raising-of-incense' | 'divine-liturgy' }) {
  const router = useRouter();
  const { preferences, isBookmarked } = useReadingPreferences();
  const arabic = preferences.appLanguage === 'ar';
  const bookmarked = (service: ServiceDef) => isBookmarked(bookmarkKeyFor(service.schema, service.table, service.id));
  const openDivine = (service: ServiceDef) => router.push(`/liturgy/divine-liturgy/${service.id}` as never);

  const showIncense = section !== 'divine-liturgy';
  const showDivine = section !== 'raising-of-incense';
  const title = section === 'raising-of-incense'
    ? { english: 'Raising of Incense', arabic: 'رفع بخور', french: 'Offrande de l’encens' }
    : section === 'divine-liturgy'
      ? { english: 'The Divine Liturgy', arabic: 'القداس الإلهي', french: 'La divine liturgie' }
      : { english: 'Liturgy', arabic: 'القداس', french: 'Liturgie' };

  const divineRows = (ids: string[]) => (
    <RowList>
      {ids.map((id) => {
        const service = DIVINE_LITURGY_SERVICES.find((entry) => entry.id === id);
        if (!service) return null;
        return <BookRow key={id} title={entryLabel(service)} arabic={arabic} bookmarked={bookmarked(service)} onPress={() => openDivine(service)} />;
      })}
    </RowList>
  );

  return (
    <BookPage
      title={title}
      kicker={section ? tr('Liturgy', 'Liturgie', 'القداس') : tr('The Holy Liturgy', 'La sainte liturgie', 'القداس الإلهي')}
      arabic={arabic}
      backHref={section ? '/liturgy' : '/books'}
    >
      {showIncense ? (
        <>
          {/* On its own route the page's title already names it. */}
          {!section ? <SectionHeading title={tr('Raising of Incense', 'Offrande de l’encens', 'رفع البخور')} arabic={arabic} /> : null}
          <RowList>
            {RAISING_OF_INCENSE_OPTIONS.map((option) => {
              const look = INCENSE[option.id];
              return (
                <BookRow
                  key={option.id}
                  icon={look?.icon}
                  title={entryLabel(option)}
                  detail={look ? appText(look.hour) : undefined}
                  arabic={arabic}
                  bookmarked={bookmarked(option)}
                  onPress={() => router.push(`/liturgy/raising-of-incense/${option.id}` as never)}
                />
              );
            })}
          </RowList>
        </>
      ) : null}

      {showDivine ? (
        <>
          {!section ? <SectionHeading title={tr('The Divine Liturgy', 'La divine liturgie', 'القداس الإلهي')} arabic={arabic} /> : null}
          {divineRows(['offering_of_the_lamb', 'liturgy_of_the_word'])}
          <SectionHeading title={tr('The Anaphora', 'L’anaphore', 'الأنافورا')} arabic={arabic} />
          {divineRows(ANAPHORAS)}
          <SectionHeading title={tr('Communion', 'La communion', 'التناول')} arabic={arabic} />
          {divineRows(['distribution'])}
        </>
      ) : null}
    </BookPage>
  );
}
