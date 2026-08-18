import { useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '../ui/AppHeader';
import ContentSelectorDrawer from '../ui/ContentSelectorDrawer';
import LoadingScreen from '../ui/LoadingScreen';
import DocumentSurface from '../DocumentSurface';
import { DocumentAction, DocumentSection, DocumentWebViewHandle } from '../DocumentWebView';
import { formatEnglishDisplayText } from '../../../utils/displayText';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { MODAL_SUPPORTED_ORIENTATIONS } from '../../../utils/modalOrientations';
import { MOBILE_WEB_BREAKPOINT } from '../../../utils/useIsMobileWeb';

interface DocumentModalTarget {
  title: { english: string; arabic: string };
  sections: DocumentSection[];
  isAntiphonary?: boolean;
  subdocumentKey?: string;
}

interface DocumentModalProps {
  visible: boolean;
  title: { english: string; arabic: string } | null;
  sections: DocumentSection[] | null;
  isAntiphonary?: boolean;
  subdocumentKey?: string;
  onClose: () => void;
}

const ANTIPHONARY_GROUPS: { key: 'introduction' | 'adam' | 'vatos'; label: string }[] = [
  { key: 'introduction', label: 'Introduction' },
  { key: 'adam', label: 'Adam' },
  { key: 'vatos', label: 'Vatos' },
];

// COPTIC_PAULINE_EPISTLE/COPTIC_CATHOLIC_EPISTLE/COPTIC_PRAXIS (see
// SUBDOCUMENT_MAP in hymnLibrary.js) are always exactly 3 sections —
// introduction, the day's reading itself, conclusion — short enough that
// the vertical content-list drawer is redundant chrome; the pill row is
// the only navigation they get. The reading section itself carries no
// hymn_titles row (its citation, e.g. "Romans 1:1-7", is a readingReference
// verse *inside* it, not a section title) — the pill row's fallback label
// below is what actually gives it a pill.
const COPTIC_READINGS_SUBDOCUMENT_KEYS = new Set(['COPTIC_PAULINE_EPISTLE', 'COPTIC_CATHOLIC_EPISTLE', 'COPTIC_PRAXIS']);

/** A section's own title, or — for the untitled reading section in a Coptic readings subdocument — its reading-reference citation verse, so the pill row can represent it without ever giving that section a real title (which would render as its own yellow header in the document body). */
function getPillLabel(section: DocumentSection, includeReadingReference: boolean): string | null {
  const title = section.title?.english ? formatEnglishDisplayText(section.title.english) : section.title?.arabic;
  if (title) return title;
  if (!includeReadingReference) return null;
  const reference = section.verses.find((v) => v.type === 'readingReference');
  return reference ? reference.english || reference.arabic || null : null;
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
function DocumentModal({ visible, title, sections, isAntiphonary, subdocumentKey, onClose }: DocumentModalProps) {
  const { preferences } = useReadingPreferences();
  const [nestedModal, setNestedModal] = useState<DocumentModalTarget | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  const [selectedSlideSectionId, setSelectedSlideSectionId] = useState<string | undefined>();
  const documentRef = useRef<DocumentWebViewHandle>(null);
  const { width: screenWidth } = useWindowDimensions();
  // Width-aware, not just Platform.OS -- a narrow mobile-web browser should
  // get the same swipe-to-close gesture as the native app, same as
  // ServiceDocument.tsx/lectionary/index.tsx.
  const isMobileDocument = Platform.OS !== 'web' || screenWidth < MOBILE_WEB_BREAKPOINT;

  const isCopticReadingsSubdocument = Boolean(subdocumentKey && COPTIC_READINGS_SUBDOCUMENT_KEYS.has(subdocumentKey));

  const handleAction = (action: DocumentAction) => {
    if (!sections) return;

    if (action.type === 'openAntiphonary') {
      const triggerSection = sections.find((s) => s.id === action.sectionId);
      if (triggerSection?.subdocumentSections) {
        setNestedModal({
          title: { english: 'Antiphonary', arabic: 'الدفنار' },
          sections: triggerSection.subdocumentSections,
          isAntiphonary: true,
        });
      }
      return;
    }

    if (action.type === 'openSubdocument') {
      const triggerSection = sections.find((s) => s.id === action.sectionId);
      if (triggerSection?.subdocumentSections) {
        setNestedModal({
          title: triggerSection.title,
          sections: triggerSection.subdocumentSections,
          subdocumentKey: triggerSection.subdocumentKey,
        });
      }
    }
  };

  function jumpToSection(id: string) {
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
  const sectionPills = useMemo(
    () =>
      (sections || [])
        .map((section) => ({ section, label: getPillLabel(section, isCopticReadingsSubdocument) }))
        .filter((entry): entry is { section: DocumentSection; label: string } => Boolean(entry.label)),
    [sections, isCopticReadingsSubdocument],
  );

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

  // Left-edge swipe-right closes *this* modal only — same gesture ServiceDocument
  // uses to go back, but scoped to `onClose` instead of the parent screen's own
  // back navigation, so swiping out of a subdocument never also exits the
  // document underneath it (nested modals stack the same way: each one's own
  // gesture only closes itself). Disabled entirely while `nestedModal` is open
  // (a subdocument opened from within this one, e.g. an Antiphonary button
  // inside a subdocument) — same reasoning as ServiceDocument.tsx's
  // isCoveredByModal: this modal never unmounts while a nested one covers it,
  // so without this guard the same swipe could close BOTH levels at once
  // instead of just the topmost (nested) one.
  const closeSwipePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (nestedModal || selectorOpen) return false;
          const startsInLeftEdge = gestureState.x0 < 56;
          const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
          return startsInLeftEdge && isHorizontal && Math.abs(gestureState.dx) > 18;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (nestedModal || selectorOpen) return;
          if (gestureState.x0 < 56 && gestureState.dx > 60) {
            onClose();
          }
        },
      }),
    [onClose, nestedModal, selectorOpen],
  );

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose} supportedOrientations={MODAL_SUPPORTED_ORIENTATIONS}>
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={styles.screen}
        {...(isMobileDocument ? closeSwipePanResponder.panHandlers : {})}
      >
        {/* Web already always shows this header regardless of width (see
            ServiceDocument.tsx's doc comment), but unlike those screens this
            one is never hidden on the NATIVE APP either -- outside Slideshow
            Mode (see DocumentSurface.tsx: onOpenSelector only reaches
            SlideshowContainer, never the scroll-mode WebView reader), the
            list icon here is the ONLY way to open ContentSelectorDrawer, so
            hiding it natively would strand the user with no way to navigate
            this modal's sections. isMobileDocument still applies to the
            swipe-to-close gesture below. */}
        <AppHeader
          title={title || ''}
          canGoBack
          onBack={onClose}
          rightIcon={isCopticReadingsSubdocument ? undefined : 'list-outline'}
          rightAccessibilityLabel="Open content list"
          onRightPress={isCopticReadingsSubdocument ? undefined : () => setSelectorOpen(true)}
        />
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
            <DocumentSurface
              ref={documentRef}
              sections={sections}
              preferences={preferences}
              onAction={handleAction}
              selectedSectionId={selectedSlideSectionId}
              onCurrentSectionChange={setCurrentSectionId}
              onOpenSelector={isCopticReadingsSubdocument ? undefined : () => setSelectorOpen(true)}
            />
            {isCopticReadingsSubdocument ? null : (
              <ContentSelectorDrawer
                visible={selectorOpen}
                sections={sections}
                currentSectionId={currentSectionId}
                onClose={() => setSelectorOpen(false)}
                onSelectSection={jumpToSection}
                displaySilentPrayers={preferences.displaySilentPrayers}
                appLanguage={preferences.appLanguage}
                bishopPresent={preferences.bishopPresent}
              />
            )}
          </>
        )}
        <DocumentModal
          visible={Boolean(nestedModal)}
          title={nestedModal?.title ?? null}
          sections={nestedModal?.sections ?? null}
          isAntiphonary={nestedModal?.isAntiphonary}
          subdocumentKey={nestedModal?.subdocumentKey}
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
  onClose,
}: {
  visible: boolean;
  sections: DocumentSection[] | null;
  onClose: () => void;
}) {
  return (
    <DocumentModal
      visible={visible}
      title={{ english: 'Antiphonary', arabic: 'الدفنار' }}
      sections={sections}
      isAntiphonary
      onClose={onClose}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
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
