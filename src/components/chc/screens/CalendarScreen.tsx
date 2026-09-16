import Icon from '@/components/chc/ui/Icon';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  getContextIndicatorKeys,
  getSeasonRanges,
  getSingleDayEventsForCopticYear,
  SeasonRange,
  SingleDayEvent,
} from '@/utils/calendarService';
import { todayIsoDate } from '@/utils/dateUtils';
import { formatCalendarDay, formatCopticMonthName, GREGORIAN_MONTHS_AR, GREGORIAN_MONTHS_EN } from '@/utils/localeFormat';
import { goBack } from '@/utils/navigation';
import { DISABLED_TEXT_SELECTION_STYLE } from '@/utils/textSelection';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_AR = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
const WEEKDAY_INDEX: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const COPTIC_MONTHS = ['Thoout', 'Paope', 'Hathor', 'Kiahk', 'Tobe', 'Meshir', 'Paremhotep', 'Parmoute', 'Pashons', 'Paone', 'Epep', 'Mesore', 'Nesi'];
const CALENDAR_LABELS = {
  calendar: { english: 'Calendar', arabic: 'التقويم' },
  live: { english: 'Live', arabic: 'حاليًا' },
  setLive: { english: 'Set Live', arabic: 'العودة للحالي' },
  season: { english: 'Season', arabic: 'فترة' },
  gregorian: { english: 'Gregorian', arabic: 'ميلادي' },
  coptic: { english: 'Coptic', arabic: 'قبطي' },
};

type Mode = 'gregorian' | 'coptic';

/** One picker row: minHeight plus its 1px margin either side — the figure the open-scroll below positions against. */
const PICKER_ROW_HEIGHT = 46;

/** Calendar screen — ported 1:1 from CalendarDatePicker.js. Its header is custom (not the shared AppHeader), matching the old component exactly. */
interface CalendarScreenProps {
  /** Set when this screen is rendered inside a modal rather than as its own route (see DocumentModal) — closes the modal instead of popping the navigation stack. */
  onClose?: () => void;
  /** Same idea for the season selector: hosted in a modal there is no route to push, so the host swaps which screen it is showing. */
  onOpenSeasonSelector?: () => void;
}

export default function CalendarScreen({ onClose, onOpenSeasonSelector }: CalendarScreenProps) {
  const router = useRouter();
  const isHosted = Boolean(onClose);
  const closeScreen = () => (onClose ? onClose() : goBack(router, '/'));
  const openSeasonSelector = () => (onOpenSeasonSelector ? onOpenSeasonSelector() : router.push('/season-selector'));
  const safeAreaInsets = useSafeAreaInsets();
  const { rawDate, effectiveDate, isLive, selectDate, goLive, liturgicalDayPeriod, setLiturgicalDayPeriod } = useCalendar();
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
  const [contextIndicatorKeys, setContextIndicatorKeys] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYearAnchor, setPickerYearAnchor] = useState<number | null>(null);
  const monthListRef = useRef<ScrollView>(null);
  const yearListRef = useRef<ScrollView>(null);

  const selectedIso = rawDate.toISOString().slice(0, 10);
  const indicatorIso = effectiveDate.toISOString().slice(0, 10);
  const todayIso = todayIsoDate();

  useEffect(() => {
    setGregorianYear(rawDate.getUTCFullYear());
    setGregorianMonth(rawDate.getUTCMonth() + 1);
    setCopticYear(null);
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
    getCopticYearForDate(new Date(`${indicatorIso}T00:00:00Z`))
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
  }, [indicatorIso]);

  useEffect(() => {
    let cancelled = false;
    getContextIndicatorKeys(indicatorIso)
      .then((keys) => {
        if (!cancelled) setContextIndicatorKeys(keys);
      })
      .catch(() => {
        if (!cancelled) setContextIndicatorKeys([]);
      });

    return () => {
      cancelled = true;
    };
  }, [indicatorIso]);

  const loadMonth = useCallback(async () => {
    setDays(null);
    if (mode === 'gregorian') {
      const grid = await getGregorianMonthGrid(gregorianYear, gregorianMonth);
      setDays(grid);
      if (grid.length) {
        const fromDate = [grid[0].gregorianDate, todayIso, selectedIso, indicatorIso].sort()[0];
        const toDate = [grid[grid.length - 1].gregorianDate, todayIso, selectedIso, indicatorIso].sort().slice(-1)[0];
        setSeasons(await getSeasonRanges(fromDate, toDate));
      }
    } else if (copticYear !== null && copticMonth !== null) {
      const grid = await getCopticMonthGrid(copticYear, copticMonth);
      setDays(grid);
      if (grid.length) {
        const fromDate = [grid[0].gregorianDate, todayIso, selectedIso, indicatorIso].sort()[0];
        const toDate = [grid[grid.length - 1].gregorianDate, todayIso, selectedIso, indicatorIso].sort().slice(-1)[0];
        setSeasons(await getSeasonRanges(fromDate, toDate));
      }
    }
  }, [mode, gregorianYear, gregorianMonth, copticYear, copticMonth, selectedIso, indicatorIso, todayIso]);

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
    () => [
      ...seasons
        .filter((season) => season.startDate <= indicatorIso && season.endDate >= indicatorIso)
        .map((season) => ({ key: season.rangeKey })),
      ...contextIndicatorKeys.filter((key) => key.endsWith('-period')).map((key) => ({ key })),
    ],
    [seasons, indicatorIso, contextIndicatorKeys],
  );
  const activeEvents = useMemo(
    () => [
      ...events.filter((event) => event.date === indicatorIso).map((event) => ({ key: event.key })),
      ...contextIndicatorKeys.filter((key) => !key.endsWith('-period')).map((key) => ({ key })),
    ],
    [events, indicatorIso, contextIndicatorKeys],
  );
  const activeSeasonLabel = getSeasonIndicatorName(activeSeasons, activeEvents, isArabic);
  const displayedYear = mode === 'gregorian' ? gregorianYear : copticYear;
  const displayedMonth = mode === 'gregorian' ? gregorianMonth : copticMonth;
  const displayedMonthName = mode === 'gregorian'
    ? (isArabic ? GREGORIAN_MONTHS_AR[gregorianMonth - 1] : GREGORIAN_MONTHS_EN[gregorianMonth - 1])
    : copticMonthName ? formatCopticMonthName(copticMonthName, isArabic) : '';
  const yearWindowAnchor = pickerYearAnchor ?? displayedYear ?? new Date().getUTCFullYear();
  const pickerYears = useMemo(
    () => Array.from({ length: 61 }, (_, index) => yearWindowAnchor - 30 + index),
    [yearWindowAnchor],
  );
  const pickerMonths = mode === 'gregorian' ? GREGORIAN_MONTHS_EN.map((_, index) => index + 1) : COPTIC_MONTHS.map((_, index) => index + 1);

  useEffect(() => {
    if (!pickerOpen) return;
    monthListRef.current?.scrollTo({ y: Math.max((displayedMonth || 1) - 1, 0) * PICKER_ROW_HEIGHT, animated: false });
    yearListRef.current?.scrollTo({ y: Math.max(pickerYears.indexOf(displayedYear ?? yearWindowAnchor), 0) * PICKER_ROW_HEIGHT, animated: false });
  }, [pickerOpen]);

  const openDatePicker = () => {
    setPickerYearAnchor(displayedYear ?? new Date().getUTCFullYear());
    setPickerOpen(true);
  };

  const weekdayLabels = isArabic ? WEEKDAYS_AR : WEEKDAYS;
  const goVisualLeftMonth = () => {
    if (isArabic) {
      if (mode === 'gregorian') goNextGregorian(); else void goAdjacentCoptic(1);
    } else {
      if (mode === 'gregorian') goPrevGregorian(); else void goAdjacentCoptic(-1);
    }
  };
  const goVisualRightMonth = () => {
    if (isArabic) {
      if (mode === 'gregorian') goPrevGregorian(); else void goAdjacentCoptic(-1);
    } else {
      if (mode === 'gregorian') goNextGregorian(); else void goAdjacentCoptic(1);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={isHosted ? [] : ['top', 'bottom']}>
      <Head><title>{labelText(CALENDAR_LABELS.calendar)}</title></Head>
      <View style={[styles.container, isHosted && { paddingTop: safeAreaInsets.top }]}> 
        <View style={styles.headerRow}>
          <Pressable onPress={closeScreen} hitSlop={10} style={styles.iconButton}>
            <Icon name={isArabic ? 'chevron-right' : 'chevron-left'} size={24} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={[styles.title, isArabic && styles.arabicText]}>{labelText(CALENDAR_LABELS.calendar)}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.summaryRow}>
          <Pressable onPress={openSeasonSelector} style={styles.summaryPill}>
            <Text numberOfLines={1} style={[styles.summaryText, isArabic && styles.arabicText]}>
              {activeSeasonLabel}
            </Text>
          </Pressable>
          {!isLive ? (
            <Pressable onPress={goLive} style={styles.liveButton}>
              <Text style={[styles.liveButtonText, isArabic && styles.arabicText]}>{labelText(CALENDAR_LABELS.setLive)}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.periodToggle}>
          <Pressable
            onPress={() => setLiturgicalDayPeriod('day')}
            style={[styles.periodOption, liturgicalDayPeriod === 'day' && styles.periodOptionActive]}
          >
            <Text style={[styles.periodText, liturgicalDayPeriod === 'day' && styles.periodTextActive, isArabic && styles.arabicText]}>{isArabic ? 'نهار' : 'Day'}</Text>
          </Pressable>
          <Pressable
            onPress={() => setLiturgicalDayPeriod('evening')}
            style={[styles.periodOption, liturgicalDayPeriod === 'evening' && styles.periodOptionActive]}
          >
            <Text style={[styles.periodText, liturgicalDayPeriod === 'evening' && styles.periodTextActive, isArabic && styles.arabicText]}>{isArabic ? 'مساء' : 'Evening'}</Text>
          </Pressable>
        </View>

        <View style={styles.modeToggle}>
          <Pressable onPress={() => setMode('gregorian')} style={[styles.modeOption, mode === 'gregorian' && styles.modeOptionActive]}>
            <Text style={[styles.modeText, mode === 'gregorian' && styles.modeTextActive, isArabic && styles.arabicText]}>{labelText(CALENDAR_LABELS.gregorian)}</Text>
          </Pressable>
          <Pressable onPress={() => setMode('coptic')} style={[styles.modeOption, mode === 'coptic' && styles.modeOptionActive]}>
            <Text style={[styles.modeText, mode === 'coptic' && styles.modeTextActive, isArabic && styles.arabicText]}>{labelText(CALENDAR_LABELS.coptic)}</Text>
          </Pressable>
        </View>

        <View style={styles.monthHeader}>
          <Pressable onPress={goVisualLeftMonth} hitSlop={10} style={styles.iconButton}>
            <Icon name='chevron-left' size={22} color={COLORS.textPrimary} />
          </Pressable>
          <Pressable onPress={openDatePicker} style={styles.monthTitleButton}>
            <Text style={[styles.monthTitle, isArabic && styles.arabicText]}>{displayedMonthName} {displayedYear ?? ''}</Text>
          </Pressable>
          <Pressable onPress={goVisualRightMonth} hitSlop={10} style={styles.iconButton}>
            <Icon name='chevron-right' size={22} color={COLORS.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.weekdayRow}>
          {weekdayLabels.map((weekday) => <Text key={weekday} style={[styles.weekdayText, isArabic && styles.arabicText]}>{weekday}</Text>)}
        </View>

        {!days ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
        ) : (
          <View style={styles.grid}>
            {Array.from({ length: leadingBlanks }).map((_, index) => <View key={`blank-${index}`} style={styles.dayCell} />)}
            {days.map((day) => {
              const selected = day.gregorianDate === selectedIso;
              const today = day.gregorianDate === todayIso;
              const date = new Date(`${day.gregorianDate}T00:00:00Z`);
              return (
                <Pressable key={day.gregorianDate} onPress={() => pickDate(date)} style={[styles.dayCell, selected && styles.dayCellSelected]}>
                  <Text style={[styles.dayPrimary, selected && styles.dayPrimarySelected, isArabic && styles.arabicText]}>{formatCalendarDay(day, mode, isArabic)}</Text>
                  {today ? <View style={styles.todayDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        )}

        <Modal transparent visible={pickerOpen} animationType='fade' onRequestClose={() => setPickerOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
            <Pressable style={styles.pickerPanel} onPress={(event) => event.stopPropagation()}>
              <View style={styles.pickerColumns}>
                <ScrollView ref={monthListRef} style={styles.pickerColumn} showsVerticalScrollIndicator={false}>
                  {pickerMonths.map((monthNumber) => {
                    const selected = monthNumber === displayedMonth;
                    const text = mode === 'gregorian'
                      ? (isArabic ? GREGORIAN_MONTHS_AR[monthNumber - 1] : GREGORIAN_MONTHS_EN[monthNumber - 1])
                      : formatCopticMonthName(COPTIC_MONTHS[monthNumber - 1], isArabic);
                    return (
                      <Pressable key={monthNumber} onPress={() => mode === 'gregorian' ? setGregorianMonth(monthNumber) : setCopticMonth(monthNumber)} style={styles.pickerRow}>
                        <Text style={[styles.pickerText, selected && styles.pickerTextSelected, isArabic && styles.arabicText]}>{text}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <ScrollView ref={yearListRef} style={styles.pickerColumn} showsVerticalScrollIndicator={false}>
                  {pickerYears.map((year) => {
                    const selected = year === displayedYear;
                    return (
                      <Pressable key={year} onPress={() => mode === 'gregorian' ? setGregorianYear(year) : setCopticYear(year)} style={styles.pickerRow}>
                        <Text style={[styles.pickerText, selected && styles.pickerTextSelected]}>{year}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              <Pressable onPress={() => setPickerOpen(false)} style={styles.doneButton}><Text style={styles.doneButtonText}>{isArabic ? 'تم' : 'Done'}</Text></Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', color: COLORS.textPrimary, fontSize: TYPOGRAPHY.lg, fontWeight: '600' },
  headerSpacer: { width: 40 },
  summaryRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', marginBottom: SPACING.md },
  summaryPill: { flex: 1, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.surface },
  summaryText: { color: COLORS.textPrimary, textAlign: 'center', fontSize: TYPOGRAPHY.sm },
  liveButton: { borderRadius: 999, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.gold },
  liveButtonText: { color: COLORS.background, fontWeight: '700' },
  periodToggle: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 999, padding: 3, marginBottom: SPACING.sm },
  periodOption: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
  periodOptionActive: { backgroundColor: COLORS.backgroundElevated },
  periodText: { color: COLORS.textSecondary },
  periodTextActive: { color: COLORS.textPrimary, fontWeight: '600' },
  modeToggle: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 999, padding: 3, marginBottom: SPACING.md },
  modeOption: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
  modeOptionActive: { backgroundColor: COLORS.backgroundElevated },
  modeText: { color: COLORS.textSecondary },
  modeTextActive: { color: COLORS.textPrimary, fontWeight: '600' },
  monthHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  monthTitleButton: { flex: 1, alignItems: 'center' },
  monthTitle: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.md, fontWeight: '600' },
  weekdayRow: { flexDirection: 'row' },
  weekdayText: { width: '14.2857%', textAlign: 'center', color: COLORS.textSecondary, paddingVertical: 8, fontSize: TYPOGRAPHY.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.2857%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  dayCellSelected: { backgroundColor: COLORS.gold },
  dayPrimary: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.sm },
  dayPrimarySelected: { color: COLORS.background, fontWeight: '700' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.gold, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  pickerPanel: { width: '100%', maxWidth: 420, maxHeight: '70%', backgroundColor: COLORS.surface, borderRadius: 20, padding: SPACING.md },
  pickerColumns: { flexDirection: 'row', gap: SPACING.sm, flex: 1 },
  pickerColumn: { flex: 1 },
  pickerRow: { minHeight: 44, marginVertical: 1, justifyContent: 'center', paddingHorizontal: SPACING.sm, borderRadius: 10 },
  pickerText: { color: COLORS.textSecondary, textAlign: 'center' },
  pickerTextSelected: { color: COLORS.textPrimary, fontWeight: '700' },
  doneButton: { marginTop: SPACING.md, alignSelf: 'stretch', alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.gold },
  doneButtonText: { color: COLORS.background, fontWeight: '700' },
  arabicText: { writingDirection: 'rtl' },
  ...DISABLED_TEXT_SELECTION_STYLE,
});
