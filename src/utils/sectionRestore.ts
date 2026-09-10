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
