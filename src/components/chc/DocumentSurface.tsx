import { forwardRef, useMemo, useState } from 'react';
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
  /** Where a freshly mounted WebView (scroll mode) should scroll to on its very first load — see DocumentWebView's initialSectionId. Slideshow mode has its own equivalent via selectedSectionId, which (unlike this) can also drive jumps after the initial mount. */
  initialScrollSectionId?: string | null;
  /** Scales the reading font size relative to the user's normal preference. Defaults to 1 — subdocuments intentionally match the main document's font size exactly, same as every other reading preference. */
  fontScaleMultiplier?: number;
  /** Current on/off state of the in-document "Coptic Gospel Rite" toggle button (only rendered where GOSPEL_RITE content is spliced in). */
  copticGospelRite?: boolean;
  /** Forces every verse's person-type indicator (Priest:/Deacon:/etc.) hidden, in both the scroll and slideshow renderers — the Agpeya's own top-level documents default to this (see ServiceDocument.tsx), since the Hours are prayed by one person with no one to address a speaker role to; a subdocument/Antiphonary modal (DocumentModal.tsx) never sets this, so an Hour opened as a subdocument of a liturgical service keeps its real speaker roles. */
  suppressAllSpeakerLabels?: boolean;
  /** Called (in slideshow mode only) immediately after a collapse/expand toggle fires, with the toggled section's own id — lets the parent navigate to that section's title slide. */
  onCollapseToggle?: (sectionId: string) => void;
}

/** A comment verse counts as "within" a silent prayer if its section is titled Silent Prayer overall, or if the nearest non-comment neighbor verse is itself a silentPrayer/silentComment — mirrors documentHtml.ts's isWithinSilentPrayer so slideshow mode applies the same display-preference filtering as the WebView reader. */
function isCommentWithinSilentPrayer(section: DocumentSection, index: number): boolean {
  if (section.titlePrayerType === 'Silent Prayer') return true;
  const verses = section.verses;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (verses[i].type === 'comment') continue;
    return verses[i].type === 'silentPrayer' || verses[i].type === 'silentComment';
  }
  for (let i = index + 1; i < verses.length; i += 1) {
    if (verses[i].type === 'comment') continue;
    return verses[i].type === 'silentPrayer' || verses[i].type === 'silentComment';
  }
  return false;
}

/**
 * Applies the same displayComments/displaySilentPrayers filtering documentHtml.ts
 * does for the WebView reader (a whole section is dropped if it's titled
 * Silent Prayer and silent prayers are hidden; comment/silentPrayer verses
 * are filtered individually otherwise), and empties a section's verses when
 * it's currently minimized — SlideshowContainer's flattenSections always
 * still emits the title item (as a slide), it just never sees the excluded
 * verses, so pagination rebuilds around them automatically.
 */
function buildSlideshowSections(
  sections: DocumentSection[],
  {
    displayComments,
    displaySilentPrayers,
    bishopPresent,
    copticGospelRite,
  }: { displayComments: boolean; displaySilentPrayers: boolean; bishopPresent: boolean; copticGospelRite: boolean },
  collapsedSectionIds: Record<string, boolean>,
): DocumentSection[] {
  return sections
    .filter((section) => displaySilentPrayers || section.titlePrayerType !== 'Silent Prayer')
    .filter((section) => !(section.bishopOnly && !bishopPresent) && !(section.priestOnly && bishopPresent))
    .filter(
      (section) =>
        !(section.copticGospelRiteOnly && !copticGospelRite) && !(section.nonCopticGospelRiteOnly && copticGospelRite),
    )
    .map((section) => {
      const currentlyCollapsed = section.collapsible
        ? (collapsedSectionIds[section.id] ?? Boolean(section.defaultCollapsed))
        : false;

      const verses = currentlyCollapsed
        ? []
        : section.verses.filter((verse, index) => {
            if ((verse.bishopOnly && !bishopPresent) || (verse.priestOnly && bishopPresent)) return false;
            if ((verse.copticGospelRiteOnly && !copticGospelRite) || (verse.nonCopticGospelRiteOnly && copticGospelRite)) return false;
            // A row explicitly marked both Comment and Silent Prayer needs
            // BOTH toggles on — it's not "a comment" or "a silent prayer"
            // alone, it's both at once.
            if (verse.type === 'silentComment') return displayComments && displaySilentPrayers;
            if (verse.type === 'comment') {
              return isCommentWithinSilentPrayer(section, index) ? displayComments && displaySilentPrayers : displayComments;
            }
            return displaySilentPrayers || verse.type !== 'silentPrayer';
          });

      return { ...section, verses, currentlyCollapsed };
    });
}

/**
 * Renders a hydrated document either as the scrolling WebView reader or, when
 * Slideshow Mode is on, as paginated slides (SlideshowContainer). Shared by
 * the main document screen and the subdocument/Antiphonary modals so both
 * get slideshow support for free. Subdocument/Antiphonary sections render as
 * their own dedicated open-button slide in Slideshow Mode too, wired to the
 * same onAction handler as the WebView reader.
 */
const DocumentSurface = forwardRef<DocumentWebViewHandle, DocumentSurfaceProps>(
  (
    {
      sections,
      preferences,
      onAction,
      selectedSectionId,
      onCurrentSectionChange,
      onOpenSelector,
      fontScaleMultiplier = 1,
      copticGospelRite = false,
      suppressAllSpeakerLabels = false,
      initialScrollSectionId,
      onCollapseToggle,
    },
    ref,
  ) => {
    const { width: screenWidth } = useWindowDimensions();
    const fontSize = Math.round(fontScaleToPx(preferences.fontScale) * fontScaleMultiplier);
    // Keyed by section.id, same model as the old app's collapsedContentIds: a
    // missing entry falls back to the section's own defaultCollapsed, an
    // explicit entry (set by tapping the slideshow's collapse button) wins.
    const [collapsedSectionIds, setCollapsedSectionIds] = useState<Record<string, boolean>>({});

    // All titles (section titles, and Subdocument/Antiphonary open-button
    // labels) follow the App Language setting, not the document's own
    // visibleLanguages — this is menu-adjacent chrome, not reading content.
    // If the selected language has no title text for a given section (e.g.
    // Arabic selected but this hymn has no Arabic title), fall back to
    // whichever language does have one instead of showing nothing.
    const titleHelpers = useMemo(() => {
      const appLanguage = preferences.appLanguage;
      return {
        getTitleParts: (title: { english: string; arabic: string }) => title || { english: '', arabic: '' },
        getTitleText: (title: { english: string; arabic: string }) => title?.english || title?.arabic || '',
        shouldShowEnglishTitle: (title: { english: string; arabic: string }) =>
          appLanguage === 'en' || !title?.arabic,
        shouldShowArabicTitle: (title: { english: string; arabic: string }) =>
          appLanguage === 'ar' && Boolean(title?.arabic),
      };
    }, [preferences.appLanguage]);

    const slideshowSections = useMemo(
      () =>
        buildSlideshowSections(
          sections,
          {
            displayComments: preferences.displayComments,
            displaySilentPrayers: preferences.displaySilentPrayers,
            bishopPresent: preferences.bishopPresent,
            copticGospelRite,
          },
          collapsedSectionIds,
        ),
      [sections, preferences.displayComments, preferences.displaySilentPrayers, preferences.bishopPresent, copticGospelRite, collapsedSectionIds],
    );

    if (preferences.slideshowMode) {
      return (
        <SlideshowContainer
          sections={slideshowSections}
          visibleLanguages={preferences.visibleLanguages}
          fontSize={fontSize}
          theme={CHC_SLIDESHOW_THEME}
          tableWidth={screenWidth}
          titleHelpers={titleHelpers}
          selectedSectionId={selectedSectionId}
          refreshKey={undefined}
          onCurrentSectionChange={onCurrentSectionChange}
          onOpenSelector={onOpenSelector}
          viewportHeightOverride={undefined}
          bishopPresent={preferences.bishopPresent}
          onAction={onAction}
          copticGospelRite={copticGospelRite}
          suppressAllSpeakerLabels={suppressAllSpeakerLabels}
          onToggleCollapse={(sectionId: string) => {
            setCollapsedSectionIds((current) => ({
              ...current,
              [sectionId]: !(current[sectionId] ?? sections.find((s) => s.id === sectionId)?.defaultCollapsed ?? false),
            }));
            onCollapseToggle?.(sectionId);
          }}
        />
      );
    }

    return (
      <DocumentWebView
        ref={ref}
        sections={sections}
        fontSize={fontSize}
        visibleColumns={{
          english: preferences.visibleLanguages.english,
          coptic: preferences.visibleLanguages.coptic,
          arabic: preferences.visibleLanguages.arabic,
        }}
        appLanguage={preferences.appLanguage}
        selectText={preferences.selectText}
        displayComments={preferences.displayComments}
        displaySilentPrayers={preferences.displaySilentPrayers}
        bishopPresent={preferences.bishopPresent}
        copticGospelRite={copticGospelRite}
        copticRecitedPrayers={preferences.visibleLanguages.copticRecitedPrayers}
        suppressAllSpeakerLabels={suppressAllSpeakerLabels}
        onAction={onAction}
        initialSectionId={initialScrollSectionId}
      />
    );
  },
);

DocumentSurface.displayName = 'DocumentSurface';

export default DocumentSurface;
