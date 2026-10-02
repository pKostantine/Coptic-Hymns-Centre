'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import BookPage, { BookRow, RowList, SectionHeading } from './BookPage';
import DayControls from '../ui/DayControls';
import TodayCard, { DayStrip, type DayStripItem } from '../ui/TodayCard';
import { bookmarkKeyFor, SERVICES_BY_CATEGORY, type ServiceDef } from '../../../constants/manifest';
import { DAY_BLOCK_THEMES } from '../../../constants/seasonAppearance';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { AGPEYA_HOURS, agpeyaHourAt, agpeyaHourEnd, formatAgpeyaClock, nextAgpeyaHour, type AgpeyaHour } from '../../../utils/agpeyaHours';
import { appText, entryLabel, tr } from '../../../utils/appText';
import { toEasternArabicDigits } from '../../../utils/localeFormat';

/** The Agpeya is prayed the same through the year, so its card keeps the plain vine green. */
const THEME = DAY_BLOCK_THEMES.annual;

/** The clock hour, re-read every minute so the hour being prayed moves on by itself. */
function useClockHour(): number {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const timer = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return hour;
}

/**
 * The Agpeya (Coptic Vine design, "Book Pages"): the hour being prayed now, the
 * day's hours as a strip to open any of them, and the hour that comes next;
 * then the prayers said around the hours.
 */
export default function AgpeyaMenu() {
  const router = useRouter();
  const { preferences, isBookmarked } = useReadingPreferences();
  const clockHour = useClockHour();
  const arabic = preferences.appLanguage === 'ar';
  const services = SERVICES_BY_CATEGORY.agpeya;
  const byId = (id: string) => services.find((service) => service.id === id);
  const open = (service: ServiceDef) => router.push(`/agpeya/${service.id}` as never);
  const bookmarked = (service: ServiceDef) => isBookmarked(bookmarkKeyFor(service.schema, service.table, service.id));

  const now = agpeyaHourAt(clockHour);
  const next = nextAgpeyaHour(now);
  const nowService = byId(now.id);
  const nextService = byId(next.id);
  const clock = (hour: number) => formatAgpeyaClock(hour, arabic);
  const span = tr(`${clock(now.from)} to ${clock(agpeyaHourEnd(now))}`, `de ${clock(now.from)} à ${clock(agpeyaHourEnd(now))}`, `من ${clock(now.from)} إلى ${clock(agpeyaHourEnd(now))}`);

  const strip: DayStripItem[] = AGPEYA_HOURS.flatMap((hour: AgpeyaHour) => {
    const service = byId(hour.id);
    if (!service) return [];
    return [{
      key: hour.id,
      label: appText(hour.short),
      value: hour.number === null ? { icon: 'moon' as const } : arabic ? toEasternArabicDigits(hour.number) : String(hour.number),
      selected: hour === now,
      accessibilityLabel: entryLabel(service),
      onPress: () => open(service),
    }];
  });

  const others = ['introduction_to_every_hour', 'prayer_of_the_veil', 'other_prayers']
    .map(byId)
    .filter((service): service is ServiceDef => Boolean(service));

  return (
    <BookPage
      title={{ english: 'Agpeya', arabic: 'الأجبية', french: 'Agpia' }}
      kicker={tr('The Book of Hours', 'Le livre des heures', 'كتاب السواعي')}
      arabic={arabic}
      backHref="/books"
      aside={nowService ? (
        <TodayCard
          theme={THEME}
          arabic={arabic}
          controls={<DayControls theme={THEME} arabic={arabic} status={tr('Now', 'Maintenant', 'الآن')} trailing="none" />}
          heading={entryLabel(nowService)}
          subheading={appText(now.traditional) === entryLabel(nowService) ? span : `${appText(now.traditional)} · ${span}`}
          onPressHeading={() => open(nowService)}
          headingAccessibilityLabel={`${entryLabel(nowService)}, ${appText(now.traditional)}`}
          strip={<DayStrip items={strip} theme={THEME} arabic={arabic} variant="hours" />}
          footer={{
            label: tr('Next', 'Ensuite', 'التالية'),
            value: nextService ? entryLabel(nextService) : ' ',
            detail: tr(`at ${clock(next.from)}`, `à ${clock(next.from)}`, `في ${clock(next.from)}`),
            action: {
              label: tr('Pray', 'Prier', 'صلِّ'),
              accessibilityLabel: `${tr('Pray', 'Prier', 'صلِّ')}: ${entryLabel(nowService)}`,
              leadingIcon: 'play',
              onPress: () => open(nowService),
            },
          }}
        />
      ) : undefined}
    >

      <SectionHeading title={tr('Other Prayers', 'Autres prières', 'صلوات أخرى')} arabic={arabic} />
      <RowList>
        {others.map((service) => (
          <BookRow
            key={service.id}
            // Under "Other Prayers", the last of them reads as all the rest.
            title={service.id === 'other_prayers' ? tr('All Other Prayers', 'Toutes les autres prières', 'كل الصلوات الأخرى') : entryLabel(service)}
            detail={service.id === 'introduction_to_every_hour' ? tr('Before every hour', 'Avant chaque heure', 'قبل كل ساعة') : undefined}
            arabic={arabic}
            bookmarked={bookmarked(service)}
            onPress={() => open(service)}
          />
        ))}
      </RowList>
    </BookPage>
  );
}
