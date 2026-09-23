import type { ReadingPreferences } from './preferencesStorage';

/**
 * Translate user-controlled Book Settings into the exact condition tokens
 * evaluated by the service and its recursively hydrated subdocuments.
 *
 * Monastery is deliberately a user flag, never a calendar-derived flag:
 * enabling "In Monastery" activates hymns with a Monastery condition;
 * disabling it must leave that token false even when another context is set.
 */
export function getUserConditionFlags(
  preferences: Pick<ReadingPreferences, 'selectedSaintHymns' | 'inMonastery'>,
): Record<string, boolean> {
  return {
    ...Object.fromEntries((preferences.selectedSaintHymns || []).map((token) => [token, true])),
    Monastery: preferences.inMonastery === true,
  };
}
