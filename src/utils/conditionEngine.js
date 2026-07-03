import { supabase } from "./supabase";

// ─── Condition string evaluator ────────────────────────────────────────────
// Ported from the Postgres public.evaluate_condition RPC (see project memory
// project_condition_engine.md) so filtering can run client-side per the
// project owner's chosen architecture. Same strategy: tokenize identifiers
// (including colon-suffixed like ArchangelMichael:Feast and dotted like
// Kiahk.5), look each up in the flags object, then evaluate the resulting
// boolean expression with &&/||/!/().

const TOKEN_RE = /[A-Za-z][A-Za-z0-9_.:]*/g;

export function evaluateCondition(condition, flags) {
  const trimmed = String(condition || "").trim();
  if (!trimmed) return true;

  const tokens = [...new Set(trimmed.match(TOKEN_RE) || [])].sort(
    (a, b) => b.length - a.length,
  );

  let expr = trimmed;
  for (const token of tokens) {
    const value = Boolean(flags?.[token]);
    expr = expr.split(token).join(value ? "true" : "false");
  }

  // eslint-disable-next-line no-eval -- expr now only contains true/false/&&/||/!/()
  try {
    const jsExpr = expr.replace(/&&/g, "&&").replace(/\|\|/g, "||").replace(/!/g, "!");
    // eslint-disable-next-line no-new-func
    return Boolean(new Function(`"use strict"; return (${jsExpr});`)());
  } catch {
    return false;
  }
}

// ─── Context flags assembler ───────────────────────────────────────────────
// Ported from calendar.get_context_flags. Uses the documented calendar
// helper RPCs (get_fixed_flags_for_date, get_active_seasons_for_date) for
// the calendar-table lookups, and replicates the token-assembly logic
// (weekday flags, literal MonthName.Day, ordinal Sunday/week-of-month,
// 29th-of-month, season aliasing) in JS.

const ORDINAL_WORDS = ["Zeroth", "First", "Second", "Third", "Fourth", "Fifth"];

const SEASON_TOKEN_MAP = {
  "Great Fast": ["Lent", "GreatLent", "Fasts"],
  "Jonah's Fast": ["JonahFast", "Fasts"],
  "Apostles' Fast": ["ApostlesFast", "Fasts"],
  "Nativity Fast": ["NativityFast", "Fasts"],
  "St. Mary's Fast": ["StMaryFast", "Fasts"],
  "Holy Pascha": ["Pascha", "PaschaWeek"],
  "Holy 50 Days": ["PentecostPeriod"],
};

async function fetchCopticDateConversion(isoDate) {
  const { data: conv, error: convError } = await supabase
    .schema("calendar")
    .from("coptic_date_conversions")
    .select(
      "weekday, coptic_month_name, coptic_day, sunday_ordinal_in_coptic_month, coptic_month, coptic_year",
    )
    .eq("gregorian_date", isoDate)
    .maybeSingle();

  if (convError) throw new Error(`Unable to load calendar context: ${convError.message}`);
  if (!conv) throw new Error(`No calendar.coptic_date_conversions row for ${isoDate}`);
  return conv;
}

/**
 * @param {Date|string} date - the "fixed" liturgical date: drives fixed-day
 *   commemorations, seasons, and the MonthName.Day/29th/ordinal-week tokens.
 * @param {Object} extraContext
 * @param {Date|string} [weekdayDate] - overrides which date's weekday
 *   (Sunday/Monday/.../AdamDays/VatosDays) is used, independent of `date`.
 *   Vespers services pass the un-rolled "today" here after the 5pm boundary
 *   flips `date` forward, since Saturday-evening Vespers Praises still chant
 *   in Saturday's (Vatos) tune even though the fixed commemorations already
 *   belong to Sunday.
 */
export async function getContextFlags(date, extraContext = {}, weekdayDate) {
  const isoDate = toIsoDate(date);
  const weekdayIsoDate = weekdayDate ? toIsoDate(weekdayDate) : isoDate;
  const flags = {};

  const [conv, weekdayConv] = await Promise.all([
    fetchCopticDateConversion(isoDate),
    weekdayIsoDate === isoDate ? Promise.resolve(null) : fetchCopticDateConversion(weekdayIsoDate),
  ]);
  const weekdaySource = weekdayConv || conv;

  flags[`${weekdaySource.weekday}s`] = true;
  flags[weekdaySource.weekday] = true;
  if (weekdaySource.weekday === "Saturday" || weekdaySource.weekday === "Sunday") {
    flags.Weekend = true;
    flags.Weekends = true;
  } else {
    flags.Weekday = true;
    flags.Weekdays = true;
  }

  const isAdamDay = ["Sunday", "Monday", "Tuesday"].includes(weekdaySource.weekday);
  flags.AdamDays = isAdamDay;
  flags.VatosDays = !isAdamDay;

  flags[`${conv.coptic_month_name}.${conv.coptic_day}`] = true;

  if (conv.coptic_day === 29) {
    flags.TwentyNinthCopticMonth = true;
    flags.Joyful29thOfTheMonth = true;
    flags.Joyful29thOfTheMonthRaw = true;
  }

  if (conv.sunday_ordinal_in_coptic_month >= 1 && conv.sunday_ordinal_in_coptic_month <= 5) {
    flags[`${ORDINAL_WORDS[conv.sunday_ordinal_in_coptic_month]}SundayOf${conv.coptic_month_name}`] = true;
  }

  const { data: weekRow } = await supabase
    .schema("calendar")
    .from("coptic_date_conversions")
    .select("sunday_ordinal_in_coptic_month")
    .eq("coptic_month", conv.coptic_month)
    .eq("coptic_year", conv.coptic_year)
    .lte("gregorian_date", isoDate)
    .not("sunday_ordinal_in_coptic_month", "is", null)
    .order("gregorian_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const weekOrdinal = weekRow?.sunday_ordinal_in_coptic_month;
  if (weekOrdinal >= 1 && weekOrdinal <= 5) {
    flags[`${ORDINAL_WORDS[weekOrdinal]}WeekOf${conv.coptic_month_name}`] = true;
  }

  const { data: fixedFlags, error: fixedError } = await supabase
    .schema("calendar")
    .rpc("get_fixed_flags_for_date", { p_gregorian_date: isoDate });
  if (fixedError) throw new Error(`Unable to load fixed flags: ${fixedError.message}`);
  (fixedFlags || []).forEach((row) => {
    flags[row.condition_key] = true;
  });

  const { data: seasons, error: seasonsError } = await supabase
    .schema("calendar")
    .rpc("get_active_seasons_for_date", { p_gregorian_date: isoDate });
  if (seasonsError) throw new Error(`Unable to load active seasons: ${seasonsError.message}`);
  (seasons || []).forEach((row) => {
    (SEASON_TOKEN_MAP[row.active_season] || []).forEach((token) => {
      flags[token] = true;
    });
  });

  return { ...flags, ...extraContext };
}

function toIsoDate(date) {
  if (typeof date === "string") return date;
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}
