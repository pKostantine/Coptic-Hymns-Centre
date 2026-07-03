import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { DocumentSection } from '../documentHtml';

interface ContentSelectorDrawerProps {
  visible: boolean;
  sections: DocumentSection[];
  currentSectionId?: string | null;
  onClose: () => void;
  onSelectSection: (id: string) => void;
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
  onOpenCalendar?: () => void;
  onOpenSettings?: () => void;
  bishopPresent?: boolean;
  onToggleBishopPresent?: () => void;
}

/** CHC ContentSelectorDrawer — ported 1:1 from HymnDisplayScreen.js's selector Modal/panel. */
export default function ContentSelectorDrawer({
  visible,
  sections,
  currentSectionId,
  onClose,
  onSelectSection,
  bookmarked,
  onToggleBookmark,
  onOpenCalendar,
  onOpenSettings,
  bishopPresent,
  onToggleBishopPresent,
}: ContentSelectorDrawerProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isMobileDocument = Platform.OS !== 'web';
  const isLandscapeViewport = screenWidth > screenHeight;
  const selectorPanelWidth = Math.round(screenWidth * (isMobileDocument && !isLandscapeViewport ? 0.75 : 0.5));

  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : 1,
      duration: 220,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  const listable = sections.filter((section) => {
    // "Our Father" always has a title but should never clutter the jump-to list.
    if (section.hymnKey === 'ourFather') return false;
    // Subdocument/Antiphonary buttons are a real UI action, not hymn text —
    // they must survive even though they carry no verses.
    if (section.isSubdocumentButton || section.isAntiphonaryButton) return true;
    return Boolean(section.title?.english || section.title?.arabic);
  });

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <View style={styles.selectorOverlay}>
        <Pressable accessibilityLabel="Close selector" style={styles.selectorBackdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.selectorPanel,
            {
              width: selectorPanelWidth,
              transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, selectorPanelWidth] }) }],
            },
          ]}
        >
          <View style={styles.selectorHeader}>
            <Text style={styles.actionLabel}>Content</Text>
          </View>

          <ScrollView style={styles.selectorList}>
            {listable.map((section) => (
              <Pressable
                key={section.id}
                style={[styles.selectorItem, section.id === currentSectionId && styles.selectorItemActive]}
                onPress={() => {
                  onSelectSection(section.id);
                  onClose();
                }}
              >
                <View style={[styles.selectorTitleRow, isLandscapeViewport && styles.selectorTitleRowLandscape]}>
                  {section.title.english ? (
                    <Text style={[styles.selectorTitle, !section.title.arabic && styles.centeredTitle]}>{section.title.english}</Text>
                  ) : null}
                  {section.title.arabic ? (
                    <Text style={[styles.selectorTitle, styles.selectorTitleArabic, !section.title.english && styles.centeredTitle]}>
                      {section.title.arabic}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>

          {onToggleBishopPresent ? (
            <Pressable accessibilityLabel="Toggle bishop present" style={styles.selectorToggleRow} onPress={onToggleBishopPresent}>
              <View style={styles.selectorToggleTextGroup}>
                <Text style={styles.selectorToggleText}>Bishop Present</Text>
                <Text style={[styles.selectorToggleText, styles.selectorToggleArabicText]}>حضور أسقف</Text>
              </View>
              <View style={[styles.selectorSwitch, bishopPresent ? styles.selectorSwitchOn : styles.selectorSwitchOff]}>
                <View style={[styles.selectorSwitchThumb, bishopPresent && styles.selectorSwitchThumbOn]} />
              </View>
            </Pressable>
          ) : null}

          {onToggleBookmark || onOpenCalendar || onOpenSettings ? (
            <View style={styles.selectorActionRow}>
              {onToggleBookmark ? (
                <Pressable accessibilityLabel="Bookmark hymn" style={styles.selectorIconButton} onPress={onToggleBookmark}>
                  <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={25} color={COLORS.gold} />
                </Pressable>
              ) : null}
              {onOpenCalendar ? (
                <Pressable
                  accessibilityLabel="Open calendar"
                  style={styles.selectorIconButton}
                  onPress={() => {
                    onClose();
                    onOpenCalendar();
                  }}
                >
                  <Ionicons name="calendar-outline" size={26} color={COLORS.gold} />
                </Pressable>
              ) : null}
              {onOpenSettings ? (
                <Pressable
                  accessibilityLabel="Open settings"
                  style={styles.selectorIconButton}
                  onPress={() => {
                    onClose();
                    onOpenSettings();
                  }}
                >
                  <Ionicons name="settings-outline" size={26} color={COLORS.gold} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  selectorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  selectorBackdrop: {
    flex: 1,
  },
  selectorPanel: {
    backgroundColor: '#050505',
    borderColor: 'rgba(201, 162, 39, 0.35)',
    borderLeftWidth: 1,
    paddingHorizontal: SPACING.md,
  },
  selectorHeader: {
    alignItems: 'center',
    backgroundColor: '#111111',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201, 162, 39, 0.28)',
    flexDirection: 'row',
    justifyContent: 'center',
    marginHorizontal: -SPACING.md,
    minHeight: 62,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  actionLabel: {
    color: COLORS.gold,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 0,
  },
  selectorList: {
    flex: 1,
    paddingTop: SPACING.md,
  },
  selectorItem: {
    backgroundColor: '#111111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#262626',
    flexDirection: 'row',
    minHeight: 78,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  selectorItemActive: {
    backgroundColor: '#171513',
    borderColor: 'rgba(201, 162, 39, 0.72)',
  },
  selectorTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  selectorTitleRowLandscape: {
    flexDirection: 'column',
  },
  selectorTitle: {
    flex: 1,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    flexShrink: 1,
    color: COLORS.white,
  },
  selectorTitleArabic: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  centeredTitle: {
    textAlign: 'center',
  },
  selectorToggleRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: 'rgba(201, 162, 39, 0.28)',
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'center',
    marginHorizontal: -SPACING.md,
    minHeight: 56,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  selectorToggleTextGroup: {
    alignItems: 'center',
    flex: 0,
    gap: 2,
    minWidth: 136,
  },
  selectorToggleText: {
    fontFamily: TYPOGRAPHY.title,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
    color: COLORS.white,
  },
  selectorToggleArabicText: {
    fontFamily: 'Arial',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  selectorSwitch: {
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 52,
  },
  selectorSwitchOn: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  selectorSwitchOff: {
    backgroundColor: '#2A2A2A',
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  selectorSwitchThumb: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    height: 24,
    width: 24,
  },
  selectorSwitchThumbOn: {
    alignSelf: 'flex-end',
  },
  selectorActionRow: {
    alignItems: 'center',
    backgroundColor: '#101010',
    borderColor: 'rgba(201, 162, 39, 0.32)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: -SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
  selectorIconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(201, 162, 39, 0.06)',
    borderColor: 'rgba(201, 162, 39, 0.24)',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
});
