import { forwardRef, type ReactElement } from 'react';
import {
  FlatList,
  type FlatListProps,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useBottomChrome } from '@/context/BottomChromeContext';

function contentStyleWithInset(
  style: StyleProp<ViewStyle> | undefined,
  inset: number,
): StyleProp<ViewStyle> {
  if (inset <= 0) return style;

  const flattened = StyleSheet.flatten(style);
  const rawBase =
    flattened?.paddingBottom
    ?? flattened?.paddingVertical
    ?? flattened?.padding
    ?? 0;
  const base = typeof rawBase === 'number' ? rawBase : 0;

  return [style, { paddingBottom: base + inset }];
}

/**
 * Scroll containers used by app-level pages. The global mini player floats
 * above screen content, so these add exactly the currently reported player
 * clearance to the page's existing bottom padding.
 */
export const NowPlayingAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function NowPlayingAwareScrollView(props, ref) {
    const { nowPlayingInset } = useBottomChrome();
    return (
      <ScrollView
        ref={ref}
        {...props}
        contentContainerStyle={contentStyleWithInset(props.contentContainerStyle, nowPlayingInset)}
      />
    );
  },
);

export function NowPlayingAwareFlatList<ItemT>(
  props: FlatListProps<ItemT>,
): ReactElement {
  const { nowPlayingInset } = useBottomChrome();
  return (
    <FlatList
      {...props}
      contentContainerStyle={contentStyleWithInset(props.contentContainerStyle, nowPlayingInset)}
    />
  );
}
