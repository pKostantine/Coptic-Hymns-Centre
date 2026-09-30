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
  assert.equal(flags.HolyWeek, true);
  assert.equal(flags.Pascha, true);
  // Pascha, not Lent, is what suppresses these from Lazarus Saturday onward.
  assert.equal(Boolean(flags.Lent), false);
  assert.equal(Boolean(flags.Annual), false);
  assert.equal(Boolean(flags.NormalFastingDays), false);
});

test('Great Lent ends on its last Friday, not on Palm Sunday', async () => {
  // 2026-04-03 is the last Friday of Lent, 04-04 Lazarus Saturday, 04-05 Palm
  // Sunday. The lent range stops at the Friday; the holy-week range covers
  // the rest and must not carry any Lent flag into it.
  const { getContextFlags } = loadEngine();
  const lastFriday = await getContextFlags('2026-04-03');
  assert.equal(lastFriday.Lent, true);
  assert.equal(lastFriday.GreatFast, true);
  assert.equal(lastFriday.LastFridayOfLent, true);

  for (const isoDate of ['2026-04-04', '2026-04-05', '2026-04-06', '2026-04-11']) {
    const flags = await getContextFlags(isoDate);
    for (const flag of ['Lent', 'GreatFast', 'LentWeekdays', 'LentWeekends', 'Fasts', 'LastFridayOfLent']) {
      assert.equal(Boolean(flags[flag]), false, `${flag} must not be active on ${isoDate}`);
    }
    assert.equal(flags.Pascha, true, `Pascha must be active on ${isoDate}`);
  }
});

test('Lazarus Saturday and Palm Sunday keep their own feast flags', async () => {
  // These two days are inside the holy-week range but before HolyWeek proper,
  // so they must come back as Pascha days with nothing Lenten attached.
  const { getContextFlags } = loadEngine({
    '2026-04-04': { LazarusSaturday: true, Feasts: true },
    '2026-04-05': { PalmSunday: true, HosannaSunday: true, Feasts: true },
  });
  const lazarusSaturday = await getContextFlags('2026-04-04');
  const palmSunday = await getContextFlags('2026-04-05');

  assert.equal(lazarusSaturday.LazarusSaturday, true);
  assert.equal(lazarusSaturday.Feasts, true);
  assert.equal(Boolean(lazarusSaturday.LentWeekends), false);

  assert.equal(palmSunday.PalmSunday, true);
  assert.equal(palmSunday.HosannaSunday, true);
  assert.equal(Boolean(palmSunday.LentWeekends), false);
});

test('HolyWeek starts with Monday Eve, not with the season on Lazarus Saturday', async () => {
  const { getContextFlags } = loadEngine();
  // 2026-04-04 is Lazarus Saturday, 04-05 Palm Sunday; Palm Sunday evening is
  // already dated Holy Monday (04-06) by the evening rollover.
  const lazarusSaturday = await getContextFlags('2026-04-04');
  const palmSunday = await getContextFlags('2026-04-05');
  const palmSundayEvening = await getContextFlags('2026-04-06');
  const brightSaturday = await getContextFlags('2026-04-11');
  assert.equal(Boolean(lazarusSaturday.HolyWeek), false);
  assert.equal(Boolean(palmSunday.HolyWeek), false);
  assert.equal(lazarusSaturday.Pascha, true);
  assert.equal(palmSunday.Pascha, true);
  assert.equal(palmSundayEvening.HolyWeek, true);
  assert.equal(brightSaturday.HolyWeek, true);
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
