import Icon from '@/components/chc/ui/Icon';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { getEventFormalName, getSeasonFormalName } from '@/constants/seasonNames';
import { useCalendar } from '@/context/CalendarContext';
import {
  getCopticYearForDate,
  getGregorianRangeForCopticYear,
  getSeasonRanges,
  getSingleDayEventsForCopticYear,
} from '@/utils/calendarService';
import { goBack } from '@/utils/navigation';

function formatCopticYear(year: number) {
  return `${year} AM`;
}

/** ISO date -> "Mar 2, 2026", using the Gregorian calendar (not the DB row's Coptic breakdown). */
function formatGregorianDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** A season's date range as "Mar 2 – Apr 18, 2026" (endDate is exclusive, so the displayed end is one day earlier), or a single date if start === displayed end. */
function formatDateRange(startDate: string, endDateExclusive: string) {
  const displayEnd = new Date(`${endDateExclusive}T00:00:00Z`);
  displayEnd.setUTCDate(displayEnd.getUTCDate() - 1);
  const endIso = displayEnd.toISOString().slice(0, 10);
  if (endIso <= startDate) return formatGregorianDate(startDate);

  const start = new Date(`${startDate}T00:00:00Z`);
  const sameYear = start.getUTCFullYear() === displayEnd.getUTCFullYear();
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const endLabel = formatGregorianDate(endIso);
  return sameYear ? `${startLabel} – ${endLabel}` : `${formatGregorianDate(startDate)} – ${endLabel}`;
}

interface ChildRow {
  key: string;
  title: string;
  arabic: string;
  date: string;
}

interface SeasonRow {
  type: 'season';
  key: string;
  title: string;
  arabic: string;
  subtitle: string;
  startDate: string;
  endDate: string;
  children: ChildRow[];
}

interface DayRow {
  type: 'day';
  key: string;
  title: string;
  arabic: string;
  date: string;
}

type TopRow = SeasonRow | DayRow;

function rowStart(row: TopRow) {
  return row.type === 'season' ? row.startDate : row.date;
}
function rowEnd(row: TopRow) {
  return row.type === 'season' ? row.endDate : row.date;
}

export default function SeasonSelectorScreen() {
  const router = useRouter();
  const safeAreaInsets = useSafeAreaInsets();
  const { selectDate } = useCalendar();
  const [year, setYear] = useState<number | null>(null);
  const [currentCopticYear, setCurrentCopticYear] = useState<number | null>(null);
  const [rows, setRows] = useState<TopRow[] | null>(null);
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
    setRows(null);
    setYearRange(null);

    getGregorianRangeForCopticYear(year).then(async ({ startDate, endDate }) => {
      if (cancelled || !startDate || !endDate) return;
      const periods = await getSeasonRanges(startDate, endDate);
      const singleDayEvents = await getSingleDayEventsForCopticYear(year, periods);
      if (cancelled) return;

      const seasonRows: SeasonRow[] = periods
        .filter((row) => row.startDate >= startDate && row.startDate < endDate)
        .map((row) => {
          const formal = getSeasonFormalName(row.rangeKey, row.activeSeason);
          return {
            type: 'season',
            key: row.rangeKey,
            title: formal.english,
            arabic: formal.arabic,
            subtitle: formatDateRange(row.startDate, row.endDate),
            startDate: row.startDate,
            endDate: row.endDate,
            children: [],
          };
        });

      const looseDays: DayRow[] = [];
      for (const event of singleDayEvents.filter((e) => e.date >= startDate && e.date < endDate)) {
        // A day that exactly completes a season (its endDate) belongs to that
        // season, even if it also happens to be the next season's startDate
        // (e.g. Resurrection ends Holy Week and begins Holy 50 Days).
        const assigned =
          seasonRows.find((s) => event.date === s.endDate) ||
          seasonRows.find((s) => event.date > s.startDate && event.date < s.endDate) ||
          seasonRows.find((s) => event.date === s.startDate);

        const formal = getEventFormalName(event.key, event.title);
        const child: ChildRow = { key: event.key, title: formal.english, arabic: formal.arabic, date: event.date };

        if (assigned) {
          assigned.children.push(child);
        } else {
          looseDays.push({ type: 'day', key: event.key, title: formal.english, arabic: formal.arabic, date: event.date });
        }
      }
      seasonRows.forEach((s) => s.children.sort((a, b) => a.date.localeCompare(b.date)));

      const merged: TopRow[] = [...seasonRows, ...looseDays].sort(
        (a, b) => rowStart(a).localeCompare(rowStart(b)) || rowEnd(a).localeCompare(rowEnd(b)),
      );

      setRows(merged);
      setYearRange({ startDate, endDate });
    });

    return () => {
      cancelled = true;
    };
  }, [year]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayInViewedYear = Boolean(yearRange && todayIso >= yearRange.startDate && todayIso < yearRange.endDate);

  const { liveTopKey, liveChildKey, lineAfterKey } = useMemo(() => {
    if (!rows || !todayInViewedYear) {
      return { liveTopKey: null as string | null, liveChildKey: null as string | null, lineAfterKey: null as string | null };
    }

    for (const row of rows) {
      if (row.type === 'season') {
        const child = row.children.find((c) => c.date === todayIso);
        if (child) return { liveTopKey: null, liveChildKey: child.key, lineAfterKey: null };
        if (todayIso >= row.startDate && todayIso <= row.endDate) {
          return { liveTopKey: row.key, liveChildKey: null, lineAfterKey: null };
        }
      } else if (row.date === todayIso) {
        return { liveTopKey: row.key, liveChildKey: null, lineAfterKey: null };
      }
    }

    const before = [...rows].filter((row) => rowEnd(row) < todayIso).sort((a, b) => rowEnd(a).localeCompare(rowEnd(b))).pop();
    return { liveTopKey: null, liveChildKey: null, lineAfterKey: before?.key ?? '__start__' };
  }, [rows, todayInViewedYear, todayIso]);

  function selectDay(date: string) {
    selectDate(new Date(`${date}T00:00:00Z`));
    goBack(router, '/calendar');
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.screen}>
      <Head>
        <title>CHC Season Selector</title>
      </Head>
      <View style={[styles.header, { paddingTop: safeAreaInsets.top }]}>
        <Pressable accessibilityLabel="Close season selector" style={styles.headerButton} onPress={() => goBack(router, '/calendar')}>
          <Icon name="chevron-back" size={28} color={COLORS.white} />
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
              <Icon name="chevron-back" size={26} color={COLORS.rowBlue} />
            </Pressable>
            <View style={styles.yearLabel}>
              {year === currentCopticYear ? <View style={styles.currentYearDot} /> : null}
              <Text style={styles.yearText}>{formatCopticYear(year)}</Text>
            </View>
            <Pressable accessibilityLabel="Next year" style={styles.yearButton} onPress={() => setYear((y) => (y ?? 0) + 1)}>
              <Icon name="chevron-forward" size={26} color={COLORS.rowBlue} />
            </Pressable>
          </View>

          {!rows ? (
            <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
          ) : (
            <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
              {lineAfterKey === '__start__' ? <LiveLine /> : null}
              {rows.map((row) => {
                if (row.type === 'day') {
                  const isLive = liveTopKey === row.key;
                  return (
                    <View key={row.key}>
                      <DayCard title={row.title} arabic={row.arabic} date={row.date} isLive={isLive} onPress={() => selectDay(row.date)} />
                      {lineAfterKey === row.key ? <LiveLine /> : null}
                    </View>
                  );
                }

                const isLive = liveTopKey === row.key;
                return (
                  <View key={row.key}>
                    <Pressable
                      accessibilityLabel={`Select ${row.title}`}
                      style={[
                        styles.seasonItem,
                        {
                          backgroundColor: isLive ? 'rgba(220, 38, 38, 0.22)' : COLORS.surfaceSoft,
                          borderColor: isLive ? '#EF4444' : COLORS.gold,
                          borderWidth: isLive ? 2 : 1,
                        },
                      ]}
                      onPress={() => selectDay(row.startDate)}
                    >
                      <View style={styles.itemTextGroup}>
                        <Text style={styles.seasonTitle}>{row.title}</Text>
                        {row.arabic ? <Text style={styles.seasonArabic}>{row.arabic}</Text> : null}
                        <Text style={styles.itemSubtitle}>{row.subtitle}</Text>
                      </View>
                      {isLive ? <Text style={styles.livePill}>Live</Text> : null}
                    </Pressable>

                    {row.children.length ? (
                      <View style={styles.childrenWrapper}>
                        {row.children.map((child) => (
                          <DayCard
                            key={child.key}
                            title={child.title}
                            arabic={child.arabic}
                            date={child.date}
                            isLive={liveChildKey === child.key}
                            onPress={() => selectDay(child.date)}
                          />
                        ))}
                      </View>
                    ) : null}

                    {lineAfterKey === row.key ? <LiveLine /> : null}
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

function DayCard({
  title,
  arabic,
  date,
  isLive,
  onPress,
}: {
  title: string;
  arabic: string;
  date: string;
  isLive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Select ${title}`}
      style={[
        styles.dayItem,
        {
          backgroundColor: isLive ? 'rgba(220, 38, 38, 0.22)' : COLORS.surface,
          borderColor: isLive ? '#EF4444' : COLORS.border,
          borderWidth: isLive ? 2 : 1,
        },
      ]}
      onPress={onPress}
    >
      <View style={styles.itemTextGroup}>
        <Text style={styles.dayItemTitle}>{title}</Text>
        {arabic ? <Text style={styles.dayItemArabic}>{arabic}</Text> : null}
        <Text style={styles.itemSubtitle}>{formatGregorianDate(date)}</Text>
      </View>
      {isLive ? <Text style={styles.livePill}>Live</Text> : null}
    </Pressable>
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
  header: { alignItems: 'center', backgroundColor: COLORS.navy, flexDirection: 'row', minHeight: 56, paddingHorizontal: SPACING.sm },
  headerButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerTitle: { color: COLORS.white, flex: 1, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  yearRow: { alignItems: 'center', borderBottomWidth: 1, borderColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  yearButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 56 },
  yearLabel: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: SPACING.sm, justifyContent: 'center' },
  currentYearDot: { backgroundColor: '#EF4444', borderRadius: 5, height: 10, width: 10 },
  yearText: { fontSize: 24, fontWeight: '800', color: COLORS.white },
  listContent: { gap: SPACING.sm, padding: SPACING.md, paddingBottom: SPACING.xl },
  seasonItem: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: SPACING.md, justifyContent: 'space-between', minHeight: 76, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  dayItem: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: SPACING.md, justifyContent: 'space-between', minHeight: 64, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  childrenWrapper: { borderLeftWidth: 2, borderColor: COLORS.gold, gap: SPACING.sm, marginLeft: SPACING.md, marginTop: SPACING.sm, paddingLeft: SPACING.md },
  itemTextGroup: { flex: 1 },
  seasonTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  seasonArabic: { color: COLORS.white, fontFamily: 'Arial', fontSize: 16, fontWeight: '700', marginTop: SPACING.xs, textAlign: 'right', writingDirection: 'rtl' },
  itemSubtitle: { fontSize: 15, marginTop: SPACING.xs, color: COLORS.muted },
  dayItemTitle: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  dayItemArabic: { color: COLORS.white, fontFamily: 'Arial', fontSize: 15, fontWeight: '700', marginTop: 2, textAlign: 'right', writingDirection: 'rtl' },
  livePill: { backgroundColor: '#EF4444', borderRadius: 999, color: '#FFFFFF', fontSize: 12, fontWeight: '900', overflow: 'hidden', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, textTransform: 'uppercase' },
  liveLineRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm, paddingVertical: SPACING.xs },
  liveLine: { backgroundColor: '#EF4444', flex: 1, height: 2 },
  liveLineText: { color: '#EF4444', fontSize: 13, fontWeight: '900', textTransform: 'uppercase' },
});
