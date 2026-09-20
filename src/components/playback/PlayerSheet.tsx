import { ReactNode, useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  PanResponderGestureState,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/theme';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
// How far down you have to drag before the sheet closes instead of settling.
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 0.6;

interface PlayerSheetProps {
  visible: boolean;
  onClose: () => void;
  accessibilityLabel: string;
  /** Portion of the window the sheet covers, 0–1. */
  heightRatio?: number;
  children: ReactNode;
}

/**
 * The pull-up panel that holds lyrics or the queue on phones, where there is
 * no room for side-by-side columns. Swipe down anywhere that is not scrolling
 * content, or tap the backdrop, to dismiss.
 */
export default function PlayerSheet({
  visible,
  onClose,
  accessibilityLabel,
  heightRatio = 0.82,
  children,
}: PlayerSheetProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const landscapePhone = width > height && height <= 600 && width < 1100;
  // In landscape, a short sheet wastes most of the already-limited vertical
  // space. Let it rise almost to the safe-area top, while leaving all content
  // inset from the notch / Dynamic Island and rounded screen corners.
  const effectiveRatio = landscapePhone ? 0.96 : heightRatio;
  const topClearance = Math.max(insets.top, landscapePhone ? 6 : 10);
  const sheetHeight = Math.min(
    Math.round(height * effectiveRatio),
    Math.max(0, height - topClearance),
  );
  // Kept mounted for the closing animation, then unmounted so the sheet never
  // swallows touches meant for the player behind it.
  const [mounted, setMounted] = useState(visible);
  const [progress] = useState(() => new Animated.Value(0));
  const [dragY] = useState(() => new Animated.Value(0));

  // Mount during the render that opens it, so the entry animation starts from
  // the closed position on the very next frame.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    dragY.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [dragY, mounted, progress, visible]);

  // Attached to the sheet as a whole rather than just the handle. Inner scroll
  // views claim vertical gestures that start on them, so this responds on the
  // handle, the headers and any padding, and never fights the lists.
  const [panResponder] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture: PanResponderGestureState) => (
      gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx)
    ),
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_event, gesture: PanResponderGestureState) => {
      dragY.setValue(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (_event, gesture: PanResponderGestureState) => {
      if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
        onClose();
        return;
      }
      Animated.spring(dragY, { toValue: 0, useNativeDriver: USE_NATIVE_DRIVER, bounciness: 2 }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(dragY, { toValue: 0, useNativeDriver: USE_NATIVE_DRIVER, bounciness: 2 }).start();
    },
  }));

  if (!mounted) return null;

  const translateY = Animated.add(
    progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] }),
    dragY,
  );

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View
        style={[styles.backdrop, { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }]}
      >
        <Pressable accessibilityLabel="Close panel" onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.View
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.sheet,
          {
            height: sheetHeight,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
            transform: [{ translateY }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.grabBar}>
          <View style={styles.grabber} />
        </View>
        <View style={styles.body}>{children}</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, elevation: 60 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 6, 14, 0.62)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#08192B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 -12px 40px rgba(0, 0, 0, 0.5)' } as object,
      default: {
        shadowColor: COLORS.shadow,
        shadowOpacity: 0.5,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: -8 },
        elevation: 24,
      },
    }),
  },
  grabBar: { height: 32, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255, 255, 255, 0.28)' },
  body: { flex: 1, minHeight: 0 },
});
