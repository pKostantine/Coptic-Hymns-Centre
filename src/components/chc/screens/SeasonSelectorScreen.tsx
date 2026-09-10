import Icon from '@/components/chc/ui/Icon';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { getEventFormalName, getSeasonFormalName } from '@/constants/seasonNames';
import { useCalendar } from '@/context/CalendarContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import {
  getCopticYearForDate,
  getGregorianRangeForCopticYear,
  getSeasonRanges,
  getSingleDayEventsForCopticYear,
} from '@/utils/calendarService';
import { localDateAtUtcMidnight, todayIsoDate } from '@/utils/dateUtils';
import { formatCopticYear, formatGregorianDate, formatGregorianDateRange } from '@/utils/localeFormat';
import { goBack } from '@/utils/navigation';

const SEASON_SELECTOR_LABELS = {
  title: { english: 'Season Selector', arabic: 'اختيار الفترة' },
  live: { english: 'Live', arabic: 'حاليًا' },
};

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

interface SeasonSelectorScreenProps {
  /** Set when this screen is rendered inside a modal rather than as its own route (see DocumentModal) — returns to whatever the host was showing instead of popping the navigation stack. */
  onClose?: () => void;
}

export default function SeasonSelectorScreen({ onClose }: SeasonSelectorScreenProps) {
  const router = useRouter();
  const isHosted = Boolean(onClose);
  const closeScreen = () => (onClose ? onClose() : goBack(router, '/calendar'));
  const safeAreaInsets = useSafeAreaInsets();
  const { selectDate } = useCalendar();
  const { preferences } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const labelText = (label: { english: string; arabic: string }) => (isArabic ? label.arabic : label.english);
  const [year, setYear] = useState<number | null>(null);
  const [currentCopticYear, setCurrentCopticYear] = useState<number | null>(null);
  const [rows, setRows] = useState<TopRow[] | null>(null);
  const [yearRange, setYearRange] = useState<{ startDate: string; endDate: string } | null>(null);

  useEffect(() => {
    // localDateAtUtcMidnight (not a bare `new Date()`) so this resolves
    // against the device's own local calendar day, same as everywhere else
    // — see CalendarContext.tsx. Real "today", not rawDate/selectedDate,
    // since this seeds which Coptic year to show regardless of whatever
    // date might be selected elsewhere in the app.
    getCopticYearForDate(localDateAtUtcMidnight(new Date())).then((y) => {
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
            subtitle: formatGregorianDateRange(row.startDate, row.endDate, isArabic),
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
  }, [year, isArabic]);

  const todayIso = todayIsoDate();
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
    closeScreen();
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.screen}>
      {/* See CalendarScreen — an overlay over a document isn't its own page. */}
      {isHosted ? null : (
        <Head>
          <title>{`CHC ${labelText(SEASON_SELECTOR_LABELS.title)}`}</title>
        </Head>
      )}
      <View style={[styles.header, { paddingTop: safeAreaInsets.top }]}>
        <Pressable accessibilityLabel="Close season selector" style={styles.headerButton} onPress={closeScreen}>
          <Icon name="chevron-back" size={28} color={COLORS.white} />
        </Pressable>
        <Text style={[styles.headerTitle, isArabic && styles.headerTitleArabic]}>{labelText(SEASON_SELECTOR_LABELS.title)}</Text>
        <View style={styles.headerButton} />
      </View>

      {year === null ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
      ) : (
        <>
          <View style={styles.yearRow}>
            <Pressable accessibilityLabel={isArabic ? 'Next year' : 'Previous year'} style={styles.yearButton} onPress={() => setYear((y) => (y ?? 0) + (isArabic ? 1 : -1))}>
              <Icon name="chevron-back" size={26} color={COLORS.rowBlue} />
            </Pressable>
            <View style={[styles.yearLabel, isArabic && styles.rowReverse]}>
              {year === currentCopticYear ? <View style={styles.currentYearDot} /> : null}
              <Text style={[styles.yearText, isArabic && styles.arabicText]}>{formatCopticYear(year, isArabic)}</Text>
            </View>
            <Pressable accessibilityLabel={isArabic ? 'Previous year' : 'Next year'} style={styles.yearButton} onPress={() => setYear((y) => (y ?? 0) + (isArabic ? -1 : 1))}>
              <Icon name="chevron-forward" size={26} color={COLORS.rowBlue} />
            </Pressable>
          </View>

          {!rows ? (
            <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
          ) : (
            <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
              {lineAfterKey === '__start__' ? <LiveLine isArabic={isArabic} label={labelText(SEASON_SELECTOR_LABELS.live)} /> : null}
              {rows.map((row) => {
                if (row.type === 'day') {
                  const isLive = liveTopKey === row.key;
                  return (
                    <View key={row.key}>
                      <DayCard title={row.title} arabic={row.arabic} date={row.date} isLive={isLive} isArabic={isArabic} liveLabel={labelText(SEASON_SELECTOR_LABELS.live)} onPress={() => selectDay(row.date)} />
                      {lineAfterKey === row.key ? <LiveLine isArabic={isArabic} label={labelText(SEASON_SELECTOR_LABELS.live)} /> : null}
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
                      <View style={[styles.itemTextGroup, isArabic && styles.itemTextGroupArabic]}>
                        <Text style={[styles.seasonTitle, isArabic && styles.arabicText]}>{isArabic ? row.arabic || row.title : row.title}</Text>
                        <Text style={[styles.itemSubtitle, isArabic && styles.arabicText]}>{row.subtitle}</Text>
                      </View>
                      {isLive ? <Text style={[styles.livePill, isArabic && styles.livePillArabic]}>{labelText(SEASON_SELECTOR_LABELS.live)}</Text> : null}
                    </Pressable>

                    {row.children.length ? (
                      <View style={[styles.childrenWrapper, isArabic && styles.childrenWrapperArabic]}>
                        {row.children.map((child) => (
                          <DayCard
                            key={child.key}
                            title={child.title}
                            arabic={child.arabic}
                            date={child.date}
                            isLive={liveChildKey === child.key}
                            isArabic={isArabic}
                            liveLabel={labelText(SEASON_SELECTOR_LABELS.live)}
                            onPress={() => selectDay(child.date)}
                          />
                        ))}
                      </View>
                    ) : null}

                    {lineAfterKey === row.key ? <LiveLine isArabic={isArabic} label={labelText(SEASON_SELECTOR_LABELS.live)} /> : null}
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
  isArabic,
  liveLabel,
  onPress,
}: {
  title: string;
  arabic: string;
  date: string;
  isLive: boolean;
  isArabic: boolean;
  liveLabel: string;
  onPress: () => void;
}) {
  const displayTitle = isArabic ? arabic || title : title;
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
      <View style={[styles.itemTextGroup, isArabic && styles.itemTextGroupArabic]}>
        <Text style={[styles.dayItemTitle, isArabic && styles.arabicText]}>{displayTitle}</Text>
        <Text style={[styles.itemSubtitle, isArabic && styles.arabicText]}>{formatGregorianDate(date, isArabic)}</Text>
      </View>
      {isLive ? <Text style={[styles.livePill, isArabic && styles.livePillArabic]}>{liveLabel}</Text> : null}
    </Pressable>
  );
}

function LiveLine({ isArabic, label }: { isArabic: boolean; label: string }) {
  return (
    <View style={styles.liveLineRow}>
      <View style={styles.liveLine} />
      <Text style={[styles.liveLineText, isArabic && styles.livePillArabic]}>{label}</Text>
      <View style={styles.liveLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  rowReverse: { flexDirection: 'row-reverse' },
  header: { alignItems: 'center', backgroundColor: COLORS.navy, flexDirection: 'row', minHeight: 56, paddingHorizontal: SPACING.sm },
  headerButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerTitle: { color: COLORS.white, flex: 1, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  headerTitleArabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'center', writingDirection: 'rtl' },
  yearRow: { alignItems: 'center', borderBottomWidth: 1, borderColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  yearButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 56 },
  yearLabel: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: SPACING.sm, justifyContent: 'center' },
  currentYearDot: { backgroundColor: '#EF4444', borderRadius: 5, height: 10, width: 10 },
  yearText: { fontSize: 24, fontWeight: '800', color: COLORS.white },
  listContent: { gap: SPACING.sm, padding: SPACING.md, paddingBottom: SPACING.xl },
  seasonItem: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: SPACING.md, justifyContent: 'space-between', minHeight: 76, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  dayItem: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: SPACING.md, justifyContent: 'space-between', minHeight: 64, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  childrenWrapper: { borderLeftWidth: 2, borderColor: COLORS.gold, gap: SPACING.sm, marginLeft: SPACING.md, marginTop: SPACING.sm, paddingLeft: SPACING.md },
  childrenWrapperArabic: { borderLeftWidth: 0, borderRightWidth: 2, marginLeft: 0, marginRight: SPACING.md, paddingLeft: 0, paddingRight: SPACING.md },
  itemTextGroup: { flex: 1 },
  itemTextGroupArabic: { alignItems: 'flex-end' },
  seasonTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  itemSubtitle: { fontSize: 15, marginTop: SPACING.xs, color: COLORS.muted },
  dayItemTitle: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  livePill: { backgroundColor: '#EF4444', borderRadius: 999, color: '#FFFFFF', fontSize: 12, fontWeight: '900', overflow: 'hidden', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, textTransform: 'uppercase' },
  livePillArabic: { fontFamily: TYPOGRAPHY.arabic, textTransform: 'none', writingDirection: 'rtl' },
  liveLineRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm, paddingVertical: SPACING.xs },
  liveLine: { backgroundColor: '#EF4444', flex: 1, height: 2 },
  liveLineText: { color: '#EF4444', fontSize: 13, fontWeight: '900', textTransform: 'uppercase' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
