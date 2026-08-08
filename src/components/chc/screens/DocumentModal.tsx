import { useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '../ui/AppHeader';
import ContentSelectorDrawer from '../ui/ContentSelectorDrawer';
import LoadingScreen from '../ui/LoadingScreen';
import DocumentSurface from '../DocumentSurface';
import { DocumentAction, DocumentSection, DocumentWebViewHandle } from '../DocumentWebView';
import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { MODAL_SUPPORTED_ORIENTATIONS } from '../../../utils/modalOrientations';

interface DocumentModalTarget {
  title: { english: string; arabic: string };
  sections: DocumentSection[];
  isAntiphonary?: boolean;
}

interface DocumentModalProps {
  visible: boolean;
  title: { english: string; arabic: string } | null;
  sections: DocumentSection[] | null;
  isAntiphonary?: boolean;
  onClose: () => void;
}

const ANTIPHONARY_GROUPS: { key: 'introduction' | 'adam' | 'vatos'; label: string }[] = [
  { key: 'introduction', label: 'Introduction' },
  { key: 'adam', label: 'Adam' },
  { key: 'vatos', label: 'Vatos' },
];

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
function DocumentModal({ visible, title, sections, isAntiphonary, onClose }: DocumentModalProps) {
  const { preferences } = useReadingPreferences();
  const [nestedModal, setNestedModal] = useState<DocumentModalTarget | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  const [selectedSlideSectionId, setSelectedSlideSectionId] = useState<string | undefined>();
  const documentRef = useRef<DocumentWebViewHandle>(null);

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
        setNestedModal({ title: triggerSection.title, sections: triggerSection.subdocumentSections });
      }
    }
  };

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
  // gesture only closes itself).
  const closeSwipePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const startsInLeftEdge = gestureState.x0 < 56;
          const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
          return startsInLeftEdge && isHorizontal && Math.abs(gestureState.dx) > 18;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.x0 < 56 && gestureState.dx > 60) {
            onClose();
          }
        },
      }),
    [onClose],
  );

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose} supportedOrientations={MODAL_SUPPORTED_ORIENTATIONS}>
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={styles.screen}
        {...(Platform.OS !== 'web' ? closeSwipePanResponder.panHandlers : {})}
      >
        <AppHeader
          title={title || ''}
          canGoBack
          onBack={onClose}
          rightIcon="list-outline"
          rightAccessibilityLabel="Open content list"
          onRightPress={() => setSelectorOpen(true)}
        />
        {isAntiphonary ? (
          <View style={styles.selectorRow}>
            {ANTIPHONARY_GROUPS.map((group) => (
              <Pressable key={group.key} style={styles.selectorItem} onPress={() => selectAntiphonaryGroup(group.key)}>
                <Text style={styles.selectorText}>{group.label}</Text>
              </Pressable>
            ))}
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
              onOpenSelector={() => setSelectorOpen(true)}
            />
            <ContentSelectorDrawer
              visible={selectorOpen}
              sections={sections}
              currentSectionId={currentSectionId}
              onClose={() => setSelectorOpen(false)}
              onSelectSection={(id) => {
                if (preferences.slideshowMode) {
                  setSelectedSlideSectionId(id);
                } else {
                  documentRef.current?.scrollToSection(id);
                }
              }}
              displaySilentPrayers={preferences.displaySilentPrayers}
              appLanguage={preferences.appLanguage}
              bishopPresent={preferences.bishopPresent}
            />
          </>
        )}
        <DocumentModal
          visible={Boolean(nestedModal)}
          title={nestedModal?.title ?? null}
          sections={nestedModal?.sections ?? null}
          isAntiphonary={nestedModal?.isAntiphonary}
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
  selectorRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.navyDark,
  },
  selectorItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  selectorText: {
    color: COLORS.gold,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 15,
    fontWeight: '700',
  },
});
