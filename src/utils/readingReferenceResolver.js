import { supabase } from "./supabase";

const bookKeyByCalendarNumberCache = new Map();

function splitReadingReference(ref) {
  return String(ref || "").split(/\*@\+|@/).map((segment) => segment.trim()).filter(Boolean);
}

function parseVerseToken(token) {
  const cleaned = String(token || "").trim().replace(/\*$/, "");
  const match = cleaned.match(/^(\d+)([a-z])?$/);
  if (!match) throw new Error(`Malformed verse token "${token}" in reading_reference`);
  return { verseNum: Number(match[1]), partLabel: match[2] || null };
}

function parseReadingSegment(segment) {
  const [bookPart, rawVersePart] = String(segment || "").split(":");
  const [bookNumStr, startChapterStr] = String(bookPart || "").split(".");
  const bookNum = Number(bookNumStr);
  const startChapter = Number(startChapterStr);
  const versePart = String(rawVersePart || "").trim().replace(/\*$/, "");
  if (!Number.isFinite(bookNum) || !Number.isFinite(startChapter) || !versePart) {
    throw new Error(`Malformed reading_reference segment "${segment}"`);
  }

  if (versePart.includes(",")) {
    return { kind: "verses", bookNum, chapter: startChapter, verses: versePart.split(",").map(parseVerseToken) };
  }

  if (versePart.includes("-")) {
    const [startVerseStr, endPart] = versePart.split("-");
    if (endPart.includes(":")) {
      const [endChapterStr, endVerseStr] = endPart.split(":");
      return {
        kind: "range",
        bookNum,
        startChapter,
        startVerse: Number(startVerseStr),
        endChapter: Number(endChapterStr),
        endVerse: Number(endVerseStr),
      };
    }
    return { kind: "range", bookNum, startChapter, startVerse: Number(startVerseStr), endChapter: startChapter, endVerse: Number(endPart) };
  }

  const token = parseVerseToken(versePart);
  if (token.partLabel) {
    return { kind: "verses", bookNum, chapter: startChapter, verses: [token] };
  }
  return { kind: "range", bookNum, startChapter, startVerse: token.verseNum, endChapter: startChapter, endVerse: token.verseNum };
}

function parseNumericVerseNumber(value) {
  const match = String(value ?? "").trim().match(/^\d+$/);
  return match ? Number(match[0]) : null;
}

function normalizeVerseRow(row, partLabel = null, chapterNumber = null, verseNumber = null) {
  const numericVerseNumber = verseNumber ?? parseNumericVerseNumber(row.verse_number);
  if (numericVerseNumber === null) return null;
  return {
    chapter_number: chapterNumber ?? row.chapter_number,
    verse_number: numericVerseNumber,
    part_label: partLabel,
    english: row.english || "",
    coptic: row.coptic || "",
    arabic: row.arabic || "",
  };
}

async function loadBookKeyByCalendarNumber(bookNum) {
  const { data, error } = await supabase.schema("bible").rpc("get_book_key_by_calendar_number", { p_calendar_number: bookNum });
  if (error) throw new Error(`Unable to resolve book number ${bookNum}: ${error.message}`);
  return data || null;
}

async function getBookKeyByCalendarNumber(bookNum) {
  let cached = bookKeyByCalendarNumberCache.get(bookNum);
  if (!cached) {
    cached = loadBookKeyByCalendarNumber(bookNum);
    bookKeyByCalendarNumberCache.set(bookNum, cached);
  }
  return cached;
}

function isRangeVerse(segment, verse) {
  if (verse.chapter_number < segment.startChapter || verse.chapter_number > segment.endChapter) return false;
  if (verse.chapter_number === segment.startChapter && verse.verse_number < segment.startVerse) return false;
  if (verse.chapter_number === segment.endChapter && verse.verse_number > segment.endVerse) return false;
  return true;
}

async function resolveRangeSegment(segment) {
  const bookKey = await getBookKeyByCalendarNumber(segment.bookNum);
  if (!bookKey) return { book_key: null, verses: [] };

  const { data, error } = await supabase
    .schema("bible")
    .from("verses")
    .select("chapter_number, verse_number, english, coptic, arabic")
    .eq("book_key", bookKey)
    .gte("chapter_number", segment.startChapter)
    .lte("chapter_number", segment.endChapter);
  if (error) throw new Error(`Unable to load reading verses: ${error.message}`);

  const verses = (data || [])
    .map((row) => normalizeVerseRow(row))
    .filter((verse) => verse && isRangeVerse(segment, verse))
    .sort((a, b) => a.chapter_number - b.chapter_number || a.verse_number - b.verse_number);
  return { book_key: bookKey, verses };
}

async function resolveVerseListSegment(segment) {
  const bookKey = await getBookKeyByCalendarNumber(segment.bookNum);
  if (!bookKey) return { book_key: null, verses: [] };

  const plainTokens = segment.verses.filter((token) => !token.partLabel);
  const partTokens = segment.verses
    .map((token, index) => ({ ...token, index }))
    .filter((token) => token.partLabel);
  const plainVerseNumbers = [...new Set(plainTokens.map((token) => String(token.verseNum)))];
  const plainRowsByVerse = new Map();

  if (plainVerseNumbers.length) {
    const { data, error } = await supabase
      .schema("bible")
      .from("verses")
      .select("chapter_number, verse_number, english, coptic, arabic")
      .eq("book_key", bookKey)
      .eq("chapter_number", segment.chapter)
      .in("verse_number", plainVerseNumbers);
    if (error) throw new Error(`Unable to load reading verses: ${error.message}`);
    for (const row of data || []) {
      const verse = normalizeVerseRow(row);
      if (verse) plainRowsByVerse.set(verse.verse_number, verse);
    }
  }

  const partRowsByIndex = new Map(
    (await Promise.all(
      partTokens.map(async (token) => {
        const { data, error } = await supabase.schema("bible").rpc("get_verse_part_by_calendar", {
          p_calendar_book_number: segment.bookNum,
          p_chapter: segment.chapter,
          p_verse: token.verseNum,
          p_part_label: token.partLabel,
        });
        if (error) throw new Error(`Unable to load verse part ${segment.chapter}:${token.verseNum}${token.partLabel}: ${error.message}`);
        const row = (data || [])[0];
        return [token.index, row ? normalizeVerseRow(row, token.partLabel, segment.chapter, token.verseNum) : null];
      }),
    )).filter(([, verse]) => verse),
  );

  const verses = segment.verses
    .map((token, index) => (token.partLabel ? partRowsByIndex.get(index) : plainRowsByVerse.get(token.verseNum)))
    .filter(Boolean);
  return { book_key: bookKey, verses };
}

async function resolveReadingSegment(segment) {
  return segment.kind === "range" ? resolveRangeSegment(segment) : resolveVerseListSegment(segment);
}

export async function resolveBibleReadingReference(reference) {
  const segments = splitReadingReference(reference).map(parseReadingSegment);
  const resolvedSegments = await Promise.all(segments.map(resolveReadingSegment));
  return {
    segments,
    resolvedSegments,
    firstBookNum: segments[0]?.bookNum ?? null,
    verses: resolvedSegments.flatMap((segment) => segment.verses || []),
  };
}
