import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { localDateAtUtcMidnight } from '../utils/dateUtils';

export type LiturgicalDayPeriod = 'morning' | 'evening';

interface CalendarContextValue {
  /** null means "live" — always resolves to today. A concrete Date pins the app to that day. */
  selectedDate: Date | null;
  /** The literal Gregorian date being viewed (today, when live) — never rolled forward. */
  rawDate: Date;
  /**
   * The liturgical date most documents should hydrate against: the Coptic
   * day begins at 5pm, so once `liturgicalDayPeriod` is "evening" this is
   * `rawDate + 1`.
   */
  effectiveDate: Date;
  /**
   * Always `rawDate`, never rolled forward. Saturday-evening Vespers Praises
   * and Vespers still chant in Saturday's (Vatos) weekday tune even though
   * `effectiveDate` has already rolled to Sunday for every other service —
   * pass this as the `weekdayDate` override for those two documents.
   */
  vespersEffectiveDate: Date;
  liturgicalDayPeriod: LiturgicalDayPeriod;
  isLive: boolean;
  selectDate: (date: Date) => void;
  goLive: () => void;
  setLiturgicalDayPeriod: (period: LiturgicalDayPeriod) => void;
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

const EVENING_START_HOUR = 17;

function computeDefaultPeriod(): LiturgicalDayPeriod {
  return new Date().getHours() >= EVENING_START_HOUR ? 'evening' : 'morning';
}

function addOneDay(date: Date): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function CalendarProvider({ children }: { children: React.ReactNode }) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [liturgicalDayPeriod, setLiturgicalDayPeriodState] = useState<LiturgicalDayPeriod>(computeDefaultPeriod);
  const manualOverrideRef = useRef(false);

  const isLive = selectedDate === null;
  const rawDate = selectedDate ?? localDateAtUtcMidnight(new Date());

  // While live and not manually overridden, keep the liturgical day period
  // tracking the real clock so the 5pm boundary flips without a fresh load.
  useEffect(() => {
    if (!isLive || manualOverrideRef.current) return undefined;
    const interval = setInterval(() => {
      setLiturgicalDayPeriodState(computeDefaultPeriod());
    }, 60000);
    return () => clearInterval(interval);
  }, [isLive]);

  const selectDate = useCallback((date: Date) => {
    setSelectedDate(date);
    manualOverrideRef.current = false;
    setLiturgicalDayPeriodState('morning');
  }, []);

  const goLive = useCallback(() => {
    setSelectedDate(null);
    manualOverrideRef.current = false;
    setLiturgicalDayPeriodState(computeDefaultPeriod());
  }, []);

  const setLiturgicalDayPeriod = useCallback((period: LiturgicalDayPeriod) => {
    manualOverrideRef.current = true;
    setLiturgicalDayPeriodState(period);
  }, []);

  const value = useMemo<CalendarContextValue>(() => {
    const effectiveDate = liturgicalDayPeriod === 'evening' ? addOneDay(rawDate) : rawDate;
    return {
      selectedDate,
      rawDate,
      effectiveDate,
      vespersEffectiveDate: rawDate,
      liturgicalDayPeriod,
      isLive,
      selectDate,
      goLive,
      setLiturgicalDayPeriod,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rawDate is a plain derivation of selectedDate, already listed
  }, [selectedDate, liturgicalDayPeriod, isLive, selectDate, goLive, setLiturgicalDayPeriod]);

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}

export function useCalendar() {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error('useCalendar must be used within a CalendarProvider');
  return ctx;
}
