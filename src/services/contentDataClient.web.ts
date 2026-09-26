// Web is intentionally a pure online client on every viewport size.
export { supabase as contentDataClient } from '@/utils/supabase';

/** Web never installs offline books. */
export async function isContentSchemaInstalled(_schemaName: string): Promise<boolean> {
  return false;
}
