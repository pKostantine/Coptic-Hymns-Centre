import { useEffect, useState } from 'react';
import { Animated, Easing, Platform } from 'react-native';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * Drives an overlay's open/close animation and keeps it mounted until the
 * closing animation has finished, so it can fade out instead of vanishing.
 *
 * `progress` runs 0 (closed) → 1 (open).
 */
export function useOverlayTransition(visible: boolean, { duration = 240 } = {}) {
  const [mounted, setMounted] = useState(visible);
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));

  // Mount during the render that opens it, so the entry animation can start
  // from the closed position on the next frame.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? duration : Math.round(duration * 0.8),
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [duration, mounted, progress, visible]);

  return { mounted, progress };
}
