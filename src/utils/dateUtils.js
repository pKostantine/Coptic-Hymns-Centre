// Every downstream consumer (conditionEngine.js, hymnLibrary.js,
// readingsService.ts, calendarService.ts, fixedFeasts.ts, ...) treats a Date
// as a date-only value and reads its calendar day via UTC accessors
// (toISOString().slice(0, 10), getUTCFullYear/getUTCMonth/getUTCDate) — the
// same convention a manually-picked calendar day already uses (built as
// `T00:00:00Z`). A bare `new Date()` is a real instant, not a date-only
// value: reading ITS calendar day via those same UTC accessors reports
// whatever day it is in UTC, not the device's own local day, silently
// rolling the app to "tomorrow" hours early (for zones ahead of UTC) or
// keeping it on "yesterday" for a while after local midnight (for zones
// behind UTC). localDateAtUtcMidnight is the one place a real "now" instant
// should ever get converted — anchoring the device's *local* year/month/date
// at UTC midnight means every UTC-based read below automatically reflects
// the device's local calendar day, with no changes needed anywhere else.

/** Anchors a real moment (typically `new Date()`) at UTC midnight of its *local* calendar day. */
export function localDateAtUtcMidnight(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/**
 * Converts a Date to its calendar-day-only "YYYY-MM-DD" string via UTC
 * accessors — the app-wide convention for "date-only" values. Every such
 * Date is expected to already be anchored at UTC midnight representing a
 * specific calendar day, whether that's the device's local "today" (via
 * localDateAtUtcMidnight above) or a value already read from the database.
 *
 * Never read a date-only value through *local* getters (getFullYear/
 * getMonth/getDate): a Date already anchored at UTC midnight would report
 * the WRONG calendar day on a device whose timezone sits behind UTC (local
 * time would fall a few hours into the *previous* day). This function and
 * localDateAtUtcMidnight are the only two places that should ever need to
 * reason about this distinction — every other date-for-querying call site
 * should just pass its Date straight through here.
 *
 * A plain "YYYY-MM-DD" string passes through unchanged.
 */
export function toIsoDate(date) {
  if (typeof date === "string") return date;
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

/** The device's local "today" as a "YYYY-MM-DD" string — localDateAtUtcMidnight(new Date()) then toIsoDate, in one call. */
export function todayIsoDate() {
  return toIsoDate(localDateAtUtcMidnight(new Date()));
}
