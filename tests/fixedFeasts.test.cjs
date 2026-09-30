const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

/** fixedFeasts.ts imports only ./dateUtils types, so it transpiles and loads as-is. */
function loadFixedFeasts() {
  const source = fs.readFileSync('src/utils/fixedFeasts.ts', 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleObject = { exports: {} };
  new Function('exports', 'require', 'module', javascript)(moduleObject.exports, require, moduleObject);
  return moduleObject.exports.FIXED_FEASTS;
}

const seasonNamesSource = fs.readFileSync('src/constants/seasonNames.ts', 'utf8');

/** The body of one `export const NAME: ... = { ... };` block in seasonNames.ts. */
function namesBlock(constName) {
  const start = seasonNamesSource.indexOf(`const ${constName}`);
  assert.notEqual(start, -1, `${constName} not found in seasonNames.ts`);
  const end = seasonNamesSource.indexOf('\n};', start);
  return seasonNamesSource.slice(start, end);
}

test('both Coptic feasts of the Cross are listed, on their own Coptic dates', () => {
  const crosses = loadFixedFeasts().filter((feast) => feast.key.startsWith('feast-of-the-cross'));

  assert.deepEqual(
    crosses.map((feast) => `${feast.monthName} ${feast.day}`).sort(),
    ['Paremhotep 10', 'Thoout 17'],
    'the Cross is kept twice a year — Thoout 17 and Paremhotep 10',
  );
});

test('every feast key is unique', () => {
  // The Season Selector renders one row per event and uses the key as its
  // React key, so a duplicate would collapse or mis-render a row rather than
  // showing both feasts.
  const keys = loadFixedFeasts().map((feast) => feast.key);
  assert.equal(new Set(keys).size, keys.length, `duplicate key in FIXED_FEASTS: ${keys.join(', ')}`);
});

test('Paremhotep 10 is the only feast that does not outrank the seasonal readings', () => {
  // It falls inside Great Lent every year and keeps the Lenten katameros;
  // flipping this to true would silently redirect that day's readings to the
  // Annual Daily book. See resolveReadingRules' tier-2 test.
  const notOverriding = loadFixedFeasts()
    .filter((feast) => !feast.overridesSeasonalReadings)
    .map((feast) => feast.key);

  assert.deepEqual(notOverriding, ['feast-of-the-cross-paremhotep']);
});

test('every feast declares whether it outranks the seasonal readings', () => {
  for (const feast of loadFixedFeasts()) {
    assert.equal(
      typeof feast.overridesSeasonalReadings,
      'boolean',
      `${feast.key} must state overridesSeasonalReadings`,
    );
  }
});

test('every feast has a display name and an indicator rank', () => {
  // A key missing from EVENT_FORMAL_NAMES falls back to the raw English
  // title with no Arabic; one missing from EVENT_INDICATOR_PRIORITIES scores
  // 0 and is dropped from the calendar pill entirely.
  const formal = namesBlock('EVENT_FORMAL_NAMES');
  // getSeasonIndicatorName reads EVENT_SHORT_NAMES and falls back to
  // SEASON_SHORT_NAMES, so a pill name in either table counts.
  const short = namesBlock('EVENT_SHORT_NAMES') + namesBlock('SEASON_SHORT_NAMES');
  const priorities = namesBlock('EVENT_INDICATOR_PRIORITIES');

  // A plain identifier key (`nayrouz:`) is written unquoted; a hyphenated one
  // (`'feast-of-the-cross':`) has to be quoted.
  const declares = (block, key) => new RegExp(`^\\s*'?${key}'?:`, 'm').test(block);

  for (const feast of loadFixedFeasts()) {
    assert.ok(declares(formal, feast.key), `${feast.key} missing from EVENT_FORMAL_NAMES`);
    assert.ok(declares(short, feast.key), `${feast.key} missing from EVENT_SHORT_NAMES`);
    assert.ok(declares(priorities, feast.key), `${feast.key} missing from EVENT_INDICATOR_PRIORITIES`);
  }
});
