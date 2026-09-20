import { supabase } from '@/utils/supabase';

export interface HomeSynaxariumEvent {
  entryKey: string;
  titleEnglish: string | null;
  titleArabic: string | null;
  entryOrder: number;
}

export interface SynaxariumYearRow {
  gregorianDate: string;
  copticYear: number;
  copticMonth: number;
  copticMonthName: string;
  copticDay: number;
  weekdayNumber: number;
  entryKey: string | null;
  entryOrder: number | null;
  titleEnglish: string | null;
  titleArabic: string | null;
}

function assertData<T>(data: T | null, error: { message: string } | null, operation: string): T {
  if (error) throw new Error(`${operation}: ${error.message}`);
  if (data == null) throw new Error(`${operation}: no data returned.`);
  return data;
}

export async function getSundayMessage(date: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_sunday_message', { p_sunday: date });
  if (error) throw new Error('Load Sunday message: ' + error.message);
  return typeof data === 'string' && data.trim() ? data.trim() : null;
}

export async function getSynaxariumEvents(date: string): Promise<HomeSynaxariumEvent[]> {
  const { data, error } = await supabase.rpc('get_home_synaxarium_events', { p_date: date });
  return assertData(data as HomeSynaxariumEvent[] | null, error, 'Load Synaxarium events');
}

export async function getSynaxariumYear(referenceDate: string): Promise<SynaxariumYearRow[]> {
  const { data, error } = await supabase.rpc('get_synaxarium_year', { p_reference_date: referenceDate });
  return assertData(data as SynaxariumYearRow[] | null, error, 'Load Synaxarium year');
}

export const homeService = {
  getSundayMessage,
  getSynaxariumEvents,
  getSynaxariumYear,
} as const;
