const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const RANGES = [
  { range_key: 'lent', start_date: '2026-02-16', end_date: '2026-04-03' },
  { range_key: 'holy-week', start_date: '2026-04-04', end_date: '2026-04-11' },
];

function loadEngine(backendFlagsByDate = {}) {
  const supabase = {
    schema(schema) {
      assert.equal(schema, 'calendar');
      return {
        from(table) {
          assert.equal(table, 'season_ranges');
          const query = {
            date: null,
            keys: [],
            select() { return this; },
            in(column, keys) {
              assert.equal(column, 'range_key');
              this.keys = keys;
              return this;
            },
            lte(column, date) {
              assert.equal(column, 'start_date');
              this.date = date;
              return this;
            },
            gte(column, date) {
              assert.equal(column, 'end_date');
              this.date = date;
              return this;
            },
            then(resolve, reject) {
              return Promise.resolve({
                data: RANGES.filter((r) =>
                  this.keys.includes(r.range_key) &&
                  r.start_date <= this.date &&
                  r.end_date >= this.date),
                error: null,
              }).then(resolve, reject);
            },
          };
          return query;
        },
        rpc(name, args) {
          assert.equal(name, 'get_context_flags');
          return Promise.resolve({
            data: {
              ...(backendFlagsByDate[args.p_date] || {}),
              ...(args.p_extra_context || {}),
            },
            error: null,
          });
        },
      };
    },
  };

  let source = fs.readFileSync('src/utils/conditionEngine.js', 'utf8');
  source = source.replace(
    'import { toIsoDate } from "./dateUtils";',
    'const toIsoDate = (date) => typeof date === "string" ? date : date.toISOString().slice(0, 10);',
  ).replace('import { contentDataClient as supabase } from "../services/contentDataClient";', '')
    .replace(/^export /gm, '');

  return new Function('supabase', source + '\nreturn { getContextFlags };')(supabase);
}

test('Lent weekdays suppress both ordinary-fast and annual flags from an older RPC', async () => {
  const { getContextFlags } = loadEngine({
    '2026-03-04': { Annual: true, NormalFastingDays: true, Wednesday: true },
  });
  const flags = await getContextFlags('2026-03-04');
  assert.equal(flags.Lent, true);
  assert.equal(flags.GreatFast, true);
  assert.equal(flags.LentWeekdays, true);
  assert.equal(flags.Fasts, true);
  assert.equal(Boolean(flags.NormalFastingDays), false);
  assert.equal(Boolean(flags.Annual), false);
});

test('Lent weekend and final Friday retain their distinct seasonal flags', async () => {
  const { getContextFlags } = loadEngine();
  const weekend = await getContextFlags('2026-03-08');
  const friday = await getContextFlags('2026-04-03');
  assert.equal(weekend.LentWeekends, true);
  assert.equal(friday.LastFridayOfLent, true);
  assert.equal(friday.LentWeekdays, true);
  assert.equal(Boolean(friday.Annual), false);
});

test('Holy Week does not inherit annual or normal fasting conditions', async () => {
  const { getContextFlags } = loadEngine({
    '2026-04-06': { Annual: true, NormalFastingDays: true, Pascha: true },
  });
  const flags = await getContextFlags('2026-04-06', { Annual: true, NormalFastingDays: true });
  assert.equal(flags.Lent, true);
  assert.equal(flags.HolyWeek, true);
  assert.equal(flags.Pascha, true);
  assert.equal(Boolean(flags.Annual), false);
  assert.equal(Boolean(flags.NormalFastingDays), false);
});

test('normal days outside Lent retain the conditions returned by the RPC', async () => {
  const { getContextFlags } = loadEngine({
    '2026-10-07': { Annual: true, NormalFastingDays: true, Wednesday: true },
  });
  const flags = await getContextFlags('2026-10-07');
  assert.equal(flags.Annual, true);
  assert.equal(flags.NormalFastingDays, true);
  assert.equal(Boolean(flags.Lent), false);
});

test('Joyful 29 activates the aggregate Feasts condition', async () => {
  const { getContextFlags } = loadEngine({
    '2026-08-22': { Joyful29: true, Joyful29thOfTheMonth: true },
  });
  const flags = await getContextFlags('2026-08-22');
  assert.equal(flags.Joyful29, true);
  assert.equal(flags.Feasts, true);
});

test('the raw Coptic day-29 marker alone is not treated as Joyful 29', async () => {
  const { getContextFlags } = loadEngine({
    '2026-01-07': { TwentyNinthCopticMonth: true, Joyful29thOfTheMonthRaw: true },
  });
  const flags = await getContextFlags('2026-01-07');
  assert.equal(Boolean(flags.Feasts), false);
});
