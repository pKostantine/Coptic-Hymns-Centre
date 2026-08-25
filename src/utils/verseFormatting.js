/**
 * Builds a citation-style verse list ("7,12-13", "11a,14a") from the verse
 * numbers actually present, grouping only genuinely consecutive runs into a
 * dash range. Naively rendering [min, max] as a range silently absorbs any
 * gap — [7, 12, 13] is NOT "7-13" (that would also claim verses 8-11, which
 * were never part of the reading at all) — so every verse actually present
 * must be accounted for individually before anything gets grouped.
 *
 * A part-labeled entry (`partLabel` set, e.g. "a" for 101:11a — one
 * editorial excerpt of a verse, see bible.verse_parts) never merges into a
 * run with its neighbors, since "11a-12" wouldn't mean anything; it's always
 * cited on its own, immediately after its verse number.
 *
 * `entries` is a list of `{ verse, partLabel? }` — plain verse numbers pass
 * `partLabel: null` (or omit it).
 */
export function formatVerses(entries) {
  const seen = new Set();
  const deduped = entries.filter((e) => {
    const key = `${e.verse}${e.partLabel || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const sorted = deduped;

  const out = [];
  let i = 0;
  while (i < sorted.length) {
    if (sorted[i].partLabel) {
      out.push(`${sorted[i].verse}${sorted[i].partLabel}`);
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < sorted.length && !sorted[j + 1].partLabel && sorted[j + 1].verse === sorted[j].verse + 1) j++;
    out.push(j > i ? `${sorted[i].verse}-${sorted[j].verse}` : `${sorted[i].verse}`);
    i = j + 1;
  }
  return out.join(",");
}
