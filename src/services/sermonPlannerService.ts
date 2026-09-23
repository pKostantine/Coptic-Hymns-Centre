import { supabase } from '@/utils/supabase';
import type { SermonPlan } from '@/types/sermonPlanner';
import { emptySermonPlan, normalizeSermonPlan } from '@/utils/sermonPlanner';

const LOCAL_STORAGE_PREFIX = 'chc.sermon-plans.v1';

function storageKey(documentKey: string, serviceDate: string) {
  return `${LOCAL_STORAGE_PREFIX}:${encodeURIComponent(documentKey)}:${serviceDate}`;
}

export async function loadLocalSermonPlan(documentKey: string, serviceDate: string): Promise<SermonPlan> {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(documentKey, serviceDate));
    return normalizeSermonPlan(raw ? JSON.parse(raw) : null, documentKey, serviceDate);
  } catch {
    return emptySermonPlan(documentKey, serviceDate);
  }
}

export async function saveLocalSermonPlan(plan: SermonPlan): Promise<void> {
  globalThis.localStorage?.setItem(storageKey(plan.documentKey, plan.serviceDate), JSON.stringify(plan));
}

export async function loadCloudSermonPlan(
  documentKey: string,
  serviceDate: string,
): Promise<SermonPlan | null> {
  const { data, error } = await supabase
    .from('sermon_plans')
    .select('document_key, service_date, general_notes, highlights, updated_at')
    .eq('document_key', documentKey)
    .eq('service_date', serviceDate)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Unable to load sermon notes.');
  if (!data) return null;
  return normalizeSermonPlan({
    version: 1,
    documentKey: data.document_key,
    serviceDate: data.service_date,
    generalNotes: data.general_notes,
    highlights: data.highlights,
    updatedAt: data.updated_at,
  }, documentKey, serviceDate);
}

export async function saveCloudSermonPlan(userId: string, plan: SermonPlan): Promise<void> {
  const { error } = await supabase.from('sermon_plans').upsert({
    user_id: userId,
    document_key: plan.documentKey,
    service_date: plan.serviceDate,
    general_notes: plan.generalNotes,
    highlights: plan.highlights,
    updated_at: plan.updatedAt,
  }, { onConflict: 'user_id,document_key,service_date' });
  if (error) throw new Error(error.message || 'Unable to save sermon notes.');
}

