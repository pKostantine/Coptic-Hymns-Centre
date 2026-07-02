export function formatEnglishDisplayText(text) {
  return String(text || "")
    .replace(/[♪♫♩♬🎵🎶]+/gu, "")
    .replace(/\bWatos\b/g, "Vatos")
    .replace(/\s+/g, " ")
    .trim();
}
