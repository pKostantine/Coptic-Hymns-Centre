const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

const EASTERN_ARABIC = '٠١٢٣٤٥٦٧٨٩';
/** localeFormat.ts reaches the app-language store; the hours only need its digits. */
const STUBS = {
  './localeFormat': { toEasternArabicDigits: (value) => String(value).replace(/\d/g, (digit) => EASTERN_ARABIC[Number(digit)]) },
};

function load(path) {
  const source = fs.readFileSync(path, 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleObject = { exports: {} };
  const localRequire = (name) => STUBS[name] ?? require(name);
  new Function('exports', 'require', 'module', javascript)(moduleObject.exports, localRequire, moduleObject);
  return moduleObject.exports;
}

const hours = load('src/utils/agpeyaHours.ts');
const psalmody = load('src/utils/psalmodySchedule.ts');

test('the Agpeya hour follows the clock, the Midnight hour carrying the night until Prime', () => {
  const at = (clockHour) => hours.agpeyaHourAt(clockHour).id;
  assert.equal(at(0), 'midnight_hour');
  assert.equal(at(5), 'midnight_hour');
  assert.equal(at(6), 'first_hour');
  assert.equal(at(9), 'third_hour');
  assert.equal(at(11), 'third_hour');
  assert.equal(at(12), 'sixth_hour');
  assert.equal(at(15), 'ninth_hour');
  assert.equal(at(17), 'eleventh_hour');
  assert.equal(at(18), 'twelfth_hour');
  assert.equal(at(23), 'twelfth_hour');
});

test('each Agpeya hour is followed by the next, and ends when it begins', () => {
  const third = hours.agpeyaHourAt(10);
  assert.equal(hours.nextAgpeyaHour(third).id, 'sixth_hour');
  assert.equal(hours.agpeyaHourEnd(third), 12);
  const twelfth = hours.agpeyaHourAt(20);
  assert.equal(hours.nextAgpeyaHour(twelfth).id, 'midnight_hour');
  assert.equal(hours.agpeyaHourEnd(twelfth), 24);
  const midnight = hours.agpeyaHourAt(2);
  assert.equal(hours.nextAgpeyaHour(midnight).id, 'first_hour');
  assert.equal(hours.agpeyaHourEnd(midnight), 6);
  assert.equal(hours.formatAgpeyaClock(9, false), '9:00');
  assert.equal(hours.formatAgpeyaClock(24, false), '0:00');
  assert.equal(hours.formatAgpeyaClock(12, true), '١٢:٠٠');
});

test('the praise up next goes round the day: dawn, evening, the night', () => {
  const WEDNESDAY = 3;
  const at = (clockHour) => psalmody.praisesUpNext(clockHour, WEDNESDAY);
  assert.deepEqual(at(8).next, { id: 'morning_doxology', when: 'this-morning' });
  assert.deepEqual(at(8).then, { id: 'vespers_praises', when: 'this-evening' });
  assert.deepEqual(at(14).next, { id: 'vespers_praises', when: 'this-evening' });
  assert.equal(at(14).then.id, 'midnight_praises');
  assert.equal(at(21).next.id, 'midnight_praises');
  assert.deepEqual(at(21).then, { id: 'morning_doxology', when: 'at-dawn' });
});

test('the Midnight Praises sing the Theotokia of the day they open', () => {
  // Wednesday night's are Thursday's; after midnight the day has already turned.
  assert.equal(psalmody.praisesUpNext(21, 3).next.theotokiaWeekday, 4);
  assert.equal(psalmody.praisesUpNext(14, 3).then.theotokiaWeekday, 4);
  assert.equal(psalmody.praisesUpNext(2, 4).next.theotokiaWeekday, 4);
  // Saturday night's are Sunday's.
  assert.equal(psalmody.praisesUpNext(22, 6).next.theotokiaWeekday, 0);
});
