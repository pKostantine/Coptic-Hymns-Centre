import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { MOBILE_WEB_BREAKPOINT } from '../../../utils/useIsMobileWeb';
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
  // A narrow browser viewport (phone-sized mobile web) gets the same
  // full-screen treatment as the native app — a 50%-width side panel would
  // be too narrow to read on a phone screen.
  const isCompactSelector = isMobileDocument || screenWidth < MOBILE_WEB_BREAKPOINT;
  const isLandscapeViewport = screenWidth > screenHeight;
  // Mobile uses depth (a full-screen slide-in, like opening another document)
  // rather than web's side panel — there's no room for a side drawer to feel
  // native on a phone, and it matches how subdocument/Antiphonary modals
  // already present on mobile.
  const selectorPanelWidth = isCompactSelector ? screenWidth : Math.round(screenWidth * 0.5);

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

  // The document's currentSectionId can land on a titleless hymn (e.g. an
  // inline-spliced continuation) that never made it into `listable` — in
  // that case, highlight/scroll to the nearest surrounding entry that did:
  // the previous listable section if there is one, otherwise the next.
  const resolvedCurrentSectionId = useMemo(() => {
    if (!currentSectionId) return null;
    if (listable.some((section) => section.id === currentSectionId)) return currentSectionId;
    const index = sections.findIndex((section) => section.id === currentSectionId);
    if (index < 0) return null;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (listable.some((section) => section.id === sections[i].id)) return sections[i].id;
    }
    for (let i = index + 1; i < sections.length; i += 1) {
      if (listable.some((section) => section.id === sections[i].id)) return sections[i].id;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSectionId, sections]);

  const scrollViewRef = useRef<ScrollView>(null);
  const [itemLayouts, setItemLayouts] = useState<Record<string, number>>({});

  // Keep the panel scrolled to wherever the user currently is in the
  // document — on open, and any time that position changes while the panel
  // is already open (e.g. it was left open while swiping through slides).
  useEffect(() => {
    if (!visible || !resolvedCurrentSectionId) return;
    const y = itemLayouts[resolvedCurrentSectionId];
    if (y === undefined) return;
    scrollViewRef.current?.scrollTo({ y: Math.max(y - SPACING.md, 0), animated: false });
  }, [visible, resolvedCurrentSectionId, itemLayouts]);

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
          <View style={[styles.selectorHeader, isCompactSelector && styles.selectorHeaderMobile]}>
            {isCompactSelector ? (
              <Pressable accessibilityLabel="Close content list" style={styles.selectorBackButton} onPress={onClose}>
                <Ionicons name="chevron-back" size={24} color={COLORS.gold} />
              </Pressable>
            ) : null}
            <Text style={styles.actionLabel}>Content</Text>
            {isCompactSelector ? <View style={styles.selectorBackButton} /> : null}
          </View>

          <ScrollView ref={scrollViewRef} style={styles.selectorList}>
            {listable.map((section) => (
              <Pressable
                key={section.id}
                style={[styles.selectorItem, section.id === resolvedCurrentSectionId && styles.selectorItemActive]}
                onLayout={(event) => {
                  const y = event.nativeEvent.layout.y;
                  setItemLayouts((current) => (current[section.id] === y ? current : { ...current, [section.id]: y }));
                }}
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
  selectorHeaderMobile: {
    justifyContent: 'space-between',
  },
  selectorBackButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(201, 162, 39, 0.45)',
    height: 40,
    justifyContent: 'center',
    width: 40,
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
