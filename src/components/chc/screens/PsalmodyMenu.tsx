'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import BookPage, { BookRow, RowList, SectionHeading } from './BookPage';
import DayControls from '../ui/DayControls';
import type { IconName } from '../ui/Icon';
import TodayCard from '../ui/TodayCard';
import { useLiturgicalDay } from '../ui/useLiturgicalDay';
import { bookmarkKeyFor, SERVICES_BY_CATEGORY, type ServiceDef } from '../../../constants/manifest';
import { useCalendar } from '../../../context/CalendarContext';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { appText, entryLabel, tr } from '../../../utils/appText';
import { praisesUpNext, type PraiseId, type PraiseMoment } from '../../../utils/psalmodySchedule';

type Name = { english: string; arabic: string; french: string };

/** The three praises in the order they are prayed through the night, each with the hour it keeps. */
const PRAISES: { id: PraiseId; icon: IconName; hour: Name }[] = [
  { id: 'vespers_praises', icon: 'cloudy-night-outline', hour: { english: 'Evening', arabic: 'المساء', french: 'Soir' } },
  { id: 'midnight_praises', icon: 'moon-outline', hour: { english: 'Midnight', arabic: 'نصف الليل', french: 'Minuit' } },
  { id: 'morning_doxology', icon: 'sunny-outline', hour: { english: 'Dawn', arabic: 'الفجر', french: 'Aube' } },
];

const WHEN: Record<PraiseMoment['when'], Name> = {
  now: { english: 'Now', arabic: 'الآن', french: 'Maintenant' },
  'this-morning': { english: 'This morning', arabic: 'هذا الصباح', french: 'Ce matin' },
  'this-evening': { english: 'This evening', arabic: 'هذا المساء', french: 'Ce soir' },
  tonight: { english: 'Tonight', arabic: 'الليلة', french: 'Cette nuit' },
  'at-dawn': { english: 'at dawn', arabic: 'عند الفجر', french: 'à l’aube' },
};

const THEOTOKIA_OF: Name[] = [
  { english: 'Theotokia of Sunday', arabic: 'ثيؤطوكية الأحد', french: 'Théotokie du dimanche' },
  { english: 'Theotokia of Monday', arabic: 'ثيؤطوكية الاثنين', french: 'Théotokie du lundi' },
  { english: 'Theotokia of Tuesday', arabic: 'ثيؤطوكية الثلاثاء', french: 'Théotokie du mardi' },
  { english: 'Theotokia of Wednesday', arabic: 'ثيؤطوكية الأربعاء', french: 'Théotokie du mercredi' },
  { english: 'Theotokia of Thursday', arabic: 'ثيؤطوكية الخميس', french: 'Théotokie du jeudi' },
  { english: 'Theotokia of Friday', arabic: 'ثيؤطوكية الجمعة', french: 'Théotokie du vendredi' },
  { english: 'Theotokia of Saturday', arabic: 'ثيؤطوكية السبت', french: 'Théotokie du samedi' },
];

/** The clock hour, re-read every minute so "Up next" moves on by itself. */
function useClockHour(): number {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const timer = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return hour;
}

/**
 * The Psalmody (CHC design, "Book Pages"): the praise to pray next — the
 * Midnight Praises with the Theotokia of the day they open — and the one
 * after it, then the three services in the order they are prayed.
 */
export default function PsalmodyMenu() {
  const router = useRouter();
  const { preferences, isBookmarked } = useReadingPreferences();
  const { isLive, rawDate, liturgicalDayPeriod } = useCalendar();
  const day = useLiturgicalDay();
  const clockHour = useClockHour();
  const arabic = preferences.appLanguage === 'ar';
  const services = SERVICES_BY_CATEGORY.psalmody;
  const byId = (id: PraiseId) => services.find((entry) => entry.id === id);
  const open = (service: ServiceDef) => router.push(`/psalmody/${service.id}` as never);

  // Live, the clock says what comes next; on a chosen day, its morning or its night.
  const hour = isLive ? clockHour : liturgicalDayPeriod === 'evening' ? 20 : 8;
  const { next, then } = praisesUpNext(hour, rawDate.getUTCDay());
  const nextService = byId(next.id);
  const thenService = byId(then.id);
  const nextLine = [appText(WHEN[next.when]), next.theotokiaWeekday !== undefined ? appText(THEOTOKIA_OF[next.theotokiaWeekday]) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <BookPage
      title={{ english: 'Psalmody', arabic: 'الإبصلمودية', french: 'Psalmodie' }}
      kicker={tr('The Praises', 'Les louanges', 'التسبحة')}
      arabic={arabic}
      backHref="/books"
      aside={nextService ? (
        <TodayCard
          theme={day.theme}
          arabic={arabic}
          controls={(
            <DayControls
              theme={day.theme}
              arabic={arabic}
              status={tr('Up next', 'À suivre', 'التالي')}
              seasonLabel={day.seasonLabel}
              onOpenSeasons={() => router.push('/season-selector')}
              trailing="none"
            />
          )}
          heading={entryLabel(nextService)}
          headingSize="small"
          subheading={nextLine}
          onPressHeading={() => open(nextService)}
          headingAccessibilityLabel={`${entryLabel(nextService)}, ${nextLine}`}
          footer={{
            label: tr('Then', 'Puis', 'ثم'),
            value: thenService ? entryLabel(thenService) : ' ',
            detail: appText(WHEN[then.when]).toLocaleLowerCase(),
            action: {
              label: tr('Open', 'Ouvrir', 'افتح'),
              accessibilityLabel: `${tr('Open', 'Ouvrir', 'افتح')} ${entryLabel(nextService)}`,
              leadingIcon: 'play',
              onPress: () => open(nextService),
            },
          }}
        />
      ) : undefined}
    >

      <SectionHeading title={tr('Services', 'Offices', 'الصلوات')} arabic={arabic} />
      <RowList>
        {PRAISES.map((praise) => {
          const service = byId(praise.id);
          if (!service) return null;
          return (
            <BookRow
              key={praise.id}
              icon={praise.icon}
              title={entryLabel(service)}
              detail={appText(praise.hour)}
              arabic={arabic}
              bookmarked={isBookmarked(bookmarkKeyFor(service.schema, service.table, service.id))}
              onPress={() => open(service)}
            />
          );
        })}
      </RowList>
    </BookPage>
  );
}
