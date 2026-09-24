import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import type {
  SermonHighlight,
  SermonHighlightColor,
  SermonReadingReference,
} from '@/types/sermonPlanner';
import type { SermonPlanSyncStatus } from '@/hooks/useSermonPlanner';
import { MODAL_SUPPORTED_ORIENTATIONS } from '@/utils/modalOrientations';
import type { SermonPlannerVisibleLanguages } from '@/utils/preferencesStorage';
import { MOBILE_WEB_BREAKPOINT } from '@/utils/useIsMobileWeb';
import Icon from './Icon';

const HIGHLIGHT_COLORS: Record<SermonHighlightColor, string> = {
  gold: '#D7AD2C',
  rose: '#D65B75',
  blue: '#4C9AD8',
  green: '#4AAA73',
};

const LANGUAGE_OPTIONS: { key: keyof SermonPlannerVisibleLanguages; label: string }[] = [
  { key: 'english', label: 'English' },
  { key: 'arabic', label: 'Arabic' },
];

interface SermonPlannerDrawerProps {
  visible: boolean;
  references: SermonReadingReference[];
  highlights: SermonHighlight[];
  verseReferences: Record<string, string>;
  generalNotes: string;
  activeHighlightId?: string | null;
  syncStatus: SermonPlanSyncStatus;
  signedIn: boolean;
  visibleLanguages: SermonPlannerVisibleLanguages;
  bookmarked?: boolean;
  onClose: () => void;
  onToggleLanguage: (language: keyof SermonPlannerVisibleLanguages) => void;
  onSelectReference: (reference: SermonReadingReference) => void;
  onJumpToHighlight: (highlight: SermonHighlight) => void;
  onChangeGeneralNotes: (value: string) => void;
  onChangeHighlightNote: (id: string, value: string) => void;
  onChangeHighlightColor: (id: string, color: SermonHighlightColor) => void;
  onDeleteHighlight: (id: string) => void;
  onToggleBookmark?: () => void;
  onOpenCalendar?: () => void;
  onOpenSettings?: () => void;
}

function syncLabel(status: SermonPlanSyncStatus, signedIn: boolean) {
  if (!signedIn) return 'Saved on this device';
  if (status === 'syncing') return 'Syncing';
  if (status === 'error') return 'Saved locally';
  return 'Synced';
}

function languageLabel(language: SermonHighlight['language']) {
  if (language === 'coptic') return 'Coptic';
  if (language === 'arabic') return 'Arabic';
  return 'English';
}

export default function SermonPlannerDrawer({
  visible,
  references,
  highlights,
  verseReferences,
  generalNotes,
  activeHighlightId,
  syncStatus,
  signedIn,
  visibleLanguages,
  bookmarked,
  onClose,
  onToggleLanguage,
  onSelectReference,
  onJumpToHighlight,
  onChangeGeneralNotes,
  onChangeHighlightNote,
  onChangeHighlightColor,
  onDeleteHighlight,
  onToggleBookmark,
  onOpenCalendar,
  onOpenSettings,
}: SermonPlannerDrawerProps) {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = Platform.OS !== 'web' || screenWidth < MOBILE_WEB_BREAKPOINT;
  const panelWidth = compact ? Math.min(screenWidth, Math.round(screenWidth * 0.9)) : Math.min(620, Math.round(screenWidth * 0.52));
  const [slide] = useState(() => new Animated.Value(0));
  const scrollRef = useRef<ScrollView>(null);
  const noteRefs = useRef<Record<string, TextInput | null>>({});
  const [highlightLayouts, setHighlightLayouts] = useState<Record<string, number>>({});
  const visibleLanguageCount = Object.values(visibleLanguages).filter(Boolean).length;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : 1,
      duration: 220,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slide, visible]);

  useEffect(() => {
    if (!visible || !activeHighlightId) return;
    const timer = setTimeout(() => {
      const y = highlightLayouts[activeHighlightId];
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - SPACING.md), animated: true });
      noteRefs.current[activeHighlightId]?.focus();
    }, 260);
    return () => clearTimeout(timer);
  }, [activeHighlightId, highlightLayouts, visible]);

  const openDestination = (callback?: () => void) => {
    onClose();
    callback?.();
  };

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
      supportedOrientations={MODAL_SUPPORTED_ORIENTATIONS}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable accessibilityLabel="Close sermon notes" style={styles.backdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.panel,
            {
              width: panelWidth,
              paddingTop: insets.top,
              transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, panelWidth] }) }],
            },
          ]}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Sermon Notes</Text>
              <Text style={styles.saveStatus}>{syncLabel(syncStatus, signedIn)}</Text>
            </View>
            <Pressable accessibilityLabel="Close sermon notes" style={styles.closeButton} onPress={onClose}>
              <Icon name="close" size={22} color={COLORS.muted} />
            </Pressable>
          </View>

          <View style={styles.languageBar}>
            {LANGUAGE_OPTIONS.map(({ key, label }) => {
              const selected = visibleLanguages[key];
              const isLastVisibleLanguage = selected && visibleLanguageCount === 1;
              return (
                <Pressable
                  accessibilityLabel={label}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isLastVisibleLanguage, selected }}
                  disabled={isLastVisibleLanguage}
                  key={key}
                  onPress={() => onToggleLanguage(key)}
                  style={[
                    styles.languageButton,
                    selected ? styles.languageButtonSelected : styles.languageButtonUnselected,
                  ]}
                >
                  <Text style={[styles.languageText, selected && styles.languageTextSelected]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionHeading}>Readings</Text>
              <Text style={styles.sectionCount}>{references.length}</Text>
            </View>
            <View style={styles.references}>
              {references.map((reference, index) => (
                <Pressable
                  key={reference.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Go to ${reference.label}`}
                  onPress={() => {
                    onClose();
                    onSelectReference(reference);
                  }}
                  style={({ pressed }) => [styles.referenceRow, pressed && styles.pressed]}
                >
                  <Text style={styles.referenceNumber}>{index + 1}</Text>
                  <Text style={styles.referenceLabel}>{reference.label}</Text>
                  <Icon name="chevron-forward" size={14} color={COLORS.goldBright} />
                </Pressable>
              ))}
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionHeading}>Sermon Outline</Text>
            <TextInput
              accessibilityLabel="Sermon outline"
              multiline
              onChangeText={onChangeGeneralNotes}
              placeholder="Theme, opening, main points, applications, and closing..."
              placeholderTextColor="#75818C"
              selectionColor={COLORS.gold}
              style={styles.outlineInput}
              textAlignVertical="top"
              value={generalNotes}
            />

            <View style={styles.highlightsHeader}>
              <Text style={styles.sectionHeading}>Highlights</Text>
              <Text style={styles.sectionCount}>{highlights.length}</Text>
            </View>
            {!highlights.length ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyMarker} />
                <Text style={styles.emptyTitle}>No highlights yet</Text>
                <Text style={styles.emptyBody}>Select text to choose a color. With Apple Pencil, drag across words to highlight them.</Text>
              </View>
            ) : highlights.map((highlight) => {
              const isActive = highlight.id === activeHighlightId;
              const recordLayout = (event: LayoutChangeEvent) => {
                const y = event.nativeEvent.layout.y;
                setHighlightLayouts((current) => current[highlight.id] === y ? current : { ...current, [highlight.id]: y });
              };
              return (
                <View
                  key={highlight.id}
                  onLayout={recordLayout}
                  style={[styles.highlightCard, isActive && styles.highlightCardActive]}
                >
                  <View style={styles.highlightMetaRow}>
                    <View style={[styles.highlightMarker, { backgroundColor: HIGHLIGHT_COLORS[highlight.color] }]} />
                    <Text style={styles.highlightLanguage}>{languageLabel(highlight.language)}</Text>
                    <View style={styles.highlightActions}>
                      <Pressable
                        accessibilityLabel="Delete highlight"
                        style={styles.iconButton}
                        onPress={() => onDeleteHighlight(highlight.id)}
                      >
                        <Icon name="trash-outline" size={17} color="#E88484" />
                      </Pressable>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Go to highlighted verse${verseReferences[highlight.verseId] ? `, ${verseReferences[highlight.verseId]}` : ''}`}
                    onPress={() => {
                      onClose();
                      onJumpToHighlight(highlight);
                    }}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    {verseReferences[highlight.verseId] ? (
                      <Text style={styles.highlightReference}>{verseReferences[highlight.verseId]}</Text>
                    ) : null}
                    <Text numberOfLines={5} style={styles.quote}>“{highlight.quote}”</Text>
                  </Pressable>
                  <View style={styles.colorRow}>
                    {(Object.keys(HIGHLIGHT_COLORS) as SermonHighlightColor[]).map((color) => (
                      <Pressable
                        key={color}
                        accessibilityLabel={`Change highlight to ${color}`}
                        onPress={() => onChangeHighlightColor(highlight.id, color)}
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: HIGHLIGHT_COLORS[color] },
                          highlight.color === color && styles.colorSwatchSelected,
                        ]}
                      />
                    ))}
                  </View>
                  <TextInput
                    ref={(input) => { noteRefs.current[highlight.id] = input; }}
                    accessibilityLabel="Note for highlight"
                    multiline
                    onChangeText={(value) => onChangeHighlightNote(highlight.id, value)}
                    placeholder="Add context, interpretation, or a preaching note..."
                    placeholderTextColor="#75818C"
                    selectionColor={COLORS.gold}
                    style={styles.highlightNoteInput}
                    textAlignVertical="top"
                    value={highlight.note}
                  />
                </View>
              );
            })}
          </ScrollView>

          <View style={[styles.actionRow, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}>
            {onToggleBookmark ? (
              <Pressable accessibilityLabel="Bookmark sermon planner" style={styles.actionButton} onPress={onToggleBookmark}>
                <Icon name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={25} color={COLORS.gold} />
              </Pressable>
            ) : null}
            {onOpenCalendar ? (
              <Pressable accessibilityLabel="Open calendar" style={styles.actionButton} onPress={() => openDestination(onOpenCalendar)}>
                <Icon name="calendar-outline" size={26} color={COLORS.gold} />
              </Pressable>
            ) : null}
            {onOpenSettings ? (
              <Pressable accessibilityLabel="Open settings" style={styles.actionButton} onPress={() => openDestination(onOpenSettings)}>
                <Icon name="settings-outline" size={26} color={COLORS.gold} />
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  panel: {
    backgroundColor: '#080A0C',
    borderLeftColor: 'rgba(201, 162, 39, 0.4)',
    borderLeftWidth: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#101316',
    borderBottomColor: 'rgba(201, 162, 39, 0.28)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 68,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerTitle: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '800' },
  saveStatus: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 2 },
  closeButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xl },
  languageBar: {
    borderBottomColor: 'rgba(201, 162, 39, 0.18)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  languageButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: SPACING.sm,
  },
  languageButtonSelected: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  languageButtonUnselected: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  languageText: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 13, fontWeight: '700' },
  languageTextSelected: { color: COLORS.black },
  sectionHeadingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionHeading: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '800' },
  sectionCount: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '700' },
  references: { borderTopColor: COLORS.border, borderTopWidth: 1, marginTop: SPACING.sm },
  referenceRow: {
    alignItems: 'center',
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    minHeight: 45,
    paddingVertical: SPACING.sm,
  },
  referenceNumber: { color: COLORS.gold, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800', width: 20 },
  referenceLabel: { color: COLORS.white, flex: 1, fontFamily: TYPOGRAPHY.title, fontSize: 15, lineHeight: 20 },
  pressed: { opacity: 0.68 },
  divider: { backgroundColor: 'rgba(201, 162, 39, 0.25)', height: 1, marginVertical: SPACING.lg },
  outlineInput: {
    backgroundColor: '#11161A',
    borderColor: '#2D353C',
    borderRadius: 6,
    borderWidth: 1,
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 15,
    lineHeight: 21,
    marginTop: SPACING.sm,
    minHeight: 132,
    padding: SPACING.md,
  },
  highlightsHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.lg },
  emptyState: { alignItems: 'center', borderTopColor: COLORS.border, borderTopWidth: 1, marginTop: SPACING.sm, padding: SPACING.xl },
  emptyMarker: { backgroundColor: HIGHLIGHT_COLORS.gold, borderRadius: 3, height: 8, marginBottom: SPACING.md, opacity: 0.7, width: 68 },
  emptyTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 16, fontWeight: '800' },
  emptyBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 20, marginTop: SPACING.sm, textAlign: 'center' },
  highlightCard: {
    backgroundColor: '#101418',
    borderColor: '#293139',
    borderRadius: 7,
    borderWidth: 1,
    marginTop: SPACING.md,
    padding: SPACING.md,
  },
  highlightCardActive: { borderColor: COLORS.gold, backgroundColor: '#171713' },
  highlightMetaRow: { alignItems: 'center', flexDirection: 'row' },
  highlightMarker: { borderRadius: 3, height: 8, marginRight: SPACING.sm, width: 38 },
  highlightLanguage: { color: COLORS.muted, flex: 1, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  highlightActions: { flexDirection: 'row', gap: SPACING.xs },
  iconButton: { alignItems: 'center', height: 34, justifyContent: 'center', width: 34 },
  highlightReference: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '700', marginTop: SPACING.sm },
  quote: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 15, lineHeight: 22, marginTop: SPACING.sm },
  colorRow: { flexDirection: 'row', gap: 10, marginTop: SPACING.md },
  colorSwatch: { borderColor: 'transparent', borderRadius: 999, borderWidth: 2, height: 24, width: 24 },
  colorSwatchSelected: { borderColor: COLORS.white },
  highlightNoteInput: {
    backgroundColor: '#090C0E',
    borderColor: '#283038',
    borderRadius: 5,
    borderWidth: 1,
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 14,
    lineHeight: 20,
    marginTop: SPACING.md,
    minHeight: 76,
    padding: SPACING.sm,
  },
  actionRow: {
    alignItems: 'center',
    backgroundColor: '#101316',
    borderTopColor: 'rgba(201, 162, 39, 0.32)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
  },
  actionButton: {
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

