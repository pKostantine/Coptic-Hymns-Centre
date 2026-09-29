'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type GestureResponderEvent, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { formatEnglishDisplayText } from '../../../utils/displayText';
import { MODAL_SUPPORTED_ORIENTATIONS } from '../../../utils/modalOrientations';
import { isStylusGestureEvent } from '../../../utils/isStylusGestureEvent';
import GlobalNowPlayingOverlay from '../../playback/GlobalNowPlayingOverlay';
import DocumentSurface from '../DocumentSurface';
import { DocumentAction, DocumentSection, DocumentWebViewHandle } from '../DocumentWebView';
import { getSectionSelectorTitle } from '../sectionSelectorTitle';
import DocumentTopBar from '../ui/DocumentTopBar';
import ContentSelectorDrawer from '../ui/ContentSelectorDrawer';
import LoadingScreen from '../ui/LoadingScreen';
import CalendarScreen from './CalendarScreen';
import SeasonSelectorScreen from './SeasonSelectorScreen';
import SettingsScreen from './SettingsScreen';
import { getCurrentAppLanguage } from '../../../utils/preferencesStorage';
import { doxologyPillNames } from '../../../utils/doxologyPillNames';

interface DocumentModalTarget {
  title: { english: string; arabic: string; french?: string };
  sections: DocumentSection[];
  isAntiphonary?: boolean;
  subdocumentKey?: string;
  collapseMemoryScope: string;
}

interface DocumentModalProps {
  visible: boolean;
  title: { english: string; arabic: string; french?: string } | null;
  sections: DocumentSection[] | null;
  isAntiphonary?: boolean;
  subdocumentKey?: string;
  /** Parent-document path plus the exact section occurrence that opened this modal. */
  collapseMemoryScope: string;
  /** Parent document's bookmark ID (e.g. "liturgy:vespers") — when provided alongside subdocumentKey, the content selector shows a bookmark button that saves "${parentBookmarkId}:sub:${subdocumentKey}". */
  parentBookmarkId?: string;
  onClose: () => void;
}

const ANTIPHONARY_GROUPS: { key: 'introduction' | 'adam' | 'vatos'; label: string }[] = [
  { key: 'introduction', label: 'Introduction' },
  { key: 'adam', label: 'Adam' },
  { key: 'vatos', label: 'Vatos' },
];

// COPTIC_PAULINE_EPISTLE/COPTIC_CATHOLIC_EPISTLE/COPTIC_PRAXIS (see
// SUBDOCUMENT_MAP in hymnLibrary.js) each include one untitled reading
// section whose citation (e.g. "Romans 1:1-7") lives as a readingReference
// verse inside it, not as a section title. This lets the pill row use that
// citation as the visible label.
const COPTIC_READINGS_SUBDOCUMENT_KEYS = new Set(['COPTIC_PAULINE_EPISTLE', 'COPTIC_CATHOLIC_EPISTLE', 'COPTIC_PRAXIS']);

/** A section's own title (with its citation, for a reading titled like one), or — for the untitled reading section in a Coptic readings subdocument — its reading-reference citation verse, so the pill row can represent it without ever giving that section a real title (which would render as its own yellow header in the document body). */
function getPillLabel(section: DocumentSection, includeReadingReference: boolean): string | null {
  if (section.title?.english || section.title?.arabic) {
    // Named as the content selector names it — a prophecy's pill reads
    // "Prophecy 2 (Isaiah 1:2-18)", as it does in the parent's list.
    const selectorTitle = getSectionSelectorTitle(section);
    if (getCurrentAppLanguage() === 'fr' && selectorTitle.french) return formatEnglishDisplayText(selectorTitle.french);
    return selectorTitle.english ? formatEnglishDisplayText(selectorTitle.english) : selectorTitle.arabic || null;
  }
  if (!includeReadingReference) return null;
  const reference = section.verses.find((v) => v.type === 'readingReference');
  if (reference && getCurrentAppLanguage() === 'fr' && reference.french) return reference.french;
  return reference ? reference.english || reference.arabic || null : null;
}

/**
 * The edge swipes, for a swipe that starts in the side safe-area inset.
 *
 * In landscape a phone insets a document from the notch on both sides, so a
 * swipe from the screen edge starts in the SafeAreaView's padding, outside
 * the document itself. The responder system never offered such a swipe to
 * the PanResponder -- something else had already taken the touch -- so there
 * was no way to swipe out. Raw touch events still reach the SafeAreaView, so
 * the swipe is read from those instead. Nothing is claimed: a tap that starts
 * in the inset (on the end of the Now Playing bar, say) still goes where it
 * was going. In portrait there is no side inset, so nothing changes there.
 *
 * An Android Modal is a dialog that pads its content itself, so there the
 * strip isn't the SafeAreaView's and this never sees it. Translucent bars
 * would hand it over, but the dialog then draws dark status bar icons on the
 * black page; a swipe starting just inside the text works on Android as is.
 */
function useInsetEdgeSwipe(enabled: boolean, onSwipeFromLeft: () => void, onSwipeFromRight?: () => void) {
  const { left: leftInset, right: rightInset } = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const startRef = useRef<{ x: number; y: number; edge: 'left' | 'right' } | null>(null);

  const startsInInset = useCallback(
    (x: number) => (leftInset > 0 && x < leftInset) || (rightInset > 0 && x > screenWidth - rightInset),
    [leftInset, rightInset, screenWidth],
  );
  const touchPoint = (event: GestureResponderEvent) => event.nativeEvent.changedTouches?.[0] ?? event.nativeEvent;

  const handlers = {
    onTouchStart: (event: GestureResponderEvent) => {
      startRef.current = null;
      if (!enabled || isStylusGestureEvent(event) || event.nativeEvent.touches.length > 1) return;
      const { pageX, pageY } = touchPoint(event);
      if (!startsInInset(pageX)) return;
      startRef.current = { x: pageX, y: pageY, edge: pageX < leftInset ? 'left' : 'right' };
    },
    onTouchEnd: (event: GestureResponderEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start || !enabled) return;
      const { pageX, pageY } = touchPoint(event);
      const dx = pageX - start.x;
      if (Math.abs(dx) <= Math.abs(pageY - start.y)) return;
      if (start.edge === 'left' && dx > 60) onSwipeFromLeft();
      else if (start.edge === 'right' && dx < -36) onSwipeFromRight?.();
    },
    onTouchCancel: () => {
      startRef.current = null;
    },
  };
  return { handlers, startsInInset };
}

/**
 * Full-screen modal that renders a subdocument or the Antiphonary using the
 * same document surface as the main reader (same fonts, language toggles,
 * comments/silent-prayer settings, minimization, slideshow support).
 *
 * `sections` is always prefetched — the parent document's own hydration
 * already recursively loaded and prepared every subdocument/Antiphonary this
 * document references (see hydrateWithFlags in hymnLibrary.js), so opening
 * this modal is a local render, never a fresh Supabase round-trip. A button
 * tapped *inside* this modal opens another modal stacked on top, reading
 * from that section's own (already prefetched) subdocumentSections — there's
 * no fixed nesting cap, it's bounded only by how many buttons a user taps
 * through and the depth-3 guard hydrateWithFlags applies while prefetching.
 */
function DocumentModal({ visible, title, sections, isAntiphonary, subdocumentKey, collapseMemoryScope, parentBookmarkId, onClose }: DocumentModalProps) {
  const { preferences, toggleBishopPresent, isBookmarked, toggleBookmark } = useReadingPreferences();
  const [nestedModal, setNestedModal] = useState<DocumentModalTarget | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  // Calendar/Settings can't be *navigated* to from in here. This whole
  // document is a Modal, and a Modal renders above the navigator on every
  // platform — so router.push swapped the screen underneath and the user had
  // to back out of the subdocument before they could see what they opened.
  // They're rendered as an overlay of this modal instead, which also means
  // closing one drops the reader straight back into the subdocument, on the
  // same hymn, with nothing lost.
  const [overlayScreen, setOverlayScreen] = useState<'calendar' | 'seasons' | 'settings' | null>(null);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  const [selectedSlideSectionId, setSelectedSlideSectionId] = useState<string | undefined>();
  const documentRef = useRef<DocumentWebViewHandle>(null);
  const { width: screenWidth } = useWindowDimensions();
  // The app closes and navigates a subdocument entirely by edge swipe and so
  // shows no top bar; a browser has no such gesture and keeps the bar instead.
  const isMobileDocument = Platform.OS !== 'web';

  // Anything stacked over this document: a deeper subdocument, the content
  // selector, or one of the overlay screens above. While any of them is up,
  // this document's own gestures and hotkeys must stay inert so a swipe
  // dismisses only the topmost layer.
  const isCovered = Boolean(nestedModal) || selectorOpen || overlayScreen !== null;

  const isCopticReadingsSubdocument = Boolean(subdocumentKey && COPTIC_READINGS_SUBDOCUMENT_KEYS.has(subdocumentKey));
  const subdocumentBookmarkId =
    parentBookmarkId && subdocumentKey ? `${parentBookmarkId}:sub:${subdocumentKey}` : undefined;

  const handleAction = (action: DocumentAction) => {
    if (!sections) return;

    if (action.type === 'currentSection') {
      // Only the scrolling reader reports this; slideshow mode reports the
      // same thing through onCurrentSectionChange. Either way it is what the
      // content selector highlights and what a Slideshow Mode flip restores
      // to, so both renderers have to keep it current. Ignored while
      // anything covers the document: the layout shift a modal opening
      // causes is enough to make the reading-line tracker briefly report a
      // section the reader never actually scrolled to.
      if (!isCovered && action.sectionId) setCurrentSectionId(action.sectionId);
      return;
    }

    if (action.type === 'openAntiphonary') {
      const triggerSection = sections.find((s) => s.id === action.sectionId);
      if (triggerSection?.subdocumentSections) {
        setNestedModal({
          title: { english: 'Antiphonary', arabic: 'الدفنار', french: 'Antiphonaire' },
          sections: triggerSection.subdocumentSections,
          isAntiphonary: true,
          collapseMemoryScope: `${collapseMemoryScope}:sub:${triggerSection.id}`,
        });
      }
      return;
    }

    if (action.type === 'openSubdocument') {
      const triggerSection = sections.find((s) => s.id === action.sectionId);
      if (triggerSection?.subdocumentSections) {
        setNestedModal({
          title: getSectionSelectorTitle(triggerSection),
          sections: triggerSection.subdocumentSections,
          subdocumentKey: triggerSection.subdocumentKey,
          collapseMemoryScope: `${collapseMemoryScope}:sub:${triggerSection.id}`,
        });
      }
      return;
    }

    if (action.type === 'swipeBack') {
      if (!isCovered) onClose();
      return;
    }

    if (action.type === 'openSelector') {
      if (!isCovered) setSelectorOpen(true);
      return;
    }
  };

  function jumpToSection(id: string) {
    // Where the reader asked to be, straight away: a pick from the content
    // list lands while the list still covers this document, and reports are
    // ignored then, so this would otherwise still hold wherever they were
    // before -- the top -- for anything that remounts the reader.
    setCurrentSectionId(id);
    if (preferences.slideshowMode) setSelectedSlideSectionId(id);
    else documentRef.current?.scrollToSection(id);
  }

  // One tappable pill per top-level section, mirroring the old app's
  // Doxologies/Synaxarium/Melodies/Litanies modals (every subdocument got
  // this row there) — ported forward and made generic here instead of
  // reimplemented per document type, and applied to every subdocument, not
  // just those four. Antiphonary keeps its own fixed 3-group row instead
  // (its "sections" don't line up 1:1 with the Introduction/Adam/Vatos tune
  // groups a reader actually wants to jump between). In a Coptic readings
  // subdocument specifically, the untitled reading section also gets a pill
  // (via its own readingReference citation as a fallback label) — everywhere
  // else, an untitled section stays exactly that: not a navigable stop.
  // The Doxologies' pills go by short names (doxologyPillNames.ts); the
  // content selector keeps the full titles.
  const sectionPills = useMemo(() => {
    const pills = (sections || [])
      .filter((section) => !(section.bishopOnly && !preferences.bishopPresent) && !(section.priestOnly && preferences.bishopPresent))
      .map((section) => ({ section, label: getPillLabel(section, isCopticReadingsSubdocument) }))
      .filter((entry): entry is { section: DocumentSection; label: string } => Boolean(entry.label));
    if (subdocumentKey !== 'DOXOLOGIES') return pills;
    const shortNames = doxologyPillNames(
      pills.map(({ section }) => ({ hymnKey: section.hymnKey, title: getSectionSelectorTitle(section) })),
      preferences.appLanguage === 'fr',
    );
    return pills.map((pill, index) => {
      const shortName = shortNames[index];
      return shortName ? { ...pill, label: formatEnglishDisplayText(shortName) } : pill;
    });
  }, [sections, isCopticReadingsSubdocument, preferences.bishopPresent, preferences.appLanguage, subdocumentKey]);

  // Flipping Slideshow Mode swaps one renderer for the other (DocumentSurface
  // renders SlideshowContainer or DocumentWebView, never both), and neither
  // one's internal "where was the reader" tracking survives that. Both keep
  // currentSectionId live, so it is the right hymn whichever mode reported it
  // — hand it to whichever renderer is coming in. Scroll mode picks it up
  // declaratively via initialScrollSectionId below; slideshow mode needs the
  // explicit selection. The ref starts equal to the current value, so this
  // only ever fires on a real flip, never on mount.
  const previousSlideshowModeRef = useRef(preferences.slideshowMode);
  useEffect(() => {
    if (previousSlideshowModeRef.current === preferences.slideshowMode) return;
    previousSlideshowModeRef.current = preferences.slideshowMode;
    if (!preferences.slideshowMode || !currentSectionId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedSlideSectionId(currentSectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.slideshowMode]);

  function selectAntiphonaryGroup(group: 'introduction' | 'adam' | 'vatos') {
    if (!sections) return;

    if (group === 'adam' || group === 'vatos') {
      // scrollToTune only exists on the WebView reader (it finds the first
      // [data-tune] element) -- slideshow mode has no equivalent single-verse
      // jump, so find whichever section holds the first verse tagged with
      // this tune (see addTuneMarkersToAntiphonarySections in
      // hymnLibrary.js) and jump there at section granularity instead.
      if (preferences.slideshowMode) {
        const targetSection = sections.find((section) => section.verses.some((verse) => verse.tune === group));
        if (targetSection) setSelectedSlideSectionId(targetSection.id);
        return;
      }
      documentRef.current?.scrollToTune(group);
      return;
    }

    const introSection = sections.find((section) => /^introduction$/i.test(section.title?.english || ''));
    if (!introSection) return;
    if (preferences.slideshowMode) setSelectedSlideSectionId(introSection.id);
    else documentRef.current?.scrollToSection(introSection.id);
  }

  // Capture-phase gesture handler for the two screen-edge swipes: left-edge
  // right-swipe closes this modal; right-edge left-swipe opens the content
  // selector. Using onMoveShouldSetPanResponderCapture (not the plain non-
  // capture variant) is essential — in slideshow mode, NavigationOverlay
  // inside SlideshowContainer also uses capture, and descendant capture fires
  // AFTER ancestor capture, so SafeAreaView wins the gesture before
  // NavigationOverlay can steal it. Disabled entirely while nestedModal is open
  // so swiping only dismisses the topmost level, not both at once.
  // A swipe that starts in the side inset of a landscape phone is read by
  // useInsetEdgeSwipe instead -- never by both.
  const insetEdgeSwipe = useInsetEdgeSwipe(!isCovered, onClose, () => setSelectorOpen(true));
  const { startsInInset } = insetEdgeSwipe;
  const swipeGesturePanResponder = useMemo(() => {
    const selectorEdgeWidth = Math.min(240, Math.max(128, screenWidth * 0.18));
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        if (isCovered || isStylusGestureEvent(_) || startsInInset(gestureState.x0)) return false;
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        if (!isHorizontal) return false;
        const isCloseSwipe = gestureState.x0 < 56 && gestureState.dx > 12;
        const isSelectorSwipe =
          gestureState.x0 > screenWidth - selectorEdgeWidth &&
          gestureState.dx < -12;
        return isCloseSwipe || isSelectorSwipe;
      },
      onPanResponderRelease: (event, gestureState) => {
        if (isCovered || isStylusGestureEvent(event) || startsInInset(gestureState.x0)) return;
        if (gestureState.x0 < 56 && gestureState.dx > 60) {
          onClose();
          return;
        }
        const selectorEdge = Math.min(240, Math.max(128, screenWidth * 0.18));
        if (gestureState.x0 > screenWidth - selectorEdge && gestureState.dx < -36) {
          setSelectorOpen(true);
        }
      },
    });
  }, [onClose, isCovered, screenWidth, startsInInset]);

  // Calendar and Settings open over this modal rather than as screens of
  // their own, so they don't get the navigator's swipe-back. The same
  // left-edge swipe closes them here: back into the subdocument, or from the
  // season list back to the calendar it was opened from.
  const overlayInsetEdgeSwipe = useInsetEdgeSwipe(overlayScreen !== null, () =>
    setOverlayScreen((screen) => (screen === 'seasons' ? 'calendar' : null)),
  );
  const overlayStartsInInset = overlayInsetEdgeSwipe.startsInInset;
  const overlaySwipePanResponder = useMemo(() => {
    const closeOverlay = () => setOverlayScreen((screen) => (screen === 'seasons' ? 'calendar' : null));
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (event, gestureState) => {
        if (isStylusGestureEvent(event) || overlayStartsInInset(gestureState.x0)) return false;
        return gestureState.x0 < 56 && gestureState.dx > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderRelease: (event, gestureState) => {
        if (isStylusGestureEvent(event) || overlayStartsInInset(gestureState.x0)) return;
        if (gestureState.x0 < 56 && gestureState.dx > 60) closeOverlay();
      },
    });
  }, [overlayStartsInInset]);

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose} supportedOrientations={MODAL_SUPPORTED_ORIENTATIONS}>
      <SafeAreaView
        // Same split as ServiceDocument: on web the bar below supplies the top
        // inset itself, while the app has no bar and must inset for the notch.
        edges={Platform.OS === 'web' ? ['left', 'right', 'bottom'] : undefined}
        style={styles.screen}
        {...(isMobileDocument ? swipeGesturePanResponder.panHandlers : {})}
        {...(isMobileDocument ? insetEdgeSwipe.handlers : {})}
      >
        {/* A subdocument opens on top of a document the reader is already in,
            so on the app it gets no bar at all -- same as the document
            underneath it (see ServiceDocument.tsx). Both of the bar's actions
            already have native gestures in swipeGesturePanResponder below:
            swipe in from the left edge to close, in from the right to open
            ContentSelectorDrawer. A browser has neither gesture, so the web
            build keeps the bar. */}
        {!isMobileDocument ? (
          <DocumentTopBar
            title={title || ''}
            onBack={onClose}
            backAccessibilityLabel="Close subdocument"
            trailingIcon="list-outline"
            trailingAccessibilityLabel="Open content list"
            onTrailingPress={() => setSelectorOpen(true)}
          />
        ) : null}
        {isAntiphonary ? (
          <View style={styles.selectorBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorContent}>
              {ANTIPHONARY_GROUPS.map((group) => (
                <Pressable key={group.key} style={styles.selectorPill} onPress={() => selectAntiphonaryGroup(group.key)}>
                  <Text numberOfLines={1} style={styles.selectorPillText}>{group.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : sectionPills.length > 1 ? (
          <View style={styles.selectorBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorContent}>
              {sectionPills.map(({ section, label }) => (
                <Pressable key={section.id} style={styles.selectorPill} onPress={() => jumpToSection(section.id)}>
                  <Text numberOfLines={1} style={styles.selectorPillText}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
        {!sections ? (
          <LoadingScreen />
        ) : (
          <>
            <View style={styles.documentFrame}>
              <DocumentSurface
                ref={documentRef}
                sections={sections}
                preferences={preferences}
                collapseMemoryScope={collapseMemoryScope}
                onAction={handleAction}
                selectedSectionId={selectedSlideSectionId}
                onCurrentSectionChange={setCurrentSectionId}
                onOpenSelector={() => setSelectorOpen(true)}
                initialScrollSectionId={currentSectionId}
                onCollapseToggle={setSelectedSlideSectionId}
                keyboardNavigationEnabled={visible && !isCovered}
              />
            </View>
            <ContentSelectorDrawer
              visible={selectorOpen}
              sections={sections}
              currentSectionId={currentSectionId}
              onClose={() => setSelectorOpen(false)}
              onSelectSection={jumpToSection}
              bookmarked={subdocumentBookmarkId ? isBookmarked(subdocumentBookmarkId) : undefined}
              onToggleBookmark={subdocumentBookmarkId ? () => toggleBookmark(subdocumentBookmarkId) : undefined}
              onOpenCalendar={() => setOverlayScreen('calendar')}
              onOpenSettings={() => setOverlayScreen('settings')}
              bishopPresent={preferences.bishopPresent}
              onToggleBishopPresent={toggleBishopPresent}
              displaySilentPrayers={preferences.displaySilentPrayers}
              appLanguage={preferences.appLanguage}
            />
          </>
        )}
        <GlobalNowPlayingOverlay />
        {/* Rendered from inside this document's own Modal, so Calendar and
            Settings appear OVER the subdocument instead of behind it, and
            closing one drops straight back into it. */}
        <Modal
          animationType="slide"
          visible={overlayScreen !== null}
          onRequestClose={() => setOverlayScreen(null)}
          supportedOrientations={MODAL_SUPPORTED_ORIENTATIONS}
        >
          <View
            style={styles.overlayFrame}
            {...(isMobileDocument ? overlaySwipePanResponder.panHandlers : {})}
            {...(isMobileDocument ? overlayInsetEdgeSwipe.handlers : {})}
          >
            {overlayScreen === 'calendar' ? (
              <CalendarScreen
                onClose={() => setOverlayScreen(null)}
                onOpenSeasonSelector={() => setOverlayScreen('seasons')}
              />
            ) : null}
            {overlayScreen === 'seasons' ? <SeasonSelectorScreen onClose={() => setOverlayScreen('calendar')} /> : null}
            {overlayScreen === 'settings' ? <SettingsScreen onClose={() => setOverlayScreen(null)} /> : null}
          </View>
        </Modal>
        <DocumentModal
          visible={Boolean(nestedModal)}
          title={nestedModal?.title ?? null}
          sections={nestedModal?.sections ?? null}
          isAntiphonary={nestedModal?.isAntiphonary}
          subdocumentKey={nestedModal?.subdocumentKey}
          collapseMemoryScope={nestedModal?.collapseMemoryScope ?? `${collapseMemoryScope}:sub:unknown`}
          onClose={() => setNestedModal(null)}
        />
      </SafeAreaView>
    </Modal>
  );
}

export function SubdocumentModal(props: Omit<DocumentModalProps, 'isAntiphonary'>) {
  return <DocumentModal {...props} isAntiphonary={false} />;
}

export function AntiphonaryModal({
  visible,
  sections,
  collapseMemoryScope,
  onClose,
}: {
  visible: boolean;
  sections: DocumentSection[] | null;
  collapseMemoryScope: string;
  onClose: () => void;
}) {
  return (
    <DocumentModal
      visible={visible}
      title={{ english: 'Antiphonary', arabic: 'الدفنار', french: 'Antiphonaire' }}
      sections={sections}
      isAntiphonary
      collapseMemoryScope={collapseMemoryScope}
      onClose={onClose}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  overlayFrame: { flex: 1, backgroundColor: COLORS.black },
  documentFrame: { flex: 1, position: 'relative' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  loading: { fontFamily: TYPOGRAPHY.body, color: COLORS.muted, fontSize: 17 },
  // Ported from the old app's modalSelector/modalSelectorContent/
  // modalSelectorItem/modalSelectorText (HymnDisplayScreen.js) — same dark
  // bar of scrollable, outlined pills, one per top-level section, used
  // there for Doxologies/Synaxarium/Melodies/Litanies (and Antiphonary's
  // fixed 3 groups); ported forward as a single generic row so every
  // subdocument gets it, not just those specific document types.
  selectorBar: {
    backgroundColor: '#111111',
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    maxHeight: 58,
  },
  selectorContent: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  selectorPill: {
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    borderWidth: 1,
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: SPACING.md,
  },
  selectorPillText: {
    color: COLORS.text,
    flexShrink: 0,
    fontSize: 14,
    fontWeight: '800',
  },
});
