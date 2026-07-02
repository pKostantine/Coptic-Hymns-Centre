import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { COLORS } from '../../constants/theme';
import { useCopticFontDataUri } from '../../utils/useCopticFontDataUri';
import { buildDocumentHtml, DocumentSection } from './documentHtml';

export type { DocumentSection, DocumentVerse } from './documentHtml';

/**
 * Native (iOS/Android) document renderer — see documentHtml.ts for the
 * shared HTML builder. Uses react-native-webview, which doesn't support web;
 * DocumentWebView.web.tsx is the web counterpart (plain iframe).
 */
export default function DocumentWebView({ sections, fontSize = 18 }: { sections: DocumentSection[]; fontSize?: number }) {
  const copticFontDataUri = useCopticFontDataUri();

  const html = useMemo(
    () => (copticFontDataUri ? buildDocumentHtml(sections, { copticFontDataUri, fontSize }) : null),
    [sections, copticFontDataUri, fontSize],
  );

  if (!html) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.gold} />
      </View>
    );
  }

  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      style={styles.webview}
      scrollEnabled
      showsVerticalScrollIndicator={false}
      javaScriptEnabled={false}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.black,
  },
  webview: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
});
