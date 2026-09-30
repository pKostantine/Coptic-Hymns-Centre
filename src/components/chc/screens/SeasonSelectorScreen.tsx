'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import Icon from '@/components/chc/ui/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CopticCross from '@/components/chc/ui/CopticCross';
import SubPageHeader from '@/components/chc/ui/SubPageHeader';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { getEventFormalName, getSeasonFormalName } from '@/constants/seasonNames';
import { useCalendar } from '@/context/CalendarContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import {
  getCopticDatesBetween,
  getCopticYearForDate,
  getGregorianRangeForCopticYear,
  getSeasonRanges,
  getSingleDayEventsForCopticYear,
  type CopticDate,
} from '@/utils/calendarService';
import { localDateAtUtcMidnight, todayIsoDate } from '@/utils/dateUtils';
import {
  formatCalendarDay,
  formatCopticDayMonth,
  formatCopticYear,
  formatGregorianDateRange,
  GREGORIAN_MONTHS_AR,
  GREGORIAN_MONTHS_EN,
  GREGORIAN_MONTHS_FR,
} from '@/utils/localeFormat';
import { goBack } from '@/utils/navigation';
import { DISABLED_TEXT_SELECTION_STYLE } from '@/utils/textSelection';

import { tr } from '../../../utils/appText';

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

/** "SEP" / "SEPT." / "سبتمبر" over each row's day number. */
function monthAbbreviation(isoDate: string, arabic: boolean): string {
  const month = Number(isoDate.slice(5, 7)) - 1;
  if (arabic) return GREGORIAN_MONTHS_AR[month];
  return tr(GREGORIAN_MONTHS_EN[month].slice(0, 3), GREGORIAN_MONTHS_FR[month].slice(0, 4).replace(/\.$/, ''), '').toUpperCase();
}

interface SeasonSelectorScreenProps {
  /** Set when this screen is rendered inside a modal rather than as its own route (see DocumentModal) — returns to whatever the host was showing instead of popping the navigation stack. */
  onClose?: () => void;
}

/**
 * The year's seasons and feasts (CHC design, "Season selector"): each under
 * its Gregorian date, with the Coptic date or the season's span beneath its
 * name; a red "Live · Today" rule where today falls; the season in progress
 * raised in navy and gold; and a season's own feasts nested under it. Choosing
 * one moves the whole app to that day.
 */
export default function SeasonSelectorScreen({ onClose }: SeasonSelectorScreenProps) {
  const router = useRouter();
  const isHosted = Boolean(onClose);
  const closeScreen = () => (onClose ? onClose() : goBack(router, '/books'));
  const { selectDate } = useCalendar();
  const { preferences } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const appLanguage = preferences.appLanguage;
  const [year, setYear] = useState<number | null>(null);
  const [currentCopticYear, setCurrentCopticYear] = useState<number | null>(null);
  const [rows, setRows] = useState<TopRow[] | null>(null);
  const [copticDates, setCopticDates] = useState<Map<string, CopticDate>>(new Map());
  const [yearRange, setYearRange] = useState<{ startDate: string; endDate: string } | null>(null);

  useEffect(() => {
    // Real "today" in the device's own calendar day, not whatever date is
    // selected elsewhere in the app — this seeds which Coptic year to show.
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
      const [periods, dates] = await Promise.all([
        getSeasonRanges(startDate, endDate),
        getCopticDatesBetween(startDate, endDate).catch(() => new Map<string, CopticDate>()),
      ]);
      const singleDayEvents = await getSingleDayEventsForCopticYear(year, periods);
      if (cancelled) return;

      const seasonRows: SeasonRow[] = periods
        .filter((row) => row.startDate >= startDate && row.startDate < endDate)
        .map((row) => {
          const formal = getSeasonFormalName(row.rangeKey, row.activeSeason);
          return {
            type: 'season',
            key: row.rangeKey,
            // Shown whenever the Arabic isn't: French in French.
            title: tr(formal.english, formal.french || formal.english, formal.english),
            arabic: formal.arabic,
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
        const title = tr(formal.english, formal.french || formal.english, formal.english);
        if (assigned) {
          assigned.children.push({ key: event.key, title, arabic: formal.arabic, date: event.date });
        } else {
          looseDays.push({ type: 'day', key: event.key, title, arabic: formal.arabic, date: event.date });
        }
      }
      seasonRows.forEach((s) => s.children.sort((a, b) => a.date.localeCompare(b.date)));

      const merged: TopRow[] = [...seasonRows, ...looseDays].sort(
        (a, b) => rowStart(a).localeCompare(rowStart(b)) || rowEnd(a).localeCompare(rowEnd(b)),
      );

      setRows(merged);
      setCopticDates(dates);
      setYearRange({ startDate, endDate });
    });

    return () => {
      cancelled = true;
    };
  }, [year, isArabic, appLanguage]);

  const todayIso = todayIsoDate();
  const todayInViewedYear = Boolean(yearRange && todayIso >= yearRange.startDate && todayIso < yearRange.endDate);

  // Where the "Live · Today" rule goes: before the row (or nested feast) that
  // is today, before the season today falls in, or after the last row already
  // past.
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

  // The row raised in navy and gold: the season or feast today falls in, or
  // failing that the next one to come, just after the Live rule.
  const raisedKey = useMemo(() => {
    if (!rows || !todayInViewedYear) return null;
    if (liveTopKey) return liveTopKey;
    if (liveChildKey) return null;
    return rows.find((row) => rowStart(row) > todayIso)?.key ?? null;
  }, [rows, todayInViewedYear, liveTopKey, liveChildKey, todayIso]);

  function selectDay(date: string) {
    selectDate(new Date(`${date}T00:00:00Z`));
    closeScreen();
  }

  const copticSubtitle = (date: string) => {
    const coptic = copticDates.get(date);
    return coptic ? formatCopticDayMonth(coptic.monthName, coptic.day, isArabic) : '';
  };
  const liveBar = <LiveBar isArabic={isArabic} />;
  const title = tr('Seasons', 'Temps liturgiques', 'الفترات');

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.screen, DISABLED_TEXT_SELECTION_STYLE]}>
      {/* See CalendarScreen — an overlay over a document isn't its own page. */}
      {isHosted ? null : (
        <Head>
          <title>{`CHC ${title}`}</title>
        </Head>
      )}
      <SubPageHeader title={title} arabic={isArabic} onBack={closeScreen} backLabel={tr('Close the seasons', 'Fermer les temps liturgiques', 'أغلق الفترات')} />

      {year === null ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
      ) : (
        <>
          <View style={styles.yearRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={isArabic ? 'السنة التالية' : tr('Previous year', 'Année précédente', '')} style={styles.arrow} onPress={() => setYear((y) => (y ?? 0) + (isArabic ? 1 : -1))}>
              <Icon name="chevron-back" size={17} color={COLORS.gold} />
            </Pressable>
            <View style={[styles.yearLabel, isArabic && styles.rowReverse]}>
              {year === currentCopticYear ? <View style={styles.yearDot} /> : null}
              <Text style={[styles.yearText, isArabic && styles.arabicText]}>{formatCopticYear(year, isArabic)}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={isArabic ? 'السنة السابقة' : tr('Next year', 'Année suivante', '')} style={styles.arrow} onPress={() => setYear((y) => (y ?? 0) + (isArabic ? -1 : 1))}>
              <Icon name="chevron-forward" size={17} color={COLORS.gold} />
            </Pressable>
          </View>

          {!rows ? (
            <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
          ) : (
            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
              {lineAfterKey === '__start__' ? liveBar : null}
              {rows.map((row) => {
                const current = raisedKey === row.key;
                const past = rowEnd(row) < todayIso;
                const date = rowStart(row);
                const subtitle = row.type === 'season' ? formatGregorianDateRange(row.startDate, row.endDate, isArabic) : copticSubtitle(row.date);
                return (
                  <Fragment key={row.key}>
                    {liveTopKey === row.key ? liveBar : null}
                    <EventRow
                      title={isArabic ? row.arabic || row.title : row.title}
                      subtitle={subtitle}
                      date={date}
                      isArabic={isArabic}
                      current={current}
                      chevron={!past}
                      onPress={() => selectDay(date)}
                    />
                    {row.type === 'season' && row.children.length ? (
                      <View style={[styles.nest, isArabic && styles.nestArabic]}>
                        {row.children.map((child, index) => (
                          <Fragment key={child.key}>
                            {liveChildKey === child.key ? liveBar : null}
                            <EventRow
                              title={isArabic ? child.arabic || child.title : child.title}
                              date={child.date}
                              isArabic={isArabic}
                              nested
                              last={index === row.children.length - 1}
                              onPress={() => selectDay(child.date)}
                            />
                          </Fragment>
                        ))}
                      </View>
                    ) : null}
                    {lineAfterKey === row.key ? liveBar : null}
                  </Fragment>
                );
              })}
            </ScrollView>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

function EventRow({
  title,
  subtitle,
  date,
  isArabic,
  current = false,
  chevron = false,
  nested = false,
  last = false,
  onPress,
}: {
  title: string;
  subtitle?: string;
  date: string;
  isArabic: boolean;
  current?: boolean;
  chevron?: boolean;
  nested?: boolean;
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, current && styles.rowCurrent, (last || current) && styles.rowLast, isArabic && styles.rowReverse, pressed && styles.pressed]}
    >
      {current ? (
        <>
          <LinearGradient colors={['#0C3158', COLORS.navyDark]} start={{ x: 0.33, y: 0 }} end={{ x: 0.67, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={[styles.watermark, isArabic ? styles.watermarkLeft : styles.watermarkRight]} pointerEvents="none">
            <CopticCross size={46} color="rgba(201, 162, 39, 0.35)" />
          </View>
        </>
      ) : null}
      <View style={styles.dateColumn}>
        <Text style={[styles.month, current && styles.gold, isArabic && styles.arabicSmall]} numberOfLines={1}>{monthAbbreviation(date, isArabic)}</Text>
        <Text style={[styles.day, nested && styles.dayNested, current && styles.gold]}>{formatCalendarDay(Number(date.slice(8, 10)), isArabic)}</Text>
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, nested && styles.titleNested, isArabic && styles.arabicText]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, isArabic && styles.arabicText]}>{subtitle}</Text> : null}
      </View>
      {chevron ? <Icon name={isArabic ? 'chevron-back' : 'chevron-forward'} size={17} color={COLORS.gold} /> : null}
    </Pressable>
  );
}

function LiveBar({ isArabic }: { isArabic: boolean }) {
  return (
    <View style={[styles.liveBar, isArabic && styles.rowReverse]} accessibilityRole="text">
      <View style={styles.liveDotHalo}>
        <View style={styles.liveDot} />
      </View>
      <Text style={[styles.liveText, isArabic && styles.arabicSmall]}>{tr('LIVE · TODAY', 'EN DIRECT · AUJOURD’HUI', 'الآن · اليوم')}</Text>
      <View style={styles.liveLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  rowReverse: { flexDirection: 'row-reverse' },
  yearRow: {
    alignItems: 'center',
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  arrow: { alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.06)', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  yearLabel: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  yearDot: { backgroundColor: COLORS.priest, borderRadius: 4, height: 8, width: 8 },
  yearText: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 24, fontWeight: '700' },
  list: { paddingBottom: 28, paddingHorizontal: 16, paddingTop: 6 },
  row: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255, 255, 255, 0.07)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  rowCurrent: {
    borderColor: COLORS.goldLine,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 6,
    marginTop: 2,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  rowLast: { borderBottomWidth: 0 },
  pressed: { opacity: 0.7 },
  watermark: { position: 'absolute', top: 3 },
  watermarkRight: { right: 36 },
  watermarkLeft: { left: 36 },
  dateColumn: { alignItems: 'center', width: 44 },
  month: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '700', letterSpacing: 0.9 },
  day: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700', lineHeight: 24 },
  dayNested: { fontSize: 18, lineHeight: 21 },
  gold: { color: COLORS.gold },
  text: { flex: 1, minWidth: 0 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 16, fontWeight: '600', lineHeight: 21 },
  titleNested: { fontSize: 15, fontWeight: '500' },
  subtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: 2 },
  nest: { borderLeftColor: COLORS.goldLine, borderLeftWidth: 1, marginLeft: 26, paddingLeft: 18 },
  nestArabic: { borderLeftWidth: 0, borderRightColor: COLORS.goldLine, borderRightWidth: 1, marginLeft: 0, marginRight: 26, paddingLeft: 0, paddingRight: 18 },
  liveBar: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 12 },
  liveDotHalo: { alignItems: 'center', backgroundColor: 'rgba(214, 69, 69, 0.2)', borderRadius: 8, height: 16, justifyContent: 'center', width: 16 },
  liveDot: { backgroundColor: COLORS.priest, borderRadius: 4, height: 8, width: 8 },
  liveText: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  liveLine: { backgroundColor: COLORS.priest, flex: 1, height: 1, opacity: 0.6 },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  arabicSmall: { fontFamily: TYPOGRAPHY.arabic, letterSpacing: 0 },
});
