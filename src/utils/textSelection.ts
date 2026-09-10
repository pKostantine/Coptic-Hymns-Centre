import { Platform } from 'react-native';

/** Prevents selection/highlight UI on screen chrome while leaving controls interactive. */
export const DISABLED_TEXT_SELECTION_STYLE = Platform.OS === 'web'
  ? {
      WebkitTouchCallout: 'none',
      WebkitUserSelect: 'none',
      userSelect: 'none',
    } as const
  : null;
