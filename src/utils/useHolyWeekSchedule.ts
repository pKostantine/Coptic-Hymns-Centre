import { useEffect, useState } from 'react';

import { useCalendar } from '../context/CalendarContext';
import { loadHolyWeekSchedule, type HolyWeekSchedule } from './holyWeek';

/**
 * The Holy Week in progress for the app's liturgical date — null outside
 * Holy Week, while loading, or when the calendar can't be read. The menus
 * only use it to date the week and mark what is being prayed now.
 */
export function useHolyWeekSchedule(): HolyWeekSchedule | null {
  const { effectiveDate, liturgicalDayPeriod } = useCalendar();
  const [schedule, setSchedule] = useState<HolyWeekSchedule | null>(null);
  const effectiveIso = effectiveDate.toISOString();

  useEffect(() => {
    let active = true;
    loadHolyWeekSchedule(new Date(effectiveIso), liturgicalDayPeriod === 'evening')
      .then((next) => { if (active) setSchedule(next); })
      .catch(() => { if (active) setSchedule(null); });
    return () => { active = false; };
  }, [effectiveIso, liturgicalDayPeriod]);

  return schedule;
}
