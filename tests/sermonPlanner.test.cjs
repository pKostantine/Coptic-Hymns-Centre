const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const hymnLibrarySource = fs.readFileSync('src/utils/hymnLibrary.js', 'utf8');
const manifestSource = fs.readFileSync('src/constants/manifest.ts', 'utf8');
const documentSource = fs.readFileSync('src/components/chc/screens/ServiceDocument.tsx', 'utf8');
const drawerSource = fs.readFileSync('src/components/chc/ui/SermonPlannerDrawer.tsx', 'utf8');
const preferencesSource = fs.readFileSync('src/utils/preferencesStorage.ts', 'utf8');

function extractFunction(startMarker, endMarker) {
  const start = hymnLibrarySource.indexOf(startMarker);
  const end = hymnLibrarySource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'Sermon Planner test harness could not find the hydrator');
  return hymnLibrarySource.slice(start, end).replace(/^export /, '');
}

function loadHydrateService(getContextFlags, hydrateWithFlags) {
  const definition = extractFunction(
    'export async function hydrateSupabaseServiceHymn(',
    '\n// A single misconfigured',
  );
  return new Function(
    'deriveStructuralFlags', 'getContextFlags', 'toIsoDateString', 'hydrateWithFlags',
    definition + '\nreturn hydrateSupabaseServiceHymn;',
  )(
    () => ({}),
    getContextFlags,
    (date) => date.toISOString().slice(0, 10),
    hydrateWithFlags,
  );
}

test('Sermon Planner is a Lectionary entry using its existing order table and epistle flags', () => {
  assert.match(manifestSource, /id: 'sermon_planner', schema: 'liturgy', table: 'sermon_planner'/);
  assert.match(documentSource, /table === 'sermon_planner'/);
});

test('Sermon Planner scopes Gospel/weekday/service conditions to each reading', async () => {
  const date = new Date('2026-09-20T00:00:00Z');
  const vespersWeekday = new Date('2026-09-19T00:00:00Z');
  const calls = [];
  let hydrated;
  const getContextFlags = async (_date, extraContext, weekdayDate) => {
    calls.push({ extraContext, weekdayDate });
    const author = extraContext.Vespers ? 'Vespers'
      : extraContext.Matins ? 'Matins' : 'Liturgy';
    return { ...extraContext, author };
  };
  const hydrateWithFlags = async (schema, table, flags, depth, isoDate, flagsForSection) => {
    hydrated = { schema, table, flags, depth, isoDate, flagsForSection };
    return ['rendered'];
  };
  const hydrate = loadHydrateService(getContextFlags, hydrateWithFlags);
  const result = await hydrate('liturgy', 'sermon_planner', date, {
    BishopPresent: true, PaulineEpistleRomans: true,
  }, vespersWeekday);

  assert.deepEqual(result, ['rendered']);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(({ extraContext }) => [
    extraContext.Vespers === true, extraContext.Matins === true, extraContext.Liturgy === true,
  ]), [[true, false, false], [false, true, false], [false, false, true]]);
  assert.equal(calls[0].weekdayDate, vespersWeekday);
  assert.equal(calls[1].weekdayDate, undefined);
  assert.equal(calls[2].weekdayDate, undefined);
  assert.ok(calls.every(({ extraContext }) => extraContext.PaulineEpistleRomans));
  assert.equal(hydrated.isoDate, '2026-09-20');
  assert.deepEqual(
    ['Vespers', 'Matins', 'Liturgy', null].map((condition) =>
      hydrated.flagsForSection({ condition }).author,
    ),
    ['Vespers', 'Matins', 'Liturgy', 'Liturgy'],
  );
});

test('Unrelated Lectionary services retain the ordinary one-context hydrator', async () => {
  const calls = [];
  let received;
  const hydrate = loadHydrateService(
    async (_date, flags, weekdayDate) => {
      calls.push({ flags, weekdayDate });
      return flags;
    },
    async (...args) => { received = args; return ['normal']; },
  );
  const result = await hydrate('liturgy', 'lectionary_matins', new Date('2026-09-20T00:00:00Z'), { Matins: true });
  assert.deepEqual(result, ['normal']);
  assert.equal(calls.length, 1);
  assert.equal(received.length, 5);
  assert.equal(received[2].Matins, true);
});

test('Only Sermon Planner includes the Gospel Rite in hymn-key fallback lookups', () => {
  const definition = extractFunction('function getHymnKeyLookupSchemas(', '\nexport async function fetchServiceRows(');
  const getLookups = new Function(
    'HYMN_KEY_FALLBACK_SCHEMAS',
    definition + '\nreturn getHymnKeyLookupSchemas;',
  )(['public', 'liturgy', 'psalmody']);
  assert.ok(getLookups('liturgy', 'sermon_planner').includes('gospel_rite'));
  assert.ok(!getLookups('liturgy', 'lectionary_liturgy').includes('gospel_rite'));
  assert.equal(getLookups('liturgy', 'sermon_planner')[0], 'liturgy');
});

test('Liturgy Gospel with Coptic uses the normalized all-caps sentinel', () => {
  assert.match(hymnLibrarySource, /"LITURGY_GOSPEL_WITH_COPTIC"/);
  assert.doesNotMatch(hymnLibrarySource, /"Liturgy_GOSPEL_WITH_COPTIC"/);
});

test('Both Liturgy Gospel variants resolve canonical all-caps and legacy mixed-case keys', () => {
  const start = hymnLibrarySource.indexOf('export const READING_SENTINELS');
  const end = hymnLibrarySource.indexOf('\nlet readingsForDateCache', start);
  assert.ok(start >= 0 && end > start);
  const definition = hymnLibrarySource.slice(start, end).replace('export const', 'const');
  const { isReadingSentinel, normalizeReadingSentinel, readingMap } = new Function(
    `${definition}\nreturn { isReadingSentinel, normalizeReadingSentinel, readingMap: READING_SENTINEL_MAP };`,
  )();

  assert.equal(isReadingSentinel('LITURGY_GOSPEL_WITH_COPTIC'), true);
  assert.equal(isReadingSentinel('LITURGY_GOSPEL_WITHOUT_COPTIC'), true);
  assert.equal(isReadingSentinel('Liturgy_GOSPEL_WITHOUT_COPTIC'), true);
  assert.equal(normalizeReadingSentinel('Liturgy_GOSPEL_WITHOUT_COPTIC'), 'LITURGY_GOSPEL_WITHOUT_COPTIC');
  assert.deepEqual(readingMap.LITURGY_GOSPEL_WITHOUT_COPTIC, {
    service: 'Liturgy', readingType: 'Gospel', withCoptic: false,
  });
  assert.match(hymnLibrarySource, /READING_SENTINEL_MAP\[normalizeReadingSentinel\(sentinel\)\]/);
  assert.match(hymnLibrarySource, /if \(isReadingSentinel\(section\.hymn_key\) && isoDate\)/);
});

test('Sermon Planner owns persisted language choices and exposes them in its notes drawer', () => {
  assert.match(preferencesSource, /sermonPlannerVisibleLanguages: SermonPlannerVisibleLanguages/);
  assert.match(preferencesSource, /\| 'sermonPlannerVisibleLanguages'/);
  assert.match(documentSource, /preferences\.sermonPlannerVisibleLanguages\.english/);
  assert.match(documentSource, /coptic: false/);
  assert.match(documentSource, /copticRecitedPrayers: false/);
  assert.match(documentSource, /preferences=\{documentPreferences\}/);
  assert.match(drawerSource, /const LANGUAGE_OPTIONS:/);
  assert.doesNotMatch(drawerSource, /\{ key: 'coptic', label: 'Coptic' \}/);
  assert.match(drawerSource, /onToggleLanguage\(key\)/);
  assert.match(drawerSource, /visibleLanguageCount === 1/);
});

test('Inline Synaxarium and regular inline Gospel hymns are both supported', () => {
  assert.match(hymnLibrarySource, /section\.hymn_key === "SYNAXARIUM" && isoDate/);
  assert.match(hymnLibrarySource, /buildWholeTableInlineSections\(synaxariumSections, section\)/);
  assert.match(hymnLibrarySource, /if \(!section\.verses\.length\) continue;/);
  assert.match(hymnLibrarySource, /sectionFlagsForRow \? sectionFlagsForRow\(section\) : documentFlags/);
});

test('Sermon Planner omits only the Synaxarium date and priest introduction', () => {
  const definition = extractFunction(
    'function omitSynaxariumPreamble(',
    '\n/** Same as resolveReadingSentinelVerses',
  );
  const omitPreamble = new Function(definition + '\nreturn omitSynaxariumPreamble;')();
  const sections = [
    { id: 'synaxarium-date-2026-09-23', title: 'Thoout 13, 1743' },
    { id: 'synaxarium-intro', verses: ['Priest introduction'] },
    { id: 'commemoration-1', verses: ['First saint'] },
    { id: 'commemoration-2', verses: ['Second saint'] },
  ];

  assert.deepEqual(omitPreamble(sections), sections.slice(2));
  assert.equal(sections.length, 4, 'Shared Synaxarium sections must not be mutated');
  assert.match(
    hymnLibrarySource,
    /if \(section\.hymn_key === "SYNAXARIUM" && isoDate\) \{\s*const synaxariumSections = omitSynaxariumPreamble\(await resolveSynaxariumSections\(isoDate\)\)/,
  );
  assert.match(
    hymnLibrarySource,
    /const synaxariumSections = await resolveSynaxariumSections\(isoDate\);\s*const label = section\.title/,
    'The standard Lectionary Synaxarium must retain the date and introduction',
  );
});


test('Highlight citations retain the exact reading and verse number', () => {
  const utilSource = fs.readFileSync('src/utils/sermonPlanner.ts', 'utf8');
  const start = utilSource.indexOf('export function getSermonHighlightVerseReferences(');
  const end = utilSource.indexOf('\nexport function getSermonPlannerReferences(', start);
  assert.ok(start >= 0 && end > start);
  const compiled = utilSource.slice(start, end).replace(
    'export function getSermonHighlightVerseReferences(sections: DocumentSection[]): Record<string, string> {',
    'function getSermonHighlightVerseReferences(sections) {',
  ).replace(
    'const exactReference = (citation: string, chapter: string, verse: string) => {',
    'const exactReference = (citation, chapter, verse) => {',
  ).replace('const result: Record<string, string> = {};', 'const result = {};');
  const getReferences = new Function(compiled + '\nreturn getSermonHighlightVerseReferences;')();
  const labels = getReferences([
    { id: 'gospel', verses: [
      { type: 'readingReference', english: '2 Peter 1:1–11' },
      { type: 'text', bibleChapterNumber: '1', bibleVerseNumber: '1' },
      { type: 'text', bibleChapterNumber: '1', bibleVerseNumber: '2' },
    ] },
    { id: 'cross-chapter', verses: [
      { type: 'readingReference', english: '2 Timothy 3:10–17, 4:1–22' },
      { type: 'text', bibleChapterNumber: '4', bibleVerseNumber: '1' },
    ] },
    { id: 'synaxarium', sourceGroupKey: 'SYNAXARIUM', verses: [{ type: 'text', english: 'A saint' }] },
    { id: 'unrelated', verses: [{ type: 'text', english: 'A hymn' }] },
  ]);
  assert.equal(labels['gospel::v0'], '2 Peter 1:1–11');
  assert.equal(labels['gospel::v1'], '2 Peter 1:1');
  assert.equal(labels['gospel::v2'], '2 Peter 1:2');
  assert.equal(labels['cross-chapter::v1'], '2 Timothy 4:1');
  assert.equal(labels['synaxarium::v0'], 'Synaxarium');
  assert.equal(labels['unrelated::v0'], undefined, 'Do not attach an unrelated previous citation');
});

test('A synced highlight deletion wins over an older copy from another device', () => {
  const utilSource = fs.readFileSync('src/utils/sermonPlanner.ts', 'utf8');
  const start = utilSource.indexOf('export function mergeSermonPlans(');
  const end = utilSource.indexOf('\nexport function createSermonHighlight(', start);
  assert.ok(start >= 0 && end > start);
  const compiled = utilSource.slice(start, end)
    .replace(
      'export function mergeSermonPlans(local: SermonPlan, cloud: SermonPlan): SermonPlan {',
      'function mergeSermonPlans(local, cloud) {',
    )
    .replace('const byId = new Map<string, SermonHighlight>();', 'const byId = new Map();')
    .replace('const highlightDeletions: Record<string, string> = {};', 'const highlightDeletions = {};');
  const normalizeHighlightDeletions = (value) => value;
  const merge = new Function(
    'normalizeHighlightDeletions',
    'MAX_HIGHLIGHTS',
    `${compiled}\nreturn mergeSermonPlans;`,
  )(normalizeHighlightDeletions, 1000);
  const old = '2026-09-23T10:00:00.000Z';
  const removed = '2026-09-23T11:00:00.000Z';
  const base = {
    version: 1,
    documentKey: 'liturgy.sermon_planner',
    serviceDate: '2026-09-23',
    generalNotes: '',
  };
  const highlight = {
    id: 'shared-highlight',
    sectionId: 'gospel',
    verseId: 'gospel::v1',
    language: 'english',
    startOffset: 0,
    endOffset: 4,
    quote: 'Word',
    color: 'gold',
    note: '',
    createdAt: old,
    updatedAt: old,
  };
  const merged = merge(
    { ...base, highlights: [], highlightDeletions: { [highlight.id]: removed }, updatedAt: removed },
    { ...base, highlights: [highlight], highlightDeletions: {}, updatedAt: old },
  );
  assert.deepEqual(merged.highlights, []);
  assert.equal(merged.highlightDeletions[highlight.id], removed);
});

test('Sermon selection snaps across complete English, Arabic and Coptic words', () => {
  const html = fs.readFileSync('src/components/chc/documentHtml.ts', 'utf8');
  const start = html.indexOf('function expandToWholeWords(text, start, end)');
  const end = html.indexOf('function anchorsFromSelection(selection)', start);
  assert.ok(start >= 0 && end > start);
  // This helper is embedded in a TS template string; unescape its regex
  // before running the same JavaScript in isolation.
  const definition = html.slice(start, end).replaceAll('\\\\p', '\\p');
  const expand = new Function(definition + '\nreturn expandToWholeWords;')();
  const cases = [
    ['Let your light shine', 1, 2, 'Let'],
    ['We cannot serve', 4, 6, 'cannot'],
    ['باسم الآب', 1, 3, 'باسم'],
    ['Ⲡⲓⲱⲟⲩ', 1, 3, 'Ⲡⲓⲱⲟⲩ'],
  ];
  for (const [text, first, last, expected] of cases) {
    const range = expand(text, first, last);
    assert.equal(text.slice(range.start, range.end), expected, text);
  }
  const withoutSegmenter = new Function('Intl', definition + '\nreturn expandToWholeWords;')({});
  const fallback = withoutSegmenter('باسم الآب', 1, 3);
  assert.equal('باسم الآب'.slice(fallback.start, fallback.end), 'باسم');
});

test('Sermon notes open on highlighted text, not an eye icon', () => {
  const drawer = fs.readFileSync('src/components/chc/ui/SermonPlannerDrawer.tsx', 'utf8');
  assert.match(drawer, /verseReferences\[highlight\.verseId\]/);
  assert.match(drawer, /accessibilityLabel=\{\`Go to highlighted verse/);
  assert.match(drawer, /onJumpToHighlight\(highlight\)/);
  assert.doesNotMatch(drawer, /name="eye-outline"/);
});

test('Web documents and Bible never attach app swipe-exit gestures', () => {
  const html = fs.readFileSync('src/components/chc/documentHtml.ts', 'utf8');
  const nativeView = fs.readFileSync('src/components/chc/DocumentWebView.tsx', 'utf8');
  const service = fs.readFileSync('src/components/chc/screens/ServiceDocument.tsx', 'utf8');
  const modal = fs.readFileSync('src/components/chc/screens/DocumentModal.tsx', 'utf8');
  const bible = fs.readFileSync('src/app/bible/[bookKey]/[chapter].tsx', 'utf8');
  const bibleHtml = fs.readFileSync('src/components/chc/bibleDocumentHtml.ts', 'utf8');
  assert.match(html, /if \(!\$\{JSON\.stringify\(nativeSwipeNavigation\)\}\) return;/);
  assert.match(nativeView, /nativeSwipeNavigation: true/);
  assert.match(service, /isMobileDocument \? gesturePanResponder\.panHandlers/);
  assert.match(modal, /isMobileDocument \? swipeGesturePanResponder\.panHandlers/);
  assert.doesNotMatch(modal, /pointerup', onUp/);
  assert.match(bible, /Platform\.OS !== 'web' \? gesturePanResponder\.panHandlers/);
  assert.match(bibleHtml, /nativeSwipeNavigation/);
  assert.match(service, /pencilGestureActiveRef\.current/);
  assert.match(bible, /isStylusGestureEvent\(event\)/);
});
