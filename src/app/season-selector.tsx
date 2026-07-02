import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useCalendar } from '@/context/CalendarContext';
import { getCopticYearForDate, getGregorianRangeForCopticYear, getSeasonRanges, SeasonRange } from '@/utils/calendarService';

function formatCopticYear(year: number) {
  return `${year} AM`;
}

/**
 * Season selector — ported 1:1 from SeasonSelector.js's chrome (year nav,
 * live badge, item cards). The old app's nested per-Sunday children come
 * from a static local dataset that has no live-DB equivalent here, so this
 * renders `calendar.season_ranges` as a flat list within the selected
 * Coptic year rather than a nested tree.
 */
export default function SeasonSelectorScreen() {
  const router = useRouter();
  const safeAreaInsets = useSafeAreaInsets();
  const { selectDate } = useCalendar();
  const [year, setYear] = useState<number | null>(null);
  const [currentCopticYear, setCurrentCopticYear] = useState<number | null>(null);
  const [items, setItems] = useState<SeasonRange[] | null>(null);

  useEffect(() => {
    getCopticYearForDate(new Date()).then((y) => {
      setCurrentCopticYear(y);
      setYear(y);
    });
  }, []);

  useEffect(() => {
    if (year === null) return;
    let cancelled = false;
    setItems(null);
    getGregorianRangeForCopticYear(year).then(({ startDate, endDate }) => {
      if (cancelled || !startDate || !endDate) return;
      getSeasonRanges(startDate, endDate).then((rows) => {
        if (!cancelled) setItems(rows.filter((row) => row.startDate >= startDate && row.startDate < endDate));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const todayIso = new Date().toISOString().slice(0, 10);

  function selectItem(item: SeasonRange) {
    selectDate(new Date(`${item.startDate}T00:00:00Z`));
    router.back();
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.screen}>
      <View style={[styles.header, { paddingTop: safeAreaInsets.top }]}>
        <Pressable accessibilityLabel="Close season selector" style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={COLORS.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Season Selector</Text>
        <View style={styles.headerButton} />
      </View>

      {year === null ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
      ) : (
        <>
          <View style={styles.yearRow}>
            <Pressable accessibilityLabel="Previous year" style={styles.yearButton} onPress={() => setYear((y) => (y ?? 0) - 1)}>
              <Ionicons name="chevron-back" size={26} color={COLORS.rowBlue} />
            </Pressable>
            <View style={styles.yearLabel}>
              {year === currentCopticYear ? <View style={styles.currentYearDot} /> : null}
              <Text style={styles.yearText}>{formatCopticYear(year)}</Text>
            </View>
            <Pressable accessibilityLabel="Next year" style={styles.yearButton} onPress={() => setYear((y) => (y ?? 0) + 1)}>
              <Ionicons name="chevron-forward" size={26} color={COLORS.rowBlue} />
            </Pressable>
          </View>

          {!items ? (
            <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
          ) : (
            <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
              {items.map((item) => {
                const isLive = item.startDate <= todayIso && item.endDate >= todayIso;
                return (
                  <Pressable
                    key={item.rangeKey}
                    accessibilityLabel={`Select ${item.activeSeason}`}
                    style={[
                      styles.item,
                      isLive && styles.liveItem,
                      { backgroundColor: isLive ? 'rgba(220, 38, 38, 0.22)' : COLORS.surfaceSoft, borderColor: isLive ? '#EF4444' : COLORS.gold },
                    ]}
                    onPress={() => selectItem(item)}
                  >
                    <View style={styles.itemTextGroup}>
                      <Text style={styles.itemTitle}>{item.activeSeason}</Text>
                      <Text style={styles.itemSubtitle}>
                        {item.startEvent} → {item.endEvent}
                      </Text>
                    </View>
                    {isLive ? <Text style={styles.livePill}>Live</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  header: {
    alignItems: 'center',
    backgroundColor: COLORS.navy,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: SPACING.sm,
  },
  headerButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerTitle: {
    color: COLORS.white,
    flex: 1,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  yearRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  yearButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 56 },
  yearLabel: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: SPACING.sm, justifyContent: 'center' },
  currentYearDot: { backgroundColor: '#EF4444', borderRadius: 5, height: 10, width: 10 },
  yearText: { fontSize: 24, fontWeight: '800', color: COLORS.white },
  listContent: { gap: SPACING.sm, padding: SPACING.md, paddingBottom: SPACING.xl },
  item: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.md,
    justifyContent: 'space-between',
    minHeight: 76,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  liveItem: { borderWidth: 2 },
  itemTextGroup: { flex: 1 },
  itemTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  itemSubtitle: { fontSize: 15, marginTop: SPACING.xs, color: COLORS.muted },
  livePill: {
    backgroundColor: '#EF4444',
    borderRadius: 999,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    textTransform: 'uppercase',
  },
});
