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
  copticGospelRite?: boolean;
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
      copticGospelRite = false,
      onAction,
    },
    ref,
  ) => {
    const copticFontDataUri = useCopticFontDataUri();
    const webviewRef = useRef<WebView>(null);
    // Whatever section the "currentSection" scroll-tracking script (see
    // documentHtml.ts) most recently reported. A settings change (font size,
    // a language toggle, comments/silent-prayers, Bishop Present) rebuilds
    // the whole HTML document, which reloads the WebView and resets scroll
    // to the top — restoring to this section on load is what brings the
    // user back to where they were instead.
    const preservedSectionIdRef = useRef<string | null>(null);

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
        const action = JSON.parse(event.nativeEvent.data);
        if (action?.type === 'currentSection' && action.sectionId) {
          preservedSectionIdRef.current = action.sectionId;
        }
        onAction?.(action);
      } catch {
        // Malformed message from the HTML content — ignore.
      }
    };

    const handleLoadEnd = () => {
      if (preservedSectionIdRef.current) {
        webviewRef.current?.injectJavaScript(
          `if (window.scrollToSection) { window.scrollToSection(${JSON.stringify(preservedSectionIdRef.current)}); } true;`,
        );
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
              copticGospelRite,
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
        copticGospelRite,
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
        onLoadEnd={handleLoadEnd}
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
