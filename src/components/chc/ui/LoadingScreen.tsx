import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, TYPOGRAPHY } from '../../../constants/theme';

/** Continues the native splash screen's look (same navy background, same logo) instead of cutting to a bare "Loading…" text while a document's content loads from Supabase. */
export default function LoadingScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          bottom: -insets.bottom,
          left: -insets.left,
          right: -insets.right,
          top: -insets.top,
        },
      ]}
    >
      <Image source={require('../../../../assets/images/CHC.png')} style={styles.logo} />
      <Text style={styles.text}>Loading…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: COLORS.navy,
    gap: 24,
    justifyContent: 'center',
    position: 'absolute',
    zIndex: 1000,
  },
  logo: {
    height: 144,
    resizeMode: 'contain',
    width: 144,
  },
  text: {
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  },
});
