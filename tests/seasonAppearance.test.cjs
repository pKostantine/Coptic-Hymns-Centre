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

test('every card keeps its text legible on its own background', () => {
  // Every stop the text can sit over has to carry the card's own text, so a
  // season's accent is a text colour rather than its card colour. The one
  // exemption is a stop the sweep puts in a corner the text never reaches.
  const { SEASON_COLOUR_FAMILIES } = loadAppearance();
  const luminance = (hex) => {
    const channel = (i) => {
      const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  };
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  for (const [name, theme] of Object.entries(SEASON_COLOUR_FAMILIES)) {
    for (const [index, stop] of theme.gradient.entries()) {
      if (index === theme.farStop) continue;
      for (const role of ['heading', 'muted', 'accent']) {
        const ratio = contrast(theme[role], stop);
        assert.ok(ratio >= 4.5, `${name}.${role} (${theme[role]}) is only ${ratio.toFixed(2)}:1 on ${stop}`);
      }
    }
  }
  // The exemption is meant for exactly one card; a second would mean the rule
  // is being worked around rather than followed.
  const exempt = Object.values(SEASON_COLOUR_FAMILIES).filter((theme) => theme.farStop !== undefined);
  assert.equal(exempt.length, 1);
});

test('the white seasons really are white, and Holy Week really is black', () => {
  const { SEASON_COLOUR_FAMILIES: f } = loadAppearance();
  const luminance = (hex) => {
    const channel = (i) => {
      const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  };

  // Holy 50 Days: a white card, which means dark text on it.
  assert.ok(luminance(f.holyFifty.gradient[0]) > 0.85, 'the Holy 50 card must actually be white');
  assert.ok(luminance(f.holyFifty.heading) < 0.1, 'a white card needs dark text');

  // Holy Week: black.
  assert.ok(luminance(f.holyWeek.gradient[0]) < 0.03, 'Holy Week must actually be black');

  // Bright Saturday: both, with the black under the text and the white opposite.
  assert.ok(luminance(f.brightSaturday.gradient[0]) < 0.03, 'Bright Saturday must start black');
  assert.ok(luminance(f.brightSaturday.gradient[2]) > 0.85, 'Bright Saturday must end white');
  assert.deepEqual(f.brightSaturday.start, { x: 0, y: 1 });
  assert.deepEqual(f.brightSaturday.end, { x: 1, y: 0 });
});

test('Lazarus Saturday is an ordinary day, and Palm Sunday is not Holy Week', () => {
  const { SEASON_APPEARANCE: a } = loadAppearance();
  assert.equal(a['lazarus-saturday'], a.annual, 'Lazarus Saturday shows as annual');
  assert.equal(a['palm-sunday'], a['feast-of-the-cross'], 'Palm Sunday keeps the light green');
  assert.notEqual(a['palm-sunday'], a['holy-week'], 'Palm Sunday must not be Holy Week black');
  assert.notEqual(a['bright-saturday'], a['holy-week'], 'Bright Saturday must not be plain black');
  assert.equal(a['holy-thursday'], a['holy-week']);
  assert.equal(a['good-friday'], a['holy-week']);
  assert.equal(a.resurrection, a['holy-50-days']);
});
