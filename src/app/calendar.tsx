import Icon from '@/components/chc/ui/Icon';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { getSeasonFormalName, getSeasonShortName } from '@/constants/seasonNames';
import { useCalendar } from '@/context/CalendarContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { todayIsoDate } from '@/utils/dateUtils';
import {
  CalendarDay,
  getAdjacentCopticMonth,
  getCopticMonthForDate,
  getCopticMonthGrid,
  getGregorianMonthGrid,
  getSeasonRanges,
  SeasonRange,
} from '@/utils/calendarService';
import { formatCalendarDay, formatCopticMonthName, formatGregorianMonthTitle } from '@/utils/localeFormat';
import { goBack } from '@/utils/navigation';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_AR = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
const WEEKDAY_INDEX: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const CALENDAR_LABELS = {
  calendar: { english: 'Calendar', arabic: 'التقويم' },
  live: { english: 'Live', arabic: 'حاليًا' },
  setLive: { english: 'Set Live', arabic: 'العودة للحالي' },
  season: { english: 'Season', arabic: 'فترة' },
  gregorian: { english: 'Gregorian', arabic: 'ميلادي' },
  coptic: { english: 'Coptic', arabic: 'قبطي' },
};

type Mode = 'gregorian' | 'coptic';

/** Calendar screen — ported 1:1 from CalendarDatePicker.js. Its header is custom (not the shared AppHeader), matching the old component exactly. */
export default function CalendarScreen() {
  const router = useRouter();
  const safeAreaInsets = useSafeAreaInsets();
  const { rawDate, isLive, selectDate, goLive, liturgicalDayPeriod, setLiturgicalDayPeriod } = useCalendar();
  const { preferences } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const labelText = (label: { english: string; arabic: string }) => (isArabic ? label.arabic : label.english);

  const [mode, setMode] = useState<Mode>('gregorian');
  const [gregorianYear, setGregorianYear] = useState(rawDate.getUTCFullYear());
  const [gregorianMonth, setGregorianMonth] = useState(rawDate.getUTCMonth() + 1);
  const [copticYear, setCopticYear] = useState<number | null>(null);
  const [copticMonth, setCopticMonth] = useState<number | null>(null);
  const [copticMonthName, setCopticMonthName] = useState('');
  const [days, setDays] = useState<CalendarDay[] | null>(null);
  const [seasons, setSeasons] = useState<SeasonRange[]>([]);

  // The grid highlight always tracks the literal calendar day, even after
  // the liturgical day has rolled forward past 5pm — only the day/night
  // toggle communicates that content is now for the evening.
  const selectedIso = rawDate.toISOString().slice(0, 10);
  const todayIso = todayIsoDate();

  // Keeps the visible month grid following `rawDate` when it changes from
  // outside this screen (e.g. teleporting here via the season selector, which
  // pops back to this same still-mounted screen instance rather than
  // remounting it, so the initial useState seed above never re-runs).
  useEffect(() => {
    setGregorianYear(rawDate.getUTCFullYear());
    setGregorianMonth(rawDate.getUTCMonth() + 1);
    setCopticYear(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the timestamp, not the Date instance
  }, [rawDate.getTime()]);

  useEffect(() => {
    if (mode !== 'coptic' || copticYear !== null) return;
    getCopticMonthForDate(rawDate).then((result) => {
      if (!result) return;
      setCopticYear(result.coptic_year);
      setCopticMonth(result.coptic_month);
      setCopticMonthName(result.coptic_month_name);
    });
  }, [mode, copticYear, rawDate]);

  const loadMonth = useCallback(async () => {
    setDays(null);
    if (mode === 'gregorian') {
      const grid = await getGregorianMonthGrid(gregorianYear, gregorianMonth);
      setDays(grid);
      if (grid.length) {
        const fromDate = grid[0].gregorianDate < todayIso ? grid[0].gregorianDate : todayIso;
        const toDate = grid[grid.length - 1].gregorianDate > todayIso ? grid[grid.length - 1].gregorianDate : todayIso;
        setSeasons(await getSeasonRanges(fromDate, toDate));
      }
    } else if (copticYear !== null && copticMonth !== null) {
      const grid = await getCopticMonthGrid(copticYear, copticMonth);
      setDays(grid);
      if (grid.length) {
        const fromDate = grid[0].gregorianDate < todayIso ? grid[0].gregorianDate : todayIso;
        const toDate = grid[grid.length - 1].gregorianDate > todayIso ? grid[grid.length - 1].gregorianDate : todayIso;
        setSeasons(await getSeasonRanges(fromDate, toDate));
      }
    }
  }, [mode, gregorianYear, gregorianMonth, copticYear, copticMonth]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const goPrevGregorian = () => {
    if (gregorianMonth === 1) {
      setGregorianMonth(12);
      setGregorianYear((y) => y - 1);
    } else {
      setGregorianMonth((m) => m - 1);
    }
  };
  const goNextGregorian = () => {
    if (gregorianMonth === 12) {
      setGregorianMonth(1);
      setGregorianYear((y) => y + 1);
    } else {
      setGregorianMonth((m) => m + 1);
    }
  };

  const goAdjacentCoptic = async (direction: 1 | -1) => {
    if (copticYear === null || copticMonth === null) return;
    const next = await getAdjacentCopticMonth(copticYear, copticMonth, direction);
    if (!next) return;
    setCopticYear(next.coptic_year);
    setCopticMonth(next.coptic_month);
    setCopticMonthName(next.coptic_month_name);
  };

  function pickDate(date: Date) {
    selectDate(date);
    setGregorianYear(date.getUTCFullYear());
    setGregorianMonth(date.getUTCMonth() + 1);
    setCopticYear(null);
  }

  const leadingBlanks = days && days.length ? WEEKDAY_INDEX[days[0].weekday] : 0;

  const activeSeason = useMemo(() => seasons.find((s) => s.startDate <= todayIso && s.endDate >= todayIso), [seasons, todayIso]);
  const activeSeasonLabel = activeSeason
    ? isArabic
      ? getSeasonFormalName(activeSeason.rangeKey, activeSeason.activeSeason).arabic || getSeasonShortName(activeSeason.rangeKey, activeSeason.activeSeason)
      : getSeasonShortName(activeSeason.rangeKey, activeSeason.activeSeason)
    : labelText(CALENDAR_LABELS.season);
  const monthTitle =
    mode === 'gregorian'
      ? formatGregorianMonthTitle(gregorianMonth, gregorianYear, isArabic)
      : `${formatCopticMonthName(copticMonthName, isArabic)} ${copticYear === null ? '' : formatCalendarDay(copticYear, isArabic)}`.trim();
  const weekdayLabels = isArabic ? WEEKDAYS_AR : WEEKDAYS;
  const goVisualLeftMonth = () => {
    if (isArabic) {
      mode === 'gregorian' ? goNextGregorian() : goAdjacentCoptic(1);
    } else {
      mode === 'gregorian' ? goPrevGregorian() : goAdjacentCoptic(-1);
    }
  };
  const goVisualRightMonth = () => {
    if (isArabic) {
      mode === 'gregorian' ? goPrevGregorian() : goAdjacentCoptic(-1);
    } else {
      mode === 'gregorian' ? goNextGregorian() : goAdjacentCoptic(1);
    }
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.screen}>
      <Head>
        <title>{`CHC ${labelText(CALENDAR_LABELS.calendar)}`}</title>
      </Head>
      <View style={[styles.header, { paddingTop: safeAreaInsets.top }]}>
        <Pressable accessibilityLabel="Close calendar" style={styles.headerButton} onPress={() => goBack(router, '/')}>
          <Icon name="chevron-back" size={30} color={COLORS.white} />
        </Pressable>
        <Text style={[styles.headerTitle, isArabic && styles.arabicText]}>{labelText(CALENDAR_LABELS.calendar)}</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.liveRow, isArabic && styles.rowReverse]}>
          {isLive ? (
            <View style={[styles.liveStatus, isArabic && styles.rowReverse]}>
              <View style={styles.liveDot} />
              <Text style={[styles.liveText, isArabic && styles.arabicText]}>{labelText(CALENDAR_LABELS.live)}</Text>
            </View>
          ) : (
            <Pressable accessibilityLabel="Set calendar to live date" style={styles.setLiveButton} onPress={goLive}>
              <Text style={[styles.setLiveText, isArabic && styles.arabicText]}>{labelText(CALENDAR_LABELS.setLive)}</Text>
            </Pressable>
          )}
          <Pressable accessibilityLabel="Open season selector" style={[styles.seasonSummary, isArabic && styles.rowReverse]} onPress={() => router.push('/season-selector')}>
            <Text numberOfLines={1} style={[styles.summaryText, isArabic && styles.arabicText]}>
              {activeSeasonLabel}
            </Text>
            <Icon name={isArabic ? 'chevron-back' : 'chevron-forward'} size={22} color={COLORS.white} />
          </Pressable>
          <Pressable
            accessibilityLabel={liturgicalDayPeriod === 'morning' ? 'Switch to evening liturgical day' : 'Switch to morning liturgical day'}
            style={[
              styles.periodToggle,
              {
                backgroundColor: liturgicalDayPeriod === 'evening' ? 'rgba(142, 197, 255, 0.22)' : 'rgba(255, 255, 255, 0.08)',
                borderColor: liturgicalDayPeriod === 'morning' ? COLORS.gold : COLORS.rowBlue,
              },
            ]}
            onPress={() => setLiturgicalDayPeriod(liturgicalDayPeriod === 'morning' ? 'evening' : 'morning')}
          >
            <Icon
              name={liturgicalDayPeriod === 'morning' ? 'sunny' : 'moon'}
              size={24}
              color={liturgicalDayPeriod === 'morning' ? COLORS.gold : COLORS.rowBlue}
            />
          </Pressable>
        </View>

        <View style={styles.divider} />

        <View style={styles.monthHeader}>
          <Pressable
            accessibilityLabel={isArabic ? 'Next month' : 'Previous month'}
            style={styles.monthButton}
            onPress={goVisualLeftMonth}
          >
            <Icon name="chevron-back" size={28} color={COLORS.rowBlue} />
          </Pressable>

          <View style={styles.monthTitleGroup}>
            <Text style={[styles.monthTitle, isArabic && styles.arabicText]}>{monthTitle}</Text>
            <View style={[styles.modeSelector, isArabic && styles.rowReverse]}>
              {(['gregorian', 'coptic'] as Mode[]).map((option) => {
                const isActive = mode === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityLabel={`Use ${option} calendar`}
                    style={[styles.modeOption, isActive && styles.modeOptionActive]}
                    onPress={() => setMode(option)}
                  >
                    <Text style={[styles.modeText, isArabic && styles.arabicText, { color: isActive ? COLORS.white : COLORS.muted }]}>
                      {labelText(option === 'gregorian' ? CALENDAR_LABELS.gregorian : CALENDAR_LABELS.coptic)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            accessibilityLabel={isArabic ? 'Previous month' : 'Next month'}
            style={styles.monthButton}
            onPress={goVisualRightMonth}
          >
            <Icon name="chevron-forward" size={28} color={COLORS.rowBlue} />
          </Pressable>
        </View>

        <View style={[styles.weekdayGrid, isArabic && styles.rowReverse]}>
          {weekdayLabels.map((weekday) => (
            <Text key={weekday} style={[styles.weekday, isArabic && styles.arabicText]}>
              {weekday}
            </Text>
          ))}
        </View>

        {!days ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
        ) : (
          <View style={[styles.dayGrid, isArabic && styles.rowReverse]}>
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <View key={`blank-${i}`} style={styles.dayCell} />
            ))}
            {days.map((day) => {
              const isSelected = day.gregorianDate === selectedIso;

              return (
                <Pressable accessibilityLabel={`Select ${day.gregorianDate}`} key={day.gregorianDate} style={styles.dayCell} onPress={() => pickDate(new Date(`${day.gregorianDate}T00:00:00Z`))}>
                  <View style={[styles.dayCircle, isSelected && styles.dayCircleSelected]}>
                    <Text style={[styles.dayText, isArabic && styles.arabicText, isSelected && styles.dayTextSelected]}>
                      {formatCalendarDay(day.displayDay, isArabic)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  rowReverse: { flexDirection: 'row-reverse' },
  header: {
    alignItems: 'center',
    backgroundColor: COLORS.navy,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: SPACING.md,
  },
  headerButton: { alignItems: 'center', height: 48, justifyContent: 'center', width: 48 },
  headerTitle: {
    color: COLORS.white,
    flex: 1,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  sheetContent: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  liveRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.md, justifyContent: 'space-between' },
  liveStatus: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm, minWidth: 88 },
  liveDot: { backgroundColor: '#A94438', borderRadius: 5, height: 10, width: 10 },
  liveText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  setLiveButton: {
    alignItems: 'center',
    backgroundColor: '#4A4A4A',
    borderRadius: 22,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: SPACING.md,
  },
  setLiveText: { color: COLORS.white, fontSize: 15, fontWeight: '800' },
  seasonSummary: {
    alignItems: 'center',
    backgroundColor: '#4A4A4A',
    borderRadius: 24,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: SPACING.md,
  },
  summaryText: { fontSize: 18, fontWeight: '700', color: COLORS.white },
  periodToggle: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 2,
    height: 48,
    justifyContent: 'center',
    width: 58,
  },
  divider: { height: 1, marginBottom: SPACING.lg, marginTop: SPACING.lg, backgroundColor: COLORS.border },
  monthHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.lg },
  monthButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  monthTitleGroup: { alignItems: 'center', flex: 1 },
  monthTitle: { fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700', textAlign: 'center', color: COLORS.white },
  modeSelector: {
    backgroundColor: '#262626',
    borderRadius: 18,
    flexDirection: 'row',
    marginTop: SPACING.sm,
    padding: 3,
    width: 260,
  },
  modeOption: {
    alignItems: 'center',
    borderRadius: 16,
    flex: 1,
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 116,
    paddingHorizontal: SPACING.sm,
  },
  modeOptionActive: { backgroundColor: '#4A4A4A' },
  modeText: { fontSize: 16, fontWeight: '700' },
  weekdayGrid: { flexDirection: 'row', marginBottom: SPACING.sm },
  weekday: { fontSize: 18, textAlign: 'center', width: `${100 / 7}%`, color: COLORS.muted },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { alignItems: 'center', height: 58, justifyContent: 'center', width: `${100 / 7}%` },
  dayCircle: { alignItems: 'center', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  dayCircleSelected: { backgroundColor: COLORS.gold },
  dayText: { fontSize: 24, fontWeight: '500', color: COLORS.white },
  dayTextSelected: { color: COLORS.white, fontWeight: '800' },
  arabicText: {
    fontFamily: TYPOGRAPHY.arabic,
    writingDirection: 'rtl',
  },
});
