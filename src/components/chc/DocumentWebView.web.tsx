import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

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
 * Web document renderer. react-native-webview doesn't support the web
 * platform, so this uses a plain iframe with the same HTML builder as the
 * native renderer (DocumentWebView.tsx) — Metro resolves this file
 * automatically for web builds via the .web.tsx extension. `allow-scripts` is
 * required in the sandbox so the builder's embedded scrollToSection script runs.
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
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useImperativeHandle(ref, () => ({
      scrollToSection: (id: string) => {
        const win = iframeRef.current?.contentWindow as (Window & { scrollToSection?: (id: string) => void }) | null | undefined;
        win?.scrollToSection?.(id);
      },
      scrollToTune: (tune: string) => {
        const win = iframeRef.current?.contentWindow as (Window & { scrollToTune?: (tune: string) => void }) | null | undefined;
        win?.scrollToTune?.(tune);
      },
    }));

    useEffect(() => {
      if (!onAction) return undefined;

      const handleMessage = (event: MessageEvent) => {
        if (event.source !== iframeRef.current?.contentWindow) return;
        try {
          onAction(JSON.parse(event.data));
        } catch {
          // Malformed message from the HTML content — ignore.
        }
      };

      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }, [onAction]);

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
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.black }}>
          <ActivityIndicator color={COLORS.gold} />
        </View>
      );
    }

    return (
      <iframe
        ref={iframeRef}
        sandbox="allow-same-origin allow-scripts"
        srcDoc={html}
        style={{ flex: 1, width: '100%', height: '100%', border: 'none', backgroundColor: COLORS.black }}
      />
    );
  },
);

DocumentWebView.displayName = 'DocumentWebView';

export default DocumentWebView;
