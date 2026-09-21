import { supabase } from '@/utils/supabase';

export interface CloudContentPreferences {
  exists: boolean;
  preferences: Record<string, unknown>;
  bookmarks: string[];
  updatedAt: string | null;
}

function cleanBookmarks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((bookmark): bookmark is string => (
    typeof bookmark === 'string' && bookmark.trim().length > 0 && bookmark.length <= 512
  )).map((bookmark) => bookmark.trim()))].slice(0, 500);
}

export async function getMyContentPreferences(): Promise<CloudContentPreferences> {
  const { data, error } = await supabase.rpc('get_my_content_preferences');
  if (error) throw new Error(error.message || 'Unable to load account preferences.');
  const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  return {
    exists: payload.exists === true,
    preferences: payload.preferences && typeof payload.preferences === 'object' && !Array.isArray(payload.preferences)
      ? payload.preferences as Record<string, unknown>
      : {},
    bookmarks: cleanBookmarks(payload.bookmarks),
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : null,
  };
}

export async function saveMyContentPreferences(
  preferences: Record<string, unknown>,
  bookmarks: string[],
): Promise<void> {
  const { error } = await supabase.rpc('save_my_content_preferences', {
    p_preferences: preferences,
    p_bookmarks: cleanBookmarks(bookmarks),
  });
  if (error) throw new Error(error.message || 'Unable to save account preferences.');
}
