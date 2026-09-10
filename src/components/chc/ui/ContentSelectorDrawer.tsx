import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { MOBILE_WEB_BREAKPOINT } from '../../../utils/useIsMobileWeb';
import { MODAL_SUPPORTED_ORIENTATIONS } from '../../../utils/modalOrientations';
import type { AppLanguage } from '../../../utils/preferencesStorage';
import { DocumentSection } from '../documentHtml';
import Icon from './Icon';

interface ContentSelectorDrawerProps {
  visible: boolean;
  sections: DocumentSection[];
  currentSectionId?: string | null;
  onClose: () => void;
  onSelectSection: (id: string) => void;
  /** Called instead of onSelectSection for a Hyperlink row — it leaves this document for another service rather than jumping within it. */
  onOpenHyperlink?: (hyperlinkKey?: string | null) => void;
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
  onOpenCalendar?: () => void;
  onOpenSettings?: () => void;
  bishopPresent?: boolean;
  onToggleBishopPresent?: () => void;
  /** When false, sections titled Silent Prayer are excluded from the list, matching their hidden state in the document itself. */
  displaySilentPrayers?: boolean;
  /** Current on/off state of the in-document "Coptic Gospel Rite" toggle — sections only visible in one state (e.g. "Coptic Psalm") are excluded from the list otherwise, matching their hidden state in the document itself. */
  copticGospelRite?: boolean;
  /** Drives which single language each list entry's title shows — falls back to whichever language has text when the selected one is missing. */
  appLanguage?: AppLanguage;
}

const READING_REFERENCE_SELECTOR_TITLES = new Set(['pauline epistle', 'catholic epistle', 'praxis']);
const READING_REFERENCE_SELECTOR_KEY_PATTERN = /^(PAULINE_EPISTLE|CATHOLIC_EPISTLE|PRAXIS)(_|$)/;
const READING_REFERENCE_SELECTOR_KEY_TITLES: Record<string, { english: string; arabic: string }> = {
  PAULINE_EPISTLE: { english: 'Pauline Epistle', arabic: 'البولس' },
  CATHOLIC_EPISTLE: { english: 'Catholic Epistle', arabic: 'الكاثوليكون' },
  PRAXIS: { english: 'Praxis', arabic: 'الإبركسيس' },
};

function normalizeSelectorTitle(value?: string) {
  return String(value || '')
    .trim()
    .replace(/^the\s+/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function shouldAppendReadingReference(section: DocumentSection, readingReference?: { english?: string; arabic?: string }) {
  if (!readingReference?.english && !readingReference?.arabic) return false;
  const key = String(section.hymnKey || (section as DocumentSection & { hymn_key?: string }).hymn_key || '').toUpperCase();
  return READING_REFERENCE_SELECTOR_TITLES.has(normalizeSelectorTitle(section.title?.english)) ||
    READING_REFERENCE_SELECTOR_KEY_PATTERN.test(key);
}

function getReadingReferenceSelectorBaseTitle(section: DocumentSection) {
  if (section.title?.english || section.title?.arabic) return section.title;
  const key = String(section.hymnKey || (section as DocumentSection & { hymn_key?: string }).hymn_key || '').toUpperCase();
  const match = key.match(READING_REFERENCE_SELECTOR_KEY_PATTERN);
  return match ? READING_REFERENCE_SELECTOR_KEY_TITLES[match[1]] : null;
}

function appendReadingReference(title: string, reference?: string) {
  const cleanTitle = String(title || '').trim();
  const cleanReference = String(reference || '').trim();
  if (!cleanTitle || !cleanReference) return cleanTitle;
  if (cleanTitle.includes(`(${cleanReference})`)) return cleanTitle;
  return `${cleanTitle} (${cleanReference})`;
}

/**
 * The Midnight Hour is prayed in three Watches, and its three watch openings
 * are the only place the Agpeya marks that split. Every hour has an
 * `introduction*` item, but only these three carry a title in
 * agpeya.hymn_titles — introductionFirstHour, introductionToTheCreed and the
 * rest are all title-less, so a title alone can't single them out. Matching
 * `introduction…Watch` does, and keeps working if a watch is ever renumbered
 * or added.
 */
const WATCH_DIVIDER_KEY = /^introduction[A-Za-z]*Watch$/;

function isWatchDividerSection(section: DocumentSection): boolean {
  return WATCH_DIVIDER_KEY.test(section.hymnKey || '');
}

function getSectionSelectorTitle(section: DocumentSection): { english: string; arabic: string } {
  const readingReference = section.verses.find((verse) => verse.type === 'readingReference');
  const baseTitle = getReadingReferenceSelectorBaseTitle(section);
  if (baseTitle) {
    if (!shouldAppendReadingReference(section, readingReference)) return section.title;
    return {
      english: appendReadingReference(baseTitle.english || '', readingReference?.english),
      arabic: appendReadingReference(baseTitle.arabic || '', readingReference?.arabic),
    };
  }
  return {
    english: readingReference?.english || '',
    arabic: readingReference?.arabic || '',
  };
}

/** CHC ContentSelectorDrawer — ported 1:1 from HymnDisplayScreen.js's selector Modal/panel. */
export default function ContentSelectorDrawer({
  visible,
  sections,
  currentSectionId,
  onClose,
  onSelectSection,
  onOpenHyperlink,
  bookmarked,
  onToggleBookmark,
  onOpenCalendar,
  onOpenSettings,
  bishopPresent,
  onToggleBishopPresent,
  displaySilentPrayers = false,
  copticGospelRite = false,
  appLanguage = 'en',
}: ContentSelectorDrawerProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobileDocument = Platform.OS !== 'web';
  // A narrow browser viewport (phone-sized mobile web) gets the same compact
  // treatment as the native app.
  const isCompactSelector = isMobileDocument || screenWidth < MOBILE_WEB_BREAKPOINT;
  const isLandscapeViewport = screenWidth > screenHeight;
  // Mobile is a narrow slide-in drawer (70% width, backdrop showing through
  // on the remaining 30%) rather than a full-screen takeover — a full-screen
  // panel felt like opening a whole new document instead of a lightweight
  // jump-to list.
  const selectorPanelWidth = isCompactSelector ? Math.round(screenWidth * 0.7) : Math.round(screenWidth * 0.5);

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
    // A section hidden from the document because Silent Prayers are disabled
    // shouldn't still be jumpable from the content list.
    if (!displaySilentPrayers && section.titlePrayerType === 'Silent Prayer') return false;
    // Same for a section hidden by the current Bishop Present state.
    if (section.bishopOnly && !bishopPresent) return false;
    if (section.priestOnly && bishopPresent) return false;
    // Same for a section (e.g. "Coptic Psalm") only visible in one state of
    // the in-document Coptic Gospel Rite toggle.
    if (section.copticGospelRiteOnly && !copticGospelRite) return false;
    if (section.nonCopticGospelRiteOnly && copticGospelRite) return false;
    // Subdocument/Antiphonary buttons are a real UI action, not hymn text —
    // they must survive even though they carry no verses.
    if (section.isSubdocumentButton || section.isAntiphonaryButton) return true;
    // Same for a Hyperlink: it carries no verses either, and it is the one way
    // to reach the next service from here without backing all the way out.
    if (section.isHyperlinkButton) return true;
    const selectorTitle = getSectionSelectorTitle(section);
    return Boolean(selectorTitle.english || selectorTitle.arabic);
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
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
      supportedOrientations={MODAL_SUPPORTED_ORIENTATIONS}
    >
      <View style={styles.selectorOverlay}>
        <Pressable accessibilityLabel="Close selector" style={styles.selectorBackdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.selectorPanel,
            {
              width: selectorPanelWidth,
              paddingTop: insets.top,
              transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, selectorPanelWidth] }) }],
            },
          ]}
        >
          <View style={styles.selectorHeader}>
            <Text style={styles.actionLabel}>Content</Text>
          </View>

          <ScrollView ref={scrollViewRef} style={styles.selectorList}>
            {listable.map((section) => {
              // A list entry always shows exactly one language, driven by
              // the App Language setting — falling back to whichever
              // language actually has text for this specific section if the
              // selected one doesn't.
              const selectorTitle = getSectionSelectorTitle(section);
              const showArabic = appLanguage === 'ar' ? Boolean(selectorTitle.arabic) : !selectorTitle.english && Boolean(selectorTitle.arabic);
              // A hymn whose own title row declares "Silent Prayer" reads
              // visually distinct in the selector too — dimmer/italic, since
              // none of its content is spoken aloud.
              const isSilentPrayerHymn = section.titlePrayerType === 'Silent Prayer';
              // A Hyperlink row is deliberately shorter than a hymn row and
              // carries the same green as its button in the document: it is a
              // way out of this service, not a place within it, and it should
              // not compete with the hymn list for height.
              const isHyperlink = Boolean(section.isHyperlinkButton);
              // Subdocuments and the Antiphonary are destinations too, but they
              // open ON this document rather than leaving it — blue, and full
              // height, since unlike a hyperlink they are content of this
              // service rather than a way out of it.
              const isSubdocument = Boolean(section.isSubdocumentButton || section.isAntiphonaryButton);
              // The three Midnight Hour watch openings are rendered as rules
              // across the list rather than as cards: they mark where one
              // Watch ends and the next begins, so they should read as the
              // seams of the hour, not as three more hymns sitting in it.
              // Still tappable — jumping to the top of a Watch is exactly what
              // someone scanning for one wants.
              const isWatchDivider = isWatchDividerSection(section);
              const isActive = section.id === resolvedCurrentSectionId;
              return (
                <Pressable
                  key={section.id}
                  style={[
                    styles.selectorItem,
                    isSubdocument && styles.selectorItemSubdocument,
                    isHyperlink && styles.selectorItemHyperlink,
                    isWatchDivider && styles.selectorItemWatchDivider,
                    !isHyperlink && !isWatchDivider && isActive && styles.selectorItemActive,
                  ]}
                  onLayout={(event) => {
                    const y = event.nativeEvent.layout.y;
                    setItemLayouts((current) => (current[section.id] === y ? current : { ...current, [section.id]: y }));
                  }}
                  onPress={() => {
                    // Closed first so the panel isn't still sitting over the
                    // destination as it comes in. The jump-within-document
                    // path keeps its original order.
                    if (isHyperlink) {
                      onClose();
                      onOpenHyperlink?.(section.hyperlinkKey);
                      return;
                    }
                    onSelectSection(section.id);
                    onClose();
                  }}
                >
                  {isWatchDivider ? (
                    <View style={styles.watchDividerRow}>
                      <View style={styles.watchDividerRule} />
                      <Text
                        style={[
                          styles.watchDividerLabel,
                          showArabic && styles.watchDividerLabelArabic,
                          isActive && styles.watchDividerLabelActive,
                        ]}
                      >
                        {showArabic ? selectorTitle.arabic : selectorTitle.english || selectorTitle.arabic}
                      </Text>
                      <View style={styles.watchDividerRule} />
                    </View>
                  ) : (
                    <View style={[styles.selectorTitleRow, isLandscapeViewport && styles.selectorTitleRowLandscape]}>
                      {showArabic ? (
                        <Text style={[styles.selectorTitle, styles.selectorTitleArabic, styles.centeredTitle, isSubdocument && styles.selectorTitleSubdocument, isHyperlink && styles.selectorTitleHyperlink, isSilentPrayerHymn && styles.selectorTitleSilentPrayer]}>{selectorTitle.arabic}</Text>
                      ) : (
                        <Text style={[styles.selectorTitle, styles.centeredTitle, isSubdocument && styles.selectorTitleSubdocument, isHyperlink && styles.selectorTitleHyperlink, isSilentPrayerHymn && styles.selectorTitleSilentPrayer]}>{selectorTitle.english || selectorTitle.arabic}</Text>
                      )}
                    </View>
                  )}
                  {isHyperlink ? <Text style={styles.selectorHyperlinkArrow}>→</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {onToggleBishopPresent ? (
            <Pressable accessibilityLabel="Toggle bishop present" style={styles.selectorToggleRow} onPress={onToggleBishopPresent}>
              <View style={styles.selectorToggleTextGroup}>
                {appLanguage === 'ar' ? (
                  <Text style={[styles.selectorToggleText, styles.selectorToggleArabicText]}>حضور أسقف</Text>
                ) : (
                  <Text style={styles.selectorToggleText}>Bishop Present</Text>
                )}
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
                  <Icon name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={25} color={COLORS.gold} />
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
                  <Icon name="calendar-outline" size={26} color={COLORS.gold} />
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
                  <Icon name="settings-outline" size={26} color={COLORS.gold} />
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
  selectorItemSubdocument: {
    backgroundColor: COLORS.subdocSoft,
    borderColor: COLORS.subdocLine,
  },
  selectorTitleSubdocument: {
    color: COLORS.subdoc,
  },
  selectorItemHyperlink: {
    alignItems: 'center',
    backgroundColor: COLORS.linkSoft,
    borderColor: COLORS.linkLine,
    minHeight: 48,
    paddingVertical: SPACING.sm,
  },
  selectorTitleHyperlink: {
    color: COLORS.link,
  },
  selectorHyperlinkArrow: {
    color: COLORS.link,
    fontSize: 16,
    marginLeft: SPACING.sm,
  },
  selectorItemWatchDivider: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
    minHeight: 0,
    paddingHorizontal: 0,
    paddingVertical: SPACING.xs,
  },
  watchDividerRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  watchDividerRule: {
    backgroundColor: COLORS.goldLine,
    flex: 1,
    height: 1,
  },
  watchDividerLabel: {
    color: COLORS.gold,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  watchDividerLabelArabic: {
    fontFamily: TYPOGRAPHY.arabic,
    fontSize: 15,
    // Arabic is cursive — letterSpacing pulls the joined letterforms apart,
    // and it has no upper case for textTransform to reach.
    letterSpacing: 0,
    textTransform: 'none',
  },
  watchDividerLabelActive: {
    color: COLORS.goldBright,
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
  selectorTitleSilentPrayer: {
    color: COLORS.silentTitle,
    fontStyle: 'italic',
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
