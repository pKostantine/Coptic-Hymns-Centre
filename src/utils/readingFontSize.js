export const MIN_READING_FONT_LEVEL = 1;
export const MAX_READING_FONT_LEVEL = 10;
export const DEFAULT_READING_FONT_LEVEL = 5;

export const READING_FONT_SIZES = Object.freeze({
  phone: Object.freeze([14, 16, 17, 19, 20, 23, 26, 30, 34, 38]),
  tablet: Object.freeze([16, 18, 20, 22, 24, 27, 30, 34, 38, 44]),
  desktop: Object.freeze([16, 18, 20, 22, 24, 27, 30, 34, 38, 44]),
});

// Expo DeviceType enum values. Keeping these values here makes the sizing
// policy independently testable without loading a native Expo module in Node.
const DEVICE_TYPE_PHONE = 1;
const DEVICE_TYPE_TABLET = 2;
const DEVICE_TYPE_DESKTOP = 3;
const DEVICE_TYPE_TV = 4;
const TABLET_SHORT_EDGE = 600;

export function clampReadingFontLevel(value) {
  const rounded = Math.round(Number(value));
  if (!Number.isFinite(rounded)) return DEFAULT_READING_FONT_LEVEL;
  return Math.min(MAX_READING_FONT_LEVEL, Math.max(MIN_READING_FONT_LEVEL, rounded));
}

/**
 * Determines a stable device category. Callers capture this result once;
 * orientation changes can swap width and height, but never change the short
 * edge or the Expo-reported physical device type.
 */
export function classifyReadingDevice({
  platform,
  deviceType,
  osName,
  screenWidth,
  screenHeight,
  userAgent,
  maxTouchPoints,
}) {
  // Prefer the device's physical category when Expo can identify it.
  if (deviceType === DEVICE_TYPE_PHONE) return "phone";
  if (deviceType === DEVICE_TYPE_TABLET) return "tablet";
  if (deviceType === DEVICE_TYPE_DESKTOP || deviceType === DEVICE_TYPE_TV) return "desktop";

  // The shorter FULL-SCREEN dimension is invariant when the device rotates.
  // Never classify from the current window width: phone landscape, browser
  // split-view and toolbar changes would change the user's font size.
  const shortEdge = Math.min(
    positiveDimension(screenWidth),
    positiveDimension(screenHeight),
  );

  if (platform === "web") {
    // expo-device normally reports iOS/Android in osName on web, but can
    // return null in less common browsers. Fall back to the user agent so an
    // unidentified mobile browser does not silently receive desktop sizes.
    const os = String(osName || "");
    const agent = String(userAgent || "");
    const isIPadDesktopAgent =
      /\bMacintosh\b/i.test(agent) && Number(maxTouchPoints) > 1;
    const isMobileWeb =
      /^(android|ios|ipados)$/i.test(os) ||
      /android|iphone|ipad|ipod/i.test(agent) ||
      isIPadDesktopAgent;

    if (!isMobileWeb) return "desktop";
    if (isIPadDesktopAgent) return "tablet";
    return shortEdge >= TABLET_SHORT_EDGE ? "tablet" : "phone";
  }

  if (platform === "ios" || platform === "android") {
    return shortEdge >= TABLET_SHORT_EDGE ? "tablet" : "phone";
  }

  return "desktop";
}

export function readingFontSizeForLevel(level, deviceClass) {
  const sizes = READING_FONT_SIZES[deviceClass] || READING_FONT_SIZES.desktop;
  return sizes[clampReadingFontLevel(level) - MIN_READING_FONT_LEVEL];
}

export function nearestReadingFontLevel(pixelSize, deviceClass) {
  const target = Number(pixelSize);
  if (!Number.isFinite(target)) return DEFAULT_READING_FONT_LEVEL;
  const sizes = READING_FONT_SIZES[deviceClass] || READING_FONT_SIZES.desktop;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  sizes.forEach((size, index) => {
    const distance = Math.abs(size - target);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex + MIN_READING_FONT_LEVEL;
}

/**
 * Converts both prior CHC ranges to their old rendered size, then chooses the
 * closest level in the new device-aware table. A stored range marker of 10 is
 * the new format; the original 0-10 format never wrote a marker.
 */
export function migrateReadingFontLevel(storedLevel, storedRangeMax, deviceClass) {
  if (storedRangeMax === MAX_READING_FONT_LEVEL) {
    return clampReadingFontLevel(storedLevel);
  }

  const oldRangeMax = storedRangeMax === 20 ? 20 : 10;
  const oldLevel = Math.min(oldRangeMax, Math.max(0, Number(storedLevel)));
  if (!Number.isFinite(oldLevel)) return DEFAULT_READING_FONT_LEVEL;
  const oldPixelSize = Math.round(18 + (oldLevel * (78 - 18)) / oldRangeMax);
  return nearestReadingFontLevel(oldPixelSize, deviceClass);
}

function positiveDimension(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}
