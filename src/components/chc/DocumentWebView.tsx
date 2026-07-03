import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { COLORS } from '../../constants/theme';
import { useCopticFontDataUri } from '../../utils/useCopticFontDataUri';
import { buildDocumentHtml, DocumentAction, DocumentSection, VisibleColumns } from './documentHtml';

export type { DocumentAction, DocumentSection, DocumentVerse } from './documentHtml';

export interface DocumentWebViewHandle {
  scrollToSection: (id: string) => void;
  scrollToTune: (tune: string) => void;
}

interface DocumentWebViewProps {
  sections: DocumentSection[];
  fontSize?: number;
  visibleColumns?: VisibleColumns;
  selectText?: boolean;
  displayComments?: boolean;
  displaySilentPrayers?: boolean;
  bishopPresent?: boolean;
  copticRecitedPrayers?: boolean;
  onAction?: (action: DocumentAction) => void;
}

/**
 * Native (iOS/Android) document renderer — see documentHtml.ts for the
 * shared HTML builder. Uses react-native-webview, which doesn't support web;
 * DocumentWebView.web.tsx is the web counterpart (plain iframe).
 */
const DocumentWebView = forwardRef<DocumentWebViewHandle, DocumentWebViewProps>(
  (
    {
      sections,
      fontSize = 18,
      visibleColumns,
      selectText = false,
      displayComments = false,
      displaySilentPrayers = false,
      bishopPresent = false,
      copticRecitedPrayers = true,
      onAction,
    },
    ref,
  ) => {
    const copticFontDataUri = useCopticFontDataUri();
    const webviewRef = useRef<WebView>(null);

    useImperativeHandle(ref, () => ({
      scrollToSection: (id: string) => {
        webviewRef.current?.injectJavaScript(`window.scrollToSection(${JSON.stringify(id)}); true;`);
      },
      scrollToTune: (tune: string) => {
        webviewRef.current?.injectJavaScript(`window.scrollToTune(${JSON.stringify(tune)}); true;`);
      },
    }));

    const handleMessage = (event: WebViewMessageEvent) => {
      try {
        onAction?.(JSON.parse(event.nativeEvent.data));
      } catch {
        // Malformed message from the HTML content — ignore.
      }
    };

    const html = useMemo(
      () =>
        copticFontDataUri
          ? buildDocumentHtml(sections, {
              copticFontDataUri,
              fontSize,
              visibleColumns,
              selectText,
              displayComments,
              displaySilentPrayers,
              bishopPresent,
              copticRecitedPrayers,
            })
          : null,
      [
        sections,
        copticFontDataUri,
        fontSize,
        visibleColumns,
        selectText,
        displayComments,
        displaySilentPrayers,
        bishopPresent,
        copticRecitedPrayers,
      ],
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
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webview}
        scrollEnabled
        showsVerticalScrollIndicator={false}
        javaScriptEnabled
        onMessage={handleMessage}
      />
    );
  },
);

DocumentWebView.displayName = 'DocumentWebView';

export default DocumentWebView;

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
