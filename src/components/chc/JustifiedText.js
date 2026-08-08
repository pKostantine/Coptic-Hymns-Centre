import { useMemo, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";

const IS_WEB = Platform.OS === "web";

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

function computeLinesWeb(words, fontSize, fontFamily, maxWidth) {
  const widths = new Map();
  for (const word of words) {
    if (!widths.has(word)) widths.set(word, measureWidthWeb(word, fontSize, fontFamily));
  }
  const spaceWidth = measureWidthWeb(" ", fontSize, fontFamily);
  return wrapWordsIntoLines(words, widths, spaceWidth, maxWidth);
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
 */
export default function JustifiedText({ text, style, fontSize, fontFamily, width, rtl = false, firstWordStyle, onLayout, onLines }) {
  const words = useMemo(() => splitWords(text), [text]);
  const fallbackAlign = rtl ? "right" : "left";
  const reportedLinesForRef = useRef(null);

  const webLines = useMemo(
    () => (IS_WEB ? computeLinesWeb(words, fontSize, fontFamily, width) : null),
    [words, fontSize, fontFamily, width],
  );
  // Always called (never skipped), even on web where its result goes
  // unused -- Platform.OS itself never changes within a running app, but
  // calling a hook conditionally is still a Rules-of-Hooks violation.
  const native = useNativeLines(text, style, fontSize, fontFamily, width);

  const lines = IS_WEB ? webLines : native.lines;

  if (lines && onLines && reportedLinesForRef.current !== text) {
    reportedLinesForRef.current = text;
    onLines(lines.map((lineWords) => ({ text: lineWords.join(" ") })));
  }

  if (!IS_WEB && native.isMeasuring) {
    return (
      <View style={{ width }} onLayout={onLayout}>
        {native.measuringNode}
      </View>
    );
  }

  const lastIndex = lines.length - 1;

  return (
    <View style={{ width }} onLayout={onLayout}>
      {lines.map((lineWords, index) => {
        const isFirstLine = index === 0;
        const isLastLine = index === lastIndex;

        if (isLastLine || lineWords.length <= 1) {
          return (
            <Text key={index} style={[style, { textAlign: fallbackAlign }]}>
              {isFirstLine && firstWordStyle && lineWords.length === 1 ? (
                <Text style={firstWordStyle}>{lineWords[0]}</Text>
              ) : (
                lineWords.join(" ")
              )}
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
                style={
                  isFirstLine && wordIndex === 0 && firstWordStyle
                    ? [style, WORD_INTRINSIC_STYLE, firstWordStyle]
                    : [style, WORD_INTRINSIC_STYLE]
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
