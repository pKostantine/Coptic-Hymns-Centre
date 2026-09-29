import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { COLORS } from '../../constants/theme';
import type { BibleHighlight } from '../../types/bibleHighlights';
import { BibleWebViewAction, BibleWebViewHandle } from './BibleWebView';

interface BibleWebViewProps {
  html: string;
  restoreVerse?: string | null;
  scrollEnabled?: boolean;
  selectText?: boolean;
  highlights?: BibleHighlight[];
  onAction?: (action: BibleWebViewAction) => void;
}

type BibleFrameWindow = Window & {
  selectBibleVerse?: (verse: string) => void;
  setSermonHighlights?: (highlights: BibleHighlight[]) => void;
};

/** Web Bible chapter renderer — plain iframe, same HTML builder as the native renderer. */
const BibleWebView = forwardRef<BibleWebViewHandle, BibleWebViewProps>(({ html, restoreVerse, highlights, onAction }, ref) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const restoreVerseRef = useRef(restoreVerse);
  restoreVerseRef.current = restoreVerse;
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;
  const drawHighlights = () => {
    const win = iframeRef.current?.contentWindow as BibleFrameWindow | null | undefined;
    win?.setSermonHighlights?.(highlightsRef.current || []);
  };

  useEffect(() => {
    drawHighlights();
  }, [highlights]);

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
      onLoad={() => {
        drawHighlights();
        const verse = restoreVerseRef.current;
        if (verse) {
          const win = iframeRef.current?.contentWindow as (Window & { selectBibleVerse?: (verse: string) => void }) | null | undefined;
          win?.selectBibleVerse?.(verse);
        }
      }}
      style={{ flex: 1, width: '100%', height: '100%', border: 'none', backgroundColor: COLORS.black }}
    />
  );
});

BibleWebView.displayName = 'BibleWebView';

export default BibleWebView;
