import { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface CalendarContextValue {
  /** null means "live" — always resolves to today. A concrete Date pins the app to that day. */
  selectedDate: Date | null;
  effectiveDate: Date;
  isLive: boolean;
  selectDate: (date: Date) => void;
  goLive: () => void;
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

export function CalendarProvider({ children }: { children: React.ReactNode }) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const selectDate = useCallback((date: Date) => setSelectedDate(date), []);
  const goLive = useCallback(() => setSelectedDate(null), []);

  const value = useMemo<CalendarContextValue>(
    () => ({
      selectedDate,
      effectiveDate: selectedDate ?? new Date(),
      isLive: selectedDate === null,
      selectDate,
      goLive,
    }),
    [selectedDate, selectDate, goLive],
  );

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}

export function useCalendar() {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error('useCalendar must be used within a CalendarProvider');
  return ctx;
}
