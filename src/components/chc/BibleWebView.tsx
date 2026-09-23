import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { COLORS } from '../../constants/theme';

export interface BibleWebViewHandle {
  selectVerse: (verse: number | string) => void;
}

export interface BibleWebViewAction {
  type: 'openSelector' | 'previousLevel' | 'currentVerse';
  verse?: string;
}

interface BibleWebViewProps {
  html: string;
  restoreVerse?: string | null;
  scrollEnabled?: boolean;
  selectText?: boolean;
  onAction?: (action: BibleWebViewAction) => void;
}

/** Native (iOS/Android) Bible chapter renderer — see bibleDocumentHtml.ts for the shared HTML builder. BibleWebView.web.tsx is the web counterpart (plain iframe). */
const BibleWebView = forwardRef<BibleWebViewHandle, BibleWebViewProps>(({ html, restoreVerse, scrollEnabled = true, selectText = false, onAction }, ref) => {
  const webviewRef = useRef<WebView>(null);
  const restoreVerseRef = useRef(restoreVerse);
  restoreVerseRef.current = restoreVerse;

  useImperativeHandle(ref, () => ({
    selectVerse: (verse: number | string) => {
      webviewRef.current?.injectJavaScript(`window.selectBibleVerse && window.selectBibleVerse(${JSON.stringify(String(verse))}); true;`);
    },
  }));

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      onAction?.(JSON.parse(event.nativeEvent.data));
    } catch {
      // Malformed message from the HTML content — ignore.
    }
  };

  return (
    <WebView
      ref={webviewRef}
      originWhitelist={['*']}
      source={{ html }}
      style={styles.webview}
      scrollEnabled={scrollEnabled}
      bounces={false}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={scrollEnabled}
      javaScriptEnabled
      textInteractionEnabled={selectText}
      onMessage={handleMessage}
      onLoadEnd={() => {
        const verse = restoreVerseRef.current;
        if (verse) webviewRef.current?.injectJavaScript(`window.selectBibleVerse && window.selectBibleVerse(${JSON.stringify(verse)}); true;`);
      }}
    />
  );
});

BibleWebView.displayName = 'BibleWebView';

export default BibleWebView;

const styles = StyleSheet.create({
  webview: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
});
