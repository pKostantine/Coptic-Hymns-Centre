import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { COLORS } from '../../constants/theme';
import { sectionRestoreCandidates } from '../../utils/sectionRestore';
import { useCopticFontDataUri } from '../../utils/useCopticFontDataUri';
import type { AppLanguage } from '../../utils/preferencesStorage';
import { buildDocumentHtml, DocumentAction, DocumentSection, VisibleColumns, withRememberedCollapse } from './documentHtml';

export type { DocumentAction, DocumentSection, DocumentVerse } from './documentHtml';

export interface DocumentWebViewHandle {
  scrollToSection: (id: string) => void;
  scrollToVerse: (id: string) => void;
  scrollToTune: (tune: string) => void;
  /** Pre-set the section the WebView will restore to on its next load (e.g. before triggering a state change that causes a full HTML rebuild). */
  setPreservedSection: (id: string) => void;
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
  /** Extra scrollable space at the bottom for floating app chrome such as the global mini player. */
  bottomContentInset?: number;
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
      bottomContentInset = 0,
      collapsedSectionIds,
    },
    ref,
  ) => {
    const copticFontDataUri = useCopticFontDataUri();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    // Whatever section the "currentSection" scroll-tracking script (see
    // documentHtml.ts) most recently reported. A settings change (font size,
    // a language toggle, comments/silent-prayers, Bishop Present) rebuilds
    // the whole HTML document, which reloads the iframe and resets scroll to
    // the top — restoring to this section's START on load is what brings
    // the user back to where they were instead. Deliberately section-
    // granular, not the exact verse — matches slideshow mode's own
    // settings-change restore. Seeded from initialSectionId (not null) so a
    // freshly mounted iframe (e.g. switching from slideshow mode, or a
    // brand-new document load) already knows where to land on its very
    // first load, rather than only being able to correct itself starting
    // from its *second* reload onward.
    const preservedSectionIdRef = useRef<string | null>(initialSectionId ?? null);

    useImperativeHandle(ref, () => ({
      scrollToSection: (id: string) => {
        const win = iframeRef.current?.contentWindow as (Window & { scrollToSection?: (id: string) => void }) | null | undefined;
        win?.scrollToSection?.(id);
      },
      scrollToVerse: (id: string) => {
        const win = iframeRef.current?.contentWindow as (Window & { scrollToVerse?: (id: string) => boolean }) | null | undefined;
        win?.scrollToVerse?.(id);
      },
      scrollToTune: (tune: string) => {
        const win = iframeRef.current?.contentWindow as (Window & { scrollToTune?: (tune: string) => void }) | null | undefined;
        win?.scrollToTune?.(tune);
      },
      setPreservedSection: (id: string) => {
        preservedSectionIdRef.current = id;
      },
    }));

    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        if (event.source !== iframeRef.current?.contentWindow) return;
        try {
          const action = JSON.parse(event.data);
          if (action?.type === 'currentSection' && action.sectionId) {
            preservedSectionIdRef.current = action.sectionId;
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

      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }, [onAction]);

    const handleLoad = () => {
      const win = iframeRef.current?.contentWindow as
        | (Window & { scrollToSection?: (id: string | string[]) => void })
        | null
        | undefined;
      // The whole chain, not just the remembered section: this load is
      // usually a settings change rebuilding the document, and that setting
      // may be what hid the section being restored to. See
      // sectionRestoreCandidates.
      const candidates = sectionRestoreCandidates(sections.map((section) => section.id), preservedSectionIdRef.current);
      if (candidates.length) win?.scrollToSection?.(candidates);
    };

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
        onLoad={handleLoad}
        style={{ flex: 1, width: '100%', height: '100%', border: 'none', backgroundColor: COLORS.black }}
      />
    );
  },
);

DocumentWebView.displayName = 'DocumentWebView';

export default DocumentWebView;
