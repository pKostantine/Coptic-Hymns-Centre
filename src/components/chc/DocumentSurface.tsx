import { forwardRef, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import SlideshowContainer from './SlideshowContainer';
import DocumentWebView, { DocumentAction, DocumentSection, DocumentWebViewHandle } from './DocumentWebView';
import { CHC_SLIDESHOW_THEME } from '../../constants/theme';
import { fontScaleToPx, ReadingPreferences } from '../../utils/preferencesStorage';

interface DocumentSurfaceProps {
  sections: DocumentSection[];
  preferences: ReadingPreferences;
  onAction?: (action: DocumentAction) => void;
  selectedSectionId?: string | null;
  onCurrentSectionChange?: (id: string) => void;
  onOpenSelector?: () => void;
}

/**
 * Renders a hydrated document either as the scrolling WebView reader or, when
 * Slideshow Mode is on, as paginated slides (SlideshowContainer). Shared by
 * the main document screen and the subdocument/Antiphonary modals so both
 * get slideshow support for free. Slideshow mode has no equivalent to
 * subdocument/Antiphonary buttons (SlideshowContainer only knows titles and
 * verses) — a button section shows as a plain title slide there, non-tappable.
 */
const DocumentSurface = forwardRef<DocumentWebViewHandle, DocumentSurfaceProps>(
  ({ sections, preferences, onAction, selectedSectionId, onCurrentSectionChange, onOpenSelector }, ref) => {
    const { width: screenWidth } = useWindowDimensions();

    const titleHelpers = useMemo(
      () => ({
        getTitleParts: (title: { english: string; arabic: string }) => title || { english: '', arabic: '' },
        getTitleText: (title: { english: string; arabic: string }) => title?.english || '',
        shouldShowEnglishTitle: () => preferences.visibleLanguages.english,
        shouldShowArabicTitle: (title: { english: string; arabic: string }) =>
          preferences.visibleLanguages.arabic && Boolean(title?.arabic),
      }),
      [preferences.visibleLanguages.english, preferences.visibleLanguages.arabic],
    );

    if (preferences.slideshowMode) {
      return (
        <SlideshowContainer
          sections={sections}
          visibleLanguages={preferences.visibleLanguages}
          fontSize={fontScaleToPx(preferences.fontScale)}
          theme={CHC_SLIDESHOW_THEME}
          tableWidth={screenWidth}
          titleHelpers={titleHelpers}
          selectedSectionId={selectedSectionId}
          refreshKey={undefined}
          onCurrentSectionChange={onCurrentSectionChange}
          onOpenSelector={onOpenSelector}
          viewportHeightOverride={undefined}
        />
      );
    }

    return (
      <DocumentWebView
        ref={ref}
        sections={sections}
        fontSize={fontScaleToPx(preferences.fontScale)}
        visibleColumns={{
          english: preferences.visibleLanguages.english,
          coptic: preferences.visibleLanguages.coptic,
          arabic: preferences.visibleLanguages.arabic,
        }}
        selectText={preferences.selectText}
        displayComments={preferences.displayComments}
        displaySilentPrayers={preferences.displaySilentPrayers}
        bishopPresent={preferences.bishopPresent}
        copticRecitedPrayers={preferences.visibleLanguages.copticRecitedPrayers}
        onAction={onAction}
      />
    );
  },
);

DocumentSurface.displayName = 'DocumentSurface';

export default DocumentSurface;
