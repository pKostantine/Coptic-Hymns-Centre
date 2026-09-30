const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

/** seasonAppearance.ts imports only a type, which transpiles away. */
function loadAppearance() {
  const source = fs.readFileSync('src/constants/seasonAppearance.ts', 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleObject = { exports: {} };
  new Function('exports', 'require', 'module', javascript)(moduleObject.exports, require, moduleObject);
  return moduleObject.exports;
}

// seasonNames.ts reaches the app-language store, so the priority tables and
// name tables are read from the source text rather than imported.
const seasonNamesSource = fs.readFileSync('src/constants/seasonNames.ts', 'utf8');

function block(constName) {
  const start = seasonNamesSource.indexOf(`const ${constName}`);
  assert.notEqual(start, -1, `${constName} not found in seasonNames.ts`);
  return seasonNamesSource.slice(start, seasonNamesSource.indexOf('\n};', start));
}

function keysIn(constName) {
  return [...block(constName).matchAll(/^\s+'?([a-zA-Z][\w-]*)'?:/gm)].map((match) => match[1]);
}

/** Every key that can ever win the indicator and be shown on the card. */
const INDICATOR_KEYS = [...keysIn('SEASON_INDICATOR_PRIORITIES'), ...keysIn('EVENT_INDICATOR_PRIORITIES')];

test('the priority tables are actually being read', () => {
  // Guards the regexes above: a silent zero-key parse would make every other
  // test in this file vacuously pass.
  assert.ok(INDICATOR_KEYS.length > 30, `parsed only ${INDICATOR_KEYS.length} indicator keys`);
  assert.ok(INDICATOR_KEYS.includes('holy-week'));
  assert.ok(INDICATOR_KEYS.includes('feast-of-the-cross-paremhotep'));
});

test('every season that can win the indicator has its own colours', () => {
  // An unmapped key falls back to the ordinary dark blue, which would quietly
  // show a feast as though it were an ordinary day.
  const { SEASON_APPEARANCE } = loadAppearance();
  for (const key of INDICATOR_KEYS) {
    assert.ok(SEASON_APPEARANCE[key], `${key} has no entry in SEASON_APPEARANCE`);
  }
});

test('every season that can win the indicator has a full name', () => {
  // getSeasonIndicatorFullName falls through the formal tables to the short
  // ones; a key in none of the four would render as 'Annual'.
  const tables = ['EVENT_FORMAL_NAMES', 'SEASON_FORMAL_NAMES', 'EVENT_SHORT_NAMES', 'SEASON_SHORT_NAMES'].map(block);
  for (const key of INDICATOR_KEYS) {
    const named = tables.some((table) => new RegExp(`^\\s+'?${key}'?:`, 'm').test(table));
    assert.ok(named, `${key} has no name in any of the four name tables`);
  }
});

test('the user-specified seasons carry the colours they were given', () => {
  const { SEASON_APPEARANCE: a } = loadAppearance();
  const sameFamily = (x, y) => assert.equal(a[x], a[y], `${x} and ${y} should share one colour family`);

  sameFamily('nativity', 'annunciation');          // dark red
  sameFamily('lent', 'jonahs-fast');               // dark green
  sameFamily('palm-sunday', 'feast-of-the-cross'); // light green
  sameFamily('feast-of-the-cross', 'feast-of-the-cross-paremhotep');
  sameFamily('st-mary-fast', 'st-marys-feast');    // royal blue
  sameFamily('apostles-fast', 'apostles-feast');   // violet
  sameFamily('holy-50-days', 'resurrection');      // white

  // ...and the ones that must NOT share, or the year would read as one colour.
  for (const [x, y] of [
    ['nayrouz', 'nativity-fast'],
    ['nativity-fast', 'nativity'],
    ['lent', 'palm-sunday'],
    ['holy-week', 'holy-50-days'],
    ['annual', 'joyful-29'],
  ]) {
    assert.notEqual(a[x], a[y], `${x} and ${y} must be distinguishable`);
  }
});

test('a card never draws light text on a light background', () => {
  // The heading and footnote are near-white and sit straight on the gradient,
  // so every stop has to stay dark however light the season's name colour is.
  const { SEASON_COLOUR_FAMILIES } = loadAppearance();
  const luminance = (hex) => {
    const channel = (i) => {
      const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  };
  const contrastWithWhite = (hex) => 1.05 / (luminance(hex) + 0.05);

  for (const [name, theme] of Object.entries(SEASON_COLOUR_FAMILIES)) {
    for (const stop of theme.gradient) {
      assert.ok(
        contrastWithWhite(stop) >= 4.5,
        `${name} gradient stop ${stop} is only ${contrastWithWhite(stop).toFixed(2)}:1 against white text`,
      );
    }
    // The accent carries the chip text and the date line over that gradient,
    // so it has to be clearly lighter than the stop it sits on.
    assert.ok(
      luminance(theme.accent) > luminance(theme.gradient[0]),
      `${name} accent ${theme.accent} is not lighter than its own gradient`,
    );
  }
});
