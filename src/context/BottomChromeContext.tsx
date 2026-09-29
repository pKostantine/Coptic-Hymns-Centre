import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

interface BottomChromeContextValue {
  /**
   * Distance from the bottom of the window to the top edge of the focused
   * screen's bottom tab bar, or 0 when the focused screen has no tab bar.
   */
  tabBarInset: number;
  /** Vertical content clearance required by the global now-playing overlay. */
  nowPlayingInset: number;
  reportTabBar: (id: string, inset: number | null) => void;
  /**
   * Each now-playing bar reports its own clearance (null when it goes away).
   * More than one can be mounted at once — a document's subdocument renders
   * its own over the app's — so one closing must not clear another's.
   */
  reportNowPlayingInset: (id: string, inset: number | null) => void;
}

const BottomChromeContext = createContext<BottomChromeContextValue>({
  tabBarInset: 0,
  nowPlayingInset: 0,
  reportTabBar: () => undefined,
  reportNowPlayingInset: () => undefined,
});

/**
 * Lets floating UI (the global now-playing bar) sit above the tab bar on
 * screens that show one, and above the page edge on screens that do not.
 * Tab bars report themselves only while their screen is focused, because
 * screens further down a stack stay mounted underneath.
 */
export function BottomChromeProvider({ children }: { children: ReactNode }) {
  const [insets, setInsets] = useState<Record<string, number>>({});
  const [nowPlayingInsets, setNowPlayingInsets] = useState<Record<string, number>>({});

  const reportTabBar = useCallback((id: string, inset: number | null) => {
    setInsets((current) => {
      if (inset == null) {
        if (!(id in current)) return current;
        const nextInsets = { ...current };
        delete nextInsets[id];
        return nextInsets;
      }
      if (current[id] === inset) return current;
      return { ...current, [id]: inset };
    });
  }, []);

  const reportNowPlayingInset = useCallback((id: string, inset: number | null) => {
    setNowPlayingInsets((current) => {
      if (inset == null) {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      const nextInset = Math.max(0, Math.round(inset));
      if (current[id] === nextInset) return current;
      return { ...current, [id]: nextInset };
    });
  }, []);

  const nowPlayingInset = Math.max(0, ...Object.values(nowPlayingInsets));
  const value = useMemo(() => ({
    tabBarInset: Math.max(0, ...Object.values(insets)),
    nowPlayingInset,
    reportTabBar,
    reportNowPlayingInset,
  }), [insets, nowPlayingInset, reportTabBar, reportNowPlayingInset]);

  return <BottomChromeContext.Provider value={value}>{children}</BottomChromeContext.Provider>;
}

export function useBottomChrome(): BottomChromeContextValue {
  return useContext(BottomChromeContext);
}
