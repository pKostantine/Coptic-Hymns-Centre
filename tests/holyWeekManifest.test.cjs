const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

// manifest.ts only imports a type, so a plain transpile is enough to load it.
function loadManifest() {
  const source = fs.readFileSync('src/constants/manifest.ts', 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', outputText)(module, module.exports, require);
  return module.exports;
}

const hymnLibrarySource = fs.readFileSync('src/utils/hymnLibrary.js', 'utf8');

/** The pure Pascha reading helpers, lifted out of hymnLibrary.js. */
function loadPaschaHelpers() {
  const start = hymnLibrarySource.indexOf('const PASCHA_READING_SENTINELS');
  const end = hymnLibrarySource.indexOf('const paschaReadingsCache', start);
  assert.ok(start >= 0 && end > start, 'Pascha reading helpers not found');
  return new Function(`${hymnLibrarySource.slice(start, end)}\nreturn { paschaHourOf, selectPaschaReadings, paschaHymnKeyForTitle };`)();
}

const manifest = loadManifest();
const DAY_TOKENS = ['PalmSunday', 'HolyMonday', 'HolyTuesday', 'HolyWednesday', 'HolyThursday', 'GoodFriday'];
const HOUR_TOKENS = ['FirstHour', 'ThirdHour', 'SixthHour', 'NinthHour', 'EleventhHour', 'TwelfthHour'];

test('Holy Week menu pairs each day with the eve prayed that evening', () => {
  const { HOLY_WEEK_ROWS, SERVICES_BY_CATEGORY } = manifest;
  assert.equal(SERVICES_BY_CATEGORY['holy-week'], undefined);
  assert.deepEqual(HOLY_WEEK_ROWS.map((row) => row.days.map((day) => day.title)), [
    ['Palm Sunday', 'Monday Eve'],
    ['Monday', 'Tuesday Eve'],
    ['Tuesday', 'Wednesday Eve'],
    ['Wednesday', 'Thursday Eve'],
    ['Holy Thursday', 'Friday Eve'],
    ['Good Friday'],
    ['Bright Saturday'],
  ]);
});

test('a day and its eve each open only their own hours', () => {
  const { HOLY_WEEK_DAYS, HOLY_WEEK_HOURS } = manifest;
  const hoursOf = (dayId) => HOLY_WEEK_DAYS.find((day) => day.id === dayId).hours.map((hour) => hour.id);
  assert.deepEqual(hoursOf('palm-sunday'), ['general_funeral_prayer', 'sunday_9th', 'sunday_11th']);
  assert.deepEqual(hoursOf('monday-eve'), ['monday_eve_1st', 'monday_eve_3rd', 'monday_eve_6th', 'monday_eve_9th', 'monday_eve_11th']);
  assert.deepEqual(hoursOf('monday'), ['monday_1st', 'monday_3rd', 'monday_6th', 'monday_9th', 'monday_11th']);
  assert.deepEqual(hoursOf('holy-thursday'), [
    'thursday_1st', 'thursday_3rd', 'thursday_6th', 'thursday_9th', 'liturgy_of_the_waters', 'holy_thursday_liturgy', 'thursday_11th',
  ]);
  assert.deepEqual(hoursOf('good-friday'), ['friday_1st', 'friday_3rd', 'friday_6th', 'friday_9th', 'friday_11th', 'friday_12th']);
  for (const day of HOLY_WEEK_DAYS) {
    const isEve = day.id.endsWith('-eve');
    assert.ok(day.hours.every((hour) => hour.id.includes('_eve_') === isEve), `${day.id} mixes day and eve hours`);
  }
  assert.equal(HOLY_WEEK_HOURS.length, 57);
  assert.equal(new Set(HOLY_WEEK_HOURS.map((hour) => hour.id)).size, HOLY_WEEK_HOURS.length);
});

test('only Holy Thursday keeps "Holy" in its name', () => {
  const { HOLY_WEEK_DAYS } = manifest;
  assert.deepEqual(HOLY_WEEK_DAYS.filter((day) => /holy/i.test(day.title)).map((day) => day.id), ['holy-thursday']);
});

test('Bright Saturday opens straight into its service', () => {
  const { HOLY_WEEK_DAYS, holyWeekDayHref } = manifest;
  assert.equal(holyWeekDayHref(HOLY_WEEK_DAYS.find((day) => day.id === 'bright-saturday')), '/holy-week/bright-saturday/bright_saturday');
  assert.equal(holyWeekDayHref(HOLY_WEEK_DAYS.find((day) => day.id === 'monday')), '/holy-week/monday');
});

test('each Holy Week hour links on to the next one', () => {
  const { HOLY_WEEK_HOURS, HYPERLINK_TARGETS } = manifest;
  HOLY_WEEK_HOURS.forEach((hour, index) => {
    const next = HOLY_WEEK_HOURS[index + 1];
    assert.equal(HYPERLINK_TARGETS[hour.hyperlinkKey].href, `/holy-week/${hour.dayId}/${hour.id}`);
    if (next) assert.equal(hour.nextHyperlinkKey, next.hyperlinkKey);
    else assert.equal(hour.nextHyperlinkKey, undefined);
  });
});

test('the general hours share pascha_hour and differ only in one day, part, and hour token', () => {
  const { HOLY_WEEK_HOURS } = manifest;
  const special = {
    thursday_1st: 'thursday_first_hour',
    friday_6th: 'good_friday_sixth_hour',
    friday_9th: 'good_friday_ninth_hour',
    friday_12th: 'good_friday_twelfth_hour',
  };
  for (const hour of HOLY_WEEK_HOURS.filter((entry) => /_(1st|3rd|6th|9th|11th|12th)$/.test(entry.id))) {
    assert.equal(hour.table, special[hour.id] || 'pascha_hour', hour.id);
    const context = hour.extraContext;
    assert.equal(DAY_TOKENS.filter((token) => context[token] === true).length, 1, hour.id);
    assert.ok(DAY_TOKENS.every((token) => typeof context[token] === 'boolean'), hour.id);
    assert.equal(HOUR_TOKENS.filter((token) => context[token]).length, 1, hour.id);
    assert.equal(Boolean(context.PaschaEveHour), hour.id.includes('_eve_'), hour.id);
    assert.equal(Boolean(context.PaschaDayHour), !hour.id.includes('_eve_'), hour.id);
  }
  // An eve counts as the day it leads into.
  assert.equal(HOLY_WEEK_HOURS.find((hour) => hour.id === 'monday_eve_1st').extraContext.HolyMonday, true);
  assert.equal(HOLY_WEEK_HOURS.find((hour) => hour.id === 'friday_eve_11th').extraContext.GoodFriday, true);
});

test('each hour resolves to the reading_rules hour it is keyed by', () => {
  const { HOLY_WEEK_HOURS } = manifest;
  const { paschaHourOf } = loadPaschaHelpers();
  const byId = (id) => HOLY_WEEK_HOURS.find((hour) => hour.id === id).extraContext;
  assert.deepEqual(paschaHourOf(byId('monday_eve_1st')), { day: 'HolyMonday', part: 'Eve', hour: 1 });
  assert.deepEqual(paschaHourOf(byId('thursday_11th')), { day: 'HolyThursday', part: 'Day', hour: 11 });
  assert.deepEqual(paschaHourOf(byId('friday_12th')), { day: 'GoodFriday', part: 'Day', hour: 12 });
  assert.equal(paschaHourOf(byId('liturgy_of_the_waters')), null);
});

test('Pascha sentinels pick their readings, interpretations following what they explain', () => {
  const { selectPaschaReadings } = loadPaschaHelpers();
  const rows = ['Prophecy', 'Interpretation', 'Prophecy', 'Homily', 'Pauline Epistle', 'Psalm', 'Gospel', 'Interpretation']
    .map((reading_type, index) => ({ reading_type, reading_rule_id: String(index) }));
  const ids = (sentinel) => selectPaschaReadings(sentinel, rows).map((row) => row.reading_rule_id);
  assert.deepEqual(ids('PASCHA_PROPHECIES'), ['0', '1', '2']);
  assert.deepEqual(ids('PASCHA_HOMILIES'), ['3']);
  assert.deepEqual(ids('PASCHA_PAULINE_EPISTLE'), ['4']);
  assert.deepEqual(ids('MOURNFUL_GOSPEL_RITE'), ['5', '6', '7']);
  assert.deepEqual(ids('PASCHA_EXPOSITION'), []);
});

test('homily and interpretation titles name their holy_week hymns', () => {
  const { paschaHymnKeyForTitle } = loadPaschaHelpers();
  assert.equal(paschaHymnKeyForTitle('Homily of Abba Shenouda the Archimandrite'), 'homilyOfAbbaShenoudaTheArchimandrite');
  assert.equal(paschaHymnKeyForTitle('Interpretation – John 13:1-17'), 'interpretationJohn13_1_17');
});

test('pascha_hour bookmarks keep the hour they were made in', () => {
  const { bookmarkKeyFor } = manifest;
  assert.equal(bookmarkKeyFor('holy_week', 'pascha_hour', 'monday_1st'), 'holy_week:pascha_hour@monday_1st');
  assert.equal(bookmarkKeyFor('holy_week', 'good_friday_twelfth_hour', 'friday_12th'), 'holy_week:good_friday_twelfth_hour');
});
