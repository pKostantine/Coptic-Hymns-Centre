'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useEffect, useState } from 'react';

import { useCalendar } from '../../../context/CalendarContext';
import { appText, tr } from '../../../utils/appText';
import { getWeekStrip, type WeekStripDay } from '../../../utils/calendarService';
import { formatCopticDayMonth, formatDayMonthYearDate, toEasternArabicDigits } from '../../../utils/localeFormat';
import { NEXT_SEASON_NAMES } from '../../../utils/nextSeason';
import DayControls from './DayControls';
import TodayCard, { DayStrip, type DayStripItem } from './TodayCard';
import type { LiturgicalDay } from './useLiturgicalDay';

const WEEKDAYS = {
  english: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  french: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
  arabic: ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'],
};

interface DayBlockProps {
  /** The liturgical day, from useLiturgicalDay — the screen reads it once and shares it. */
  day: LiturgicalDay;
  arabic: boolean;
  onOpenCalendar: () => void;
  onOpenSeasons: () => void;
  /** A gold button in the footer — during Pascha, the way into the hour being prayed. */
  action?: { label: string; onPress: () => void };
}

/**
 * The top of the Books screen: the liturgical day the books are read against
 * (Coptic Vine design, "Books"). Live, the season and the eve toggle; the Coptic day
 * large over the Gregorian; the week around it, each day selectable; and the
 * next great season with a day count. It wears the day's season colours
 * (seasonAppearance.ts), cross-fading when the day changes.
 */
export default function DayBlock({ day, arabic, onOpenCalendar, onOpenSeasons, action }: DayBlockProps) {
  const { selectDate } = useCalendar();
  const { theme } = day;
  const [week, setWeek] = useState<{ key: string; days: WeekStripDay[] } | null>(null);

  useEffect(() => {
    let active = true;
    void getWeekStrip(day.isoDate).then((days) => { if (active) setWeek({ key: day.isoDate, days }); }).catch(() => {});
    return () => { active = false; };
  }, [day.isoDate]);

  const heading = day.coptic ? formatCopticDayMonth(day.coptic.monthName, day.coptic.day, arabic) : ' ';
  const weekdayNames = arabic ? WEEKDAYS.arabic : tr(WEEKDAYS.english.join('|'), WEEKDAYS.french.join('|'), '').split('|');
  const digits = (value: number) => (arabic ? toEasternArabicDigits(value) : String(value));
  const next = day.overview?.nextSeason;
  const nextName = next ? NEXT_SEASON_NAMES[next.key] : undefined;

  const strip: DayStripItem[] = (week?.key === day.isoDate ? week.days : []).map((weekDay, index) => {
    const date = new Date(`${weekDay.isoDate}T00:00:00Z`);
    return {
      key: weekDay.isoDate,
      label: weekdayNames[index],
      value: digits(weekDay.gregorianDay),
      sub: weekDay.copticDay === null ? ' ' : digits(weekDay.copticDay),
      selected: weekDay.isoDate === day.isoDate,
      dot: weekDay.hasFeast,
      accessibilityLabel: formatDayMonthYearDate(date, arabic),
      onPress: () => selectDate(date),
    };
  });

  return (
    <TodayCard
      theme={theme}
      arabic={arabic}
      controls={<DayControls theme={theme} seasonLabel={day.seasonLabel} arabic={arabic} onOpenSeasons={onOpenSeasons} />}
      heading={heading}
      subheading={formatDayMonthYearDate(day.date, arabic)}
      onPressHeading={onOpenCalendar}
      headingAccessibilityLabel={`${heading}. ${tr('Open the calendar', 'Ouvrir le calendrier', 'افتح التقويم')}`}
      strip={<DayStrip items={strip} theme={theme} arabic={arabic} />}
      footer={{
        label: tr('Next season', 'Prochain temps', 'الفترة القادمة'),
        value: nextName ? appText(nextName) : ' ',
        detail: next && nextName ? dayCount(next.days, arabic) : undefined,
        action: action ? { label: action.label, onPress: action.onPress, trailingIcon: arabic ? 'chevron-back' : 'chevron-forward' } : undefined,
      }}
    />
  );
}

/** "1 day", "56 days"; in Arabic with the noun each count takes. */
function dayCount(days: number, arabic: boolean): string {
  if (arabic) {
    if (days === 1) return 'يوم واحد';
    if (days === 2) return 'يومان';
    return `${toEasternArabicDigits(days)} ${days <= 10 ? 'أيام' : 'يومًا'}`;
  }
  return days === 1 ? tr('1 day', '1 jour', '') : tr(`${days} days`, `${days} jours`, '');
}
