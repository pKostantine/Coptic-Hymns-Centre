import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { COLORS } from '../../constants/theme';
import type { BibleHighlight } from '../../types/bibleHighlights';

export interface BibleWebViewHandle {
  selectVerse: (verse: number | string) => void;
}

export interface BibleWebViewAction {
  type:
    | 'openSelector'
    | 'previousLevel'
    | 'currentVerse'
    | 'createBibleHighlights'
    | 'recolorBibleHighlight'
    | 'removeBibleHighlight'
    | 'biblePencilGesture'
    | 'copyBibleText';
  verse?: string;
  readerId?: string;
  anchors?: unknown[];
  color?: string;
  highlightId?: string;
  active?: boolean;
  text?: string;
}

interface BibleWebViewProps {
  html: string;
  restoreVerse?: string | null;
  scrollEnabled?: boolean;
  selectText?: boolean;
  /** The book's highlights, drawn over whichever of their verses this chapter shows. */
  highlights?: BibleHighlight[];
  onAction?: (action: BibleWebViewAction) => void;
}

/** Native (iOS/Android) Bible chapter renderer — see bibleDocumentHtml.ts for the shared HTML builder. BibleWebView.web.tsx is the web counterpart (plain iframe). */
const BibleWebView = forwardRef<BibleWebViewHandle, BibleWebViewProps>(({ html, restoreVerse, scrollEnabled = true, selectText = false, highlights, onAction }, ref) => {
  const webviewRef = useRef<WebView>(null);
  const restoreVerseRef = useRef(restoreVerse);
  restoreVerseRef.current = restoreVerse;
  const highlightsJson = JSON.stringify(highlights || []);
  const highlightsJsonRef = useRef(highlightsJson);
  highlightsJsonRef.current = highlightsJson;
  const drawHighlights = () => {
    webviewRef.current?.injectJavaScript(`window.setSermonHighlights && window.setSermonHighlights(${highlightsJsonRef.current}); true;`);
  };

  useEffect(() => {
    drawHighlights();
  }, [highlightsJson]);

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
        drawHighlights();
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
