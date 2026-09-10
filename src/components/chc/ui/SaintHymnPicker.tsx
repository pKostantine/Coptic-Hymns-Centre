import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon from '@/components/chc/ui/Icon';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { MODAL_SUPPORTED_ORIENTATIONS } from '@/utils/modalOrientations';
import { getSaintHymnIndex, SaintEntry } from '@/utils/saintHymns';
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
};

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

  // Closing clears this sheet's own transient state, so it never reopens with
  // a stale search or a saint's menu still hanging open behind it. Done on the
  // close path rather than in an effect watching `visible` — every close goes
  // through here, and the effect was setting state mid-reconciliation.
  const closePicker = () => {
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
                  {active ? <Icon name="checkmark" size={18} color={COLORS.gold} /> : null}
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
    maxHeight: '86%',
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
  list: { marginTop: SPACING.sm },
  loading: { paddingVertical: SPACING.xl },
  message: { color: COLORS.muted, fontSize: 14, paddingVertical: SPACING.lg, textAlign: 'center' },
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
  popoverActions: { flexDirection: 'row', gap: SPACING.sm, justifyContent: 'flex-end', marginTop: SPACING.xs },
  popoverAction: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  popoverActionText: { color: COLORS.gold, fontSize: 14, fontWeight: '700' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
