import { toIsoDate } from "./dateUtils";
import { supabase } from "./supabase";

// ─── Condition string evaluator ────────────────────────────────────────────
// Parses a stored condition string (e.g. "Lent && !Saturday", "FeastOfTheCross
// || PalmSunday") against a flat { [token]: true } flags object. Tokenizes
// identifiers (including colon-suffixed like ArchangelMichael:Feast and
// dotted like Kiahk.5), looks each up in the flags object (a missing key is
// exactly as false as an explicit `false`), then evaluates the resulting
// boolean expression with &&/||/!/(). A null/empty condition always passes —
// most rows have no condition at all, and "no condition" means "always
// show", never "never show".

const TOKEN_RE = /[A-Za-z][A-Za-z0-9_.:]*/g;

/**
 * Whether one required condition atom is satisfied by the active flags.
 *
 * Saint hymn conditions are hierarchical: a saint has a base token (StMark)
 * and child tokens naming individual hymns (StMark:Doxology1, StMark:VOC,
 * StMark:Veneration, StMark:Feast...). An active parent satisfies every one of
 * its children, which is what lets the calendar simply raise `StMark` on his
 * feast and have all of his hymns appear.
 *
 * The relationship is deliberately ONE-WAY. An active child never satisfies
 * the parent, and never satisfies a sibling: picking "Verse of the Cymbals"
 * from the saint menu sets StMark:VOC alone, and must not drag in his
 * doxologies, his psalies, or the bare StMark that would.
 *
 * Only the first colon separates base from child, so a dotted date token like
 * Kiahk.5 (no colon) and an ordinary flag are both unaffected.
 */
function isConditionAtomSatisfied(token, flags) {
  if (flags?.[token]) return true;
  const separator = token.indexOf(":");
  if (separator <= 0) return false;
  return Boolean(flags?.[token.slice(0, separator)]);
}

export function evaluateCondition(condition, flags) {
  const trimmed = String(condition || "").trim();
  if (!trimmed) return true;

  const tokens = [...new Set(trimmed.match(TOKEN_RE) || [])].sort(
    (a, b) => b.length - a.length,
  );

  // Substituted per atom, leaving &&/||/!/() untouched — the parser still has
  // to handle "(StMark:Psali1 || Paope.30) && AdamDays" exactly as before, so
  // the hierarchy is resolved here rather than by rewriting condition strings.
  let expr = trimmed;
  for (const token of tokens) {
    const value = isConditionAtomSatisfied(token, flags);
    expr = expr.split(token).join(value ? "true" : "false");
  }

  // eslint-disable-next-line no-eval -- expr now only contains true/false/&&/||/!/()
  try {
    // eslint-disable-next-line no-new-func
    return Boolean(new Function(`"use strict"; return (${expr});`)());
  } catch {
    return false;
  }
}

// ─── Context flags: calendar.get_context_flags is the single source of truth ─
// Every date-derived condition flag (weekday, fixed feasts, seasons, fasts,
// Kiahk, Paramoun, NormalFastingDays, Annual, ...) is computed server-side by
// this one RPC — see calendar.get_active_flags_for_date, which it wraps. The
// client never re-derives any of that; it only ever asks "what's true today"
// and evaluates conditions against the answer. This keeps the app and the
// database from being two independent (and driftable) implementations of
// the same liturgical calendar.

// One cached context resolution per distinct (date, extraContext)
// combination — hymnLibrary.js calls getContextFlags once per document, not
// once per hymn or per line. The date-only Lent range lookup has its own
// cache so documents with different structural flags still share it.
const contextFlagsCache = new Map(); // cacheKey -> Promise<flags>
const lentFlagsCache = new Map(); // isoDate -> Promise<flags>
const MAX_CACHE_ENTRIES = 200;

function cacheKeyFor(isoDate, extraContext) {
  const sortedEntries = Object.entries(extraContext || {}).sort(([a], [b]) => a.localeCompare(b));
  return `${isoDate}:${JSON.stringify(sortedEntries)}`;
}

function rememberInCache(cache, key, value) {
  if (!cache.has(key) && cache.size >= MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, value);
}

function utcWeekdayForIsoDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function daysBetweenIsoDates(startIsoDate, endIsoDate) {
  const [startYear, startMonth, startDay] = startIsoDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endIsoDate.split("-").map(Number);
  return Math.round(
    (Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) /
      86400000,
  );
}

// calendar.season_ranges is the source of truth for Great Lent and Holy Week.
// Derive the same aliases as a compatibility fallback for older RPC versions;
// the canonical calendar RPC now also recognizes the Lent range directly.
// This preserves Lent's hour-placement flags on all supported app versions.
function fetchDerivedLentFlags(isoDate) {
  let cached = lentFlagsCache.get(isoDate);
  if (!cached) {
    cached = (async () => {
      const { data, error } = await supabase
        .schema("calendar")
        .from("season_ranges")
        .select("range_key, start_date, end_date")
        .in("range_key", ["lent", "holy-week"])
        .lte("start_date", isoDate)
        .gte("end_date", isoDate);
      if (error) {
        throw new Error("Unable to load Lent range flags for " + isoDate + ": " + error.message);
      }

      const ranges = data || [];
      const greatFastRange = ranges.find((range) => range.range_key === "lent");
      const holyWeekRange = ranges.find((range) => range.range_key === "holy-week");
      if (!greatFastRange && !holyWeekRange) return {};

      const weekday = utcWeekdayForIsoDate(isoDate);
      const isWeekend = weekday === 0 || weekday === 6;
      const flags = {
        Lent: true,
        [isWeekend ? "LentWeekends" : "LentWeekdays"]: true,
      };

      if (greatFastRange) {
        flags.GreatFast = true;
        if (weekday === 1 && daysBetweenIsoDates(greatFastRange.start_date, isoDate) < 7) {
          flags.FirstMondayOfLent = true;
        }
        if (weekday === 5 && isoDate === greatFastRange.end_date) {
          flags.LastFridayOfLent = true;
        }
      }
      if (holyWeekRange) {
        flags.HolyWeek = true;
        flags.Pascha = true;
      }
      return flags;
    })();
    rememberInCache(lentFlagsCache, isoDate, cached);
  }
  return cached;
}

async function fetchContextFlags(isoDate, extraContext) {
  const key = cacheKeyFor(isoDate, extraContext);
  let cached = contextFlagsCache.get(key);
  if (!cached) {
    cached = (async () => {
      const [{ data, error }, derivedLentFlags] = await Promise.all([
        supabase
          .schema("calendar")
          .rpc("get_context_flags", { p_date: isoDate, p_extra_context: extraContext || {} }),
        fetchDerivedLentFlags(isoDate),
      ]);
      if (error) throw new Error(`Unable to load context flags for ${isoDate}: ${error.message}`);
      const flags = { ...(data || {}), ...derivedLentFlags };
      if (derivedLentFlags.Lent) {
        // Older RPC deployments may incorrectly include ordinary-fast or
        // annual flags during Lent. Never allow those to overlap Lent's
        // seasonal hour and hymn placements.
        delete flags.NormalFastingDays;
        delete flags.Annual;
        delete flags.Joyful29thOfTheMonth;
        flags.Fasts = true;
      }
      return flags;
    })();
    rememberInCache(contextFlagsCache, key, cached);
  }
  return cached;
}

// get_context_flags computes weekday flags (Saturday/Saturdays, Weekend(s)/
// Weekday(s), AdamDays/VatosDays, ...) from its one p_date argument. A caller
// can pass a distinct weekdayDate when a service needs only that day-family
// vocabulary swapped: Vespers keeps the raw day's weekday after the evening
// rollover, while Vespers Praises uses the previous liturgical day's weekday.
// The RPC has no separate "weekday date" parameter, so this fetches flags for
// the override date too and swaps in just its weekday-derived keys, closing
// over the exact vocabulary the old client-side weekday computation used to
// set (confirmed against calendar.get_context_flags directly: it never emits
// any weekday key outside this list).
const WEEKDAY_FLAG_KEYS = [
  "Sunday", "Sundays", "Monday", "Mondays", "Tuesday", "Tuesdays",
  "Wednesday", "Wednesdays", "Thursday", "Thursdays", "Friday", "Fridays",
  "Saturday", "Saturdays", "Weekend", "Weekends", "Weekday", "Weekdays",
  "AdamDays", "VatosDays", "NonSundays",
];

function withWeekdayFlagsFrom(baseFlags, weekdayFlags) {
  const merged = { ...baseFlags };
  const isLent = Boolean(
    baseFlags.Lent ||
      baseFlags.GreatFast ||
      baseFlags.LentWeekdays ||
      baseFlags.LentWeekends,
  );
  for (const key of WEEKDAY_FLAG_KEYS) delete merged[key];
  for (const key of WEEKDAY_FLAG_KEYS) {
    if (weekdayFlags[key]) merged[key] = true;
  }
  // LentWeekdays/LentWeekends combine a season flag from the liturgical date
  // with the weekday family intentionally replaced above (for Vespers).
  // Recompute them after the swap or Sunday-evening Vespers can retain
  // Monday's LentWeekdays while its ordinary weekday flags say Weekends.
  delete merged.LentWeekdays;
  delete merged.LentWeekends;
  if (isLent) {
    merged[merged.Weekends ? "LentWeekends" : "LentWeekdays"] = true;
  }
  return merged;
}

// ─── Today's Gospel author (gospel_rite's GospelMatthew/Mark/Luke/John) ────
// introductionAndPsalm's own Reader line and introductionToTheCopticGospel's
// Priest line are conditioned on these tokens, and the [AUTHOR] placeholder
// substitution in readingsService.ts needs the same book — but which Gospel
// is being read depends on the day's resolved lectionary reading, not on the
// date alone, so this can't come from calendar.get_context_flags. Scoped to
// whichever one of Vespers/Matins/Liturgy is active in *this* hydration (the
// structural flag is already in extraContext by the time this runs),
// matching the same service->book_key resolution getGospelRiteSections
// (readingsService.ts) already uses for the "[AUTHOR]" placeholder itself.
const gospelAuthorsByDateCache = new Map(); // isoDate -> Promise<Record<service, bookKey>>
const gospelBookKeyCache = new Map(); // calendar book number -> Promise<bookKey>

function getGospelBookKey(readingReference) {
  const firstSegment = String(readingReference || "").split(/\*@\+|@/).map((part) => part.trim()).find(Boolean);
  const bookNumber = Number(firstSegment?.split(":")[0]?.split(".")[0]);
  if (!Number.isFinite(bookNumber)) return Promise.resolve(null);

  let cached = gospelBookKeyCache.get(bookNumber);
  if (!cached) {
    cached = supabase
      .schema("bible")
      .rpc("get_book_key_by_calendar_number", { p_calendar_number: bookNumber })
      .then(({ data, error }) => {
        if (error) throw new Error(`Unable to resolve Gospel book ${bookNumber}: ${error.message}`);
        return data || null;
      });
    gospelBookKeyCache.set(bookNumber, cached);
  }
  return cached;
}

function getGospelAuthorsByService(isoDate) {
  let cached = gospelAuthorsByDateCache.get(isoDate);
  if (!cached) {
    cached = (async () => {
      const { data, error } = await supabase.rpc("get_readings_for_date", { p_date: isoDate });
      if (error) throw new Error(`Unable to load Gospel readings for ${isoDate}: ${error.message}`);
      const gospelRows = (data || []).filter((row) => row.reading_type === "Gospel");
      const resolvedBooks = await Promise.all(gospelRows.map((row) => getGospelBookKey(row.reading_reference)));
      const byService = {};
      gospelRows.forEach((row, index) => {
        const bookKey = resolvedBooks[index];
        if (bookKey) byService[row.service] = bookKey;
      });
      return byService;
    })();
    rememberInCache(gospelAuthorsByDateCache, isoDate, cached);
  }
  return cached;
}

async function computeGospelAuthorFlags(isoDate, extraContext) {
  const activeGospelService = extraContext?.Liturgy ? "Liturgy" : extraContext?.Matins ? "Matins" : extraContext?.Vespers ? "Vespers" : null;
  if (!activeGospelService) return {};
  const authorsByService = await getGospelAuthorsByService(isoDate);
  const bookKey = authorsByService[activeGospelService];
  if (!bookKey) return {};
  return { [`Gospel${bookKey.charAt(0).toUpperCase()}${bookKey.slice(1)}`]: true };
}

/**
 * @param {Date|string} date - the liturgical date to resolve flags for
 *   (already rolled forward past the 5pm boundary where applicable — see
 *   CalendarContext's effectiveDate).
 * @param {Object} extraContext - non-date flags merged in (and always
 *   winning over anything date-derived): UI toggles like BishopPresent, and
 *   the schema/table-derived structural flags hymnLibrary.js's
 *   deriveStructuralFlags computes (StBasilLiturgy, Liturgy, ...) — these
 *   aren't date-dependent, so they're supplied by the caller, not this
 *   module, exactly like get_context_flags's own p_extra_context contract.
 * @param {Date|string} [weekdayDate] - overrides which date's weekday
 *   (Sunday/Monday/.../AdamDays/VatosDays) is used, independent of `date`.
 */
export async function getContextFlags(date, extraContext = {}, weekdayDate) {
  const isoDate = toIsoDate(date);
  const weekdayIsoDate = weekdayDate ? toIsoDate(weekdayDate) : isoDate;

  const [baseFlags, gospelAuthorFlags, weekdayFlags] = await Promise.all([
    fetchContextFlags(isoDate, extraContext),
    computeGospelAuthorFlags(isoDate, extraContext),
    weekdayIsoDate === isoDate ? null : fetchContextFlags(weekdayIsoDate, {}),
  ]);

  const withWeekday = weekdayFlags ? withWeekdayFlagsFrom(baseFlags, weekdayFlags) : baseFlags;
  const flags = { ...withWeekday, ...gospelAuthorFlags, ...extraContext };
  // Even if a caller supplies these as extra context, the two ordinary
  // conditions must not be active during Great Lent or Holy Week.
  if (flags.Lent) {
    delete flags.NormalFastingDays;
    delete flags.Annual;
  }
  return flags;
}
