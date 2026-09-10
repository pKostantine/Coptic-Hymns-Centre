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

// One network round trip per distinct (date, extraContext) combination —
// hymnLibrary.js calls getContextFlags once per document, not once per hymn
// or per line, so in practice this cache mostly serves repeat visits to the
// same document/date within a session.
const contextFlagsCache = new Map(); // cacheKey -> Promise<flags>
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

async function fetchContextFlags(isoDate, extraContext) {
  const key = cacheKeyFor(isoDate, extraContext);
  let cached = contextFlagsCache.get(key);
  if (!cached) {
    cached = (async () => {
      const { data, error } = await supabase
        .schema("calendar")
        .rpc("get_context_flags", { p_date: isoDate, p_extra_context: extraContext || {} });
      if (error) throw new Error(`Unable to load context flags for ${isoDate}: ${error.message}`);
      return data || {};
    })();
    rememberInCache(contextFlagsCache, key, cached);
  }
  return cached;
}

// get_context_flags computes weekday flags (Saturday/Saturdays, Weekend(s)/
// Weekday(s), AdamDays/VatosDays, ...) from its one p_date argument — but
// Saturday-evening Vespers Praises and Vespers still chant in Saturday's
// (Vatos) weekday tune even once the 5pm liturgical-day boundary has already
// rolled `date` itself forward to Sunday for every other flag (fixed
// commemorations, season, etc.) — see CalendarContext.tsx's
// vespersEffectiveDate. The RPC has no separate "weekday date" parameter, so
// when the caller passes a distinct weekdayDate, this fetches flags for it
// too and swaps in just its weekday-derived keys, closing over the exact
// vocabulary the old client-side weekday computation used to set (confirmed
// against calendar.get_context_flags directly: it never emits any weekday
// key outside this list).
const WEEKDAY_FLAG_KEYS = [
  "Sunday", "Sundays", "Monday", "Mondays", "Tuesday", "Tuesdays",
  "Wednesday", "Wednesdays", "Thursday", "Thursdays", "Friday", "Fridays",
  "Saturday", "Saturdays", "Weekend", "Weekends", "Weekday", "Weekdays",
  "AdamDays", "VatosDays", "NonSundays",
];

function withWeekdayFlagsFrom(baseFlags, weekdayFlags) {
  const merged = { ...baseFlags };
  for (const key of WEEKDAY_FLAG_KEYS) delete merged[key];
  for (const key of WEEKDAY_FLAG_KEYS) {
    if (weekdayFlags[key]) merged[key] = true;
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
  return { ...withWeekday, ...gospelAuthorFlags, ...extraContext };
}
