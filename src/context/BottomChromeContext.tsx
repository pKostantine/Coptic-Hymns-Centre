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
  /**
   * Whether the reader has hidden the now-playing bar down to its button.
   * Shared by every bar, so hiding it once hides it everywhere — a
   * subdocument's own bar included.
   */
  nowPlayingCollapsed: boolean;
  setNowPlayingCollapsed: (collapsed: boolean) => void;
  /**
   * Whether a full now-playing screen is open. The desktop sidebar reads this
   * to get out of the way, so the player takes the whole window instead of
   * sitting in the column beside it.
   */
  nowPlayingExpanded: boolean;
  /** Each overlay reports its own state, for the same reason insets are per-overlay. */
  reportNowPlayingExpanded: (id: string, expanded: boolean) => void;
}

const BottomChromeContext = createContext<BottomChromeContextValue>({
  tabBarInset: 0,
  nowPlayingInset: 0,
  reportTabBar: () => undefined,
  reportNowPlayingInset: () => undefined,
  nowPlayingCollapsed: false,
  setNowPlayingCollapsed: () => undefined,
  nowPlayingExpanded: false,
  reportNowPlayingExpanded: () => undefined,
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
  const [nowPlayingCollapsed, setNowPlayingCollapsed] = useState(false);
  const [expandedOverlays, setExpandedOverlays] = useState<Record<string, true>>({});

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

  const reportNowPlayingExpanded = useCallback((id: string, expanded: boolean) => {
    setExpandedOverlays((current) => {
      if (!expanded) {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      if (current[id]) return current;
      return { ...current, [id]: true };
    });
  }, []);

  const nowPlayingInset = Math.max(0, ...Object.values(nowPlayingInsets));
  const nowPlayingExpanded = Object.keys(expandedOverlays).length > 0;
  const value = useMemo(() => ({
    tabBarInset: Math.max(0, ...Object.values(insets)),
    nowPlayingInset,
    reportTabBar,
    reportNowPlayingInset,
    nowPlayingCollapsed,
    setNowPlayingCollapsed,
    nowPlayingExpanded,
    reportNowPlayingExpanded,
  }), [insets, nowPlayingInset, reportTabBar, reportNowPlayingInset, nowPlayingCollapsed, nowPlayingExpanded, reportNowPlayingExpanded]);

  return <BottomChromeContext.Provider value={value}>{children}</BottomChromeContext.Provider>;
}

export function useBottomChrome(): BottomChromeContextValue {
  return useContext(BottomChromeContext);
}
