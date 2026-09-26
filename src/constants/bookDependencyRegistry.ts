import type { ContentRootManifest, DownloadableBookKey } from '@/types/bookDownloads';

/**
 * One package is produced per shared content resource (currently a Supabase
 * schema). Books merely hold references to resources, so Public, Agpeya,
 * Doxologies, Bible, etc. are stored once no matter how many books need them.
 *
 * These declarations mirror the reader's runtime registries in
 * hymnLibrary.js and saintHymns.ts. References whose schema cannot be inferred
 * safely from stored row values are registered explicitly here and in the
 * server registry, then exercised by the dependency coverage tests.
 */
export const CONTENT_RESOURCE_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  public: [],
  calendar: [],
  bible: ['public'],
  agpeya: ['public'],
  canons: ['public'],
  doxologies: ['public'],
  gospel_rite: ['public', 'bible', 'calendar'],
  gospel_responses: ['public'],
  hymn_of_the_intercessions: ['public'],
  litanies: ['public'],
  praxis_response: ['public'],
  readings: ['public', 'bible', 'calendar'],
  synaxarium: ['calendar'],
  verses_of_the_cymbals: ['public'],
  psalmody: ['public', 'agpeya', 'doxologies', 'canons', 'bible', 'calendar'],
  veneration: [
    'public', 'doxologies', 'verses_of_the_cymbals', 'hymn_of_the_intercessions',
    'praxis_response', 'psalmody', 'calendar',
  ],
  liturgy: [
    'public', 'verses_of_the_cymbals', 'doxologies', 'bible', 'gospel_rite',
    'gospel_responses', 'agpeya', 'hymn_of_the_intercessions', 'readings',
    'praxis_response', 'litanies', 'synaxarium', 'psalmody', 'veneration', 'calendar',
  ],
  // Holy Week's hymns live in holy_week and public; each hour's prophecies,
  // epistles and gospels are read from bible via holy_week.reading_rules.
  holy_week: ['public', 'bible', 'calendar'],
});

export const DOWNLOADABLE_BOOKS: Readonly<Record<DownloadableBookKey, {
  title: string;
  titleArabic: string;
  roots: readonly string[];
}>> = Object.freeze({
  psalmody: { title: 'Psalmody', titleArabic: 'الإبصلمودية', roots: ['psalmody'] },
  liturgy: { title: 'Liturgy', titleArabic: 'القداس', roots: ['liturgy'] },
  veneration: { title: 'Veneration', titleArabic: 'تمجيد', roots: ['veneration'] },
  agpeya: { title: 'Agpeya', titleArabic: 'الأجبية', roots: ['agpeya'] },
  bible: { title: 'Bible', titleArabic: 'الكتاب المقدس', roots: ['bible'] },
  holy_week: { title: 'Holy Week', titleArabic: 'أسبوع الآلام', roots: ['holy_week'] },
});

export const DOWNLOADABLE_BOOK_KEYS = Object.freeze(Object.keys(DOWNLOADABLE_BOOKS) as DownloadableBookKey[]);

export function resolveResourceDependencies(
  roots: readonly string[],
  dependencyMap: Readonly<Record<string, readonly string[]>> = CONTENT_RESOURCE_DEPENDENCIES,
): string[] {
  const resolved: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (resourceId: string) => {
    if (visited.has(resourceId)) return;
    // A back-edge is a valid circular reference. The already-active stack
    // will finish adding each resource exactly once.
    if (visiting.has(resourceId)) return;
    if (!Object.prototype.hasOwnProperty.call(dependencyMap, resourceId)) {
      throw new Error(`Unknown offline content resource: ${resourceId}`);
    }
    visiting.add(resourceId);
    for (const dependency of dependencyMap[resourceId] || []) visit(dependency);
    visiting.delete(resourceId);
    visited.add(resourceId);
    resolved.push(resourceId);
  };

  // Public is mandatory for every optional book even when a future root has
  // not declared it correctly yet. Calendar is system-managed separately.
  visit('public');
  for (const root of roots) visit(root);
  return resolved;
}

export function resourcesForBook(bookKey: DownloadableBookKey): string[] {
  return resolveResourceDependencies(DOWNLOADABLE_BOOKS[bookKey].roots);
}

export function validatePublishedManifest(manifest: ContentRootManifest): void {
  if (manifest.formatVersion !== 1 || !manifest.snapshotId) throw new Error('Unsupported content manifest.');
  for (const bookKey of DOWNLOADABLE_BOOK_KEYS) {
    const book = manifest.books[bookKey];
    if (!book) throw new Error(`Published manifest is missing ${bookKey}.`);
    const required = new Set(resourcesForBook(bookKey));
    for (const resourceId of book.resources) required.add(resourceId);
    if (!required.has('public')) throw new Error(`${bookKey} does not include Public.`);
    for (const resourceId of required) {
      const resource = manifest.resources[resourceId];
      if (!resource) throw new Error(`Published manifest is missing resource ${resourceId}.`);
      if (!resource.version || !resource.chunks.length) throw new Error(`Resource ${resourceId} has no downloadable chunks.`);
      const chunkIds = new Set<string>();
      for (const chunk of resource.chunks) {
        if (!chunk.id || chunkIds.has(chunk.id)) throw new Error(`Resource ${resourceId} has duplicate or empty chunk IDs.`);
        if (!/^\/?packages\//.test(chunk.url) && !/^https:\/\//i.test(chunk.url)) throw new Error(`Resource ${resourceId} has an invalid chunk URL.`);
        if (!/^[a-f0-9]{64}$/i.test(chunk.sha256) || chunk.size <= 0 || chunk.rowCount <= 0) {
          throw new Error(`Resource ${resourceId} has invalid chunk integrity metadata.`);
        }
        chunkIds.add(chunk.id);
      }
    }
  }
  if (!manifest.resources.calendar) throw new Error('Published manifest is missing Calendar.');
}
