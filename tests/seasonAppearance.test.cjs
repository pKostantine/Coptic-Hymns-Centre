const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

/** seasonAppearance.ts and nextSeason.ts import nothing at runtime, so a plain transpile loads them. */
function load(path) {
  const source = fs.readFileSync(path, 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleObject = { exports: {} };
  new Function('exports', 'require', 'module', javascript)(moduleObject.exports, require, moduleObject);
  return moduleObject.exports;
}

const appearance = load('src/constants/seasonAppearance.ts');
const nextSeason = load('src/utils/nextSeason.ts');

// seasonNames.ts reaches the app-language store, so the priority and name
// tables are read from the source text rather than imported.
const seasonNamesSource = fs.readFileSync('src/constants/seasonNames.ts', 'utf8');

function block(constName) {
  const start = seasonNamesSource.indexOf(`const ${constName}`);
  assert.notEqual(start, -1, `${constName} not found in seasonNames.ts`);
  return seasonNamesSource.slice(start, seasonNamesSource.indexOf('\n};', start));
}

function keysIn(constName) {
  return [...block(constName).matchAll(/^\s+'?([a-zA-Z][\w-]*)'?:/gm)].map((match) => match[1]);
}

/** Every key that can ever win the indicator and name the day. */
const INDICATOR_KEYS = [...keysIn('SEASON_INDICATOR_PRIORITIES'), ...keysIn('EVENT_INDICATOR_PRIORITIES')];

test('the priority tables are actually being read', () => {
  // Guards the regexes above: a silent zero-key parse would make every other
  // test in this file vacuously pass.
  assert.ok(INDICATOR_KEYS.length > 30, `parsed only ${INDICATOR_KEYS.length} indicator keys`);
  assert.ok(INDICATOR_KEYS.includes('holy-week'));
  assert.ok(INDICATOR_KEYS.includes('feast-of-the-cross-paremhotep'));
});

test('every season or feast that can name the day has a colour and a chip name', () => {
  // An unmapped key falls back to the annual green, which would quietly show a
  // feast as though it were an ordinary day; an unnamed one would read "Annual".
  const shortNames = ['EVENT_SHORT_NAMES', 'SEASON_SHORT_NAMES'].map(block);
  for (const key of INDICATOR_KEYS) {
    assert.ok(appearance.THEME_BY_INDICATOR_KEY[key], `${key} has no colour`);
    assert.ok(shortNames.some((table) => new RegExp(`^\\s+'?${key}'?:`, 'm').test(table)), `${key} has no short name`);
  }
});

test('each season wears the colour the spec gives it', () => {
  const theme = (key, active) => appearance.getDayThemeKey(key, active);
  const expected = {
    annual: 'annual',
    'lazarus-saturday': 'annual',
    'palm-sunday': 'palm',
    'holy-week': 'holyweek',
    'holy-thursday': 'holyweek',
    'good-friday': 'holyweek',
    // سبت النور — Holy Saturday, E−1 — is still Holy Week's black.
    'bright-saturday': 'holyweek',
    resurrection: 'resurrection',
    'holy-50-days': 'resurrection',
    'thomas-sunday': 'resurrection',
    ascension: 'resurrection',
    pentecost: 'resurrection',
    'jonahs-fast': 'lent',
    'jonahs-feast': 'lent',
    lent: 'lent',
    'lent-sunday-3': 'lent',
    'last-friday-of-lent': 'lent',
    'apostles-fast': 'apostles',
    'apostles-feast': 'apostles',
    'feast-of-the-cross': 'palm',
    'feast-of-the-cross-paremhotep': 'palm',
    'nayrouz-period': 'gold',
    nayrouz: 'gold',
    'nativity-fast': 'natfast',
    'kiahk-sunday-2': 'natfast',
    'nativity-paramoun': 'lent',
    nativity: 'nativity',
    'nativity-period': 'nativity',
    circumcision: 'gold',
    'theophany-paramoun': 'lent',
    theophany: 'theophany',
    'second-day-of-theophany': 'theophany',
    'wedding-at-cana': 'gold',
    'st-mary-fast': 'marian',
    'st-marys-feast': 'marian',
    annunciation: 'marian',
    'joyful-29': 'gold',
    'entry-into-egypt': 'gold',
    transfiguration: 'gold',
  };
  for (const [key, colour] of Object.entries(expected)) assert.equal(theme(key, [key]), colour, key);
  assert.equal(theme(null), 'annual');
  assert.equal(theme('something-new'), 'annual');
});

test('a lesser feast inside a fast keeps the fast colour; a great one does not', () => {
  const theme = appearance.getDayThemeKey;
  assert.equal(theme('joyful-29', ['nativity-fast', 'joyful-29']), 'natfast');
  assert.equal(theme('joyful-29', ['lent', 'joyful-29']), 'lent');
  assert.equal(theme('joyful-29', ['apostles-fast', 'joyful-29']), 'apostles');
  assert.equal(theme('transfiguration', ['st-mary-fast', 'transfiguration']), 'marian');
  assert.equal(theme('entry-into-temple', ['jonahs-fast', 'entry-into-temple']), 'lent');
  // The second Feast of the Cross, in Lent, is Lent's.
  assert.equal(theme('feast-of-the-cross-paremhotep', ['lent', 'feast-of-the-cross-paremhotep']), 'lent');
  // The Annunciation keeps its own blue in Lent.
  assert.equal(theme('annunciation', ['lent', 'annunciation']), 'marian');
  assert.equal(theme('feast-of-the-cross', ['nayrouz-period', 'feast-of-the-cross']), 'palm');
});

test('the themes carry the Coptic Vine season colours', () => {
  const t = appearance.DAY_BLOCK_THEMES;
  // Annual is the vine green; the old CHC navy now belongs to the Apostles.
  assert.deepEqual([t.annual.from, t.annual.to], ['#2B5A30', '#14301B']);
  assert.equal(t.annual.border, 'rgba(227, 181, 59, 0.30)');
  assert.equal(t.annual.strong, '#ECD48A');
  assert.deepEqual([t.apostles.from, t.apostles.to], ['#0C3158', '#001D3D']);
  assert.equal(t.natfast.toAt, 0.78);
  assert.equal(t.nativity.toAt, 0.8);
  assert.equal(t.lent.toAt, 0.75);
  // Gold: the selected day and the accents turn white so they don't blend in.
  assert.equal(t.gold.selected, '#FFFFFF');
  assert.equal(t.gold.accent, '#FFFFFF');
  assert.equal(t.lent.selected, '#E3B53B');
  assert.equal(t.lent.selectedText, '#14301B');
  // Resurrection: a white block with dark text and a darker gold.
  assert.equal(t.resurrection.text, '#10223A');
  assert.equal(t.resurrection.muted, '#5B6573');
  assert.equal(t.resurrection.accent, '#8A6A12');
  assert.equal(t.resurrection.accentBorder, '#B08A1C');
  assert.deepEqual([t.holyweek.from, t.holyweek.to], ['#141414', '#000000']);
  assert.equal(t.holyweek.border, 'rgba(227, 181, 59, 0.35)');
  for (const theme of Object.values(t)) {
    assert.equal(theme.liveRing, theme.key === 'annual' ? 'halo' : 'white', theme.key);
  }
});

// A 1743 A.M. year laid out as the database gives it (2026–27).
const SEASONS = [
  { rangeKey: 'nativity-fast', startDate: '2026-11-25' },
  { rangeKey: 'jonahs-fast', startDate: '2027-02-22' },
  { rangeKey: 'lent', startDate: '2027-03-08' },
  { rangeKey: 'holy-week', startDate: '2027-04-24' },
  { rangeKey: 'holy-50-days', startDate: '2027-05-02' },
  { rangeKey: 'apostles-fast', startDate: '2027-06-21' },
  { rangeKey: 'st-mary-fast', startDate: '2027-08-07' },
];
const EVENTS = [
  { key: 'feast-of-the-cross', date: '2026-09-27' },
  { key: 'nativity', date: '2027-01-07' },
  { key: 'theophany', date: '2027-01-19' },
  { key: 'wedding-at-cana', date: '2027-01-21' },
  { key: 'annunciation', date: '2027-04-07' },
  { key: 'lazarus-saturday', date: '2027-04-24' },
  { key: 'palm-sunday', date: '2027-04-25' },
  { key: 'resurrection', date: '2027-05-02' },
  { key: 'ascension', date: '2027-06-10' },
  { key: 'pentecost', date: '2027-06-20' },
  { key: 'apostles-feast', date: '2027-07-12' },
  { key: 'st-marys-feast', date: '2027-08-22' },
  { key: 'nayrouz', date: '2027-09-11' },
];

test('the next season skips the lesser feasts and counts the days, as in the design', () => {
  const next = (date) => {
    const found = nextSeason.pickNextSeason(date, SEASONS, EVENTS);
    return found && `${found.key} ${found.days}`;
  };
  assert.equal(next('2026-09-30'), 'nativity-fast 56');
  assert.equal(next('2026-09-27'), 'nativity-fast 59');
  assert.equal(next('2026-12-02'), 'nativity 36');
  assert.equal(next('2027-01-07'), 'theophany 12');
  assert.equal(next('2027-01-19'), 'jonahs-fast 34');   // past the Wedding at Cana
  assert.equal(next('2027-03-17'), 'palm-sunday 39');   // past the Annunciation and Lazarus Saturday
  assert.equal(next('2027-04-07'), 'palm-sunday 18');
  assert.equal(next('2027-04-25'), 'holy-week 1');      // Holy Week from the Monday
  assert.equal(next('2027-04-29'), 'resurrection 3');
  assert.equal(next('2027-05-10'), 'pentecost 41');     // past the Ascension
  assert.equal(next('2027-06-28'), 'apostles-feast 14');
  assert.equal(next('2027-08-12'), 'st-marys-feast 10');
  assert.equal(next('2027-09-01'), 'nayrouz 10');
  assert.equal(next('2027-09-12'), null);
  for (const key of ['nativity-fast', 'holy-week', 'resurrection', 'st-marys-feast', 'nayrouz']) {
    assert.ok(nextSeason.NEXT_SEASON_NAMES[key]?.english, `${key} has no name`);
  }
});
