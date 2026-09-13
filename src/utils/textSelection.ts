import { Platform, type TextStyle, type ViewStyle } from 'react-native';

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

/**
 * Puts selection back on an editable field that sits inside chrome carrying
 * DISABLED_TEXT_SELECTION_STYLE.
 *
 * iOS Safari will not keep a caret in an input that inherits
 * -webkit-user-select: none: the field takes a character or two and then stops
 * accepting text. Desktop browsers and the native app are both unaffected,
 * which is why a search box inside an unselectable sheet can look fine
 * everywhere except a phone browser. The surrounding chrome stays
 * unselectable; only the field the reader types into opts back in.
 */
export const EDITABLE_TEXT_SELECTION_STYLE: TextStyle | null = Platform.OS === 'web'
  ? ({
      WebkitTouchCallout: 'default',
      WebkitUserSelect: 'text',
      userSelect: 'text',
    } as unknown as TextStyle)
  : null;
