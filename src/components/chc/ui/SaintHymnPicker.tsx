import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon from '@/components/chc/ui/Icon';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { MODAL_SUPPORTED_ORIENTATIONS } from '@/utils/modalOrientations';
import {
  getSaintHymnIndex,
  getSaintHymnPreview,
  SaintEntry,
  SaintHymnCategory,
  SaintHymnPreviewHymn,
} from '@/utils/saintHymns';
import { DISABLED_TEXT_SELECTION_STYLE } from '@/utils/textSelection';

interface SaintHymnPickerProps {
  visible: boolean;
  onClose: () => void;
  isArabic: boolean;
  selected: string[];
  onToggle: (token: string) => void;
  onClearSaint: (base: string) => void;
}

const LABELS = {
  title: { english: 'Saint Hymns', arabic: 'ألحان القديسين' },
  search: { english: 'Search saints', arabic: 'ابحث عن قديس' },
  empty: { english: 'No saints match that search.', arabic: 'لا يوجد قديس مطابق.' },
  clear: { english: 'Clear', arabic: 'مسح' },
  done: { english: 'Done', arabic: 'تم' },
  close: { english: 'Close', arabic: 'إغلاق' },
  noPreview: { english: 'This hymn has no text yet.', arabic: 'لا يوجد نص لهذا اللحن بعد.' },
};

interface PreviewTarget {
  token: string;
  category: SaintHymnCategory;
  /** The hymn's own name in the menu, e.g. "Doxology 2". */
  label: string;
  saintName: string;
}

/** Normalized for search so "st mark" and "stmark" both find StMark. */
function searchKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export default function SaintHymnPicker({
  visible,
  onClose,
  isArabic,
  selected,
  onToggle,
  onClearSaint,
}: SaintHymnPickerProps) {
  const [saints, setSaints] = useState<SaintEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // The saint whose own hymn menu is open on top of the list. Only saints with
  // more than one choice get one — see the comment on openSaint below.
  const [expandedBase, setExpandedBase] = useState<string | null>(null);
  // The hymn whose text is being read, over whichever of those two it was
  // opened from. Choosing a saint hymn otherwise means recognising it by name;
  // this is how you choose it by reading it.
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [previewHymns, setPreviewHymns] = useState<SaintHymnPreviewHymn[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const label = (entry: { english: string; arabic: string }) => (isArabic ? entry.arabic : entry.english);
  const localized = isArabic && styles.arabicText;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    getSaintHymnIndex()
      .then((entries) => {
        if (!cancelled) {
          setSaints(entries);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Unable to load saint hymns.');
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    getSaintHymnPreview(preview.token, preview.category)
      .then((hymns) => {
        if (!cancelled) setPreviewHymns(hymns);
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err?.message || 'Unable to load this hymn.');
      });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  // Cleared here rather than in the effect above, so opening a second preview
  // never shows the previous hymn's text while the new one loads — and so the
  // effect only ever sets state from its own async result.
  const openPreview = (target: PreviewTarget) => {
    setPreviewHymns(null);
    setPreviewError(null);
    setPreview(target);
  };

  // Closing clears this sheet's own transient state, so it never reopens with
  // a stale search or a saint's menu still hanging open behind it. Done on the
  // close path rather than in an effect watching `visible` — every close goes
  // through here, and the effect was setting state mid-reconciliation.
  const closePicker = () => {
    setPreview(null);
    setExpandedBase(null);
    setQuery('');
    onClose();
  };

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    if (!saints) return [];
    const key = searchKey(query);
    if (!key) return saints;
    // Matched against both the display name and the raw token, so searching
    // "michael" finds Archangel Michael and "stmark" finds St. Mark.
    return saints.filter((entry) => searchKey(entry.name).includes(key) || searchKey(entry.base).includes(key));
  }, [saints, query]);

  const expanded = useMemo(
    () => (expandedBase ? saints?.find((entry) => entry.base === expandedBase) ?? null : null),
    [expandedBase, saints],
  );

  /**
   * Tapping a saint opens his hymn menu — except where that menu would hold a
   * single row. Most saints in the book have only an Axios line, and making
   * several hundred of them cost an extra sheet to reach one toggle would be
   * worse than useless; those toggle from the row itself, which already names
   * the one choice underneath.
   */
  const openSaint = (entry: SaintEntry) => {
    if (entry.options.length === 1) {
      onToggle(entry.options[0].token);
      return;
    }
    setExpandedBase(entry.base);
  };

  const countFor = (entry: SaintEntry) => entry.options.filter((option) => selectedSet.has(option.token)).length;

  // Sits inside the row it belongs to, so it has to claim the touch before the
  // row's own handler runs — hitSlop rather than a bigger box, so it stays a
  // small mark beside the name without stealing width from it.
  const previewButton = (target: PreviewTarget) => (
    <Pressable
      accessibilityLabel={`Preview ${target.label} for ${target.saintName}`}
      hitSlop={12}
      style={styles.previewButton}
      onPress={(event) => {
        // On the web the row around this one would otherwise see the same
        // click and toggle the saint, so reading a hymn would also pick it.
        // Native hands the touch to this responder alone; this makes both
        // behave the same way.
        event?.stopPropagation?.();
        openPreview(target);
      }}
    >
      <Icon name="eye-outline" size={17} color={COLORS.muted} />
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={closePicker}
      supportedOrientations={MODAL_SUPPORTED_ORIENTATIONS}
    >
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Close saint hymns" style={styles.backdrop} onPress={closePicker} />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, DISABLED_TEXT_SELECTION_STYLE]}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <Text style={[styles.title, localized]}>{label(LABELS.title)}</Text>
            <Pressable accessibilityLabel="Done" style={styles.doneButton} onPress={closePicker}>
              <Text style={[styles.doneText, localized]}>{label(LABELS.done)}</Text>
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <Icon name="search-outline" size={18} color={COLORS.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={label(LABELS.search)}
              placeholderTextColor={COLORS.muted}
              style={[styles.searchInput, localized]}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>

          {error ? (
            <Text style={[styles.message, localized]}>{error}</Text>
          ) : !saints ? (
            <ActivityIndicator color={COLORS.gold} style={styles.loading} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(entry) => entry.base}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={16}
              windowSize={9}
              ListEmptyComponent={<Text style={[styles.message, localized]}>{label(LABELS.empty)}</Text>}
              renderItem={({ item }) => {
                const count = countFor(item);
                const single = item.options.length === 1;
                return (
                  <Pressable
                    style={[styles.saintRow, count > 0 && styles.saintRowActive]}
                    onPress={() => openSaint(item)}
                  >
                    <View style={styles.saintTextGroup}>
                      <Text style={[styles.saintName, localized]}>{item.name}</Text>
                      <Text style={[styles.saintMeta, localized]}>
                        {single ? item.options[0].label : item.options.map((option) => option.label).join(' · ')}
                      </Text>
                    </View>
                    {single
                      ? previewButton({
                          token: item.options[0].token,
                          category: item.options[0].category,
                          label: item.options[0].label,
                          saintName: item.name,
                        })
                      : null}
                    {count > 0 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{count}</Text>
                      </View>
                    ) : null}
                    {single ? null : <Icon name="chevron-forward" size={18} color={COLORS.muted} />}
                  </Pressable>
                );
              }}
            />
          )}
        </SafeAreaView>
      </View>

      {/* One saint's own hymn menu, over the list it came from. */}
      <Modal
        visible={Boolean(expanded)}
        transparent
        animationType="fade"
        onRequestClose={() => setExpandedBase(null)}
        supportedOrientations={MODAL_SUPPORTED_ORIENTATIONS}
      >
        <View style={styles.popoverOverlay}>
          <Pressable
            accessibilityLabel="Close saint hymn menu"
            style={styles.backdrop}
            onPress={() => setExpandedBase(null)}
          />
          <View style={[styles.popover, DISABLED_TEXT_SELECTION_STYLE]}>
            <Text style={[styles.popoverTitle, localized]}>{expanded?.name}</Text>
            {expanded?.options.map((option) => {
              const active = selectedSet.has(option.token);
              return (
                <Pressable
                  key={option.token}
                  style={[styles.optionRow, active && styles.optionRowActive]}
                  onPress={() => onToggle(option.token)}
                >
                  <Text style={[styles.optionLabel, active && styles.optionLabelActive, localized]}>
                    {option.label}
                  </Text>
                  <View style={styles.optionActions}>
                    {previewButton({
                      token: option.token,
                      category: option.category,
                      label: option.label,
                      saintName: expanded?.name ?? '',
                    })}
                    {active ? <Icon name="checkmark" size={18} color={COLORS.gold} /> : null}
                  </View>
                </Pressable>
              );
            })}
            <View style={styles.popoverActions}>
              {expanded && countFor(expanded) > 0 ? (
                <Pressable style={styles.popoverAction} onPress={() => onClearSaint(expanded.base)}>
                  <Text style={[styles.popoverActionText, localized]}>{label(LABELS.clear)}</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.popoverAction} onPress={() => setExpandedBase(null)}>
                <Text style={[styles.popoverActionText, localized]}>{label(LABELS.done)}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* The hymn itself, over whichever layer asked for it. Declared last so
          it presents above the saint's own menu when opened from there. */}
      <Modal
        visible={Boolean(preview)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
        supportedOrientations={MODAL_SUPPORTED_ORIENTATIONS}
      >
        <View style={styles.popoverOverlay}>
          <Pressable accessibilityLabel="Close preview" style={styles.backdrop} onPress={() => setPreview(null)} />
          <View style={[styles.previewCard, DISABLED_TEXT_SELECTION_STYLE]}>
            <Text style={[styles.popoverTitle, localized]} numberOfLines={2}>
              {preview?.saintName}
            </Text>
            <Text style={[styles.previewSubtitle, localized]}>{preview?.label}</Text>

            {previewError ? (
              <Text style={[styles.message, localized]}>{previewError}</Text>
            ) : !previewHymns ? (
              <ActivityIndicator color={COLORS.gold} style={styles.previewLoading} />
            ) : previewHymns.length === 0 ? (
              <Text style={[styles.message, localized]}>{label(LABELS.noPreview)}</Text>
            ) : (
              <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewContent}>
                {previewHymns.map((hymn) => (
                  <View key={hymn.hymnKey} style={styles.previewHymn}>
                    {/* Named only when the choice brings in more than one hymn
                        — an Adam and a Vatos Psali, say — since otherwise the
                        header above already says what this is. */}
                    {previewHymns.length > 1 && (hymn.title.english || hymn.title.arabic) ? (
                      <Text style={[styles.previewHymnTitle, localized]}>
                        {isArabic ? hymn.title.arabic || hymn.title.english : hymn.title.english || hymn.title.arabic}
                      </Text>
                    ) : null}
                    {hymn.verses.map((verse, index) => (
                      <View key={index} style={styles.previewVerse}>
                        {verse.coptic.trim() ? <Text style={styles.previewCoptic}>{verse.coptic}</Text> : null}
                        {verse.english.trim() ? <Text style={styles.previewEnglish}>{verse.english}</Text> : null}
                        {verse.arabic.trim() ? <Text style={styles.previewArabic}>{verse.arabic}</Text> : null}
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={styles.popoverActions}>
              <Pressable style={styles.popoverAction} onPress={() => setPreview(null)}>
                <Text style={[styles.popoverActionText, localized]}>{label(LABELS.close)}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: COLORS.black,
    borderColor: COLORS.border,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    // Fixed, not maxHeight: the sheet keeps one size whatever the search
    // narrows the list to, instead of collapsing towards the search field as
    // results drop away and springing back when they return.
    height: '86%',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: COLORS.border,
    borderRadius: 2,
    height: 4,
    marginBottom: SPACING.sm,
    width: 44,
  },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 18, fontWeight: '800' },
  doneButton: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  doneText: { color: COLORS.gold, fontSize: 15, fontWeight: '700' },
  searchRow: {
    alignItems: 'center',
    backgroundColor: '#111111',
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  searchInput: { color: COLORS.white, flex: 1, fontSize: 15, paddingVertical: SPACING.sm },
  list: { flex: 1, marginTop: SPACING.sm },
  loading: { flex: 1, paddingVertical: SPACING.xl },
  message: { color: COLORS.muted, flex: 1, fontSize: 14, paddingVertical: SPACING.lg, textAlign: 'center' },
  saintRow: {
    alignItems: 'center',
    backgroundColor: '#111111',
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  saintRowActive: { backgroundColor: '#171513', borderColor: COLORS.goldLine },
  saintTextGroup: { flex: 1, gap: 2 },
  saintName: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 15, fontWeight: '700' },
  saintMeta: { color: COLORS.muted, fontSize: 12 },
  badge: {
    alignItems: 'center',
    backgroundColor: COLORS.goldSoft,
    borderColor: COLORS.goldLine,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: COLORS.gold, fontSize: 12, fontWeight: '800' },
  popoverOverlay: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: SPACING.lg },
  popover: {
    backgroundColor: COLORS.black,
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: SPACING.xs,
    maxWidth: 420,
    padding: SPACING.md,
    width: '100%',
  },
  popoverTitle: {
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: SPACING.xs,
  },
  optionRow: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  optionRowActive: { backgroundColor: '#171513', borderColor: COLORS.goldLine },
  optionLabel: { color: COLORS.white, fontSize: 15, fontWeight: '600' },
  optionLabelActive: { color: COLORS.gold, fontWeight: '800' },
  optionActions: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm },
  previewButton: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  previewCard: {
    backgroundColor: COLORS.black,
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    // Tall enough to read a doxology in without becoming a second document
    // screen — a preview is for recognising the hymn, not praying it.
    maxHeight: '78%',
    maxWidth: 460,
    padding: SPACING.md,
    width: '100%',
  },
  previewSubtitle: { color: COLORS.gold, fontSize: 13, fontWeight: '700', marginBottom: SPACING.sm },
  previewLoading: { paddingVertical: SPACING.xl },
  previewScroll: { flexGrow: 0 },
  previewContent: { gap: SPACING.md, paddingBottom: SPACING.xs },
  previewHymn: { gap: SPACING.sm },
  previewHymnTitle: { color: COLORS.gold, fontFamily: TYPOGRAPHY.title, fontSize: 14, fontWeight: '800' },
  previewVerse: { gap: 2 },
  previewCoptic: { color: COLORS.white, fontFamily: TYPOGRAPHY.coptic, fontSize: 17, lineHeight: 24 },
  previewEnglish: { color: COLORS.white, fontSize: 14, lineHeight: 20 },
  previewArabic: {
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.arabic,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  popoverActions: { flexDirection: 'row', gap: SPACING.sm, justifyContent: 'flex-end', marginTop: SPACING.xs },
  popoverAction: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  popoverActionText: { color: COLORS.gold, fontSize: 14, fontWeight: '700' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
