import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '../ui/AppHeader';
import ContentSelectorDrawer from '../ui/ContentSelectorDrawer';
import DocumentSurface from '../DocumentSurface';
import { DocumentAction, DocumentSection, DocumentWebViewHandle } from '../DocumentWebView';
import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';

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
      documentRef.current?.scrollToTune(group);
      return;
    }
    const introSection = sections.find((section) => /^introduction$/i.test(section.title?.english || ''));
    if (introSection) documentRef.current?.scrollToSection(introSection.id);
  }

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.screen}>
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
          <View style={styles.center}>
            <Text style={styles.loading}>Loading…</Text>
          </View>
        ) : (
          <>
            <DocumentSurface
              ref={documentRef}
              sections={sections}
              preferences={preferences}
              onAction={handleAction}
              fontScaleMultiplier={0.75}
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
