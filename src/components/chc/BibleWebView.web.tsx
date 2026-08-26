import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { COLORS } from '../../constants/theme';
import { BibleWebViewAction, BibleWebViewHandle } from './BibleWebView';

interface BibleWebViewProps {
  html: string;
  scrollEnabled?: boolean;
  selectText?: boolean;
  onAction?: (action: BibleWebViewAction) => void;
}

/** Web Bible chapter renderer — plain iframe, same HTML builder as the native renderer. */
const BibleWebView = forwardRef<BibleWebViewHandle, BibleWebViewProps>(({ html, onAction }, ref) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useImperativeHandle(ref, () => ({
    selectVerse: (verse: number | string) => {
      const win = iframeRef.current?.contentWindow as (Window & { selectBibleVerse?: (verse: string) => void }) | null | undefined;
      win?.selectBibleVerse?.(String(verse));
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

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin allow-scripts"
      srcDoc={html}
      style={{ flex: 1, width: '100%', height: '100%', border: 'none', backgroundColor: COLORS.black }}
    />
  );
});

BibleWebView.displayName = 'BibleWebView';

export default BibleWebView;
