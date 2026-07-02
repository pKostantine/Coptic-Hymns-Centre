import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useCalendar } from '@/context/CalendarContext';
import {
  getCopticYearForDate,
  getGregorianRangeForCopticYear,
  getSeasonRanges,
  getSingleDayEventsForCopticYear,
  SeasonRange,
} from '@/utils/calendarService';
import { goBack } from '@/utils/navigation';

function formatCopticYear(year: number) {
  return `${year} AM`;
}

type SelectorItem =
  | { type: 'period'; key: string; title: string; subtitle: string; startDate: string; endDate: string }
  | { type: 'day'; key: string; title: string; date: string };

function itemStart(item: SelectorItem) {
  return item.type === 'period' ? item.startDate : item.date;
}
function itemEnd(item: SelectorItem) {
  return item.type === 'period' ? item.endDate : item.date;
}

/**
 * Season selector — ported from SeasonSelector.js's chrome (year nav, live
 * badge, item cards), merging period ranges (`calendar.season_ranges`) with
 * named single-day feasts into one chronological list. The old app's nested
 * per-Sunday children came from a static local dataset with no live-DB
 * equivalent, so this renders a flat list instead of a tree — but the "Live"
 * indicator is implemented in full: a whole block/day is highlighted red
 * when today falls exactly within it, otherwise a red "Live" line is drawn
 * between the two items today falls between.
 */
export default function SeasonSelectorScreen() {
  const router = useRouter();
  const safeAreaInsets = useSafeAreaInsets();
  const { selectDate } = useCalendar();
  const [year, setYear] = useState<number | null>(null);
  const [currentCopticYear, setCurrentCopticYear] = useState<number | null>(null);
  const [items, setItems] = useState<SelectorItem[] | null>(null);
  const [yearRange, setYearRange] = useState<{ startDate: string; endDate: string } | null>(null);

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
    setYearRange(null);

    getGregorianRangeForCopticYear(year).then(async ({ startDate, endDate }) => {
      if (cancelled || !startDate || !endDate) return;
      const periods = await getSeasonRanges(startDate, endDate);
      const singleDayEvents = await getSingleDayEventsForCopticYear(year, periods);
      if (cancelled) return;

      const periodItems: SelectorItem[] = periods
        .filter((row) => row.startDate >= startDate && row.startDate < endDate)
        .map((row) => ({
          type: 'period',
          key: row.rangeKey,
          title: row.activeSeason,
          subtitle: `${row.startEvent} → ${row.endEvent}`,
          startDate: row.startDate,
          endDate: row.endDate,
        }));
      const dayItems: SelectorItem[] = singleDayEvents
        .filter((event) => event.date >= startDate && event.date < endDate)
        .map((event) => ({ type: 'day', key: event.key, title: event.title, date: event.date }));

      const merged = [...periodItems, ...dayItems].sort((a, b) => itemStart(a).localeCompare(itemStart(b)));
      setItems(merged);
      setYearRange({ startDate, endDate });
    });

    return () => {
      cancelled = true;
    };
  }, [year]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayInViewedYear = Boolean(yearRange && todayIso >= yearRange.startDate && todayIso < yearRange.endDate);

  const { liveKeys, lineAfterKey } = useMemo(() => {
    if (!items || !todayInViewedYear) return { liveKeys: new Set<string>(), lineAfterKey: null as string | null };

    const matching = items.filter((item) => itemStart(item) <= todayIso && itemEnd(item) >= todayIso);
    if (matching.length) {
      return { liveKeys: new Set(matching.map((item) => item.key)), lineAfterKey: null as string | null };
    }

    const before = [...items].filter((item) => itemEnd(item) < todayIso).sort((a, b) => itemEnd(a).localeCompare(itemEnd(b))).pop();
    return { liveKeys: new Set<string>(), lineAfterKey: before?.key ?? '__start__' };
  }, [items, todayInViewedYear, todayIso]);

  function selectItem(item: SelectorItem) {
    selectDate(new Date(`${itemStart(item)}T00:00:00Z`));
    goBack(router, '/calendar');
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.screen}>
      <Head>
        <title>CHC Season Selector</title>
      </Head>
      <View style={[styles.header, { paddingTop: safeAreaInsets.top }]}>
        <Pressable accessibilityLabel="Close season selector" style={styles.headerButton} onPress={() => goBack(router, '/calendar')}>
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
              {lineAfterKey === '__start__' ? <LiveLine /> : null}
              {items.map((item) => {
                const isLive = liveKeys.has(item.key);
                const isDay = item.type === 'day';
                return (
                  <View key={item.key}>
                    <Pressable
                      accessibilityLabel={`Select ${item.title}`}
                      style={[
                        isDay ? styles.dayItem : styles.item,
                        isLive && styles.liveItem,
                        {
                          backgroundColor: isLive ? 'rgba(220, 38, 38, 0.22)' : isDay ? COLORS.surface : COLORS.surfaceSoft,
                          borderColor: isLive ? '#EF4444' : isDay ? COLORS.border : COLORS.gold,
                        },
                      ]}
                      onPress={() => selectItem(item)}
                    >
                      <View style={styles.itemTextGroup}>
                        <Text style={isDay ? styles.dayItemTitle : styles.itemTitle}>{item.title}</Text>
                        {item.type === 'period' ? <Text style={styles.itemSubtitle}>{item.subtitle}</Text> : null}
                      </View>
                      {isLive ? <Text style={styles.livePill}>Live</Text> : null}
                    </Pressable>
                    {lineAfterKey === item.key ? <LiveLine /> : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

function LiveLine() {
  return (
    <View style={styles.liveLineRow}>
      <View style={styles.liveLine} />
      <Text style={styles.liveLineText}>Live</Text>
      <View style={styles.liveLine} />
    </View>
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
  dayItem: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.md,
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  liveItem: { borderWidth: 2 },
  itemTextGroup: { flex: 1 },
  itemTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  dayItemTitle: { fontSize: 16, fontWeight: '700', color: COLORS.white },
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
  liveLineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  liveLine: { backgroundColor: '#EF4444', flex: 1, height: 2 },
  liveLineText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
});
