import type { UnifiedSearchPayload, UnifiedSearchScope } from '@/types/unifiedSearch';
import { supabase } from '@/utils/supabase';

const EMPTY_RESULTS: UnifiedSearchPayload = {
  query: '',
  normalizedQuery: '',
  scope: 'all',
  results: [],
};

export async function searchUnifiedMedia(
  query: string,
  locale = 'en',
  scope: UnifiedSearchScope = 'all',
  limit = 60,
): Promise<UnifiedSearchPayload> {
  const value = query.trim();
  if (!value) return { ...EMPTY_RESULTS, scope };

  const { data, error } = scope === 'all'
    ? await supabase.rpc('search_media_catalog', {
        p_query: value,
        p_locale: locale,
        p_scope: scope,
        p_limit: limit,
      })
    : await supabase.rpc('search_section_catalog', {
        p_query: value,
        p_locale: locale,
        p_section: scope,
        p_limit: limit,
      });

  if (error) throw new Error('Search CHC: ' + error.message);
  if (!data) throw new Error('Search CHC: no data returned.');
  return data as unknown as UnifiedSearchPayload;
}

export const unifiedSearchService = { search: searchUnifiedMedia } as const;
