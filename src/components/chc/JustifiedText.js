import { useMemo, useRef, useState } from "react";
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

function measureWidthWeb(token, fontSize, fontFamily) {
  const key = `${fontFamily}|${fontSize}|${token}`;
  const cached = canvasWidthCache.get(key);
  if (cached != null) return cached;

  const ctx = getCanvasContext();
  ctx.font = `${fontSize}px ${fontFamily}`;
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
function splitOverwidthWord(word, maxWidth, fontSize, fontFamily) {
  const graphemes = getGraphemes(word);
  const chunks = [];
  let current = "";

  for (const grapheme of graphemes) {
    const candidate = current + grapheme;
    if (current && measureWidthWeb(candidate, fontSize, fontFamily) > maxWidth) {
      chunks.push(current);
      current = grapheme;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function computeLinesWeb(words, fontSize, fontFamily, maxWidth) {
  const widths = new Map();
  for (const word of words) {
    if (!widths.has(word)) widths.set(word, measureWidthWeb(word, fontSize, fontFamily));
  }

  const expandedWords = words.flatMap((word) => {
    const width = widths.get(word);
    if (width <= maxWidth) return [word];

    const chunks = splitOverwidthWord(word, maxWidth, fontSize, fontFamily);
    chunks.forEach((chunk) => {
      if (!widths.has(chunk)) widths.set(chunk, measureWidthWeb(chunk, fontSize, fontFamily));
    });
    return chunks;
  });

  const spaceWidth = measureWidthWeb(" ", fontSize, fontFamily);
  return wrapWordsIntoLines(expandedWords, widths, spaceWidth, maxWidth);
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
export function measureJustifiedLinesWeb(text, fontSize, fontFamily, maxWidth) {
  if (!IS_WEB) return null;
  const words = splitWords(text);
  if (!words.length) return [];
  return computeLinesWeb(words, fontSize, fontFamily, maxWidth).map((lineWords) => ({
    text: lineWords.join(" "),
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

function nativeLineCacheKey(text, fontSize, fontFamily, width) {
  return `${fontFamily}|${fontSize}|${width}|${text}`;
}

function useNativeLines(text, style, fontSize, fontFamily, width) {
  const cacheKey = nativeLineCacheKey(text, fontSize, fontFamily, width);
  const [state, setState] = useState(null); // { forKey, lines }
  const cached = nativeLineCache.get(cacheKey);
  const lines = cached ?? (state && state.forKey === cacheKey ? state.lines : null);

  function handleTextLayout(event) {
    const nativeLines = event.nativeEvent.lines || [];
    const computed = nativeLines.map((line) => splitWords(line.text));
    if (!nativeLineCache.has(cacheKey) && nativeLineCache.size >= MAX_NATIVE_CACHE_ENTRIES) {
      nativeLineCache.delete(nativeLineCache.keys().next().value);
    }
    nativeLineCache.set(cacheKey, computed);
    setState({ forKey: cacheKey, lines: computed });
  }

  const isMeasuring = lines == null;
  const measuringNode = isMeasuring ? (
    <Text
      style={[style, { position: "absolute", opacity: 0, width }]}
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
  width,
  rtl = false,
  firstWordStyle,
  onLayout,
  onLines,
  forceLines,
  minWordsToJustify = 5,
  selectable = false,
}) {
  const words = useMemo(() => splitWords(text), [text]);
  const fallbackAlign = rtl ? "right" : "left";
  const reportedLinesForRef = useRef(null);

  const webLines = useMemo(
    () => (IS_WEB && !forceLines ? computeLinesWeb(words, fontSize, fontFamily, width) : null),
    [words, fontSize, fontFamily, width, forceLines],
  );
  // Always called (never skipped), even when its result goes unused (web,
  // or forceLines supplied) -- calling a hook conditionally is a
  // Rules-of-Hooks violation regardless of whether the branch it feeds ever
  // actually runs.
  const native = useNativeLines(text, style, fontSize, fontFamily, width);

  const forcedLines = useMemo(
    () => (forceLines ? forceLines.map((line) => splitWords(line.text)) : null),
    [forceLines],
  );
  const lines = forcedLines ?? (IS_WEB ? webLines : native.lines);

  const reportKey = `${fontFamily}|${fontSize}|${width}|${text}`;
  if (lines && onLines && !forceLines && reportedLinesForRef.current !== reportKey) {
    reportedLinesForRef.current = reportKey;
    onLines(lines.map((lineWords) => ({ text: lineWords.join(" ") })));
  }

  if (!forceLines && !IS_WEB && native.isMeasuring) {
    // No onLayout here (deliberately -- see native.measuringNode's own
    // definition): the measuring node is absolutely positioned and
    // contributes ~0 to this View's height, so calling onLayout now would
    // report a bogus near-zero height for this language before its real
    // content (and onTextLayout's line data, reported below once measuring
    // finishes) ever exists. SlideshowContainer.js's pagination distinguishes
    // "no lines because this metric doesn't need them" from "lines not in
    // yet" purely by whether a metric was reported at all -- a premature
    // height-only report here would satisfy that check too early, unmounting
    // this item from the off-screen measurement layer before its line data
    // arrives and silently falling back to much-less-accurate
    // character-count estimation for tall-verse splitting.
    return (
      <View style={{ width }}>
        {native.measuringNode}
      </View>
    );
  }

  const lastIndex = lines.length - 1;
  const selectionStyle = selectable ? null : DISABLED_SELECTION_STYLE;

  return (
    <View style={[{ width }, selectionStyle]} onLayout={onLayout}>
      {lines.map((lineWords, index) => {
        const isFirstLine = index === 0;
        const isLastLine = index === lastIndex;

        if (isLastLine || lineWords.length < minWordsToJustify) {
          return (
            <Text key={index} selectable={selectable} style={[style, selectionStyle, { textAlign: fallbackAlign }]}>
              {isFirstLine && firstWordStyle && lineWords.length ? (
                <>
                  <Text selectable={selectable} style={firstWordStyle}>{lineWords[0]}</Text>
                  {lineWords.length > 1 ? ` ${lineWords.slice(1).join(" ")}` : ""}
                </>
              ) : lineWords.join(" ")}
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
                  isFirstLine && wordIndex === 0 && firstWordStyle
                    ? [style, WORD_INTRINSIC_STYLE, selectionStyle, firstWordStyle]
                    : [style, WORD_INTRINSIC_STYLE, selectionStyle]
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
