const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function loadRegistry() {
  const source = fs.readFileSync('src/constants/bookDependencyRegistry.ts', 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleObject = { exports: {} };
  new Function('exports', 'require', 'module', javascript)(moduleObject.exports, require, moduleObject);
  return moduleObject.exports;
}

test('all initial books include public through the recursive registry', () => {
  const registry = loadRegistry();
  for (const bookKey of registry.DOWNLOADABLE_BOOK_KEYS) {
    const resources = registry.resourcesForBook(bookKey);
    assert.ok(resources.includes(bookKey), `${bookKey} must include its primary resource`);
    assert.equal(resources.filter((resource) => resource === 'public').length, 1);
  }
});

test('a Public revision impacts every installed book graph', () => {
  const registry = loadRegistry();
  const impacted = registry.DOWNLOADABLE_BOOK_KEYS.filter((bookKey) => registry.resourcesForBook(bookKey).includes('public'));
  assert.deepEqual(new Set(impacted), new Set(['psalmody', 'liturgy', 'veneration', 'agpeya', 'bible', 'holy_week']));
});

test('Psalmody and Liturgy share one dependency identity', () => {
  const registry = loadRegistry();
  const psalmody = new Set(registry.resourcesForBook('psalmody'));
  const liturgy = new Set(registry.resourcesForBook('liturgy'));
  for (const shared of ['public', 'agpeya', 'doxologies', 'bible', 'calendar']) {
    assert.ok(psalmody.has(shared));
    assert.ok(liturgy.has(shared));
  }
});

test('Liturgy resolves inline, reading, seasonal, and Synaxarium dependencies', () => {
  const { resourcesForBook } = loadRegistry();
  const liturgy = new Set(resourcesForBook('liturgy'));
  for (const dependency of ['praxis_response', 'gospel_rite', 'gospel_responses', 'readings', 'synaxarium', 'calendar']) {
    assert.ok(liturgy.has(dependency), `missing ${dependency}`);
  }
});

test('dependency registry covers every explicit cross-schema reader target', () => {
  const registry = loadRegistry();
  const declared = new Set(Object.keys(registry.CONTENT_RESOURCE_DEPENDENCIES));
  for (const path of ['src/utils/hymnLibrary.js', 'src/utils/saintHymns.ts']) {
    const source = fs.readFileSync(path, 'utf8');
    const targets = [...source.matchAll(/schema\s*:\s*["']([a-z0-9_]+)["']/g)].map((match) => match[1]);
    for (const target of targets) assert.ok(declared.has(target), `${path} references unregistered ${target}`);
  }
});

test('installed books search only installed schemas for hymn keys', () => {
  const reader = fs.readFileSync('src/utils/hymnLibrary.js', 'utf8');
  assert.match(reader, /async function getHymnKeyLookupSchemas[\s\S]*?isContentSchemaInstalled\(schema\)[\s\S]*?filter/);
  assert.doesNotMatch(reader, /(?<!await |function )getHymnKeyLookupSchemas\(/, 'every lookup must await the installed-schema filter');
  const web = fs.readFileSync('src/services/contentDataClient.web.ts', 'utf8');
  assert.match(web, /isContentSchemaInstalled[\s\S]*return false/);
});

test('Agpeya and Holy Week are self-contained apart from Public', () => {
  const { CONTENT_RESOURCE_DEPENDENCIES } = loadRegistry();
  assert.deepEqual([...CONTENT_RESOURCE_DEPENDENCIES.agpeya], ['public']);
  assert.deepEqual([...CONTENT_RESOURCE_DEPENDENCIES.holy_week], ['public', 'calendar']);
});

test('offline book registry migrations mirror the client book keys', () => {
  const { DOWNLOADABLE_BOOK_KEYS } = loadRegistry();
  const migrations = fs.readdirSync('supabase/migrations').map((name) => fs.readFileSync(`supabase/migrations/${name}`, 'utf8')).join('\n');
  for (const bookKey of DOWNLOADABLE_BOOK_KEYS) {
    assert.match(migrations, new RegExp(`insert into offline_content\\.books[^;]*\\('${bookKey}'`), `no offline_content.books row for ${bookKey}`);
  }
});

test('recursive dependency resolution tolerates cycles and deduplicates nodes', () => {
  const { resolveResourceDependencies } = loadRegistry();
  const result = resolveResourceDependencies(['a'], { public: [], a: ['b', 'public'], b: ['c'], c: ['a', 'public'] });
  assert.equal(new Set(result).size, result.length);
  assert.deepEqual(new Set(result), new Set(['public', 'a', 'b', 'c']));
});

test('Calendar is system-owned and book removal retains referenced resources', () => {
  const database = fs.readFileSync('src/services/bookContentDatabase.ts', 'utf8');
  assert.match(database, /VALUES \('calendar', NULL, 'not_downloaded', 1/);
  assert.match(database, /content_book_pending_resources/);
  assert.match(database, /!resource\?\.system_owned.*refs\?\.count/s);
});

test('partial book downloads are reference-tracked and removable before activation', () => {
  const manager = fs.readFileSync('src/services/bookDownloadManager.ts', 'utf8');
  const database = fs.readFileSync('src/services/bookContentDatabase.ts', 'utf8');
  assert.match(manager, /setPendingBookResources\(bookKey, resourceIds\)/);
  assert.match(database, /UNION SELECT resource_id FROM content_book_pending_resources/);
});

test('restart recovery pauses interrupted content work without replacing active resources', () => {
  const database = fs.readFileSync('src/services/offlineDatabase.ts', 'utf8');
  assert.match(database, /UPDATE content_books[\s\S]*status = 'paused'[\s\S]*queued', 'downloading'/);
  assert.match(database, /UPDATE content_resources[\s\S]*active_version IS NULL[\s\S]*queued', 'downloading'/);
});

test('Wi-Fi reconnection retries failed chunks but respects explicit pauses', () => {
  const bootstrap = fs.readFileSync('src/components/BookSyncBootstrap.tsx', 'utf8');
  assert.match(bootstrap, /book\.status === 'failed'[\s\S]*bookDownloadManager\.retry/);
  assert.doesNotMatch(bootstrap, /filter\(\(book\) => book\.status === 'paused'/);
});

test('legacy remove-all excludes reference-counted book packages', () => {
  const storage = fs.readFileSync('src/services/downloadStorageManager.ts', 'utf8');
  assert.match(storage, /filter\(\(pkg\) => pkg\.domain !== 'books'\)/);
});

test('native packages stage content before one transactional activation', () => {
  const manager = fs.readFileSync('src/services/bookDownloadManager.ts', 'utf8');
  const database = fs.readFileSync('src/services/bookContentDatabase.ts', 'utf8');
  assert.match(manager, /for \(const resource of resources\).*stageResource.*activateBookResources/s);
  assert.match(database, /activateBookResources[\s\S]*withExclusiveTransactionAsync/);
  assert.match(manager, /chunk\.sha256/);
});

test('Bible updates use deterministic content-addressed chunks', () => {
  const worker = fs.readFileSync('workers/content-packages/src/index.ts', 'utf8');
  const manager = fs.readFileSync('src/services/bookDownloadManager.ts', 'utf8');
  assert.match(worker, /function bibleBucket/);
  assert.match(worker, /stableChunkId/);
  assert.match(worker, /reusable\?\.url/);
  assert.match(manager, /fileKey: `content:\$\{resource\.id\}:\$\{chunk\.sha256\}`/);
  assert.doesNotMatch(manager, /fileKey: `content:\$\{resource\.id\}:\$\{resource\.version\}/);
});

test('RPC rows participate in package row-count integrity checks', () => {
  const database = fs.readFileSync('src/services/bookContentDatabase.ts', 'utf8');
  assert.match(database, /for \(const rpc of payload\.rpcResults \|\| \[\]\)[\s\S]*rowCount \+= 1/);
});

test('Bible and Calendar package every field used by offline rendering', () => {
  const migration = fs.readFileSync('supabase/migrations/20260924120000_native_offline_content_packages.sql', 'utf8');
  const provider = fs.readFileSync('src/services/contentDataClient.ts', 'utf8');
  assert.match(migration, /\('bible', 'bible', array\['books','verses','verse_parts'\]\)/);
  assert.match(provider, /english_nkjv[\s\S]*english_from_coptic[\s\S]*coptic[\s\S]*greek[\s\S]*arabic_from_coptic[\s\S]*french/);
  for (const table of ['coptic_date_conversions', 'season_ranges', 'reading_rules', 'condition_flags']) assert.match(migration, new RegExp(table));
  for (const rpc of ['get_context_flags', 'get_active_flags_for_date', 'get_readings_for_date']) assert.match(migration, new RegExp(rpc));
});

test('web variants do not initialize SQLite or expose download UI', () => {
  const provider = fs.readFileSync('src/services/contentDataClient.web.ts', 'utf8');
  const bootstrap = fs.readFileSync('src/components/BookSyncBootstrap.web.tsx', 'utf8');
  const route = fs.readFileSync('src/app/downloads.web.tsx', 'utf8');
  const nativeRoute = fs.readFileSync('src/app/downloads.tsx', 'utf8');
  const booksWeb = fs.readFileSync('src/app/books/index.web.tsx', 'utf8');
  assert.doesNotMatch(provider, /sqlite|bookDownloadManager/i);
  assert.match(bootstrap, /return null/);
  assert.match(route, /Redirect href=.*\/account/);
  assert.match(nativeRoute, /Platform\.OS === 'web'.*Redirect/s);
  assert.doesNotMatch(booksWeb, /bookDownloadManager|downloadStatus|onDownloadPress/);
});
