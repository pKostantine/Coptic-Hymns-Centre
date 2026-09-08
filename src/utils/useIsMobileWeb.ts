import { useWindowDimensions } from 'react-native';

/** Compact web layout for narrow windows and phones in either orientation. */
export const MOBILE_WEB_BREAKPOINT = 700;

export function useIsMobileWeb(): boolean {
  const { width, height } = useWindowDimensions();
  // A landscape phone is wide but still needs compact controls. Requiring a
  // coarse pointer keeps short desktop browser windows in the desktop layout.
  const isLandscapePhone =
    height < MOBILE_WEB_BREAKPOINT &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  return width < MOBILE_WEB_BREAKPOINT || isLandscapePhone;
}
