/**
 * React Native and browser pointer events use different fields for Apple
 * Pencil/stylus input. Treat any reported stylus touch as non-navigation.
 */
export function isStylusGestureEvent(event: unknown): boolean {
  if (!event || typeof event !== 'object') return false;
  const native = (event as { nativeEvent?: Record<string, unknown> }).nativeEvent;
  if (!native) return false;
  const isStylus = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false;
    const point = value as Record<string, unknown>;
    return point.pointerType === 'pen' || point.pointerType === 'stylus'
      || point.touchType === 'stylus' || point.type === 'stylus';
  };
  if (isStylus(native)) return true;
  for (const key of ['touches', 'changedTouches', 'targetTouches']) {
    const touches = native[key];
    if (Array.isArray(touches) && touches.some(isStylus)) return true;
  }
  return false;
}
