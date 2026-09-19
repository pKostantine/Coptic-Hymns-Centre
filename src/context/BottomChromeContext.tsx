import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

interface BottomChromeContextValue {
  /**
   * Distance from the bottom of the window to the top edge of the focused
   * screen's bottom tab bar, or 0 when the focused screen has no tab bar.
   */
  tabBarInset: number;
  reportTabBar: (id: string, inset: number | null) => void;
}

const BottomChromeContext = createContext<BottomChromeContextValue>({
  tabBarInset: 0,
  reportTabBar: () => undefined,
});

/**
 * Lets floating UI (the global now-playing bar) sit above the tab bar on
 * screens that show one, and above the page edge on screens that do not.
 * Tab bars report themselves only while their screen is focused, because
 * screens further down a stack stay mounted underneath.
 */
export function BottomChromeProvider({ children }: { children: ReactNode }) {
  const [insets, setInsets] = useState<Record<string, number>>({});

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

  const value = useMemo(() => ({
    tabBarInset: Math.max(0, ...Object.values(insets)),
    reportTabBar,
  }), [insets, reportTabBar]);

  return <BottomChromeContext.Provider value={value}>{children}</BottomChromeContext.Provider>;
}

export function useBottomChrome(): BottomChromeContextValue {
  return useContext(BottomChromeContext);
}
