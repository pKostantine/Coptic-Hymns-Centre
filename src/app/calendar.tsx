import Icon from '@/components/chc/ui/Icon';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getSeasonIndicatorName } from '@/constants/seasonNames';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useCalendar } from '@/context/CalendarContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import {
  CalendarDay,
  getAdjacentCopticMonth,
  getCopticMonthForDate,
  getCopticMonthGrid,
  getCopticYearForDate,
  getGregorianMonthGrid,
  getGregorianRangeForCopticYear,
  getSeasonRanges,
  getSingleDayEventsForCopticYear,
  SeasonRange,
  SingleDayEvent,
} from '@/utils/calendarService';
import { todayIsoDate } from '@/utils/dateUtils';
import { formatCalendarDay, formatCopticMonthName, GREGORIAN_MONTHS_AR, GREGORIAN_MONTHS_EN } from '@/utils/localeFormat';
import { goBack } from '@/utils/navigation';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_AR = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
const WEEKDAY_INDEX: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const COPTIC_MONTHS = ['Thoout', 'Baba', 'Hathor', 'Kiahk', 'Tobe', 'Meshir', 'Paremhotep', 'Parmoute', 'Pashons', 'Paone', 'Epep', 'Mesore', 'Nasie'];
const CALENDAR_LABELS = {
  calendar: { english: 'Calendar', arabic: 'التقويم' },
  live: { english: 'Live', arabic: 'حاليًا' },
  setLive: { english: 'Set Live', arabic: 'العودة للحالي' },
  season: { english: 'Season', arabic: 'فترة' },
  gregorian: { english: 'Gregorian', arabic: 'ميلادي' },
  coptic: { english: 'Coptic', arabic: 'قبطي' },
};

type Mode = 'gregorian' | 'coptic';
type Picker = 'year' | 'month';
type PickerAnchor = { x: number; y: number; width: number; height: number };

/** Calendar screen — ported 1:1 from CalendarDatePicker.js. Its header is custom (not the shared AppHeader), matching the old component exactly. */
export default function CalendarScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
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
  const [events, setEvents] = useState<SingleDayEvent[]>([]);
  const [openPicker, setOpenPicker] = useState<Picker | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<PickerAnchor | null>(null);
  const monthTriggerRef = useRef<View>(null);
  const yearTriggerRef = useRef<View>(null);
  const pickerListRef = useRef<ScrollView>(null);

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

  useEffect(() => {
    let cancelled = false;
    getCopticYearForDate(new Date(`${todayIso}T00:00:00Z`))
      .then(async (year) => {
        if (year === null) return;
        const { startDate, endDate } = await getGregorianRangeForCopticYear(year);
        const yearSeasons = await getSeasonRanges(startDate, endDate);
        const yearEvents = await getSingleDayEventsForCopticYear(year, yearSeasons);
        if (!cancelled) setEvents(yearEvents);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });

    return () => {
      cancelled = true;
    };
  }, [todayIso]);

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

  const activeSeasons = useMemo(
    () => seasons.filter((season) => season.startDate <= todayIso && season.endDate >= todayIso).map((season) => ({ key: season.rangeKey })),
    [seasons, todayIso],
  );
  const activeEvents = useMemo(
    () => events.filter((event) => event.date === todayIso).map((event) => ({ key: event.key })),
    [events, todayIso],
  );
  const activeSeasonLabel = getSeasonIndicatorName(activeSeasons, activeEvents);
  const displayedYear = mode === 'gregorian' ? gregorianYear : copticYear;
  const displayedMonth = mode === 'gregorian' ? gregorianMonth : copticMonth;
  const displayedMonthName = mode === 'gregorian'
    ? (isArabic ? GREGORIAN_MONTHS_AR[gregorianMonth - 1] : GREGORIAN_MONTHS_EN[gregorianMonth - 1])
    : copticMonthName ? formatCopticMonthName(copticMonthName, isArabic) : '';
  const pickerYears = Array.from({ length: 61 }, (_, index) => (displayedYear || new Date().getUTCFullYear()) - 30 + index);
  const pickerMonths = mode === 'gregorian' ? GREGORIAN_MONTHS_EN.map((_, index) => index + 1) : COPTIC_MONTHS.map((_, index) => index + 1);
  const pickerWidth = openPicker === 'year' ? 160 : 220;
  const pickerLeft = pickerAnchor ? Math.max(12, Math.min(pickerAnchor.x, screenWidth - pickerWidth - 12)) : 12;

  useEffect(() => {
    if (!openPicker) return;
    const selectedIndex = openPicker === 'year' ? 30 : (displayedMonth || 1) - 1;
    if (selectedIndex >= 0) pickerListRef.current?.scrollTo({ y: selectedIndex * 44, animated: false });
  }, [displayedMonth, openPicker]);

  function showPicker(picker: Picker, triggerRef: RefObject<View | null>) {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setPickerAnchor({ x, y, width, height });
      setOpenPicker(picker);
    });
  }
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
            onPress={() => {
              if (isLive) {
                // Any manual period change while live unsets live mode so the
                // auto-clock-flip stops and the chosen period stays fixed.
                // selectDate always resets the period to morning; only add a
                // second call when the user wants evening instead.
                selectDate(rawDate);
                if (liturgicalDayPeriod === 'morning') {
                  setLiturgicalDayPeriod('evening');
                }
              } else {
                setLiturgicalDayPeriod(liturgicalDayPeriod === 'morning' ? 'evening' : 'morning');
              }
            }}
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
            <View style={styles.datePickerTriggers}>
              <View ref={monthTriggerRef} collapsable={false}>
                <Pressable accessibilityLabel="Choose month" style={styles.datePickerTrigger} onPress={() => showPicker('month', monthTriggerRef)}>
                  <Text style={[styles.monthTitle, isArabic && styles.arabicText]}>{displayedMonthName}</Text>
                  <Icon name="chevron-down" size={18} color={COLORS.gold} />
                </Pressable>
              </View>
              <View ref={yearTriggerRef} collapsable={false}>
                <Pressable accessibilityLabel="Choose year" style={styles.datePickerTrigger} onPress={() => showPicker('year', yearTriggerRef)}>
                  <Text style={[styles.yearTitle, isArabic && styles.arabicText]}>
                    {displayedYear === null ? '' : formatCalendarDay(displayedYear, isArabic)}
                  </Text>
                  <Icon name="chevron-down" size={18} color={COLORS.gold} />
                </Pressable>
              </View>
            </View>
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

      <Modal visible={openPicker !== null} transparent animationType="fade" onRequestClose={() => setOpenPicker(null)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setOpenPicker(null)}>
          <Pressable
            style={[styles.pickerPanel, pickerAnchor && { left: pickerLeft, top: pickerAnchor.y + pickerAnchor.height, width: pickerWidth }]}
            onPress={(event) => event.stopPropagation()}
          >
            <ScrollView ref={pickerListRef} style={styles.pickerList} showsVerticalScrollIndicator>
              {(openPicker === 'year' ? pickerYears : pickerMonths).map((value) => {
                const isSelected = value === displayedYear || value === displayedMonth;
                const label = openPicker === 'year'
                  ? formatCalendarDay(value, isArabic)
                  : mode === 'gregorian'
                    ? (isArabic ? GREGORIAN_MONTHS_AR[value - 1] : GREGORIAN_MONTHS_EN[value - 1])
                    : formatCopticMonthName(COPTIC_MONTHS[value - 1], isArabic);

                return (
                  <Pressable
                    key={value}
                    style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]}
                    onPress={() => {
                      if (openPicker === 'year') {
                        if (mode === 'gregorian') setGregorianYear(value);
                        else setCopticYear(value);
                      } else if (mode === 'gregorian') {
                        setGregorianMonth(value);
                      } else {
                        setCopticMonth(value);
                        setCopticMonthName(COPTIC_MONTHS[value - 1]);
                      }
                      setOpenPicker(null);
                    }}
                  >
                    <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected, isArabic && styles.arabicText]}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  datePickerTriggers: { alignItems: 'center', flexDirection: 'row', gap: SPACING.xs },
  datePickerTrigger: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 40, paddingHorizontal: SPACING.sm },
  monthTitle: { fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700', textAlign: 'center', color: COLORS.white },
  yearTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
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
  pickerBackdrop: { flex: 1 },
  pickerPanel: { backgroundColor: '#18212D', borderColor: 'rgba(255, 255, 255, 0.16)', borderRadius: 12, borderWidth: 1, maxHeight: 280, overflow: 'hidden', position: 'absolute', shadowColor: COLORS.black, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 10 },
  pickerList: { padding: 5 },
  pickerOption: { alignItems: 'center', borderRadius: 8, minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.sm },
  pickerOptionSelected: { backgroundColor: 'rgba(211, 164, 74, 0.26)' },
  pickerOptionText: { color: 'rgba(255, 255, 255, 0.86)', fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '600' },
  pickerOptionTextSelected: { color: COLORS.gold, fontWeight: '800' },
});
