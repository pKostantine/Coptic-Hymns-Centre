import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Web-only browser fullscreen toggle, ported from the predecessor app's
 * `toggleBrowserFullscreen`/`isBrowserFullscreen` (App.web.js). No-op on
 * native — there is no `document` to request fullscreen on.
 */
export function useBrowserFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  return { isFullscreen, toggle };
}
