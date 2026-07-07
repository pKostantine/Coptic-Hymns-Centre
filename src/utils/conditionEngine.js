import { supabase } from "./supabase";
import { getSeasonRanges } from "./calendarService";
import { computeMovableFeastDates, computeParamounDates, FIXED_FEASTS } from "./fixedFeasts";

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
// Every single-day/period condition token actually referenced by real hymn
// data (verified by pulling every distinct `condition` string across the
// live schemas — see the frequency dump this was built from) is computed
// here, client-side, from three already-queried sources:
//  - `coptic_date_conversions` for today's weekday/Coptic month+day
//  - `calendar.season_ranges` for the current fast/feast-period boundaries
//  - the shared fixedFeasts.ts module (also used by the Season Selector),
//    so the two can never disagree about when a feast actually falls
// `calendar.get_fixed_flags_for_date` is still used for fixed saint/angel
// commemoration flags; this module adds the Lord-feast and period aliases
// that are not currently returned by that RPC.

const ORDINAL_WORDS = ["Zeroth", "First", "Second", "Third", "Fourth", "Fifth"];

const SEASON_TOKEN_MAP = {
  "Great Fast": ["Lent", "GreatLent", "GreatFast", "Fasts"],
  "Jonah's Fast": ["JonahFast", "JonahsFast", "Fasts"],
  "Apostles' Fast": ["ApostlesFast", "Fasts"],
  "Nativity Fast": ["NativityFast", "Fasts"],
  "St. Mary's Fast": ["StMaryFast", "Fasts"],
  "Holy Pascha": ["Pascha", "PaschaWeek", "HolyWeek"],
  "Holy 50 Days": ["PentecostPeriod"],
};

/** Coptic month order, for the fixed-range season checks (SeasonOfWaters/Herbs/AirAndFruits) below. */
const COPTIC_MONTH_ORDER = [
  "Thoout", "Paope", "Hathor", "Kiahk", "Tobe", "Meshir",
  "Paremhotep", "Paremoude", "Pashons", "Paone", "Epep", "Mesore", "Nasie",
];

const COPTIC_MONTH_ALIASES = {
  Paremoude: ["Parmoute"],
  Nasie: ["Nesi"],
};

/** Named token(s) each fixed single-day feast (from fixedFeasts.js) sets, keyed by its `key`. */
const FIXED_FEAST_FLAGS = {
  nayrouz: ["CopticNewYear", "Nayrouz"],
  "feast-of-the-cross": ["FeastOfTheCross", "HolyCross", "ThooutFeastOfTheCross1"],
  nativity: ["Nativity", "NativityFeast"],
  circumcision: ["Circumcision"],
  theophany: ["Theophany", "TheophanyFeast", "TheophanyLiturgyOfTheWaters"],
  "wedding-at-cana": ["WeddingCana"],
  "entry-into-temple": ["PresentationInTemple"],
  annunciation: ["Annunciation", "AnnunciationRaw"],
  "entry-into-egypt": ["EntranceIntoEgypt", "EntranceOfTheLordChrist"],
  transfiguration: ["Transfiguration"],
};

/** Named token(s) each movable single-day feast (from fixedFeasts.js) sets, keyed by its `key`. */
const MOVABLE_FEAST_FLAGS = {
  "lazarus-saturday": ["LazarusSaturday"],
  "palm-sunday": ["PalmSunday", "HosannaSunday"],
  "holy-thursday": ["CovenantThursday"],
  "good-friday": ["GoodFriday"],
  resurrection: ["Resurrection", "ResurrectionFeast"],
  "bright-saturday": ["BrightSaturday", "JoyousSaturday", "DayAfterResurrection"],
  "thomas-sunday": ["ThomasSunday"],
  ascension: ["Ascension"],
  pentecost: ["Pentecost"],
  "last-friday-of-lent": ["LastFridayOfLent", "LastFridayOfGreatFast"],
  "jonahs-feast": ["JonahPassover", "JonahsPassover"],
  "apostles-feast": ["ApostlesFeast"],
  "st-marys-feast": ["AssumptionStMary", "StMaryFeast"],
};

/** Single fixed-day feasts that count as "Feasts"/"FeastsOfTheLordPeriods" for the generic aggregate tokens below. */
const MAJOR_FEAST_FLAGS = [
  "NativityFeast", "TheophanyFeast", "Circumcision", "WeddingCana", "PresentationInTemple",
  "Transfiguration", "CopticNewYear", "FeastOfTheCross", "EntranceOfTheLordChrist",
  "ResurrectionFeast", "Ascension", "Pentecost",
];

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

async function resolveCopticDate(copticYear, monthName, day) {
  const { data, error } = await supabase
    .schema("calendar")
    .from("coptic_date_conversions")
    .select("gregorian_date")
    .eq("coptic_year", copticYear)
    .eq("coptic_month_name", monthName)
    .eq("coptic_day", day)
    .maybeSingle();
  if (error) throw new Error(`Unable to resolve ${monthName} ${day}, ${copticYear} AM: ${error.message}`);
  return data?.gregorian_date ?? null;
}

function isCopticDateInRange(monthName, day, startMonth, startDay, endMonth, endDay) {
  const monthIndex = COPTIC_MONTH_ORDER.indexOf(monthName);
  const startIndex = COPTIC_MONTH_ORDER.indexOf(startMonth);
  const endIndex = COPTIC_MONTH_ORDER.indexOf(endMonth);
  if (monthIndex === -1 || startIndex === -1 || endIndex === -1) return false;

  const value = monthIndex * 40 + day;
  const startValue = startIndex * 40 + startDay;
  const endValue = endIndex * 40 + endDay;

  return startValue <= endValue
    ? value >= startValue && value <= endValue
    : value >= startValue || value <= endValue;
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
  flags.NonSundays = weekdaySource.weekday !== "Sunday";
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
  (COPTIC_MONTH_ALIASES[conv.coptic_month_name] || []).forEach((monthName) => {
    flags[`${monthName}.${conv.coptic_day}`] = true;
  });

  if (conv.coptic_day === 29) {
    flags.TwentyNinthCopticMonth = true;
    flags.Joyful29thOfTheMonth = true;
    flags.Joyful29thOfTheMonthRaw = true;
  }

  if (conv.coptic_month_name === "Paremhotep" && conv.coptic_day === 10) {
    flags.ParemhotepFeastOfTheCross = true;
    flags.FeastOfTheCross = true;
    flags.HolyCross = true;
  }

  if (conv.sunday_ordinal_in_coptic_month >= 1 && conv.sunday_ordinal_in_coptic_month <= 5) {
    flags[`${ORDINAL_WORDS[conv.sunday_ordinal_in_coptic_month]}SundayOf${conv.coptic_month_name}`] = true;
    (COPTIC_MONTH_ALIASES[conv.coptic_month_name] || []).forEach((monthName) => {
      flags[`${ORDINAL_WORDS[conv.sunday_ordinal_in_coptic_month]}SundayOf${monthName}`] = true;
    });
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
    (COPTIC_MONTH_ALIASES[conv.coptic_month_name] || []).forEach((monthName) => {
      flags[`${ORDINAL_WORDS[weekOrdinal]}WeekOf${monthName}`] = true;
    });
  }

  const { data: fixedFlags, error: fixedError } = await supabase
    .schema("calendar")
    .rpc("get_fixed_flags_for_date", { p_gregorian_date: isoDate });
  if (fixedError) throw new Error(`Unable to load fixed flags: ${fixedError.message}`);
  (fixedFlags || []).forEach((row) => {
    flags[row.condition_key] = true;
  });

  // ─── Fixed Coptic-date feasts (Nayrouz, Nativity, Theophany, etc.) ───────
  for (const feast of FIXED_FEASTS) {
    if (conv.coptic_month_name === feast.monthName && conv.coptic_day === feast.day) {
      (FIXED_FEAST_FLAGS[feast.key] || []).forEach((token) => {
        flags[token] = true;
      });
    }
  }

  if (conv.coptic_month_name === "Thoout" && conv.coptic_day >= 1 && conv.coptic_day < 17) {
    flags.CopticNewYearPeriod = true;
    flags.NayrouzPeriod = true;
  }

  // ─── Season-of-the-year fixed ranges (agricultural blessing seasons) ─────
  if (isCopticDateInRange(conv.coptic_month_name, conv.coptic_day, "Paone", 12, "Paope", 9)) {
    flags.SeasonOfWaters = true;
  }
  if (isCopticDateInRange(conv.coptic_month_name, conv.coptic_day, "Paope", 10, "Tobe", 10)) {
    flags.SeasonOfHerbs = true;
  }
  if (isCopticDateInRange(conv.coptic_month_name, conv.coptic_day, "Tobe", 11, "Paone", 11)) {
    flags.SeasonOfAirAndFruits = true;
  }

  // ─── Weekday-aware Paramoun (Nativity/Theophany eve) ─────────────────────
  // Never observed on a Saturday or Sunday — when the feast itself falls on
  // one of those (or the following Monday), Paramoun shifts back to the
  // preceding weekday(s) instead, sometimes spanning 2-3 days.
  const [nativityDate, theophanyDate] = await Promise.all([
    resolveCopticDate(conv.coptic_year, "Kiahk", 29),
    resolveCopticDate(conv.coptic_year, "Tobe", 11),
  ]);
  if (nativityDate && computeParamounDates(nativityDate).includes(isoDate)) {
    flags.NativityParamoun = true;
  }
  if (theophanyDate && computeParamounDates(theophanyDate).includes(isoDate)) {
    flags.TheophanyParamoun = true;
  }

  // NativityPeriod/TheophanyPeriod ("afterfeast") lengths aren't defined
  // anywhere in the available reference data (the old app's equivalent
  // logic was itself never fed real season data), so these are a best-
  // effort one-week afterfeast assumption — flag for confirmation if the
  // exact boundary matters and looks off.
  if (nativityDate && isoDate >= nativityDate && isoDate <= addDaysIso(nativityDate, 7)) {
    flags.NativityPeriod = true;
  }
  if (theophanyDate && isoDate >= theophanyDate && isoDate <= addDaysIso(theophanyDate, 7)) {
    flags.TheophanyPeriod = true;
  }

  // ─── Movable single-day feasts (from the current season-range boundaries) ─
  // A ~200-day window either side of `date` comfortably covers every one of
  // the 6 season ranges these feasts are computed from, regardless of what
  // time of the liturgical year `date` itself falls in.
  const windowStart = addDaysIso(isoDate, -200);
  const windowEnd = addDaysIso(isoDate, 200);
  const seasonRanges = await getSeasonRanges(windowStart, windowEnd);
  const rangesByKey = {};
  for (const range of seasonRanges) {
    rangesByKey[range.rangeKey] = { startDate: range.startDate, endDate: range.endDate };
  }

  const movableFeasts = computeMovableFeastDates(rangesByKey);
  for (const feast of movableFeasts) {
    if (feast.date === isoDate) {
      (MOVABLE_FEAST_FLAGS[feast.key] || []).forEach((token) => {
        flags[token] = true;
      });
    }
  }

  // ─── Holy 50 Days sub-windows (Ascension is always +39 days from Easter) ─
  const holy50Days = rangesByKey["holy-50-days"];
  if (holy50Days) {
    const ascensionDate = addDaysIso(holy50Days.startDate, 39);
    if (isoDate >= holy50Days.startDate && isoDate < ascensionDate) {
      flags.PreAscensionPentecostPeriod = true;
    }
    if (isoDate >= ascensionDate && isoDate <= holy50Days.endDate) {
      flags.PostAscensionPentecostPeriod = true;
    }
  }

  const greatFast = rangesByKey["great-fast"];
  if (greatFast) {
    const lentSunday0 = addDaysIso(greatFast.startDate, -1);
    const inLent = isoDate >= greatFast.startDate && isoDate <= greatFast.endDate;
    if (isoDate === lentSunday0) {
      flags.LentSunday0 = true;
      flags.GreatFastSunday0 = true;
    }
    if (inLent) {
      flags.Lent = true;
      flags.GreatLent = true;
      flags.GreatFast = true;
      flags.Fasts = true;
      if (flags.Weekdays) {
        flags.LentWeekdays = true;
      }
      if (flags.Weekends) {
        flags.LentWeekends = true;
      }
      if (isoDate === greatFast.startDate) {
        flags.FirstMondayOfLent = true;
        flags.FirstMondayOfGreatFast = true;
      }
      if (isoDate === greatFast.endDate) {
        flags.LastFridayOfLent = true;
        flags.LastFridayOfGreatFast = true;
      }
    }
  }

  // ─── Kiahk season (the Kiahk-specific Theotokia rite, Kiahk 1-28) ────────
  if (conv.coptic_month_name === "Kiahk" && conv.coptic_day < 29 && !flags.NativityParamoun) {
    flags.KiahkSeason = true;
    flags.KoiahkSeason = true;
    if (flags.Weekdays) flags.KiahkWeekdays = true;
    if (flags.Weekends) flags.KiahkWeekends = true;
  }

  // ─── Raising of Incense (Vespers or Matins, whichever route got us here) ──
  if (extraContext?.Vespers || extraContext?.Matins) {
    flags.RaisingOfIncense = true;
  }

  // ─── Generic "is today some kind of feast" aggregates ────────────────────
  // Mirrors the old app's isFeastTokenDay/isFeastsOfTheLordPeriod: true for
  // any of the named major single-day feasts above, or anywhere within the
  // Holy 50 Days period (Resurrection through Pentecost).
  const isWithinHoly50Days = Boolean(
    holy50Days && isoDate >= holy50Days.startDate && isoDate <= holy50Days.endDate,
  );
  const isMajorFeastDay = MAJOR_FEAST_FLAGS.some((token) => flags[token]);
  const isLordFeastPeriod = Boolean(
    isWithinHoly50Days ||
      flags.NativityPeriod ||
      flags.TheophanyPeriod ||
      flags.CopticNewYearPeriod ||
      flags.FeastOfTheCross,
  );
  if (isMajorFeastDay || isLordFeastPeriod) {
    flags.Feasts = true;
    flags.Feast = true;
    flags.FeastsOfTheLordPeriods = true;
  }
  if (isMajorFeastDay) {
    flags.GreatFeasts = true;
  }

  const { data: seasons, error: seasonsError } = await supabase
    .schema("calendar")
    .rpc("get_active_seasons_for_date", { p_gregorian_date: isoDate });
  if (seasonsError) throw new Error(`Unable to load active seasons: ${seasonsError.message}`);
  (seasons || []).forEach((row) => {
    (SEASON_TOKEN_MAP[row.active_season] || []).forEach((token) => {
      flags[token] = true;
    });
  });

  if (flags.Feasts) flags.Feast = true;
  if (flags.JonahFast) flags.JonahsFast = true;
  if (flags.JonahsFast) flags.JonahFast = true;

  if (
    flags.Sundays &&
    (flags.ApostlesFast || isCopticDateInRange(conv.coptic_month_name, conv.coptic_day, "Epep", 6, "Hathor", 30))
  ) {
    flags.ApostlesFastToLastDayOfHathor = true;
  }

  if (
    (weekdaySource.weekday === "Wednesday" || weekdaySource.weekday === "Friday") &&
    !flags.Feasts &&
    !flags.Fasts &&
    !flags.Pascha &&
    !flags.PentecostPeriod
  ) {
    flags.NormalFastingDays = true;
  }

  if (
    !flags.Feasts &&
    !flags.Fasts &&
    !flags.Pascha &&
    !flags.KiahkSeason &&
    !flags.CopticNewYearPeriod &&
    !flags.FeastOfTheCross &&
    !flags.PentecostPeriod
  ) {
    flags.Annual = true;
  }

  return { ...flags, ...extraContext };
}

function addDaysIso(isoDate, delta) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function toIsoDate(date) {
  if (typeof date === "string") return date;
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}
