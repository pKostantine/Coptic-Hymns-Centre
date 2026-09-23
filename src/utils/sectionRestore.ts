/**
 * The sections a restore is allowed to land on, best first: the one the
 * reader was actually on, then every section before it in document order.
 *
 * A settings change rebuilds the whole document, and the setting that changed
 * can be exactly the one that was keeping the reader's own section visible —
 * hiding Silent Prayers while reading one, turning off the only language it
 * has text in, switching Bishop Present. Restoring to a section that no
 * longer exists silently does nothing, which dumps the reader back at the top
 * of the document. Walking this chain instead lands them on the nearest
 * surviving section *before* where they were, and only falls back to the top
 * when nothing before it survived either.
 *
 * Deliberately resolved against the raw section list rather than by
 * re-deriving what is currently visible: the renderers already do that
 * filtering (buildDocumentHtml, buildSlideshowSections), each in its own way,
 * and a second copy of those rules here would be one more thing to keep in
 * sync. Whoever holds the rendered output picks the first candidate it
 * actually has.
 */
export function sectionRestoreCandidates(
  sectionIds: readonly string[],
  targetId: string | null | undefined,
): string[] {
  if (!targetId) return [];
  const index = sectionIds.indexOf(targetId);
  // Not in this list at all (a stale id from a previous hydration) — nothing
  // to walk back through, so it's the only thing worth trying.
  if (index < 0) return [targetId];

  const candidates: string[] = [];
  for (let i = index; i >= 0; i -= 1) candidates.push(sectionIds[i]);
  return candidates;
}

/** A settings/calendar restore always starts at the original hymn's title.
 * If the hymn is gone, the nearest *preceding* surviving hymn is shown at its
 * end instead. Never substitute a following hymn when an earlier one exists. */
export interface DocumentRestoreTarget {
  sectionId: string;
  edge: 'start' | 'end';
}
export interface DocumentRestoreRequest {
  token: string;
  target: DocumentRestoreTarget;
}

/** The ordering MUST come from the document before it changed. */
export function resolveDocumentRestore(
  originalSectionIds: readonly string[],
  originalSectionId: string,
  visibleNewSectionIds: readonly string[],
): DocumentRestoreTarget | null {
  const visible = new Set(visibleNewSectionIds);
  if (visible.has(originalSectionId)) return { sectionId: originalSectionId, edge: 'start' };
  const originalIndex = originalSectionIds.lastIndexOf(originalSectionId);
  for (let index = originalIndex - 1; index >= 0; index -= 1) {
    const sectionId = originalSectionIds[index];
    if (visible.has(sectionId)) return { sectionId, edge: 'end' };
  }
  // A removed first hymn has no predecessor. There is no sensible "end of
  // previous" target, so take the new document's start.
  return visibleNewSectionIds.length ? { sectionId: visibleNewSectionIds[0], edge: 'start' } : null;
}

export function visibleDocumentSectionIds(
  sections: readonly {
    id: string; titlePrayerType?: string | null; bishopOnly?: boolean;
    priestOnly?: boolean; copticGospelRiteOnly?: boolean; nonCopticGospelRiteOnly?: boolean;
  }[],
  preferences: { displaySilentPrayers: boolean; bishopPresent: boolean; copticGospelRite: boolean },
): string[] {
  return sections.filter(section =>
    (preferences.displaySilentPrayers || section.titlePrayerType !== 'Silent Prayer') &&
    (!section.bishopOnly || preferences.bishopPresent) &&
    (!section.priestOnly || !preferences.bishopPresent) &&
    (!section.copticGospelRiteOnly || preferences.copticGospelRite) &&
    (!section.nonCopticGospelRiteOnly || !preferences.copticGospelRite)
  ).map(section => section.id);
}
