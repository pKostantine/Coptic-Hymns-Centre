'use no memo'; // Names the day in the App Language — see src/utils/appText.ts.
import { useEffect, useState } from 'react';

import { getDayTheme, type DayBlockTheme } from '../../../constants/seasonAppearance';
import { getSeasonIndicatorShortName } from '../../../constants/seasonNames';
import { useCalendar } from '../../../context/CalendarContext';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { getCopticDate, getDayOverview, type CopticDate, type DayOverview } from '../../../utils/calendarService';

export interface LiturgicalDay {
  /** The calendar day being shown, as an ISO date. At night it is still that day: 28 September's eve is not 29 September. */
  isoDate: string;
  date: Date;
  /** That day's Coptic date. */
  coptic: CopticDate | null;
  /** The season and next season of the rite being prayed — after the eve toggle, the next morning's. */
  overview: DayOverview | null;
  theme: DayBlockTheme;
  /** The rite's season or feast, named short for the chip. */
  seasonLabel: string;
}

/**
 * The day the Books block and the calendar sheet show, read once per day.
 * The date is the literal day (the eve toggle never turns 28 September into
 * the 29th); the season, its colours and the next season follow the rite being
 * prayed, which after the eve is the next morning's. Each value is kept with
 * the day it was read for, so a slow answer for a day the reader has already
 * left never paints over the new one.
 */
export function useLiturgicalDay(): LiturgicalDay {
  const { rawDate, effectiveDate } = useCalendar();
  // Subscribing re-renders this on an App Language change, so the chip's name follows it.
  useReadingPreferences();
  const isoDate = rawDate.toISOString().slice(0, 10);
  const riteIso = effectiveDate.toISOString().slice(0, 10);
  const [coptic, setCoptic] = useState<{ key: string; value: CopticDate | null } | null>(null);
  const [overview, setOverview] = useState<{ key: string; value: DayOverview | null } | null>(null);

  useEffect(() => {
    let active = true;
    void getCopticDate(new Date(`${isoDate}T00:00:00Z`)).then((value) => { if (active) setCoptic({ key: isoDate, value }); });
    return () => { active = false; };
  }, [isoDate]);

  useEffect(() => {
    let active = true;
    void getDayOverview(riteIso).then((value) => { if (active) setOverview({ key: riteIso, value }); });
    return () => { active = false; };
  }, [riteIso]);

  const dayOverview = overview?.key === riteIso ? overview.value : null;
  return {
    isoDate,
    date: rawDate,
    coptic: coptic?.key === isoDate ? coptic.value : null,
    overview: dayOverview,
    theme: getDayTheme(dayOverview?.indicatorKey, dayOverview?.activeKeys),
    seasonLabel: getSeasonIndicatorShortName(dayOverview?.indicatorKey),
  };
}
