import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";

const IS_WEB = Platform.OS === "web";
const DISABLED_SELECTION_STYLE = IS_WEB
  ? {
      WebkitTouchCallout: "none",
      WebkitUserSelect: "none",
      userSelect: "none",
    }
  : null;

// The shared verse textStyle carries width:"100%"/flexShrink:1 (meant for
// the full paragraph block) -- applied to a single word in a justified row,
// that stretches the Text to fill the row instead of sizing to the word's
// own content, so the row can't lay multiple whole words out side by side
// (each one individually wraps/breaks instead). This override forces the
// word back to intrinsic (content-driven) sizing; Yoga then measures each
// word's real width itself during actual layout, so justifyContent:
// "space-between" alone produces true word-only justification with no
// pixel math of our own needed at render time.
const WORD_INTRINSIC_STYLE = { width: "auto", flexBasis: "auto", flexShrink: 0, alignSelf: "flex-start" };

function splitWords(text) {
  return String(text || "")
    .split(/\s+/)
    .filter(Boolean);
}

function splitParagraphs(text) {
  return String(text || "").replace(/\r\n?/g, "\n").split("\n");
}

function getLineWordOffsets(lines) {
  let offset = 0;
  return (lines || []).map((line) => {
    const lineOffset = offset;
    offset += line.words.length;
    return lineOffset;
  });
}

/**
 * Greedy line-wrap: pack words left-to-right, each line taking as many
 * words as fit before the next one would overflow `maxWidth` -- the same
 * algorithm every basic text-wrapping engine uses. `spaceWidth` stands in
 * for the natural gap between words; not pixel-identical to how the host
 * platform's own text shaping would join them, but accurate enough to
 * decide *how many* words fit per line, which is all line-breaking needs.
 */
function wrapWordsIntoLines(words, widths, spaceWidth, maxWidth) {
  const lines = [];
  let current = [];
  let currentWidth = 0;

  for (const word of words) {
    const wordWidth = widths.get(word) ?? 0;
    const additional = current.length ? spaceWidth + wordWidth : wordWidth;

    if (current.length && currentWidth + additional > maxWidth) {
      lines.push(current);
      current = [word];
      currentWidth = wordWidth;
    } else {
      current.push(word);
      currentWidth += additional;
    }
  }

  if (current.length) lines.push(current);
  return lines;
}

// ---- Web: synchronous canvas measurement, no extra components at all ----
// canvas.measureText is exact (real font metrics, real kerning) and
// synchronous -- line breaks are known in the same tick as the render that
// needs them, with zero extra mounted Text nodes and zero re-render passes.
// This replaces an earlier design that mounted one hidden, individually
// onLayout-measured Text per word: correct, but for a full document (dozens
// of verses x 3 languages x ~15 words) that meant thousands of extra
// components doing real layout work at once, which was the actual source of
// the slideshow feeling slow -- not the justification math itself.
let sharedCanvasContext = null;
function getCanvasContext() {
  if (!sharedCanvasContext) {
    const canvas = document.createElement("canvas");
    sharedCanvasContext = canvas.getContext("2d");
  }
  return sharedCanvasContext;
}

const canvasWidthCache = new Map();
const MAX_CACHE_ENTRIES = 20000;

function getCanvasFont(fontSize, fontFamily, fontWeight, fontStyle) {
  const families = String(fontFamily || "sans-serif")
    .split(",")
    .map((family) => family.trim())
    .filter(Boolean)
    .map((family) => /^['"].*['"]$/.test(family) ? family : `"${family.replace(/"/g, "\\\"")}"`)
    .join(", ");
  return `${fontStyle || "normal"} ${fontWeight || "400"} ${fontSize}px ${families || "sans-serif"}`;
}

function measureWidthWeb(token, fontSize, fontFamily, fontWeight, fontStyle) {
  const key = `${fontFamily}|${fontSize}|${fontWeight}|${fontStyle}|${token}`;
  const cached = canvasWidthCache.get(key);
  if (cached != null) return cached;

  const ctx = getCanvasContext();
  ctx.font = getCanvasFont(fontSize, fontFamily, fontWeight, fontStyle);
  const measured = ctx.measureText(token).width;

  if (!canvasWidthCache.has(key) && canvasWidthCache.size >= MAX_CACHE_ENTRIES) {
    canvasWidthCache.delete(canvasWidthCache.keys().next().value);
  }
  canvasWidthCache.set(key, measured);
  return measured;
}

// Unicode-codepoint iteration (Array.from/split) would cut a Coptic base
// letter apart from its own combining overline (e.g. "ⲁ̅" = U+2C81 + U+0305)
// mid-character. Intl.Segmenter's grapheme granularity keeps every such pair
// together -- the same unit the CSS overflow-wrap/word-break spec requires a
// browser to treat as unbreakable, so chunking on the same boundaries here
// keeps this measurement consistent with what word-break:"break-word" (see
// VerseBlock.js's textStyle) will actually render.
function getGraphemes(text) {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (entry) => entry.segment);
  }
  return Array.from(text);
}

// A single "word" (no internal whitespace) wider than the whole column --
// routine for Coptic at larger font sizes in a narrow phone-width column --
// still has to land somewhere: the browser's own word-break:"break-word"
// (see VerseBlock.js) hard-breaks it at a grapheme boundary once it runs out
// of room. wrapWordsIntoLines alone never breaks within a word, so without
// this a verse containing one such word was measured as a single
// (impossibly wide) line while the browser silently rendered it as several
// -- undercounting that verse's real line/height needs and, for a verse
// split across slides, potentially budgeting room for a segment that
// doesn't actually fit.
function splitOverwidthWord(word, maxWidth, fontSize, fontFamily, fontWeight, fontStyle) {
  const graphemes = getGraphemes(word);
  const chunks = [];
  let current = "";

  for (const grapheme of graphemes) {
    const candidate = current + grapheme;
    if (current && measureWidthWeb(candidate, fontSize, fontFamily, fontWeight, fontStyle) > maxWidth) {
      chunks.push(current);
      current = grapheme;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function computeParagraphLinesWeb(words, fontSize, fontFamily, fontWeight, fontStyle, maxWidth) {
  const widths = new Map();
  for (const word of words) {
    if (!widths.has(word)) widths.set(word, measureWidthWeb(word, fontSize, fontFamily, fontWeight, fontStyle));
  }

  const expandedWords = words.flatMap((word) => {
    const width = widths.get(word);
    if (width <= maxWidth) return [word];

    const chunks = splitOverwidthWord(word, maxWidth, fontSize, fontFamily, fontWeight, fontStyle);
    chunks.forEach((chunk) => {
      if (!widths.has(chunk)) widths.set(chunk, measureWidthWeb(chunk, fontSize, fontFamily, fontWeight, fontStyle));
    });
    return chunks;
  });

  const spaceWidth = measureWidthWeb(" ", fontSize, fontFamily, fontWeight, fontStyle);
  return wrapWordsIntoLines(expandedWords, widths, spaceWidth, maxWidth);
}

function computeLinesWeb(text, fontSize, fontFamily, fontWeight, fontStyle, maxWidth) {
  return splitParagraphs(text).flatMap((paragraph) => {
    const words = splitWords(paragraph);
    if (!words.length) {
      return [{ words: [], isBlank: true, isParagraphEnd: true }];
    }
    const lines = computeParagraphLinesWeb(words, fontSize, fontFamily, fontWeight, fontStyle, maxWidth);
    return lines.map((lineWords, index) => ({
      words: lineWords,
      isParagraphEnd: index === lines.length - 1,
    }));
  });
}

// Web-only line measurement for text that is NOT rendered through this
// component -- namely VerseBlock.js's plain-Text justified path, which uses
// real CSS text-align:justify (cheaper and more accurate than this
// component's synthetic per-word Flexbox reconstruction, see useCssJustify in
// VerseBlock.js) and so never mounts JustifiedText/gets onLines at all.
// react-native-web's Text has no onTextLayout equivalent (confirmed: no
// occurrence anywhere in the package), so without this, slideshow pagination
// has literally no way to learn real line breaks for web verse text and
// always falls back to rough character-count estimation for every tall-verse
// split -- this reuses the same canvas measurement this component's own web
// path already relies on, just exposed standalone.
export function measureJustifiedLinesWeb(text, fontSize, fontFamily, maxWidth, fontWeight = "400", fontStyle = "normal") {
  if (!IS_WEB) return null;
  if (!String(text || "").length) return [];
  return computeLinesWeb(text, fontSize, fontFamily, fontWeight, fontStyle, maxWidth).map((line) => ({
    text: line.words.join(" "),
    isBlank: Boolean(line.isBlank),
    isParagraphEnd: Boolean(line.isParagraphEnd),
  }));
}

// ---- Native: one hidden Text per paragraph (not per word) ----
// iOS/Android's own text engine already computes line breaks for a normally
// wrapped Text and reports them for free via onTextLayout -- one native
// layout pass per paragraph, the same mechanism the plain (non-justified)
// verse path already relies on for tall-verse splitting, just reused here
// instead of re-deriving breaks from individually measured words.
//
// Verse text is rendered twice in the slideshow pipeline -- once off-screen
// for pagination measurement, then again on-screen for the actual slide --
// so a module-level cache keyed by everything that affects line breaks lets
// the second (visible) render skip straight to the already-known result
// instead of paying for another native layout pass and visibly flashing
// plain-then-justified.
const nativeLineCache = new Map();
const MAX_NATIVE_CACHE_ENTRIES = 2000;

function nativeLineCacheKey(text, fontSize, fontFamily, fontWeight, fontStyle, width) {
  return `${fontFamily}|${fontSize}|${fontWeight}|${fontStyle}|${width}|${text}`;
}

function annotateNativeLines(nativeLines, text) {
  const paragraphs = splitParagraphs(text).map(splitWords);
  let paragraphIndex = 0;
  let wordsInParagraph = 0;

  return nativeLines.map((line, lineIndex) => {
    const words = splitWords(line.text);
    while (paragraphIndex < paragraphs.length && paragraphs[paragraphIndex].length === 0) {
      if (!words.length) {
        paragraphIndex += 1;
        return { words: [], isBlank: true, isParagraphEnd: true };
      }
      paragraphIndex += 1;
    }

    wordsInParagraph += words.length;
    const paragraphWordCount = paragraphs[paragraphIndex]?.length || 0;
    const isParagraphEnd =
      paragraphIndex >= paragraphs.length - 1 ||
      wordsInParagraph >= paragraphWordCount ||
      lineIndex === nativeLines.length - 1;

    if (isParagraphEnd) {
      paragraphIndex += 1;
      wordsInParagraph = 0;
    }

    return { words, isParagraphEnd };
  });
}

function useNativeLines(text, style, fontSize, fontFamily, fontWeight, fontStyle, width) {
  const cacheKey = nativeLineCacheKey(text, fontSize, fontFamily, fontWeight, fontStyle, width);
  const [state, setState] = useState(null); // { forKey, lines }
  const cached = nativeLineCache.get(cacheKey);
  const lines = cached ?? (state && state.forKey === cacheKey ? state.lines : null);

  function handleTextLayout(event) {
    const nativeLines = event.nativeEvent.lines || [];
    const computed = annotateNativeLines(nativeLines, text);
    if (!nativeLineCache.has(cacheKey) && nativeLineCache.size >= MAX_NATIVE_CACHE_ENTRIES) {
      nativeLineCache.delete(nativeLineCache.keys().next().value);
    }
    nativeLineCache.set(cacheKey, computed);
    setState({ forKey: cacheKey, lines: computed });
  }

  const isMeasuring = lines == null;
  const measuringNode = isMeasuring ? (
    <Text
      // Keep the probe invisible but in normal layout flow. The slideshow's
      // outer measurement wrapper also receives this first layout pass; an
      // absolutely positioned probe made that wrapper report only its cell
      // padding, so long verses were cached as a few pixels tall and then
      // clipped when their real text replaced the probe.
      style={[style, { opacity: 0, width }]}
      onTextLayout={handleTextLayout}
    >
      {text}
    </Text>
  ) : null;

  return { lines, isMeasuring, measuringNode };
}

/**
 * React Native's own textAlign:"justify" has no equivalent to CSS's
 * text-justify:"inter-word" -- native justification (iOS's
 * NSTextAlignment.justified, and historically absent on Android) stretches
 * tracking between individual LETTERS too, not just the gaps between words,
 * which reads as broken type. This reproduces true word-only justification
 * with nothing but Flexbox: once a paragraph's line breaks are known (via
 * canvas measurement on web, native onTextLayout elsewhere), every line
 * except the last renders as a justifyContent:"space-between" row of
 * per-word Text nodes -- Yoga distributes the leftover width between words
 * automatically, exactly matching what a browser's own justify engine does.
 * The final line of a paragraph is never stretched, matching standard
 * typographic convention (and CSS's own justify behavior).
 *
 * `firstWordStyle`, if given, is merged onto just the very first word (e.g.
 * to color a leading Bible verse-number gold) -- the verse number is
 * expected to already be part of `text` (as its own leading "word",
 * separated by a space), not passed separately, so it naturally
 * participates in wrapping and justification like any other word.
 *
 * `forceLines`, if given (the exact `{ text }[]` shape this component's own
 * `onLines` reports), skips wrapping entirely and renders precisely those
 * lines instead of re-deriving line breaks from `text`. This is what makes
 * slideshow mode's tall-verse splitting safe: pagination decides how many of
 * THIS component's own already-measured lines fit in the space left on a
 * slide, slices that exact array, and hands it back here for the actual
 * segment -- rather than joining the sliced lines' text back into one blob
 * and asking a fresh instance to re-wrap it, which can legitimately wrap
 * differently the second time (a shorter string can break at different word
 * boundaries than the original did), silently desyncing what pagination
 * measured from what actually renders. See SlideshowContainer.js's
 * appendTallVerseSegments.
 */
export default function JustifiedText({
  text,
  style,
  fontSize,
  fontFamily,
  fontWeight = "400",
  fontStyle = "normal",
  width,
  rtl = false,
  firstWordStyle,
  wordStyles,
  onLayout,
  onLines,
  forceLines,
  minWordsToJustify = 5,
  selectable = false,
}) {
  const fallbackAlign = rtl ? "right" : "left";
  const reportedLinesForRef = useRef(null);

  const webLines = useMemo(
    () => (IS_WEB && !forceLines
      ? computeLinesWeb(text, fontSize, fontFamily, fontWeight, fontStyle, width)
      : null),
    [text, fontSize, fontFamily, fontWeight, fontStyle, width, forceLines],
  );
  // Always called (never skipped), even when its result goes unused (web,
  // or forceLines supplied) -- calling a hook conditionally is a
  // Rules-of-Hooks violation regardless of whether the branch it feeds ever
  // actually runs.
  const native = useNativeLines(text, style, fontSize, fontFamily, fontWeight, fontStyle, width);

  const forcedLines = useMemo(
    () => (forceLines ? forceLines.map((line) => ({
      words: splitWords(line.text),
      isBlank: Boolean(line.isBlank),
      isParagraphEnd: Boolean(line.isParagraphEnd),
    })) : null),
    [forceLines],
  );
  const lines = forcedLines ?? (IS_WEB ? webLines : native.lines);
  const lineWordOffsets = useMemo(() => getLineWordOffsets(lines), [lines]);

  const reportKey = `${fontFamily}|${fontSize}|${fontWeight}|${fontStyle}|${width}|${text}`;
  const reportableLines = useMemo(
    () => lines?.map((line) => ({
      text: line.words.join(" "),
      isBlank: Boolean(line.isBlank),
      isParagraphEnd: Boolean(line.isParagraphEnd),
    })),
    [lines],
  );

  useEffect(() => {
    if (!reportableLines || !onLines || forceLines || reportedLinesForRef.current === reportKey) return;
    reportedLinesForRef.current = reportKey;
    onLines(reportableLines);
  }, [forceLines, onLines, reportKey, reportableLines]);

  if (!forceLines && !IS_WEB && native.isMeasuring) {
    // The invisible measuring Text stays in flow so its parent reports the
    // real paragraph height on this first pass. We still wait for
    // onTextLayout before reporting language lines; that second metric gives
    // pagination exact split boundaries without ever caching a zero-height
    // verse first.
    return (
      <View style={{ width }}>
        {native.measuringNode}
      </View>
    );
  }

  const lastIndex = lines.length - 1;
  const firstContentLineIndex = lines.findIndex((line) => line.words.length);
  const selectionStyle = selectable ? null : DISABLED_SELECTION_STYLE;

  return (
    <View style={[{ width }, selectionStyle]} onLayout={onLayout}>
      {lines.map((line, index) => {
        const lineWords = line.words;
        const isFirstLine = index === firstContentLineIndex;
        const isLastLine = index === lastIndex || line.isParagraphEnd;

        if (line.isBlank) {
          return (
            <Text key={index} selectable={selectable} style={[style, selectionStyle, { textAlign: fallbackAlign }]}>
              {"\u00a0"}
            </Text>
          );
        }

        if (isLastLine || lineWords.length < minWordsToJustify) {
          const needsRichWords = Boolean(firstWordStyle && isFirstLine) || Boolean(wordStyles);
          return (
            <Text key={index} selectable={selectable} style={[style, selectionStyle, { textAlign: fallbackAlign }]}>
              {needsRichWords ? lineWords.map((word, wordIndex) => {
                const globalWordIndex = lineWordOffsets[index] + wordIndex;
                return (
                  <Text
                    key={wordIndex}
                    selectable={selectable}
                    style={[
                      isFirstLine && wordIndex === 0 ? firstWordStyle : null,
                      wordStyles?.[globalWordIndex],
                    ]}
                  >
                    {wordIndex ? ` ${word}` : word}
                  </Text>
                );
              }) : lineWords.join(" ")}
            </Text>
          );
        }

        return (
          <View
            key={index}
            style={{
              flexDirection: rtl ? "row-reverse" : "row",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            {lineWords.map((word, wordIndex) => (
              <Text
                key={wordIndex}
                selectable={selectable}
                style={
                  [
                    style,
                    WORD_INTRINSIC_STYLE,
                    selectionStyle,
                    isFirstLine && wordIndex === 0 ? firstWordStyle : null,
                    wordStyles?.[lineWordOffsets[index] + wordIndex],
                  ]
                }
              >
                {word}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}
