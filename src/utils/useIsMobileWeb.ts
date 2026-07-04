import { useWindowDimensions } from 'react-native';

/** Below this viewport width, web-only screens/components switch to a
 * mobile-tuned layout (smaller chrome, wrapping instead of truncating,
 * single-column rows) instead of the desktop-oriented layout they're built
 * for by default. Desktop/tablet widths are completely unaffected. */
export const MOBILE_WEB_BREAKPOINT = 700;

export function useIsMobileWeb(): boolean {
  const { width } = useWindowDimensions();
  return width < MOBILE_WEB_BREAKPOINT;
}
