'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '../../../constants/theme';
import { tr } from '../../../utils/appText';
import { useLayoutMode } from '../../../utils/useLayoutMode';
import CalendarPanel from './CalendarPanel';

interface CalendarSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenSeasons: () => void;
  /**
   * Drawn in the page itself rather than in a native modal. Documents use
   * this: they already sit in modals and open others (Seasons, Settings,
   * drawers), and iOS presents only one native modal at a time from a screen.
   */
  inline?: boolean;
}

const DRAG_TO_CLOSE = 80;

/**
 * The calendar over whatever page it was opened from — Books, or a document
 * (Coptic Vine design system, "CalendarSheet"). On a phone or iPad it slides
 * up from the foot; the day block stays in view above it, so choosing a day
 * recolours the block behind the sheet. On a desktop it opens as a centred
 * dialog instead. Closes on the dimmed area, the back button, or (as a sheet)
 * a drag down on the handle.
 */
export default function CalendarSheet({ visible, onClose, onOpenSeasons, inline = false }: CalendarSheetProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dialog = useLayoutMode() === 'desktop';
  const [mounted, setMounted] = useState(visible);
  const [progress] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));
  // The drag handler outlives renders; it reads the latest onClose from here.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      drag.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, mounted, progress, drag]);

  // eslint-disable-next-line react-hooks/refs -- refs are read in gesture callbacks, not during render
  const [panResponder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => drag.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DRAG_TO_CLOSE || gesture.vy > 1.2) onCloseRef.current();
        else Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
    }),
  );

  // Inline there is no modal to catch Android's back button, so the sheet does.
  useEffect(() => {
    if (!inline || !visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onCloseRef.current();
      return true;
    });
    return () => subscription.remove();
  }, [inline, visible]);

  if (!mounted) return null;

  /** The native modal, or inline a layer over the whole page. A plain function, so the calendar inside keeps its state between renders. */
  const layer = (children: ReactNode) => (inline
    ? <View style={styles.inlineLayer}>{children}</View>
    : <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>{children}</Modal>);

  const panel = (
    <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
      <CalendarPanel
        onOpenSeasons={() => {
          onClose();
          onOpenSeasons();
        }}
        header={dialog ? undefined : (
          <View style={styles.grabArea} {...panResponder.panHandlers}>
            <View style={styles.grab} />
          </View>
        )}
      />
    </ScrollView>
  );

  const backdrop = (
    <Animated.View style={[styles.dim, { opacity: progress }]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={tr('Close the calendar', 'Fermer le calendrier', 'أغلق التقويم')}
        onPress={onClose}
      />
    </Animated.View>
  );

  if (dialog) {
    const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
    return layer(
      <>
        {backdrop}
        <View style={styles.dialogFrame} pointerEvents="box-none">
          <Animated.View style={[styles.dialog, { maxHeight: height - 80, opacity: progress, transform: [{ scale }] }]}>
            {panel}
          </Animated.View>
        </View>
      </>,
    );
  }

  const translateY = Animated.add(
    progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }),
    drag,
  );

  return layer(
    <>
      {backdrop}
      <Animated.View style={[styles.sheet, { maxHeight: height - insets.top - 60, paddingBottom: insets.bottom + 22, transform: [{ translateY }] }]}>
        {panel}
      </Animated.View>
    </>,
  );
}

const styles = StyleSheet.create({
  inlineLayer: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 1000 },
  dim: { backgroundColor: 'rgba(0, 0, 0, 0.66)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  sheet: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.goldLine,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    bottom: 0,
    elevation: 20,
    left: 0,
    marginHorizontal: 'auto',
    maxWidth: 560,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.6,
    shadowRadius: 25,
    width: '100%',
  },
  dialogFrame: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  // The desktop's centred dialog: the sheet's surface and gold top rule, rounded all round.
  dialog: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.goldLine,
    borderRadius: 28,
    borderTopWidth: 1,
    boxShadow: '0px 20px 50px rgba(0, 0, 0, 0.6)',
    overflow: 'hidden',
    paddingBottom: 22,
    width: 440,
  },
  grabArea: { alignItems: 'center', marginHorizontal: -16, marginTop: -10, paddingBottom: 16, paddingTop: 10 },
  grab: { backgroundColor: 'rgba(255, 255, 255, 0.2)', borderRadius: 3, height: 5, width: 40 },
});
