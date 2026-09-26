import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import BookMenuScaffold from './BookMenuScaffold';
import { getBookTheme, PASCHA_TILE_THEMES, type BookTheme } from '../../../constants/bookTheme';
import { HOLY_WEEK_ROWS, holyWeekDayHref, type HolyWeekDayDef } from '../../../constants/manifest';
import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { formatRowDate, holyWeekRowDate, weekdayName } from '../../../utils/holyWeek';
import { useHolyWeekSchedule } from '../../../utils/useHolyWeekSchedule';

/** Menu text never grows past this multiple of its design size, so large accessibility text keeps the two-column rows intact. */
const MAX_FONT_SCALE = 1.25;

function isEve(day: HolyWeekDayDef): boolean {
  return day.id.endsWith('-eve');
}

/** Crimson for a day, midnight blue for an eve, and the two days that stand apart — brighter for the one being prayed now. */
function tileTheme(day: HolyWeekDayDef, isCurrent: boolean): BookTheme {
  if (day.id === 'good-friday') return PASCHA_TILE_THEMES.goodFriday;
  if (day.id === 'bright-saturday') return PASCHA_TILE_THEMES.brightSaturday;
  if (isEve(day)) return isCurrent ? PASCHA_TILE_THEMES.eveNow : PASCHA_TILE_THEMES.eve;
  return isCurrent ? PASCHA_TILE_THEMES.dayNow : PASCHA_TILE_THEMES.day;
}

interface DayTileProps {
  day: HolyWeekDayDef;
  isCurrent: boolean;
  isArabic: boolean;
  onPress: () => void;
}

function DayTile({ day, isCurrent, isArabic, onPress }: DayTileProps) {
  const eve = isEve(day);
  const theme = tileTheme(day, isCurrent);
  const kind = eve ? (isArabic ? 'ليلة' : 'EVE') : (isArabic ? 'نهار' : 'DAY');
  const now = eve ? (isArabic ? 'الليلة' : 'TONIGHT') : (isArabic ? 'الآن' : 'NOW');
  const standsApart = day.id === 'good-friday' || day.id === 'bright-saturday';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${isArabic ? day.arabic : day.title}${isCurrent ? `, ${now}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        eve ? styles.tileEve : standsApart ? styles.tileApart : styles.tileDay,
        isCurrent && styles.tileCurrent,
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient colors={theme.gradient} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={[StyleSheet.absoluteFill, styles.tileFill]} />
      <Text style={[styles.kind, { color: theme.accent }, isArabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {isCurrent ? `${kind} · ${now}` : kind}
      </Text>
      <Text
        style={[styles.tileTitle, standsApart && styles.tileTitleWide, isArabic && styles.arabicText]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
      >
        {isArabic ? day.arabic : day.title}
      </Text>
    </Pressable>
  );
}

/**
 * Holy Week menu: the week as a timeline, one row per day — the day itself
 * beside the eve prayed on its evening (see HOLY_WEEK_ROWS). While Holy Week
 * is being prayed the rows carry their dates, the day or eve being prayed now
 * glows, and the list opens scrolled to it. Outside Holy Week it is simply
 * the book.
 */
export default function HolyWeekMenu() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const schedule = useHolyWeekSchedule();
  const scrollRef = useRef<ScrollView>(null);
  const rowOffsets = useRef<Record<string, number>>({});
  const scrolledTo = useRef<string | null>(null);
  const currentRowId = schedule ? HOLY_WEEK_ROWS.find((row) => row.days.some((day) => day.id === schedule.currentDayId))?.id : undefined;
  const currentIsEve = Boolean(schedule?.currentDayId.endsWith('-eve'));

  // Bring the day being prayed into view — once, as soon as both it and its
  // row's position are known — without fighting the reader's own scrolling.
  const scrollToCurrent = () => {
    if (!currentRowId || scrolledTo.current === currentRowId) return;
    const y = rowOffsets.current[currentRowId];
    if (y === undefined) return;
    scrolledTo.current = currentRowId;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - SPACING.md), animated: true });
  };
  useEffect(scrollToCurrent, [currentRowId]);

  const open = (day: HolyWeekDayDef) => router.push(holyWeekDayHref(day) as never);

  return (
    <BookMenuScaffold
      ref={scrollRef}
      theme={getBookTheme('holy-week')}
      title={{ english: 'Holy Week', arabic: 'أسبوع الآلام' }}
      overline={isArabic ? 'البصخة المقدسة' : 'PASCHA'}
      arabic={isArabic}
      backHref="/books"
    >
      {HOLY_WEEK_ROWS.map((row, index) => {
        const label = schedule
          ? formatRowDate(holyWeekRowDate(schedule.palmSunday, index), isArabic)
          : isArabic ? weekdayName(index, true) : weekdayName(index, false).toUpperCase();
        const isCurrentRow = row.id === currentRowId;
        return (
          <View
            key={row.id}
            style={styles.row}
            onLayout={(event) => {
              rowOffsets.current[row.id] = event.nativeEvent.layout.y;
              if (isCurrentRow) scrollToCurrent();
            }}
          >
            <View style={[styles.rowHeader, isArabic && styles.rowReverse]}>
              <Text style={[styles.rowLabel, isCurrentRow && styles.rowLabelCurrent, isArabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {label}
              </Text>
              {isCurrentRow ? (
                <View style={styles.todayChip}>
                  <Text style={styles.todayChipText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    {currentIsEve ? (isArabic ? 'الليلة' : 'TONIGHT') : (isArabic ? 'اليوم' : 'TODAY')}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={[styles.tiles, isArabic && styles.rowReverse]}>
              {row.days.map((day) => (
                <DayTile
                  key={day.id}
                  day={day}
                  isCurrent={schedule?.currentDayId === day.id}
                  isArabic={isArabic}
                  onPress={() => open(day)}
                />
              ))}
            </View>
          </View>
        );
      })}
    </BookMenuScaffold>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  rowReverse: { flexDirection: 'row-reverse' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },

  row: { marginBottom: 6 },
  rowHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 8, marginHorizontal: 4 },
  rowLabel: { color: 'rgba(201, 162, 39, 0.8)', fontFamily: TYPOGRAPHY.body, fontSize: 11.5, fontWeight: '800', letterSpacing: 1.4 },
  rowLabelCurrent: { color: COLORS.gold },
  todayChip: { backgroundColor: COLORS.gold, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  todayChipText: { color: '#1A0508', fontFamily: TYPOGRAPHY.body, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.8 },
  tiles: { flexDirection: 'row', gap: 10 },

  tile: {
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 86,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  // The gradient keeps the tile's rounding even where the glow needs overflow visible.
  tileFill: { borderRadius: 17 },
  tileDay: { borderColor: 'rgba(255, 255, 255, 0.08)' },
  tileEve: { borderColor: 'rgba(156, 201, 255, 0.22)' },
  tileApart: { borderColor: 'rgba(201, 162, 39, 0.4)' },
  tileCurrent: {
    borderColor: COLORS.gold,
    borderWidth: 1.5,
    elevation: 8,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
  },
  kind: { fontFamily: TYPOGRAPHY.body, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.3 },
  // 17 keeps the longest names ("Wednesday Eve", "Holy Thursday") on one line
  // in a half-width tile on a 390pt phone; narrower phones shrink to fit.
  tileTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '700', marginTop: 12 },
  tileTitleWide: { fontSize: 19 },
});
