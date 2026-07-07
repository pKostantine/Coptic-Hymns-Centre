import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { useIsMobileWeb } from './useIsMobileWeb';

/**
 * Web-only browser fullscreen toggle, ported from the predecessor app's
 * `toggleBrowserFullscreen`/`isBrowserFullscreen` (App.web.js). No-op on
 * native — there is no `document` to request fullscreen on. `shouldShow` is
 * false on native AND on mobile web (phone browsers don't have a meaningful
 * fullscreen chrome toggle) — every fullscreen button in the app should gate
 * on this instead of re-deriving the Platform/viewport check itself.
 */
export function useBrowserFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isMobileWeb = useIsMobileWeb();
  const shouldShow = Platform.OS === 'web' && !isMobileWeb;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggle = useCallback(() => {
    if (Platform.OS !== 'web') return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  return { isFullscreen, toggle, shouldShow };
}
