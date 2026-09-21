import { Platform, StyleSheet, Text, View } from "react-native";

import { COLORS, SPACING, TYPOGRAPHY } from "../../constants/theme";
import { formatEnglishDisplayText } from "../../utils/displayText";
import { resolveRubricKey } from "../../utils/verseRubric";
import JustifiedText from "./JustifiedText";
import {
  getSlideshowLanguageFontSize,
  getSlideshowLanguageLineHeight,
  hasSeasonalPrefixLine as hasVisibleSeasonalPrefixLine,
} from "./slideshowLayout";

const REFRAIN_TAN = "#9FFFD0";
const LIGHT_YELLOW = "#FFFF00";
const SILENT_PRAYER_GRAY = "#C5CBD2";
const DISABLED_SELECTION_STYLE = Platform.OS === "web"
  ? {
      WebkitTouchCallout: "none",
      WebkitUserSelect: "none",
      userSelect: "none",
    }
  : null;

export default function VerseBlock({
  verse,
  index,
  visibleLanguages,
  fontSize,
  theme,
  tableWidth,
  onLanguageLayout,
  isRecitedPrayer = false,
  isReading = false,
  forceWhiteText = false,
  colorIndex,
  suppressSpeakerLabel = false,
  // Decided by shouldUsePeopleLineColor in verseRubric.js — the People's own
  // responses inside the Agpeya's Litanies. Passed in rather than worked out
  // here because it depends on the section title, which this component never
  // sees.
  usePeopleLineColor = false,
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
      ? COLORS.comment
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
      : // See resolveVerseColorBase in documentHtml.ts. Same point in the
      // chain as there — below the authored White/Blue overrides, above the
      // default alternation — and off the same shared predicate, since the
      // two renderers must never disagree about this.
      usePeopleLineColor
      ? COLORS.peopleLight
      : forceWhiteText || verse.forceWhiteText || isRefrain || isRecitedPrayer || isReading || (colorIndex ?? index) % 2 === 0
      ? theme.colors.text
      : theme.colors.rowBlue;
  const hasSeasonalPrefixLine = hasVisibleSeasonalPrefixLine(verse);
  const bodyFontStyle = isComment || isRefrain || isRefrainLabel || verse.italic ? "italic" : "normal";
  const bodyFontWeight = isReadingReference ? "800" : isRefrainLabel || isRefrain ? "500" : "400";
  // "Invincible Coptic" only means "this Coptic must always render, even if
  // the language toggle or a translation is missing" -- it does NOT mean the
  // line structurally has no English/Arabic (some DB rows tagged this way do
  // carry a translation). A row that has one lays out in the normal columns
  // below, Coptic above Coptic, and its speaker label renders in its normal
  // per-language spot like any other verse. Only when the Coptic really is
  // the whole line does it stop being a column and span the row (see
  // spanningLanguage).
  const hasTranslationText = Boolean((verse.english && verse.english.trim()) || (verse.arabic && verse.arabic.trim()));
  const copticStandsAlone = verse.invincibleCoptic && !hasTranslationText;
  const bibleNumberFor = (language) =>
    !Array.isArray(verse.slideshowBibleNumberLanguages) ||
    verse.slideshowBibleNumberLanguages.includes(language)
      ? verse.bibleVerseNumber
      : "";
  const rowLanguages = [
    {
      key: "english",
      speakerLabel: suppressSpeakerLabel ? "" : getSpeakerLabel(rubricType, "english", bishopPresent),
      text: formatEnglishDisplayText(verse.english),
      bibleVerseNumber: bibleNumberFor("english"),
      seasonalHoosVersePrefix: hasSeasonalPrefixLine ? verse.seasonalHoosVersePrefix : "",
      fontSize: getSlideshowLanguageFontSize("english", { verse }, fontSize),
      fontFamily: "Georgia",
      lineHeight: getSlideshowLanguageLineHeight("english", { verse }, fontSize),
      styles: [styles.english],
      textAlign: isRefrainLabel || isReadingReference ? "center" : "justify",
      minWordsToJustify: 1,
      forceLines: verse.slideshowForcedLines?.english,
    },
    {
      key: "coptic",
      text: formatCopticNumbers(verse.coptic, verse.preserveCopticDigits),
      bibleVerseNumber: bibleNumberFor("coptic"),
      seasonalHoosVersePrefixSpacer: hasSeasonalPrefixLine
        ? verse.seasonalHoosVersePrefix
        : "",
      fontSize: getSlideshowLanguageFontSize("coptic", { verse }, fontSize),
      fontFamily: TYPOGRAPHY.coptic,
      lineHeight: getSlideshowLanguageLineHeight("coptic", { verse }, fontSize),
      styles: [styles.coptic],
      textAlign: isRefrainLabel || isReadingReference || copticStandsAlone ? "center" : "justify",
      minWordsToJustify: 1,
      forceLines: verse.slideshowForcedLines?.coptic,
    },
    {
      key: "arabic",
      speakerLabel: suppressSpeakerLabel ? "" : getSpeakerLabel(rubricType, "arabic", bishopPresent),
      text: formatArabicNumbers(verse.arabic),
      bibleVerseNumber: bibleNumberFor("arabic"),
      seasonalHoosVersePrefix: hasSeasonalPrefixLine
        ? formatArabicNumbers(verse.seasonalHoosVersePrefix)
        : "",
      fontSize: getSlideshowLanguageFontSize("arabic", { verse }, fontSize),
      fontFamily: "Arial",
      lineHeight: getSlideshowLanguageLineHeight("arabic", { verse }, fontSize),
      styles: [styles.arabic],
      textAlign: isRefrainLabel || isReadingReference ? "center" : "justify",
      minWordsToJustify: 1,
      forceLines: verse.slideshowForcedLines?.arabic,
    },
  ].filter((language) => {
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
      const forceCoptic = verse.forceCopticVisible || verse.invincibleCoptic;
      const copticHiddenByToggle = isRecitedPrayer && !visibleLanguages.copticRecitedPrayers && !forceCoptic;
      if (copticHiddenByToggle) return false;
      if (!visibleLanguages.coptic && !forceCoptic) return false;
      return Boolean(language.text && language.text.trim());
    }

    if (!visibleLanguages[language.key]) return false;
    return Boolean((language.text && language.text.trim()) || language.speakerLabel);
  });
  // A Coptic line with no translation of its own has nothing in the other
  // columns to be read against, so it is not a column -- it is the whole
  // line. Giving it a column anyway wedged it into a third (or a half) of
  // the row and wrapped it in there, reading as text shoved to one side.
  // It spans the full row instead, centered on the row rather than on a
  // cell, sitting below the speaker labels (which ARE per-language, and so
  // keep their own row) -- which is where it already appeared, just narrow.
  const spanningLanguage = copticStandsAlone ? rowLanguages.find((language) => language.key === "coptic") : null;
  const columnLanguages = spanningLanguage
    ? rowLanguages.filter((language) => language.key !== "coptic")
    : rowLanguages;
  const rowColumnWidth = tableWidth / Math.max(columnLanguages.length, 1);
  const isCenteredAcrossPage = Boolean(verse.centeredAcrossPage);
  const hasSpeakerLabel = rowLanguages.some((language) => language.speakerLabel);
  const speakerRowHeight = hasSpeakerLabel
    ? Math.max(...rowLanguages.filter((language) => language.speakerLabel).map((language) => language.lineHeight))
    : 0;

  function reportLanguageMetric(language, metric) {
    onLanguageLayout?.(language, metric);
  }

  function renderLanguageCell(language, spansRow = false) {
    const isJustified = language.textAlign === "justify";
    const selectionStyle = selectableText ? null : DISABLED_SELECTION_STYLE;
    const cellWidth = spansRow ? tableWidth : rowColumnWidth;
    const cellWidthStyle = { flexBasis: cellWidth, maxWidth: cellWidth };
    const textStyle = [
      styles.text,
      ...language.styles,
      selectionStyle,
      {
        color: rowTextColor,
        fontFamily: language.fontFamily,
        fontSize: language.fontSize,
        fontStyle: bodyFontStyle,
        fontWeight: bodyFontWeight,
        letterSpacing: 0,
        lineHeight: language.lineHeight,
        ...(Platform.OS === "web"
          ? {
              overflowWrap: "break-word",
              wordBreak: "normal",
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
          cellWidthStyle,
        ]}
      >
        {isJustified ? (
          <JustifiedVerseBody
            language={language}
            textStyle={textStyle}
            selectableText={selectableText}
            columnWidth={cellWidth - SPACING.xs * 2}
            forceLines={language.forceLines}
            minWordsToJustify={language.minWordsToJustify}
            fontStyle={bodyFontStyle}
            fontWeight={bodyFontWeight}
            onMetric={(metric) => reportLanguageMetric(language.key, metric)}
          />
        ) : (
          <Text
            selectable={selectableText}
            style={[...textStyle, { textAlign: getSafeTextAlign(language) }]}
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
        )}
      </View>
    );
  }

  function renderSpeakerRow(languages, speakerColumnWidth) {
    if (!speakerRowHeight || !languages.length) return null;
    return (
      <View style={styles.speakerRow}>
        {languages.map((language) => (
          <View
            key={`speaker-${language.key}`}
            style={[
              styles.speakerCell,
              {
                flexBasis: speakerColumnWidth,
                height: speakerRowHeight,
                maxWidth: speakerColumnWidth,
              },
            ]}
          >
            {language.speakerLabel ? (
              <Text
                selectable={selectableText}
                style={[
                  ...language.styles,
                  {
                    color: getSpeakerColor(rubricType, bishopPresent),
                    fontFamily: language.fontFamily,
                    fontSize: language.fontSize,
                    fontStyle: bodyFontStyle,
                    fontWeight: bodyFontWeight,
                    lineHeight: language.lineHeight,
                    textAlign: getSafeTextAlign(language),
                    width: "100%",
                  },
                ]}
              >
                {language.speakerLabel}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    );
  }

  if (spanningLanguage) {
    return (
      <View style={styles.spanningRowGroup}>
        {renderSpeakerRow(columnLanguages, rowColumnWidth)}
        <View style={styles.row}>{renderLanguageCell(spanningLanguage, true)}</View>
      </View>
    );
  }

  return (
    <View style={styles.spanningRowGroup}>
      {renderSpeakerRow(rowLanguages, rowColumnWidth)}
      <View style={styles.row}>{rowLanguages.map((language) => renderLanguageCell(language))}</View>
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
function JustifiedVerseBody({ language, textStyle, selectableText, columnWidth, forceLines, minWordsToJustify, fontStyle, fontWeight, onMetric }) {
  const parts = getSeasonalHoosPrefixParts(language.text, language.seasonalHoosVersePrefix);
  const prefixStyle = getSeasonalHoosPrefixStyle(language.fontSize);
  const bibleVerseNumber = formatBibleVerseNumber(language.bibleVerseNumber, language.key);

  let prefixNode = null;

  if (parts) {
    prefixNode = <Text selectable={selectableText} style={[prefixStyle, { color: REFRAIN_TAN }]}>{parts.prefix}</Text>;
  } else if (language.seasonalHoosVersePrefixSpacer) {
    prefixNode = (
      <Text selectable={selectableText} style={[prefixStyle, { color: "transparent" }]}>{language.seasonalHoosVersePrefixSpacer}</Text>
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
        fontStyle={fontStyle}
        fontWeight={fontWeight}
        width={columnWidth}
        rtl={language.key === "arabic"}
        firstWordStyle={bibleVerseNumber ? { color: COLORS.gold } : null}
        forceLines={forceLines}
        minWordsToJustify={minWordsToJustify}
        selectable={selectableText}
        onLayout={(event) => onMetric({ height: event.nativeEvent.layout.height })}
        onLines={(lines) => onMetric({ lines })}
      />
    </>
  );
}

// The exact text a justified paragraph body wraps -- verse number prepended,
// seasonal Hoos prefix excluded (it renders on its own line, never part of
// the justified body; see JustifiedVerseBody's prefixNode). Shared between
// JustifiedVerseBody's render and measurement paths.
function getJustifiedBodyText(language) {
  const parts = getSeasonalHoosPrefixParts(language.text, language.seasonalHoosVersePrefix);
  const bodyText = parts ? parts.body : language.text;
  const bibleVerseNumber = formatBibleVerseNumber(language.bibleVerseNumber, language.key);
  return bibleVerseNumber ? `${bibleVerseNumber} ${bodyText}` : bodyText;
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
  speakerCell: {
    flexShrink: 1,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: SPACING.xs,
  },
  speakerRow: {
    flexDirection: "row",
    overflow: "hidden",
    width: "100%",
  },
  seasonalHoosCell: {
    paddingVertical: 2,
  },
  // Stacks the per-language speaker-label row above a line that spans the
  // whole width instead of taking a column (see spanningLanguage).
  spanningRowGroup: {
    width: "100%",
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
