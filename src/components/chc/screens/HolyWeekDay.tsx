'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useRouter } from 'expo-router';

import BookPage, { BookRow, RowList } from './BookPage';
import { bookmarkKeyFor, HOLY_WEEK_ROWS, holyWeekHourHref, type HolyWeekDayDef, type HolyWeekHourDef } from '../../../constants/manifest';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { tr } from '../../../utils/appText';
import { formatLongDate, formatMonthDay, holyWeekRowDate, weekdayName } from '../../../utils/holyWeek';
import { useHolyWeekSchedule } from '../../../utils/useHolyWeekSchedule';

/** The date the day or eve is prayed on — only while the week is in progress; otherwise its name says it all. */
function whenLine(day: HolyWeekDayDef, rowIndex: number, palmSunday: Date | null, arabic: boolean): string | undefined {
  if (!palmSunday) return undefined;
  const date = holyWeekRowDate(palmSunday, rowIndex);
  if (!day.id.endsWith('-eve')) return formatLongDate(date, arabic);
  // An eve belongs to the evening before its day.
  return arabic
    ? `مساء ${formatLongDate(date, true)}`
    : tr(`${weekdayName(rowIndex, false)} evening · ${formatMonthDay(date)}`, `${weekdayName(rowIndex, false)} soir · ${formatMonthDay(date)}`, '');
}

/**
 * One Holy Week day or eve on a page of its own: its hours and services in
 * the order they are prayed. The Holy Week page shows them beside the rest of
 * the week; this is where a day opens from the Books screen while Pascha is
 * being prayed.
 */
export default function HolyWeekDay({ day }: { day: HolyWeekDayDef }) {
  const router = useRouter();
  const { preferences, isBookmarked } = useReadingPreferences();
  const arabic = preferences.appLanguage === 'ar';
  const schedule = useHolyWeekSchedule();

  const eve = day.id.endsWith('-eve');
  const rowIndex = Math.max(0, HOLY_WEEK_ROWS.findIndex((row) => row.days.some((entry) => entry.id === day.id)));
  const isCurrent = schedule?.currentDayId === day.id;
  const kind = eve ? tr('Eve', 'Veille', 'ليلة') : tr('Day', 'Jour', 'نهار');
  const now = eve ? tr('Tonight', 'Ce soir', 'الليلة') : tr('Now', 'Maintenant', 'الآن');

  const bookmarked = (hour: HolyWeekHourDef) => isBookmarked(bookmarkKeyFor(hour.schema, hour.table, hour.id));

  return (
    <BookPage
      title={{ english: day.title, arabic: day.arabic, french: day.french }}
      kicker={isCurrent ? `${kind} · ${now}` : kind}
      subtitle={whenLine(day, rowIndex, schedule?.palmSunday ?? null, arabic)}
      arabic={arabic}
      backHref="/holy-week"
      glow="crimson"
    >
      <RowList>
        {day.hours.map((hour) => (
          <BookRow
            key={hour.id}
            icon={hour.hourNumber ? (eve ? 'moon-outline' : 'sunny-outline') : undefined}
            title={tr(hour.shortTitle, hour.shortFrench, hour.shortArabic)}
            arabic={arabic}
            bookmarked={bookmarked(hour)}
            onPress={() => router.push(holyWeekHourHref(hour) as never)}
          />
        ))}
      </RowList>
    </BookPage>
  );
}
