import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, type LayoutChangeEvent, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
 * An hour opening that marks where one part of a service gives way to the
 * next: the Midnight Hour's three Watches, and the Agpeya hours prayed inside
 * the Offering of the Lamb ("3rd Hour", "3rd Hour and 6th Hour", "12th Hour
 * and Veil"...).
 *
 * Whether one of these reads as a divider is decided by whether it has a title
 * at all, and that is per-schema: agpeya.hymn_titles leaves the hour openings
 * null, so inside the Agpeya book they stay silent, while liturgy.hymn_titles
 * names them, so inside the Liturgy they announce the hour. An untitled
 * section never reaches this code — `listable` has already dropped it — so the
 * same hymn divides the Offering of the Lamb without touching the Hour it also
 * belongs to.
 *
 * The `(?!Of|To)` is what separates a divider from ordinary content that
 * happens to be named the same way: introductionOfEveryHour is a real prayer
 * (and titled, in agpeya), and introductionToTheCreed, introductionToTheHoosP1
 * and introductionToRaisingOfIncenseP1 are all lead-ins to a hymn rather than
 * headings over a section.
 */
const SECTION_DIVIDER_KEY = /^introduction(?!Of|To)[A-Za-z]*(?:Hour|Watch|Veil)$/;

function isDividerSection(section: DocumentSection): boolean {
  return SECTION_DIVIDER_KEY.test(section.hymnKey || '');
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

  /**
   * Everything a divider gathers under it, by section id.
   *
   * A nest opens on a divider that actually speaks — one whose hymn key has
   * the shape AND a title in this document's schema, since the same hour
   * opening is titled in liturgy.hymn_titles and null in agpeya.hymn_titles.
   * That matters: an untitled opening never renders a rule, so it must not
   * silently indent the rest of the Hour behind an invisible heading.
   *
   * It closes on the next `introduction…` row of any kind, whether or not that
   * row is itself visible. In the Offering of the Lamb that is
   * introductionToTheCreed, which carries no title and so never appears in
   * this list — but it is still the point where the Agpeya hours end and the
   * Liturgy resumes, so the Creed and everything after it sit back at the
   * outer level. The Midnight Hour ends its third Watch on the same row.
   *
   * Walked over `sections` rather than `listable` so those invisible
   * boundaries still count.
   */
  const nestedSectionIds = useMemo(() => {
    const nested = new Set<string>();
    let insideNest = false;
    for (const section of sections) {
      if (/^introduction/i.test(section.hymnKey || '')) {
        const title = getSectionSelectorTitle(section);
        insideNest = isDividerSection(section) && Boolean(title.english || title.arabic);
        continue;
      }
      if (insideNest) nested.add(section.id);
    }
    return nested;
  }, [sections]);

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
            {listable.map((section, listIndex) => {
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
              // An hour opening renders as a rule across the list rather than
              // a card: it marks where one part of the service ends and the
              // next begins, so it should read as a seam rather than as one
              // more hymn sitting between them. Still tappable — jumping to
              // the top of an hour is exactly what someone scanning for one
              // wants.
              const isDivider = isDividerSection(section);
              // Sits under the divider above it. The rule that brackets the
              // group is drawn by the wrapper below, not by the card.
              const isNested = nestedSectionIds.has(section.id);
              const isLastNested = isNested && !nestedSectionIds.has(listable[listIndex + 1]?.id ?? '');
              const isActive = section.id === resolvedCurrentSectionId;

              const recordLayout = (event: LayoutChangeEvent) => {
                const y = event.nativeEvent.layout.y;
                setItemLayouts((current) => (current[section.id] === y ? current : { ...current, [section.id]: y }));
              };

              const row = (
                <Pressable
                  key={section.id}
                  style={[
                    styles.selectorItem,
                    isNested && styles.selectorItemNested,
                    isSubdocument && styles.selectorItemSubdocument,
                    isHyperlink && styles.selectorItemHyperlink,
                    isDivider && styles.selectorItemDivider,
                    !isHyperlink && !isDivider && isActive && styles.selectorItemActive,
                  ]}
                  // A nested card's own y is measured inside its wrapper, so
                  // the wrapper reports position instead — itemLayouts feeds
                  // scrollTo, which needs an offset within the ScrollView.
                  onLayout={isNested ? undefined : recordLayout}
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
                  {isDivider ? (
                    <View style={styles.dividerRow}>
                      <View style={styles.dividerRule} />
                      <Text
                        style={[
                          styles.dividerLabel,
                          showArabic && styles.dividerLabelArabic,
                        ]}
                      >
                        {showArabic ? selectorTitle.arabic : selectorTitle.english || selectorTitle.arabic}
                      </Text>
                      <View style={styles.dividerRule} />
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

              if (!isNested) return row;

              // One segment of the rule bracketing the group. The gap below the
              // card is this wrapper's padding rather than the card's margin,
              // so the border runs through it and consecutive segments meet —
              // one unbroken line down the group instead of a dash beside each
              // card. The last segment drops that padding so the line stops
              // with the group rather than trailing past it.
              return (
                <View
                  key={section.id}
                  style={[styles.nestedSegment, isLastNested && styles.nestedSegmentLast]}
                  onLayout={recordLayout}
                >
                  {row}
                </View>
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
  nestedSegment: {
    borderLeftColor: COLORS.goldLine,
    borderLeftWidth: 3,
    paddingBottom: SPACING.sm,
    paddingLeft: SPACING.md,
  },
  nestedSegmentLast: { paddingBottom: 0 },
  // The gap moves onto the wrapper's padding so the rule can run through it.
  selectorItemNested: { marginBottom: 0 },
  selectorItemDivider: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
    minHeight: 0,
    paddingHorizontal: 0,
    paddingVertical: SPACING.xs,
  },
  dividerRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  dividerRule: {
    backgroundColor: COLORS.goldLine,
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    color: COLORS.gold,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  dividerLabelArabic: {
    fontFamily: TYPOGRAPHY.arabic,
    fontSize: 15,
    // Arabic has no upper case for textTransform to reach.
    textTransform: 'none',
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
