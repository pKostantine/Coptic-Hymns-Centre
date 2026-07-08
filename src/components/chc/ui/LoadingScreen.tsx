import { Image, StyleSheet, Text, View } from 'react-native';

import { COLORS, TYPOGRAPHY } from '../../../constants/theme';

/** Continues the native splash screen's look (same navy background, same logo) instead of cutting to a bare "Loading…" text while a document's content loads from Supabase. */
export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <Image source={require('../../../../assets/images/CHC.png')} style={styles.logo} />
      <Text style={styles.text}>Loading…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: COLORS.navy,
    flex: 1,
    gap: 16,
    justifyContent: 'center',
  },
  logo: {
    height: 96,
    resizeMode: 'contain',
    width: 96,
  },
  text: {
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 17,
    fontWeight: '700',
  },
});
