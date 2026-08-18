import { useMemo, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { COLORS, SPACING, TYPOGRAPHY } from "../../constants/theme";
import { formatEnglishDisplayText } from "../../utils/displayText";
import { resolveRubricKey } from "../../utils/verseRubric";
import JustifiedText, { measureJustifiedLinesWeb } from "./JustifiedText";

const REFRAIN_TAN = "#9FFFD0";
const COMMENT_GREEN = "#8FD19E";
const LIGHT_YELLOW = "#FFFF00";
const SILENT_PRAYER_GRAY = "#C5CBD2";

export default function VerseBlock({
  verse,
  index,
  visibleLanguages,
  fontSize,
  theme,
  columnWidth,
  tableWidth,
  onLanguageLayout,
  isRecitedPrayer = false,
  isReading = false,
  forceWhiteText = false,
  colorIndex,
  suppressSpeakerLabel = false,
  selectableText = false,
  bishopPresent = false,
}) {
  const isRefrainLabel = verse.type === "refrainLabel";
  const isReadingReference = verse.type === "readingReference";
  const isRefrain = verse.type === "refrain";
  const isComment = isCommentVerseType(verse.type);
  const isSilentPrayer = isSilentPrayerVerse(verse);
  // Who actually said this line, independent of `type` — a Silent/Recited
  // Prayer or Refrain line's `type` collapses to that prayer type and loses
  // the underlying speaker, so the rubric label/color falls back to the
  // preserved personRole instead (see resolvePersonRole in hymnLibrary.js).
  const rubricType = verse.personRole || verse.type;
  const isSeasonalHoosVerse = Boolean(verse.seasonalHoosVersePrefix);
  const rowTextColor =
    isComment
      ? COMMENT_GREEN
      : isSilentPrayer
      ? SILENT_PRAYER_GRAY
      : isRefrainLabel || isRefrain
      ? REFRAIN_TAN
      : isReadingReference
      ? COLORS.comment
      : // "White"/"Blue" prayer_type forces that alternating color directly on
      // this one verse — surrounding verses alternate exactly as if it
      // weren't there (see getEffectiveAlternatingVerseIndex in
      // SlideshowContainer.js, which excludes it from the parity count).
      verse.prayerType === "White"
      ? theme.colors.text
      : verse.prayerType === "Blue"
      ? theme.colors.rowBlue
      : forceWhiteText || verse.forceWhiteText || isRefrain || isRecitedPrayer || isReading || (colorIndex ?? index) % 2 === 0
      ? theme.colors.text
      : theme.colors.rowBlue;
  const copticFontSize = Math.round(fontSize * 1.25);
  const titleFontSize = Math.max(Math.round(fontSize * 0.5), 11);
  const titleLineHeight = Math.max(Math.round(fontSize * 0.7), 15);
  const hasSeasonalPrefixLine = doesVerseHaveSeasonalPrefixLine(verse);
  const rowLanguages = (verse.invincibleCoptic
    ? [
        {
          key: "coptic",
          text: formatCopticNumbers(verse.coptic, verse.preserveCopticDigits),
          seasonalHoosVersePrefixSpacer: "",
          fontSize: isRefrainLabel ? titleFontSize : copticFontSize,
          fontFamily: TYPOGRAPHY.coptic,
          lineHeight:
            isRefrainLabel
              ? titleLineHeight
              : Math.round(copticFontSize * 1),
          styles: [styles.coptic],
          // Invincible Coptic never has parallel English/Arabic text to
          // justify against — it should always read centered in its column,
          // not just when centeredAcrossPage happens to also be set.
          textAlign: "center",
        },
      ]
    : [
        {
          key: "english",
          speakerLabel: suppressSpeakerLabel ? "" : getSpeakerLabel(rubricType, "english", bishopPresent),
          text: formatEnglishDisplayText(verse.english),
          bibleVerseNumber: verse.bibleVerseNumber,
          seasonalHoosVersePrefix: verse.seasonalHoosVersePrefix,
          fontSize: isRefrainLabel ? titleFontSize : fontSize,
          fontFamily: "Georgia",
          lineHeight:
            isRefrainLabel
              ? titleLineHeight
              : Math.round(fontSize * 1.25),
          styles: [styles.english],
          textAlign: isRefrainLabel || isReadingReference ? "center" : "justify",
          forceLines: verse.slideshowForcedLines?.english,
        },
        {
          key: "coptic",
          text: formatCopticNumbers(verse.coptic, verse.preserveCopticDigits),
          bibleVerseNumber: verse.bibleVerseNumber,
          seasonalHoosVersePrefixSpacer: hasSeasonalPrefixLine
            ? verse.seasonalHoosVersePrefix
            : "",
          fontSize: isRefrainLabel ? titleFontSize : copticFontSize,
          fontFamily: TYPOGRAPHY.coptic,
          lineHeight:
            isRefrainLabel
              ? titleLineHeight
              : Math.round(copticFontSize * 1),
          styles: [styles.coptic],
          textAlign: isRefrainLabel || isReadingReference ? "center" : "justify",
          forceLines: verse.slideshowForcedLines?.coptic,
        },
        {
          key: "arabic",
          speakerLabel: suppressSpeakerLabel ? "" : getSpeakerLabel(rubricType, "arabic", bishopPresent),
          text: formatArabicNumbers(verse.arabic),
          bibleVerseNumber: verse.bibleVerseNumber,
          seasonalHoosVersePrefix: formatArabicNumbers(verse.seasonalHoosVersePrefix),
          fontSize:
            isRefrainLabel
              ? titleFontSize
              : Math.round(fontSize * 1.15),
          fontFamily: "Arial",
          lineHeight:
            isRefrainLabel
              ? titleLineHeight
              : Math.round(fontSize * 1.25),
          styles: [styles.arabic],
          textAlign: isRefrainLabel || isReadingReference ? "center" : "justify",
          forceLines: verse.slideshowForcedLines?.arabic,
        },
      ]).filter((language) => {
    // A language column collapses per verse (not per whole hymn) whenever
    // this specific verse has no text in it — matching documentHtml.ts's
    // scroll-mode behavior exactly, so a Coptic-less verse (e.g. a
    // Reader-labeled verse with no Coptic in the DB) doesn't reserve a
    // blank column here while correctly dropping it in scroll mode.
    if (verse.invincibleCoptic) return true;

    // A verse split across multiple slides (see appendTallVerseSegments in
    // SlideshowContainer.js) can have a language finish its own lines on an
    // earlier segment while others still have more to show — that language's
    // text is legitimately blank on this later segment, but the column must
    // stay in the layout anyway (just empty) rather than collapse: dropping
    // it would reshape the row from e.g. 3 columns to 2 and back again
    // segment-to-segment, which reads as the remaining columns visibly
    // shifting/splitting apart.
    const isPartOfSplitVerse = Array.isArray(verse.slideshowLanguageKeys);
    if (isPartOfSplitVerse && verse.slideshowLanguageKeys.includes(language.key)) return true;

    if (language.key === "coptic") {
      const copticHiddenByToggle =
        isRecitedPrayer && !visibleLanguages.copticRecitedPrayers && !verse.forceCopticVisible;
      if (copticHiddenByToggle) return false;
      if (!visibleLanguages.coptic && !verse.forceCopticVisible) return false;
      return Boolean(language.text && language.text.trim());
    }

    if (!visibleLanguages[language.key]) return false;
    return Boolean((language.text && language.text.trim()) || language.speakerLabel);
  });
  const rowColumnWidth = tableWidth / Math.max(rowLanguages.length, 1);
  const isCenteredAcrossPage = Boolean(verse.centeredAcrossPage);
  const hasSpeakerLabel = rowLanguages.some((language) => language.speakerLabel);

  function reportLanguageMetric(language, metric) {
    onLanguageLayout?.(language, metric);
  }

  return (
    <View style={styles.row}>
      {rowLanguages.map((language) => {
        const isJustified = language.textAlign === "justify";
        // On web, react-native-web renders straight to real DOM/CSS, so the
        // browser's own text-align:justify already does true word-only
        // justification as long as text-justify:inter-word rides along (see
        // styles.text below) -- exactly the mechanism scroll mode's WebView
        // already uses. Only native (iOS/Android) needs the synthetic
        // per-word-Flexbox reconstruction in JustifiedText, since RN's own
        // native justify stretches letter tracking too. Routing web through
        // the plain single-Text path instead keeps it exactly as cheap as
        // every non-justified verse -- no extra components, no per-word
        // layout -- which is also why it's the fast path worth preferring
        // whenever it's actually correct to use.
        const useCssJustify = isJustified && Platform.OS === "web";
        const textStyle = [
          styles.text,
          ...language.styles,
          {
            color: rowTextColor,
            fontFamily: language.fontFamily,
            fontSize: language.fontSize,
            fontStyle: isComment || isRefrain || isRefrainLabel || verse.italic ? "italic" : "normal",
            fontWeight: isReadingReference ? "800" : isRefrainLabel || isRefrain ? "500" : "400",
            letterSpacing: 0,
            lineHeight: language.lineHeight,
            ...(Platform.OS === "web"
              ? {
                  overflowWrap: "break-word",
                  wordBreak: "break-word",
                }
              : null),
          },
        ];

        return (
          <View
            key={language.key}
            style={[
              styles.cell,
              isSeasonalHoosVerse && styles.seasonalHoosCell,
              isCenteredAcrossPage && styles.centeredCell,
              language.key === "coptic" && hasSpeakerLabel
                ? { paddingTop: SPACING.sm + language.lineHeight }
                : null,
              { flexBasis: rowColumnWidth, maxWidth: rowColumnWidth },
            ]}
          >
            {language.speakerLabel ? (
              <Text style={[textStyle, { textAlign: getSafeTextAlign(language), color: getSpeakerColor(rubricType, bishopPresent) }]}>
                {language.speakerLabel}
              </Text>
            ) : null}
            {isJustified && !useCssJustify ? (
              <JustifiedVerseBody
                language={language}
                textStyle={textStyle}
                selectableText={selectableText}
                columnWidth={rowColumnWidth - SPACING.xs * 2}
                forceLines={language.forceLines}
                onMetric={(metric) => reportLanguageMetric(language.key, metric)}
              />
            ) : (
              <>
                {useCssJustify ? (
                  <CssJustifiedLinesReporter
                    text={getJustifiedBodyText(language)}
                    fontSize={language.fontSize}
                    fontFamily={language.fontFamily}
                    width={rowColumnWidth - SPACING.xs * 2}
                    onLines={(lines) => reportLanguageMetric(language.key, { lines })}
                  />
                ) : null}
                <Text
                  selectable={selectableText}
                  style={[...textStyle, { textAlign: useCssJustify ? "justify" : getSafeTextAlign(language) }]}
                  onLayout={(event) =>
                    reportLanguageMetric(language.key, {
                      height: event.nativeEvent.layout.height,
                    })
                  }
                  onTextLayout={(event) =>
                    reportLanguageMetric(language.key, {
                      lines: event.nativeEvent.lines || [],
                    })
                  }
                >
                  {renderLanguageText(language)}
                </Text>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * The synthetic (per-word Flexbox) justified render path — only reached on
 * native (see useCssJustify above; web gets true CSS justify through the
 * plain Text path instead, Metropolitan highlighting included, at no extra
 * cost). Still renders a seasonal Hoos prefix line (own line, untouched by
 * justification, exactly like the plain path) ahead of the actual justified
 * body.
 *
 * Metropolitan-bracket highlighting (see documentHtml.ts's
 * highlightMetropolitanBrackets) is intentionally not reproduced here — it's
 * a rare, purely cosmetic color accent, and correctly preserving it would
 * mean tracking highlighted character ranges across words that a real line
 * break can land in the middle of; not worth the risk of a subtly wrong
 * split for how rarely it fires. It's unaffected everywhere else (scroll
 * mode, and every non-justified slideshow verse type).
 */
function JustifiedVerseBody({ language, textStyle, selectableText, columnWidth, forceLines, onMetric }) {
  const parts = getSeasonalHoosPrefixParts(language.text, language.seasonalHoosVersePrefix);
  const prefixStyle = getSeasonalHoosPrefixStyle(language.fontSize);
  const bibleVerseNumber = formatBibleVerseNumber(language.bibleVerseNumber, language.key);

  let prefixNode = null;

  if (parts) {
    prefixNode = <Text style={[prefixStyle, { color: REFRAIN_TAN }]}>{parts.prefix}</Text>;
  } else if (language.seasonalHoosVersePrefixSpacer) {
    prefixNode = (
      <Text style={[prefixStyle, { color: "transparent" }]}>{language.seasonalHoosVersePrefixSpacer}</Text>
    );
  }

  const fullText = getJustifiedBodyText(language);

  return (
    <>
      {prefixNode}
      <JustifiedText
        text={fullText}
        style={textStyle}
        fontSize={language.fontSize}
        fontFamily={language.fontFamily}
        width={columnWidth}
        rtl={language.key === "arabic"}
        firstWordStyle={bibleVerseNumber ? { color: COLORS.gold } : null}
        forceLines={forceLines}
        onLayout={(event) => onMetric({ height: event.nativeEvent.layout.height })}
        onLines={(lines) => onMetric({ lines })}
      />
    </>
  );
}

// The exact text a justified paragraph body wraps -- verse number prepended,
// seasonal Hoos prefix excluded (it renders on its own line, never part of
// the justified body; see JustifiedVerseBody's prefixNode). Shared between
// JustifiedVerseBody (native's real render+measurement) and
// CssJustifiedLinesReporter (web's measurement-only shadow of the same text)
// so the two platforms measure identically-derived input.
function getJustifiedBodyText(language) {
  const parts = getSeasonalHoosPrefixParts(language.text, language.seasonalHoosVersePrefix);
  const bodyText = parts ? parts.body : language.text;
  const bibleVerseNumber = formatBibleVerseNumber(language.bibleVerseNumber, language.key);
  return bibleVerseNumber ? `${bibleVerseNumber} ${bodyText}` : bodyText;
}

// Web's justified verse text renders as a single plain CSS
// text-align:"justify" Text (see useCssJustify above) rather than through
// JustifiedText, so it never mounts anything that measures real line breaks
// -- and react-native-web's Text has no onTextLayout equivalent at all, so
// there is no native fallback either. Without this, SlideshowContainer.js's
// tall-verse splitter has no real line data to work with on web and always
// falls back to rough character-count estimation, which is what produces
// visibly wrong splits (mid-word breaks, misjudged capacity) and wasted
// slide space. This renders nothing -- it exists purely to compute the same
// canvas-based line breaks JustifiedText already uses on web and report them
// up through the same onLanguageLayout/onMetric channel real measurement
// uses, so pagination gets accurate data without changing what's actually
// painted on screen.
function CssJustifiedLinesReporter({ text, fontSize, fontFamily, width, onLines }) {
  const reportedForRef = useRef(null);
  const lines = useMemo(
    () => measureJustifiedLinesWeb(text, fontSize, fontFamily, width),
    [text, fontSize, fontFamily, width],
  );

  if (lines && reportedForRef.current !== text) {
    reportedForRef.current = text;
    onLines(lines);
  }

  return null;
}

function renderLanguageText(language) {
  const parts = getSeasonalHoosPrefixParts(language.text, language.seasonalHoosVersePrefix);
  const prefixStyle = getSeasonalHoosPrefixStyle(language.fontSize);
  const bibleVerseNumber = formatBibleVerseNumber(
    language.bibleVerseNumber,
    language.key,
  );

  if (!parts) {
    if (language.seasonalHoosVersePrefixSpacer) {
      return (
        <>
          <Text style={[prefixStyle, { color: "transparent" }]}>
            {language.seasonalHoosVersePrefixSpacer}
          </Text>
          {"\n"}
          {language.text}
        </>
      );
    }

    return renderTextWithBibleVerseNumber(language.text, bibleVerseNumber);
  }

  return (
    <>
      <Text style={[prefixStyle, { color: REFRAIN_TAN }]}>{parts.prefix}</Text>
      {"\n"}
      {parts.body}
    </>
  );
}

function renderTextWithBibleVerseNumber(text, bibleVerseNumber) {
  const content = renderTextWithMetropolitanHighlight(text);
  if (!bibleVerseNumber) {
    return content;
  }

  return (
    <>
      <Text style={{ color: COLORS.gold }}>{bibleVerseNumber} </Text>
      {content}
    </>
  );
}

// A parenthetical naming a Metropolitan — "(Metropolitan)", "(the
// metropolitan)", "(ⲙ̀ⲙⲏⲧⲣⲟⲡⲟⲗⲓⲧⲏⲥ)", "(والمطران)" — reads visually distinct
// from the surrounding text, in every language. Matches the innermost
// bracket pair containing the keyword (never spans into an adjacent,
// unrelated bracket group like "(bishop) ... (metropolitan)"). Mirrors
// highlightMetropolitanBrackets in documentHtml.ts.
const METROPOLITAN_BRACKET_PATTERN = /\(([^()]*(?:metropolitan|ⲙⲏⲧⲣⲟⲡⲟⲗⲓⲧ|مطران)[^()]*)\)/giu;

function renderTextWithMetropolitanHighlight(text) {
  const raw = String(text || "");
  if (!raw || !METROPOLITAN_BRACKET_PATTERN.test(raw)) return raw;
  METROPOLITAN_BRACKET_PATTERN.lastIndex = 0;

  const nodes = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = METROPOLITAN_BRACKET_PATTERN.exec(raw))) {
    if (match.index > lastIndex) {
      nodes.push(raw.slice(lastIndex, match.index));
    }
    nodes.push(
      <Text key={`metropolitan-${key++}`} style={{ color: COLORS.rowBlue }}>
        {match[0]}
      </Text>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < raw.length) {
    nodes.push(raw.slice(lastIndex));
  }
  return nodes;
}

function formatBibleVerseNumber(number, language) {
  const value = String(number || "").trim();

  if (!value) {
    return "";
  }

  if (language === "arabic") {
    return formatArabicNumbers(value);
  }

  if (language === "coptic") {
    return formatCopticNumbers(value);
  }

  return value;
}

function getSeasonalHoosPrefixStyle(fontSize) {
  const prefixFontSize = fontSize;

  return {
    fontSize: prefixFontSize,
    lineHeight: Math.max(Math.round(prefixFontSize * 1.25), 9),
  };
}

function getSeasonalHoosPrefixParts(text, prefix) {
  const value = String(text || "").trimStart();
  const normalizedPrefix = String(prefix || "").trim();

  if (!normalizedPrefix || !value.startsWith(normalizedPrefix)) {
    return null;
  }

  return {
    prefix: value.slice(0, normalizedPrefix.length),
    body: value.slice(normalizedPrefix.length).replace(/^\s+/, ""),
  };
}

function doesVerseHaveSeasonalPrefixLine(verse = {}) {
  const prefix = String(verse.seasonalHoosVersePrefix || "").trim();

  if (!prefix) {
    return false;
  }

  return ["english", "arabic"].some((language) =>
    String(verse[language] || "").trimStart().startsWith(prefix),
  );
}

const COPTIC_DIGITS = {
  1: "ⲁ̅",
  2: "ⲃ̅",
  3: "ⲅ̅",
  4: "ⲇ̅",
  5: "ⲉ̅",
  6: "Ⲋ",
  7: "ⲍ̅",
  8: "ⲏ̅",
  9: "ⲑ̅",
};
const COPTIC_TENS = {
  1: "ⲓ̅",
  2: "ⲕ̅",
  3: "ⲗ̅",
  4: "ⲙ̅",
  5: "ⲛ̅",
  6: "ⲝ̅",
  7: "ⲟ̅",
  8: "ⲡ̅",
  9: "ϥ̅",
};
const COPTIC_HUNDREDS = {
  1: "ⲣ̅",
  2: "ⲥ̅",
  3: "ⲧ̅",
  4: "ⲩ̅",
  5: "ⲫ̅",
  6: "ⲭ̅",
  7: "ⲯ̅",
  8: "ⲱ̅",
  9: "ϣ̅",
};

function formatCopticNumbers(text, preserveDigits = false) {
  if (preserveDigits) {
    return String(text || "");
  }

  return String(text || "").replace(/\d+/g, (value) => {
    const number = Number(value);

    if (!Number.isInteger(number) || number <= 0 || number > 999) {
      return value;
    }

    const hundreds = Math.floor(number / 100);
    const tens = Math.floor((number % 100) / 10);
    const ones = number % 10;

    return `${COPTIC_HUNDREDS[hundreds] || ""}${COPTIC_TENS[tens] || ""}${
      COPTIC_DIGITS[ones] || ""
    }`;
  });
}

function formatArabicNumbers(text) {
  return String(text || "").replace(/\d/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit);
}

function getSpeakerLabel(type, language, bishopPresent) {
  const role = getSpeakerRole(type, bishopPresent);

  if (!role) {
    return "";
  }

  if (language === "arabic") {
    return {
      bishop: "الأسقف:",
      deacon: "الشماس:",
      people: "الشعب:",
      priest: "الكاهن:",
      reader: "القارئ:",
    }[role] || "";
  }

  if (language === "english") {
    return {
      bishop: "Bishop:",
      deacon: "Deacon:",
      people: "People:",
      priest: "Priest:",
      reader: "Reader:",
    }[role] || "";
  }

  return "";
}

function getSpeakerColor(type, bishopPresent) {
  return {
    bishop: "#D64545",
    deacon: LIGHT_YELLOW,
    people: "#E28A2E",
    priest: "#D64545",
    reader: LIGHT_YELLOW,
  }[getSpeakerRole(type, bishopPresent)] || "#E28A2E";
}

// "Bishop/Priest" (verse.type === "bishopOrPriest") resolves to "bishop" or
// "priest" via the shared resolveRubricKey (same logic the WebView reader
// uses) — see src/utils/verseRubric.js. Every other speaker verse type
// ("priest", "deacon", "reader", "people") already matches its role exactly,
// since hymnLibrary.js's getServiceVerseType only ever produces those exact
// strings — no more prefix-guessing needed.
function getSpeakerRole(type, bishopPresent) {
  const resolved = resolveRubricKey(type, bishopPresent);
  if (resolved === "priest" || resolved === "bishop" || resolved === "people" || resolved === "deacon" || resolved === "reader") {
    return resolved;
  }
  return "";
}

function isCommentVerseType(type) {
  return ["comment", "note", "tunecomment", "silentcomment"].includes(String(type || "").toLowerCase());
}

function isSilentPrayerVerse(verse = {}) {
  return Boolean(verse.isSilentPrayer) || /silent/i.test(String(verse.type || ""));
}

const EASTERN_ARABIC_DIGITS = {
  0: "٠",
  1: "١",
  2: "٢",
  3: "٣",
  4: "٤",
  5: "٥",
  6: "٦",
  7: "٧",
  8: "٨",
  9: "٩",
};

const styles = StyleSheet.create({
  arabic: {
    fontFamily: "Arial",
    writingDirection: "rtl",
  },
  cell: {
    flexShrink: 1,
    overflow: "hidden",
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  centeredCell: {
    alignItems: "center",
  },
  coptic: {
    fontFamily: TYPOGRAPHY.coptic,
  },
  english: {
    fontFamily: "Georgia",
  },
  row: {
    flexDirection: "row",
    overflow: "hidden",
    width: "100%",
  },
  seasonalHoosCell: {
    paddingVertical: 2,
  },
  text: {
    flexShrink: 1,
    fontFamily: TYPOGRAPHY.body,
    letterSpacing: 0,
    textJustify: "inter-word",
    width: "100%",
  },
});

// Only ever called for center-aligned types (refrainLabel/readingReference/
// invincibleCoptic) — every regular paragraph verse ("justify") now renders
// through JustifiedVerseBody instead, which reproduces true word-only
// justification itself (React Native's own textAlign:"justify" has no
// inter-word-only mode — see JustifiedText.js).
function getSafeTextAlign(language) {
  return language.textAlign === "center" ? "center" : language.key === "arabic" ? "right" : "left";
}
