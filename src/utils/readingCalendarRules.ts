import { supabase } from './supabase';

const MESORE_MONTH = 12;
export const NESI_MONTH = 13;
const READING_RULE_FIELDS = 'service, priority, cycle_type, reading_code, reading_type, reading_reference';

export interface SundayReadingDateInfo {
  copticYear: number;
  copticMonth: number;
  copticDay: number;
  weekdayNumber: number;
  sundayOrdinalInCopticMonth: number | null;
}

const nesiSundayCache = new Map<number, Promise<boolean>>();

async function hasNesiSunday(copticYear: number, sundayWeekdayNumber: number): Promise<boolean> {
  let promise = nesiSundayCache.get(copticYear);
  if (!promise) {
    promise = (async () => {
      try {
        const { data, error } = await supabase
          .schema('calendar')
          .from('coptic_date_conversions')
          .select('gregorian_date')
          .eq('coptic_year', copticYear)
          .eq('coptic_month', NESI_MONTH)
          .eq('weekday_number', sundayWeekdayNumber)
          .limit(1);
        if (error) throw new Error(`Unable to check for a Nesi Sunday: ${error.message}`);
        return Boolean(data?.length);
      } catch (error) {
        nesiSundayCache.delete(copticYear);
        throw error;
      }
    })();
    nesiSundayCache.set(copticYear, promise);
  }
  return promise;
}

export async function shouldUseNesiSundayReadings(copticDate: SundayReadingDateInfo): Promise<boolean> {
  const isLastMesoreSunday = copticDate.copticMonth === MESORE_MONTH
    && copticDate.sundayOrdinalInCopticMonth != null
    && copticDate.copticDay > 23;
  if (!isLastMesoreSunday) return false;

  return !(await hasNesiSunday(copticDate.copticYear, copticDate.weekdayNumber));
}

export async function shouldUseNesiSundayReadingsForDate(isoDate: string): Promise<boolean> {
  const { data, error } = await supabase
    .schema('calendar')
    .from('coptic_date_conversions')
    .select('coptic_year, coptic_month, coptic_day, weekday_number, sunday_ordinal_in_coptic_month')
    .eq('gregorian_date', isoDate)
    .maybeSingle();
  if (error) throw new Error(`Unable to load Coptic date info: ${error.message}`);
  if (!data) throw new Error(`No Coptic date conversion found for ${isoDate}`);

  return shouldUseNesiSundayReadings({
    copticYear: data.coptic_year,
    copticMonth: data.coptic_month,
    copticDay: data.coptic_day,
    weekdayNumber: data.weekday_number,
    sundayOrdinalInCopticMonth: data.sunday_ordinal_in_coptic_month,
  });
}

export async function loadReadingRuleRowsForDate(isoDate: string) {
  const useNesiSundayReadings = await shouldUseNesiSundayReadingsForDate(isoDate);
  const { data, error } = useNesiSundayReadings
    ? await supabase
        .schema('calendar')
        .from('reading_rules')
        .select(READING_RULE_FIELDS)
        .eq('cycle_type', 'AnnualSunday')
        .eq('coptic_month', NESI_MONTH)
        .eq('sunday_ordinal', 1)
        .eq('day_of_week', 0)
    : await supabase.rpc('get_readings_for_date', { p_date: isoDate });

  if (error) throw new Error(`Unable to load readings for ${isoDate}: ${error.message}`);
  return data || [];
}
