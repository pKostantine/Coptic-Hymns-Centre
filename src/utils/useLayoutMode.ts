import { Platform, useWindowDimensions } from 'react-native';

/**
 * How much room the app has (Coptic Vine design system, "Layout and spacing"):
 * - `phone`: one column with the bottom tab bar.
 * - `tablet`: the iPad — the same tab bar (as a centred row), two content columns.
 * - `desktop`: a desktop browser — a left sidebar with the seal and wordmark
 *   in place of the tab bar, and wider column layouts.
 */
export type LayoutMode = 'phone' | 'tablet' | 'desktop';

/** Wide enough to set a page's content in two columns. */
export const TABLET_MIN_WIDTH = 768;
/** Wide enough for the sidebar beside two columns. */
export const DESKTOP_MIN_WIDTH = 1024;
/** The desktop sidebar's width. */
export const SIDEBAR_WIDTH = 248;

/** A touch screen (an iPad in Safari) keeps the iPad layout however wide its window. */
function hasCoarsePointer(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

export function layoutModeFor(width: number, isWeb: boolean, coarsePointer: boolean): LayoutMode {
  if (isWeb && !coarsePointer && width >= DESKTOP_MIN_WIDTH) return 'desktop';
  if (width >= TABLET_MIN_WIDTH) return 'tablet';
  return 'phone';
}

export function useLayoutMode(): LayoutMode {
  const { width } = useWindowDimensions();
  return layoutModeFor(width, Platform.OS === 'web', Platform.OS === 'web' && hasCoarsePointer());
}

/** The width a page's own content has: the window, less the desktop sidebar. */
export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  return useLayoutMode() === 'desktop' ? width - SIDEBAR_WIDTH : width;
}
