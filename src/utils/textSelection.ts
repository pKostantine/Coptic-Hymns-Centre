import { Platform, type ViewStyle } from 'react-native';

/**
 * Prevents selection/highlight UI on screen chrome while leaving controls
 * interactive.
 *
 * All three properties are real CSS that react-native-web passes straight
 * through to the DOM node, and all three are absent from React Native's own
 * ViewStyle: the vendor-prefixed pair has no native counterpart at all, and
 * `userSelect` is typed onto TextStyle only, while every consumer here
 * applies this to a View/Pressable. Asserted once, here, so no call site has
 * to repeat it — and typed as ViewStyle so they all keep their normal style
 * checking on everything else in the array.
 */
export const DISABLED_TEXT_SELECTION_STYLE: ViewStyle | null = Platform.OS === 'web'
  ? ({
      WebkitTouchCallout: 'none',
      WebkitUserSelect: 'none',
      userSelect: 'none',
    } as unknown as ViewStyle)
  : null;
