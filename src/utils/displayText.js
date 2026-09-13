export function formatEnglishDisplayText(text) {
  return String(text || "")
    .replace(/[♪♫♩♬🎵🎶]+/gu, "")
    .replace(/\bWatos\b/g, "Vatos")
    .replace(/\s+/g, " ")
    .trim();
}

const EASTERN_ARABIC_DIGITS = {
  "0": "٠", "1": "١", "2": "٢", "3": "٣", "4": "٤",
  "5": "٥", "6": "٦", "7": "٧", "8": "٨", "9": "٩",
};

/** Rewrites Western digits as Eastern Arabic ones, for text being shown as Arabic. */
export function formatArabicDigits(text) {
  return String(text || "").replace(/\d/g, (digit) => EASTERN_ARABIC_DIGITS[digit] || digit);
}
