import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { COLORS } from '../../constants/theme';
import { sectionRestoreCandidates, type DocumentRestoreRequest } from '../../utils/sectionRestore';
import { useCopticFontDataUri } from '../../utils/useCopticFontDataUri';
import type { AppLanguage } from '../../utils/preferencesStorage';
import type { SermonHighlight } from '../../types/sermonPlanner';
import { buildDocumentHtml, DocumentAction, DocumentSection, VisibleColumns, withRememberedCollapse } from './documentHtml';

export type { DocumentAction, DocumentSection, DocumentVerse } from './documentHtml';

export interface DocumentWebViewHandle {
  scrollToSection: (id: string, edge?: 'start' | 'end') => void;
  scrollToVerse: (id: string) => void;
  scrollToTune: (tune: string) => void;
  /** Pre-set the section the WebView will restore to on its next load (e.g. before triggering a state change that causes a full HTML rebuild). */
  setPreservedSection: (id: string, edge?: 'start' | 'end') => void;
  scrollToSermonHighlight: (id: string) => void;
}

interface DocumentWebViewProps {
  sections: DocumentSection[];
  fontSize?: number;
  visibleColumns?: VisibleColumns;
  appLanguage?: AppLanguage;
  selectText?: boolean;
  displayComments?: boolean;
  displaySilentPrayers?: boolean;
  bishopPresent?: boolean;
  copticRecitedPrayers?: boolean;
  copticGospelRite?: boolean;
  /** Forces every verse's person-type indicator hidden — see documentHtml.ts's buildDocumentHtml. */
  suppressAllSpeakerLabels?: boolean;
  onAction?: (action: DocumentAction) => void;
  /** The reader's remembered open/closed choice per section, overriding each one's database default. Deliberately not a dependency of the HTML build below — see the ref there. */
  collapsedSectionIds?: Record<string, boolean>;
  /** Section to scroll to the moment this WebView finishes its first load — e.g. wherever the user was reading in slideshow mode just before switching, or the last remembered position for a brand-new mount. Only consulted once, at mount; changing it on a later render has no effect (use the imperative scrollToSection handle for that). */
  initialSectionId?: string | null;
  /** Explicit post-settings/calendar jump. The token forces a jump even to the already selected hymn. */
  restoreRequest?: DocumentRestoreRequest | null;
  /** Extra scrollable space at the bottom for floating app chrome such as the global mini player. */
  bottomContentInset?: number;
  sermonPlannerMode?: boolean;
  sermonHighlights?: SermonHighlight[];
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
      appLanguage = 'en',
      selectText = false,
      displayComments = false,
      displaySilentPrayers = false,
      bishopPresent = false,
      copticRecitedPrayers = true,
      copticGospelRite = false,
      suppressAllSpeakerLabels = false,
      onAction,
      initialSectionId,
      restoreRequest,
      bottomContentInset = 0,
      collapsedSectionIds,
      sermonPlannerMode = false,
      sermonHighlights = [],
    },
    ref,
  ) => {
    const copticFontDataUri = useCopticFontDataUri();
    const webviewRef = useRef<WebView>(null);
    // Whatever section the "currentSection" scroll-tracking script (see
    // documentHtml.ts) most recently reported. A settings change (font size,
    // a language toggle, comments/silent-prayers, Bishop Present) rebuilds
    // the whole HTML document, which reloads the WebView and resets scroll
    // to the top — restoring to this section's START on load is what brings
    // the user back to where they were instead. Deliberately section-
    // granular, not the exact verse — matches slideshow mode's own
    // settings-change restore. Seeded from initialSectionId (not null) so a
    // freshly mounted WebView (e.g. switching from slideshow mode, or a
    // brand-new document load) already knows where to land on its very
    // first load, rather than only being able to correct itself starting
    // from its *second* reload onward.
    const preservedSectionIdRef = useRef<string | null>(initialSectionId ?? null);
    const preservedEdgeRef = useRef<'start' | 'end'>('start');
    const pendingRestoreSectionIdRef = useRef<string | null>(null);
    const lastRestoreTokenRef = useRef<string | null>(null);
    // Assign before the rebuilt HTML/iframe is committed, never after a
    // transient "at the top" position report can overwrite the target.
    if (restoreRequest && lastRestoreTokenRef.current !== restoreRequest.token) {
      lastRestoreTokenRef.current = restoreRequest.token;
      preservedSectionIdRef.current = restoreRequest.target.sectionId;
      preservedEdgeRef.current = restoreRequest.target.edge;
      pendingRestoreSectionIdRef.current = restoreRequest.target.sectionId;
    }

    useImperativeHandle(ref, () => ({
      scrollToSection: (id: string, edge: 'start' | 'end' = 'start') => {
        webviewRef.current?.injectJavaScript(`window.scrollToSection(${JSON.stringify(id)}, ${JSON.stringify(edge)}); true;`);
      },
      scrollToVerse: (id: string) => {
        webviewRef.current?.injectJavaScript(`window.scrollToVerse(${JSON.stringify(id)}); true;`);
      },
      scrollToTune: (tune: string) => {
        webviewRef.current?.injectJavaScript(`window.scrollToTune(${JSON.stringify(tune)}); true;`);
      },
      setPreservedSection: (id: string, edge: 'start' | 'end' = 'start') => {
        preservedSectionIdRef.current = id;
        preservedEdgeRef.current = edge;
        pendingRestoreSectionIdRef.current = id;
      },
      scrollToSermonHighlight: (id: string) => {
        webviewRef.current?.injectJavaScript(`window.scrollToSermonHighlight && window.scrollToSermonHighlight(${JSON.stringify(id)}); true;`);
      },
    }));

    const syncSermonHighlights = () => {
      if (!sermonPlannerMode) return;
      webviewRef.current?.injectJavaScript(
        `window.setSermonHighlights && window.setSermonHighlights(${JSON.stringify(sermonHighlights)}); true;`,
      );
    };

    useEffect(() => {
      syncSermonHighlights();
      // The serialized highlight payload is the actual renderer dependency.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sermonPlannerMode, JSON.stringify(sermonHighlights)]);

    const handleMessage = (event: WebViewMessageEvent) => {
      try {
        const action = JSON.parse(event.nativeEvent.data);
        if (action?.type === 'currentSection' && action.sectionId) {
          if (pendingRestoreSectionIdRef.current && pendingRestoreSectionIdRef.current !== action.sectionId) return;
          pendingRestoreSectionIdRef.current = null;
          preservedSectionIdRef.current = action.sectionId;
          preservedEdgeRef.current = 'start';
        }
        // Remember the title that was actually tapped before the collapse
        // state rebuilds this HTML, so the reload stays anchored there.
        if (action?.type === 'toggleCollapse' && action.sectionId) {
          preservedSectionIdRef.current = action.sectionId;
        }
        onAction?.(action);
      } catch {
        // Malformed message from the HTML content — ignore.
      }
    };

    const handleLoadEnd = () => {
      // The whole chain, not just the remembered section: this load is
      // usually a settings change rebuilding the document, and that setting
      // may be what hid the section being restored to. See
      // sectionRestoreCandidates.
      const candidates = sectionRestoreCandidates(sections.map((section) => section.id), preservedSectionIdRef.current)
        .map((sectionId, index) => ({ sectionId, edge: index ? 'end' : preservedEdgeRef.current }));
      if (candidates.length) {
        webviewRef.current?.injectJavaScript(
          `if (window.scrollToSection) { window.scrollToSection(${JSON.stringify(candidates)}); } true;`,
        );
      }
      syncSermonHighlights();
    };

    useEffect(() => {
      if (!restoreRequest) return;
      webviewRef.current?.injectJavaScript(
        `if (window.scrollToSection) { window.scrollToSection(${JSON.stringify(restoreRequest.target.sectionId)}, ${JSON.stringify(restoreRequest.target.edge)}); } true;`,
      );
    }, [restoreRequest?.token]);

    // Collapse state is deliberately NOT a dependency of this build, and is
    // read from a ref rather than captured by it. The reader opens and closes
    // a section in its own DOM the instant the button is tapped (see the
    // collapse-button handler in documentHtml) and reports it up only so the
    // choice is remembered -- rebuilding the HTML for that would reload this
    // whole document and throw the reader's place away, for a change that has
    // already visibly happened. Reading the ref at build time still gets every
    // choice made since whenever something real does force a rebuild (a font
    // size, a language, a new date), so nothing is silently lost either.
    const collapsedSectionIdsRef = useRef(collapsedSectionIds);
    useEffect(() => {
      collapsedSectionIdsRef.current = collapsedSectionIds;
    }, [collapsedSectionIds]);

    const html = useMemo(
      () =>
        copticFontDataUri
          ? buildDocumentHtml(withRememberedCollapse(sections, collapsedSectionIdsRef.current ?? {}), {
              copticFontDataUri,
              fontSize,
              visibleColumns,
              appLanguage,
              selectText,
              displayComments,
              displaySilentPrayers,
              bishopPresent,
              copticRecitedPrayers,
              copticGospelRite,
              suppressAllSpeakerLabels,
              bottomContentInset,
              sermonPlannerMode,
            })
          : null,
      [
        sections,
        copticFontDataUri,
        fontSize,
        visibleColumns,
        appLanguage,
        selectText,
        displayComments,
        displaySilentPrayers,
        bishopPresent,
        copticRecitedPrayers,
        copticGospelRite,
        suppressAllSpeakerLabels,
        bottomContentInset,
        sermonPlannerMode,
      ],
    );

    // Declared before the early return below so the hook order is fixed; the
    // empty-string case is never rendered.
    const source = useMemo(() => ({ html: html ?? '' }), [html]);

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
        // Memoized alongside the html string: a bare object literal here is a
        // new source on every render, and the point of the build above is that
        // a re-render caused by a collapse toggle changes nothing to reload.
        source={source}
        style={styles.webview}
        scrollEnabled
        showsVerticalScrollIndicator={false}
        javaScriptEnabled
        textInteractionEnabled={selectText || sermonPlannerMode}
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
