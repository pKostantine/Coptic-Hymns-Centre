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

const manifest = loadManifest();
const DAY_TOKENS = ['PalmSunday', 'HolyMonday', 'HolyTuesday', 'HolyWednesday', 'CovenantThursday', 'GoodFriday'];
const HOUR_TOKENS = ['FirstHour', 'ThirdHour', 'SixthHour', 'NinthHour', 'EleventhHour', 'TwelfthHour'];

test('Holy Week is a menu of days, each listing its hours in prayer order', () => {
  const { HOLY_WEEK_DAYS, HOLY_WEEK_HOURS, SERVICES_BY_CATEGORY } = manifest;
  assert.equal(SERVICES_BY_CATEGORY['holy-week'], undefined);
  assert.deepEqual(HOLY_WEEK_DAYS.map((day) => day.id), [
    'palm-sunday', 'holy-monday', 'holy-tuesday', 'holy-wednesday', 'covenant-thursday', 'good-friday', 'bright-saturday',
  ]);
  assert.deepEqual(HOLY_WEEK_DAYS.find((day) => day.id === 'palm-sunday').hours.map((hour) => hour.id), [
    'general_funeral_prayer', 'sunday_9th', 'sunday_11th', 'monday_eve_1st', 'monday_eve_3rd', 'monday_eve_6th', 'monday_eve_9th', 'monday_eve_11th',
  ]);
  assert.deepEqual(HOLY_WEEK_DAYS.find((day) => day.id === 'covenant-thursday').hours.map((hour) => hour.id), [
    'thursday_1st', 'thursday_3rd', 'thursday_6th', 'thursday_9th', 'liturgy_of_the_waters', 'covenant_thursday_liturgy', 'thursday_11th',
    'friday_eve_1st', 'friday_eve_3rd', 'friday_eve_6th', 'friday_eve_9th', 'friday_eve_11th',
  ]);
  assert.equal(HOLY_WEEK_HOURS.length, 57);
  assert.equal(new Set(HOLY_WEEK_HOURS.map((hour) => hour.id)).size, HOLY_WEEK_HOURS.length);
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
  // The eve belongs to the following day.
  assert.equal(HOLY_WEEK_HOURS.find((hour) => hour.id === 'monday_eve_1st').extraContext.HolyMonday, true);
  assert.equal(HOLY_WEEK_HOURS.find((hour) => hour.id === 'friday_eve_11th').extraContext.GoodFriday, true);
});

test('pascha_hour bookmarks keep the hour they were made in', () => {
  const { bookmarkKeyFor } = manifest;
  assert.equal(bookmarkKeyFor('holy_week', 'pascha_hour', 'monday_1st'), 'holy_week:pascha_hour@monday_1st');
  assert.equal(bookmarkKeyFor('holy_week', 'good_friday_twelfth_hour', 'friday_12th'), 'holy_week:good_friday_twelfth_hour');
});
