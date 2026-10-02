'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DAY_BLOCK_GRADIENT_END, DAY_BLOCK_GRADIENT_START } from '../../../constants/seasonAppearance';
import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useCalendar } from '../../../context/CalendarContext';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { appText, tr } from '../../../utils/appText';
import {
  CalendarDay,
  getAdjacentCopticMonth,
  getCopticMonthForDate,
  getCopticMonthGrid,
  getFeastDatesBetween,
  getGregorianMonthGrid,
} from '../../../utils/calendarService';
import { formatCalendarDay, formatCopticMonthName, GREGORIAN_MONTHS_AR, GREGORIAN_MONTHS_EN, GREGORIAN_MONTHS_FR } from '../../../utils/localeFormat';
import { DISABLED_TEXT_SELECTION_STYLE } from '../../../utils/textSelection';
import DayControls from './DayControls';
import Icon from './Icon';
import { VineDivider } from './Ornaments';
import { useLiturgicalDay } from './useLiturgicalDay';

const WEEKDAY_LETTERS = {
  english: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  french: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
  arabic: ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'],
};
const WEEKDAY_INDEX: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const COPTIC_MONTHS = ['Thoout', 'Paope', 'Hathor', 'Kiahk', 'Tobe', 'Meshir', 'Paremhotep', 'Parmoute', 'Pashons', 'Paone', 'Epep', 'Mesore', 'Nesi'];
const LABELS = {
  gregorian: { english: 'Gregorian', arabic: 'ميلادي', french: 'Grégorien' },
  coptic: { english: 'Coptic', arabic: 'قبطي', french: 'Copte' },
};

type Mode = 'gregorian' | 'coptic';

/** One picker row: minHeight plus its 1px margin either side — the figure the open-scroll below positions against. */
const PICKER_ROW_HEIGHT = 46;

/** A Gregorian month's name in the App Language. */
function gregorianMonthName(month: number): string {
  const french = GREGORIAN_MONTHS_FR[month - 1] || '';
  return tr(GREGORIAN_MONTHS_EN[month - 1], french.charAt(0).toUpperCase() + french.slice(1), GREGORIAN_MONTHS_AR[month - 1]);
}

interface CalendarPanelProps {
  onOpenSeasons: () => void;
  /** The top band — grab handle and controls — wears the day's season colours when the panel sits in the Books sheet. */
  header?: React.ReactNode;
}

/**
 * The calendar (Coptic Vine design, "Calendar popup"): Live, the day's season and the
 * eve toggle; the month with its arrows and picker; Gregorian or Coptic; and
 * the month's days, each with its date in the other calendar beneath it and a
 * gold dot on a feast. Shared by the Books sheet and the calendar page.
 */
export default function CalendarPanel({ onOpenSeasons, header }: CalendarPanelProps) {
  const { rawDate, selectDate } = useCalendar();
  const { preferences } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const day = useLiturgicalDay();

  const [mode, setMode] = useState<Mode>('gregorian');
  const [gregorianYear, setGregorianYear] = useState(rawDate.getUTCFullYear());
  const [gregorianMonth, setGregorianMonth] = useState(rawDate.getUTCMonth() + 1);
  const [copticYear, setCopticYear] = useState<number | null>(null);
  const [copticMonth, setCopticMonth] = useState<number | null>(null);
  const [copticMonthName, setCopticMonthName] = useState('');
  const [days, setDays] = useState<CalendarDay[] | null>(null);
  const [feastDates, setFeastDates] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  // The year column's window is frozen at whatever year was showing when the
  // panel opened. Deriving it from the live selection meant picking a year
  // re-centred the range and slid all 61 rows out from under the finger.
  const [pickerYearAnchor, setPickerYearAnchor] = useState<number | null>(null);
  const monthListRef = useRef<ScrollView>(null);
  const yearListRef = useRef<ScrollView>(null);

  // The grid highlight always tracks the literal calendar day, even after
  // the liturgical day has rolled forward past 5pm — only the day/night
  // toggle communicates that content is now for the evening.
  const selectedIso = rawDate.toISOString().slice(0, 10);

  // Keeps the visible month following `rawDate` when it changes from outside
  // (the Season selector, or the Books week strip behind the sheet).
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

  // The month on screen stays until the next one has arrived, days and feast
  // dots together, so switching month or calendar swaps the grid in place
  // rather than collapsing it to a spinner and opening it again.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let grid: CalendarDay[];
      if (mode === 'gregorian') grid = await getGregorianMonthGrid(gregorianYear, gregorianMonth);
      else if (copticYear !== null && copticMonth !== null) grid = await getCopticMonthGrid(copticYear, copticMonth);
      else return;
      const feasts = grid.length
        ? await getFeastDatesBetween(grid[0].gregorianDate, grid[grid.length - 1].gregorianDate).catch(() => new Set<string>())
        : new Set<string>();
      if (cancelled) return;
      setDays(grid);
      setFeastDates(feasts);
    };
    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mode, gregorianYear, gregorianMonth, copticYear, copticMonth]);

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
  const displayedYear = mode === 'gregorian' ? gregorianYear : copticYear;
  const displayedMonth = mode === 'gregorian' ? gregorianMonth : copticMonth;
  const displayedMonthName = mode === 'gregorian'
    ? gregorianMonthName(gregorianMonth)
    : copticMonthName ? formatCopticMonthName(copticMonthName, isArabic) : '';
  const yearWindowAnchor = pickerYearAnchor ?? displayedYear ?? new Date().getUTCFullYear();
  const pickerYears = useMemo(
    () => Array.from({ length: 61 }, (_, index) => yearWindowAnchor - 30 + index),
    [yearWindowAnchor],
  );
  const pickerMonths = mode === 'gregorian' ? GREGORIAN_MONTHS_EN.map((_, index) => index + 1) : COPTIC_MONTHS.map((_, index) => index + 1);
  // Positions both columns once, as the picker opens, and never again while
  // it is open — re-positioning on each pick snapped the list out from under
  // the finger.
  useEffect(() => {
    if (!pickerOpen) return;
    monthListRef.current?.scrollTo({ y: Math.max((displayedMonth || 1) - 1, 0) * PICKER_ROW_HEIGHT, animated: false });
    yearListRef.current?.scrollTo({ y: Math.max(pickerYears.indexOf(displayedYear ?? yearWindowAnchor), 0) * PICKER_ROW_HEIGHT, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- positions on open only; re-running on selection is the bug this replaced
  }, [pickerOpen]);

  const openDatePicker = () => {
    setPickerYearAnchor(displayedYear ?? new Date().getUTCFullYear());
    setPickerOpen(true);
  };

  const weekdayLetters = isArabic ? WEEKDAY_LETTERS.arabic : preferences.appLanguage === 'fr' ? WEEKDAY_LETTERS.french : WEEKDAY_LETTERS.english;
  // Arrows keep their visual meaning in Arabic: the one pointing back in the
  // reading direction goes back.
  const goVisualLeftMonth = () => {
    if (isArabic) void (mode === 'gregorian' ? goNextGregorian() : goAdjacentCoptic(1));
    else void (mode === 'gregorian' ? goPrevGregorian() : goAdjacentCoptic(-1));
  };
  const goVisualRightMonth = () => {
    if (isArabic) void (mode === 'gregorian' ? goPrevGregorian() : goAdjacentCoptic(-1));
    else void (mode === 'gregorian' ? goNextGregorian() : goAdjacentCoptic(1));
  };

  return (
    <View style={DISABLED_TEXT_SELECTION_STYLE}>
      <View style={styles.band}>
        <LinearGradient
          colors={[day.theme.from, day.theme.to]}
          locations={[0, day.theme.toAt]}
          start={DAY_BLOCK_GRADIENT_START}
          end={DAY_BLOCK_GRADIENT_END}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {header}
        <DayControls theme={day.theme} seasonLabel={day.seasonLabel} arabic={isArabic} onOpenSeasons={onOpenSeasons} />
      </View>

      <View style={styles.body}>
        <View style={[styles.monthRow, isArabic && styles.rowReverse]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('Choose month and year', 'Choisir le mois et l’année', 'اختر الشهر والسنة')}
            style={[styles.monthTitleButton, isArabic && styles.rowReverse]}
            onPress={openDatePicker}
          >
            <Text style={[styles.monthTitle, isArabic && styles.arabicText]} numberOfLines={1}>
              {displayedMonthName}
              {displayedYear === null ? '' : ` ${formatCalendarDay(displayedYear, isArabic)}`}
            </Text>
            <Icon name="chevron-down" size={16} color={COLORS.gold} />
          </Pressable>
          <View style={styles.arrows}>
            <Pressable accessibilityRole="button" accessibilityLabel={isArabic ? 'الشهر التالي' : tr('Previous month', 'Mois précédent', '')} style={styles.arrow} onPress={goVisualLeftMonth}>
              <Icon name="chevron-back" size={17} color={COLORS.gold} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={isArabic ? 'الشهر السابق' : tr('Next month', 'Mois suivant', '')} style={styles.arrow} onPress={goVisualRightMonth}>
              <Icon name="chevron-forward" size={17} color={COLORS.gold} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.segment, isArabic && styles.rowReverse]}>
          {(['gregorian', 'coptic'] as Mode[]).map((option) => {
            const active = mode === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.segmentOption, active && styles.segmentOptionActive]}
                onPress={() => setMode(option)}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive, isArabic && styles.arabicText]} numberOfLines={1}>
                  {appText(option === 'gregorian' ? LABELS.gregorian : LABELS.coptic)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.gridRow, isArabic && styles.rowReverse]}>
          {weekdayLetters.map((letter, index) => (
            <Text key={index} style={[styles.weekday, isArabic && styles.arabicLetter]}>{letter}</Text>
          ))}
        </View>

        {!days ? (
          <ActivityIndicator color={COLORS.gold} style={styles.loading} />
        ) : (
          <View style={[styles.grid, isArabic && styles.rowReverse]}>
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <View key={`blank-${i}`} style={styles.cell} />
            ))}
            {days.map((calendarDay) => {
              const selected = calendarDay.gregorianDate === selectedIso;
              const small = calendarDay.otherMonthName
                ? isArabic
                  ? `${formatCalendarDay(calendarDay.otherDay, true)} ${formatCopticMonthName(calendarDay.otherMonthName, true)}`
                  : `${calendarDay.otherMonthName} ${calendarDay.otherDay}`
                : formatCalendarDay(calendarDay.otherDay, isArabic);
              return (
                <Pressable
                  key={calendarDay.gregorianDate}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={calendarDay.gregorianDate}
                  style={styles.cell}
                  onPress={() => pickDate(new Date(`${calendarDay.gregorianDate}T00:00:00Z`))}
                >
                  <View style={[styles.circle, selected && styles.circleSelected]}>
                    <Text style={[styles.dayNumber, selected && styles.dayNumberSelected, isArabic && styles.arabicLetter]}>
                      {formatCalendarDay(calendarDay.displayDay, isArabic)}
                    </Text>
                    <Text
                      style={[styles.otherDay, calendarDay.otherMonthName ? styles.otherDayMonth : null, selected && styles.otherDaySelected, isArabic && styles.arabicLetter]}
                      numberOfLines={1}
                    >
                      {small}
                    </Text>
                    {feastDates.has(calendarDay.gregorianDate) && !selected ? <View style={styles.feastDot} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.divider} pointerEvents="none">
          <VineDivider width={210} height={26} />
        </View>
      </View>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={[styles.pickerBackdrop, DISABLED_TEXT_SELECTION_STYLE]} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.pickerPanel} onPress={(event) => event.stopPropagation()}>
            <View style={[styles.pickerColumns, isArabic && styles.rowReverse]}>
              <View style={styles.pickerColumn}>
                <Text style={[styles.pickerColumnLabel, isArabic && styles.arabicText]}>{tr('Month', 'Mois', 'الشهر')}</Text>
                <ScrollView ref={monthListRef} style={styles.pickerList} showsVerticalScrollIndicator={false} snapToInterval={PICKER_ROW_HEIGHT} decelerationRate="fast">
                  {pickerMonths.map((value) => {
                    const isSelected = value === displayedMonth;
                    const label = mode === 'gregorian' ? gregorianMonthName(value) : formatCopticMonthName(COPTIC_MONTHS[value - 1], isArabic);
                    return (
                      <Pressable
                        key={value}
                        style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]}
                        onPress={() => {
                          if (mode === 'gregorian') {
                            setGregorianMonth(value);
                          } else {
                            setCopticMonth(value);
                            setCopticMonthName(COPTIC_MONTHS[value - 1]);
                          }
                        }}
                      >
                        <Text numberOfLines={1} style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected, isArabic && styles.arabicText]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.pickerColumnDivider} />

              <View style={styles.pickerColumn}>
                <Text style={[styles.pickerColumnLabel, isArabic && styles.arabicText]}>{tr('Year', 'Année', 'السنة')}</Text>
                <ScrollView ref={yearListRef} style={styles.pickerList} showsVerticalScrollIndicator={false} snapToInterval={PICKER_ROW_HEIGHT} decelerationRate="fast">
                  {pickerYears.map((value) => {
                    const isSelected = value === displayedYear;
                    return (
                      <Pressable
                        key={value}
                        style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]}
                        onPress={() => {
                          if (mode === 'gregorian') setGregorianYear(value);
                          else setCopticYear(value);
                        }}
                      >
                        <Text numberOfLines={1} style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected, isArabic && styles.arabicText]}>
                          {formatCalendarDay(value, isArabic)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            <Pressable accessibilityRole="button" style={styles.pickerDone} onPress={() => setPickerOpen(false)}>
              <Text style={[styles.pickerDoneText, isArabic && styles.arabicText]}>{tr('Done', 'Terminé', 'تم')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  rowReverse: { flexDirection: 'row-reverse' },
  band: { overflow: 'hidden', paddingBottom: 14, paddingHorizontal: 16, paddingTop: 10 },
  body: { paddingHorizontal: 16 },
  monthRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  monthTitleButton: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 6, minHeight: 40 },
  monthTitle: { color: COLORS.white, flexShrink: 1, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700' },
  arrows: { flexDirection: 'row', gap: 8 },
  arrow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  segment: {
    backgroundColor: COLORS.black,
    borderColor: COLORS.border,
    borderRadius: 99,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginTop: 14,
    padding: 4,
  },
  segmentOption: { alignItems: 'center', borderRadius: 99, flex: 1, paddingVertical: 8 },
  segmentOptionActive: { backgroundColor: COLORS.gold },
  segmentText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: COLORS.greenDeep },
  gridRow: { flexDirection: 'row', marginTop: 12 },
  weekday: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '600', paddingBottom: 6, textAlign: 'center', width: `${100 / 7}%` },
  loading: { height: 6 * 44 + 5 * 2 },
  // Always six weeks tall, so a five-week month doesn't move the sheet's top edge.
  grid: { flexDirection: 'row', flexWrap: 'wrap', minHeight: 6 * 44 + 5 * 2, rowGap: 2 },
  cell: { alignItems: 'center', height: 44, justifyContent: 'center', width: `${100 / 7}%` },
  circle: { alignItems: 'center', borderRadius: 21, gap: 1, height: 42, justifyContent: 'center', width: 42 },
  circleSelected: { backgroundColor: COLORS.gold },
  dayNumber: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 16, fontWeight: '500', lineHeight: 19 },
  dayNumberSelected: { color: COLORS.greenDeep, fontWeight: '700' },
  otherDay: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 9.5, lineHeight: 11, opacity: 0.8 },
  otherDayMonth: { fontSize: 8.5, width: 56, textAlign: 'center' },
  otherDaySelected: { color: COLORS.greenDeep, fontWeight: '700', opacity: 1 },
  feastDot: { backgroundColor: COLORS.gold, borderRadius: 2, bottom: 1, height: 4, position: 'absolute', width: 4 },
  divider: { alignItems: 'center', marginTop: 14 },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
  arabicLetter: { fontFamily: TYPOGRAPHY.arabic },
  // Centred over a scrim rather than pinned under whichever word was tapped.
  pickerBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.66)', flex: 1, justifyContent: 'center', padding: SPACING.lg },
  pickerPanel: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.goldLine,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 12,
    maxWidth: 380,
    overflow: 'hidden',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    width: '100%',
  },
  pickerColumns: { flexDirection: 'row', maxHeight: 320 },
  pickerColumn: { flex: 1, paddingTop: SPACING.md },
  pickerColumnDivider: { backgroundColor: COLORS.border, width: 1 },
  pickerColumnLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, paddingBottom: SPACING.sm, textAlign: 'center', textTransform: 'uppercase' },
  pickerList: { paddingHorizontal: SPACING.sm },
  // minHeight + marginVertical must stay equal to PICKER_ROW_HEIGHT.
  pickerOption: { alignItems: 'center', borderRadius: 10, justifyContent: 'center', marginVertical: 1, minHeight: 44, paddingHorizontal: SPACING.sm },
  pickerOptionSelected: { backgroundColor: COLORS.goldSoft },
  pickerOptionText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '600' },
  pickerOptionTextSelected: { color: COLORS.gold, fontWeight: '800' },
  pickerDone: { alignItems: 'center', borderTopColor: COLORS.border, borderTopWidth: 1, justifyContent: 'center', minHeight: 48 },
  pickerDoneText: { color: COLORS.gold, fontFamily: TYPOGRAPHY.title, fontSize: 16, fontWeight: '800' },
});
