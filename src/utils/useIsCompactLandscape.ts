import { Platform, useWindowDimensions } from 'react-native';

import { useIsMobileWeb } from './useIsMobileWeb';

/**
 * True when the viewport is a *phone or tablet* held sideways — the case where
 * vertical space is scarce and horizontal space is spare, so a screen should
 * lay its content out in two columns and shrink its chrome.
 *
 * A desktop browser window is almost always wider than it is tall, so plain
 * `width > height` would drag the whole desktop web layout into this mode as
 * well. On web the check is therefore narrowed to what useIsMobileWeb already
 * recognises as a phone-sized viewport (a narrow window, or a short one with a
 * coarse pointer); native has no such ambiguity.
 */
export function useIsCompactLandscape(): boolean {
  const { width, height } = useWindowDimensions();
  const isMobileWeb = useIsMobileWeb();

  if (width <= height) return false;
  return Platform.OS === 'web' ? isMobileWeb : true;
}
