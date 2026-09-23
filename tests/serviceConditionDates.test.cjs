const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function loadHelpers() {
  let source = fs.readFileSync('src/utils/serviceConditionDates.ts', 'utf8');
  source = source.replace(
    "import { addUtcDays } from './dateUtils';",
    "const addUtcDays = (date, delta) => { const d = new Date(date); d.setUTCDate(d.getUTCDate() + delta); return d; };",
  );
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleObject = { exports: {} };
  new Function('exports', 'require', 'module', '__filename', '__dirname', javascript)(
    moduleObject.exports,
    require,
    moduleObject,
    'serviceConditionDates.ts',
    process.cwd(),
  );
  return moduleObject.exports;
}

function dateOnly(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`);
}

function isoDate(date) {
  return date?.toISOString().slice(0, 10);
}

test('Vespers Praises uses the previous liturgical day for weekday conditions', () => {
  const { getServiceWeekdayConditionDate } = loadHelpers();

  const weekdayDate = getServiceWeekdayConditionDate({
    schema: 'psalmody',
    table: 'vespers_praises',
    effectiveDate: dateOnly('2026-09-19'),
    vespersEffectiveDate: dateOnly('2026-09-19'),
  });

  assert.equal(isoDate(weekdayDate), '2026-09-18');
});

test('Vespers Praises only shifts the weekday override from the effective date', () => {
  const { getServiceWeekdayConditionDate } = loadHelpers();

  const weekdayDate = getServiceWeekdayConditionDate({
    schema: 'psalmody',
    table: 'vespers_praises',
    effectiveDate: dateOnly('2026-09-20'),
    vespersEffectiveDate: dateOnly('2026-09-19'),
  });

  assert.equal(isoDate(weekdayDate), '2026-09-19');
});

test('Other Vespers services keep the existing raw-date weekday override', () => {
  const { getServiceWeekdayConditionDate } = loadHelpers();

  const raisingWeekdayDate = getServiceWeekdayConditionDate({
    schema: 'liturgy',
    table: 'raising_of_incense',
    extraContext: { Vespers: true },
    effectiveDate: dateOnly('2026-09-20'),
    vespersEffectiveDate: dateOnly('2026-09-19'),
  });
  const lectionaryWeekdayDate = getServiceWeekdayConditionDate({
    schema: 'liturgy',
    table: 'lectionary_vespers',
    effectiveDate: dateOnly('2026-09-20'),
    vespersEffectiveDate: dateOnly('2026-09-19'),
  });

  assert.equal(isoDate(raisingWeekdayDate), '2026-09-19');
  assert.equal(isoDate(lectionaryWeekdayDate), '2026-09-19');
});

test('Sermon Planner passes the Vespers weekday only to its mixed-context hydrator', () => {
  const { getServiceWeekdayConditionDate } = loadHelpers();
  const vespersEffectiveDate = dateOnly('2026-09-19');
  const weekdayDate = getServiceWeekdayConditionDate({
    schema: 'liturgy',
    table: 'sermon_planner',
    effectiveDate: dateOnly('2026-09-20'),
    vespersEffectiveDate,
  });
  assert.equal(weekdayDate, vespersEffectiveDate);
});

test('Non-Vespers services do not override weekday conditions', () => {
  const { getServiceWeekdayConditionDate } = loadHelpers();

  const weekdayDate = getServiceWeekdayConditionDate({
    schema: 'psalmody',
    table: 'midnight_praises',
    effectiveDate: dateOnly('2026-09-19'),
    vespersEffectiveDate: dateOnly('2026-09-19'),
  });

  assert.equal(weekdayDate, undefined);
});
