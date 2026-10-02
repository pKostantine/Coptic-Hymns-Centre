'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useId, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import BookPage, { PageGutter } from './BookPage';
import Icon from '../ui/Icon';
import TodayCard, { DayStrip, type DayStripItem } from '../ui/TodayCard';
import { bookmarkKeyFor, HOLY_WEEK_ROWS, holyWeekHourHref, type HolyWeekDayDef, type HolyWeekHourDef } from '../../../constants/manifest';
import type { DayBlockTheme } from '../../../constants/seasonAppearance';
import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import { useCalendar } from '../../../context/CalendarContext';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { entryLabel, tr } from '../../../utils/appText';
import { getCopticDatesBetween, type CopticDate } from '../../../utils/calendarService';
import { addUtcDays, toIsoDate } from '../../../utils/dateUtils';
import { holyWeekRowDate, loadUpcomingPalmSunday, toArabicDigits } from '../../../utils/holyWeek';
import { formatCopticDayMonth, formatDayMonthRange, formatDayMonthYearDate } from '../../../utils/localeFormat';
import { useHolyWeekSchedule } from '../../../utils/useHolyWeekSchedule';

const MAX_FONT_SCALE = 1.25;
const WEEKDAYS = {
  english: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  french: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
  arabic: ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'],
};
/** Good Friday's row, marked in the strip as a feast is. */
const GOOD_FRIDAY_ROW = 5;

/** The week card's crimson (Coptic Vine design, "Book Pages": oklch(0.36 0.14 22) and oklch(0.22 0.09 20) on near-black). */
const CRIMSON: DayBlockTheme = {
  key: 'holyweek',
  from: '#760618',
  to: '#050101',
  toAt: 0.8,
  border: '#1D1D1D',
  text: '#FFFFFF',
  muted: 'rgba(255, 255, 255, 0.72)',
  strong: 'rgba(255, 255, 255, 0.85)',
  accent: COLORS.gold,
  accentBorder: COLORS.gold,
  selected: COLORS.gold,
  selectedText: COLORS.greenDeep,
  chip: 'rgba(255, 255, 255, 0.08)',
  liveRing: 'white',
};

/** Palm Sunday of the week being prayed, or of the next, and the Coptic date of each of its days. */
function useHolyWeekDates() {
  const { effectiveDate } = useCalendar();
  const fromIso = toIsoDate(effectiveDate);
  const [dates, setDates] = useState<{ key: string; palmSunday: Date | null; coptic: Map<string, CopticDate> } | null>(null);

  useEffect(() => {
    let active = true;
    loadUpcomingPalmSunday(new Date(`${fromIso}T00:00:00Z`))
      .then(async (palmSunday) => {
        const coptic = palmSunday
          ? await getCopticDatesBetween(toIsoDate(palmSunday), toIsoDate(addUtcDays(palmSunday, 6) as Date)).catch(() => new Map<string, CopticDate>())
          : new Map<string, CopticDate>();
        if (active) setDates({ key: fromIso, palmSunday, coptic });
      })
      .catch(() => { if (active) setDates({ key: fromIso, palmSunday: null, coptic: new Map() }); });
    return () => { active = false; };
  }, [fromIso]);

  return dates?.key === fromIso ? dates : null;
}

function isEve(day: HolyWeekDayDef): boolean {
  return day.id.endsWith('-eve');
}

/** "1st", "3rd"… — "1re", "3e" in French, the numeral alone in Arabic. */
function hourLabel(hour: HolyWeekHourDef, arabic: boolean): string {
  const number = hour.hourNumber ?? 0;
  if (arabic) return toArabicDigits(number);
  const english = `${number}${number === 1 ? 'st' : number === 3 ? 'rd' : 'th'}`;
  return tr(english, number === 1 ? '1re' : `${number}e`, '');
}

/**
 * Holy Week (Coptic Vine design, "Book Pages"): the week in a crimson card — pick a
 * day, and beneath it are that day's hours and the hours of the eve prayed on
 * its evening. The page is dated by the Pascha being prayed or the next to
 * come; while it is being prayed it opens on today, and the day or eve being
 * prayed now is marked.
 */
export default function HolyWeekMenu() {
  const router = useRouter();
  const { preferences, isBookmarked } = useReadingPreferences();
  const arabic = preferences.appLanguage === 'ar';
  const schedule = useHolyWeekSchedule();
  const dates = useHolyWeekDates();
  const [picked, setPicked] = useState<number | null>(null);

  const currentRow = schedule ? HOLY_WEEK_ROWS.findIndex((row) => row.days.some((day) => day.id === schedule.currentDayId)) : -1;
  const selected = picked ?? (currentRow >= 0 ? currentRow : 0);
  const row = HOLY_WEEK_ROWS[selected];
  const palmSunday = dates?.palmSunday ?? null;
  const copticOf = (index: number) => (palmSunday ? dates?.coptic.get(toIsoDate(holyWeekRowDate(palmSunday, index))) : undefined);

  const weekdayNames = arabic ? WEEKDAYS.arabic : tr(WEEKDAYS.english.join('|'), WEEKDAYS.french.join('|'), '').split('|');
  const digits = (value: number) => (arabic ? toArabicDigits(value) : String(value));
  const strip: DayStripItem[] = HOLY_WEEK_ROWS.map((entry, index) => {
    const date = palmSunday ? holyWeekRowDate(palmSunday, index) : null;
    const coptic = copticOf(index);
    return {
      key: entry.id,
      label: weekdayNames[index],
      value: date ? digits(date.getUTCDate()) : ' ',
      sub: coptic ? digits(coptic.day) : ' ',
      selected: index === selected,
      dot: index === GOOD_FRIDAY_ROW,
      accessibilityLabel: date ? `${entryLabel(entry.days[0])}, ${formatDayMonthYearDate(date, arabic)}` : entryLabel(entry.days[0]),
      onPress: () => setPicked(index),
    };
  });

  const day = row.days[0];
  const coptic = copticOf(selected);
  // Monday to Wednesday are named by their weekday alone: "Tuesday of Holy Week".
  const ofHolyWeek = ['monday', 'tuesday', 'wednesday'].includes(day.id)
    ? tr('of Holy Week', 'de la Semaine sainte', 'من أسبوع الآلام')
    : tr('Holy Week', 'Semaine sainte', 'أسبوع الآلام');
  const subheading = coptic ? `${ofHolyWeek} · ${formatCopticDayMonth(coptic.monthName, coptic.day, arabic)}` : ofHolyWeek;

  const bookmarked = (hour: HolyWeekHourDef) => isBookmarked(bookmarkKeyFor(hour.schema, hour.table, hour.id));
  const open = (hour: HolyWeekHourDef) => router.push(holyWeekHourHref(hour) as never);

  return (
    <BookPage
      title={{ english: 'Holy Week', arabic: 'أسبوع الآلام', french: 'Semaine sainte' }}
      kicker={tr('Pascha', 'Pâque', 'البصخة المقدسة')}
      subtitle={palmSunday ? formatDayMonthRange(palmSunday, holyWeekRowDate(palmSunday, 6), arabic) : undefined}
      arabic={arabic}
      backHref="/books"
      glow="crimson"
      wide="single"
    >
      <PageGutter>
        <TodayCard
          theme={CRIMSON}
          background={<CrimsonGlow />}
          arabic={arabic}
          heading={entryLabel(day)}
          subheading={subheading}
          strip={<DayStrip items={strip} theme={CRIMSON} arabic={arabic} />}
        />

        <DayAndEve
          days={row.days}
          currentDayId={schedule?.currentDayId ?? null}
          arabic={arabic}
          bookmarked={bookmarked}
          onOpen={open}
        />
      </PageGutter>
    </BookPage>
  );
}

/** The week card's light, falling from its top corner. */
function CrimsonGlow() {
  const id = `crimson${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={[StyleSheet.absoluteFill, styles.crimsonBase]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id} cx="0%" cy="0%" rx="140%" ry="110%" fx="0%" fy="0%">
            <Stop offset="0" stopColor="#760618" stopOpacity="0.9" />
            <Stop offset="0.4" stopColor="#3A0008" stopOpacity="0.6" />
            <Stop offset="0.8" stopColor="#000000" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

interface DayAndEveProps {
  days: HolyWeekDayDef[];
  currentDayId: string | null;
  arabic: boolean;
  bookmarked: (hour: HolyWeekHourDef) => boolean;
  onOpen: (hour: HolyWeekHourDef) => void;
}

/** The chosen day's hours in gold, over the hours of the eve prayed on its evening in blue. */
function DayAndEve({ days, currentDayId, arabic, bookmarked, onOpen }: DayAndEveProps) {
  const hasEve = days.some(isEve);
  return (
    <View style={styles.dayAndEve}>
      <LinearGradient
        colors={hasEve ? ['#311900', '#0D0A05', '#040B18', '#0C2548'] : ['#311900', '#0D0A05']}
        locations={hasEve ? [0, 0.46, 0.54, 1] : [0, 1]}
        style={StyleSheet.absoluteFill}
      />
      {days.map((day, index) => (
        <View key={day.id}>
          {index > 0 ? <View style={styles.separator} /> : null}
          <HoursOf day={day} current={day.id === currentDayId} arabic={arabic} bookmarked={bookmarked} onOpen={onOpen} />
        </View>
      ))}
    </View>
  );
}

function HoursOf({ day, current, arabic, bookmarked, onOpen }: { day: HolyWeekDayDef; current: boolean; arabic: boolean; bookmarked: (hour: HolyWeekHourDef) => boolean; onOpen: (hour: HolyWeekHourDef) => void }) {
  const eve = isEve(day);
  const accent = eve ? COLORS.rowBlue : COLORS.gold;
  const kind = eve ? tr('Eve', 'Veille', 'ليلة') : tr('Day', 'Jour', 'نهار');
  const now = eve ? tr('Tonight', 'Ce soir', 'الليلة') : tr('Now', 'Maintenant', 'الآن');

  // Runs of hours share rows of five; the services that aren't hours take a row of their own.
  const rows: HolyWeekHourDef[][] = [];
  for (const hour of day.hours) {
    const last = rows[rows.length - 1];
    if (hour.hourNumber && last && last.length < 5 && last[0].hourNumber) last.push(hour);
    else rows.push([hour]);
  }

  return (
    <View style={styles.hours}>
      <View style={[styles.hoursHead, arabic && styles.rowReverse]}>
        <Icon name={eve ? 'moon' : 'sunny'} size={17} color={accent} />
        <Text style={[styles.kind, { color: accent }, arabic && styles.kindArabic]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {arabic ? kind : kind.toUpperCase()}
        </Text>
        {current ? (
          <View style={styles.nowTag}>
            <Text style={[styles.nowTagText, arabic && styles.arabicSmall]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{now}</Text>
          </View>
        ) : null}
        <Text style={[styles.dayTitle, arabic ? styles.dayTitleArabic : styles.dayTitleLatin]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {entryLabel(day)}
        </Text>
      </View>
      {rows.map((hours) => (
        <View key={hours[0].id} style={[styles.chipRow, arabic && styles.rowReverse]}>
          {hours.map((hour) => {
            const label = hour.hourNumber ? hourLabel(hour, arabic) : tr(hour.shortTitle, hour.shortFrench, hour.shortArabic);
            return (
              <Pressable
                key={hour.id}
                accessibilityRole="button"
                accessibilityLabel={tr(hour.shortTitle, hour.shortFrench, hour.shortArabic)}
                onPress={() => onOpen(hour)}
                style={({ pressed }) => [styles.chip, eve ? styles.chipEve : styles.chipDay, pressed && styles.pressed]}
              >
                <Text style={[styles.chipText, { color: eve ? '#DCECFF' : '#F3E6B8' }, arabic && styles.arabicSmall]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {label}
                </Text>
                {bookmarked(hour) ? (
                  <View style={[styles.chipMark, arabic ? styles.chipMarkArabic : null]}>
                    <Icon name="bookmark" size={9} color={COLORS.gold} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
          {/* A short run of hours keeps its chips hour-sized. */}
          {hours[0].hourNumber ? Array.from({ length: 5 - hours.length }).map((_, index) => <View key={`gap-${index}`} style={styles.chipGap} />) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rowReverse: { flexDirection: 'row-reverse' },
  arabicSmall: { fontFamily: TYPOGRAPHY.arabic },
  pressed: { opacity: 0.75 },
  crimsonBase: { backgroundColor: '#050101' },

  dayAndEve: { borderColor: '#1D1D1D', borderRadius: 22, borderWidth: 1, marginTop: 14, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 4 },
  separator: { backgroundColor: 'rgba(255, 255, 255, 0.1)', height: 1 },
  hours: { gap: 6, paddingBottom: 16, paddingTop: 14 },
  hoursHead: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 6 },
  kind: { fontFamily: TYPOGRAPHY.body, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.8 },
  kindArabic: { fontFamily: TYPOGRAPHY.arabic, fontSize: 13, letterSpacing: 0 },
  nowTag: { backgroundColor: COLORS.gold, borderRadius: 99, justifyContent: 'center', paddingHorizontal: 9, paddingVertical: 2 },
  nowTagText: { color: COLORS.greenDeep, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '700' },
  dayTitle: { color: COLORS.white, flexShrink: 1, fontFamily: TYPOGRAPHY.title, fontSize: 19, fontWeight: '700' },
  dayTitleLatin: { marginLeft: 'auto' },
  dayTitleArabic: { fontFamily: TYPOGRAPHY.arabic, marginRight: 'auto', writingDirection: 'rtl' },
  chipRow: { flexDirection: 'row', gap: 6 },
  chip: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flex: 1, height: 38, justifyContent: 'center', minWidth: 0, paddingHorizontal: 6 },
  chipDay: { backgroundColor: 'rgba(227, 181, 59, 0.12)', borderColor: 'rgba(227, 181, 59, 0.28)' },
  chipEve: { backgroundColor: 'rgba(142, 197, 255, 0.1)', borderColor: 'rgba(142, 197, 255, 0.28)' },
  chipText: { fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '600' },
  chipMark: { position: 'absolute', right: 4, top: 3 },
  chipMarkArabic: { left: 4, right: undefined },
  chipGap: { flex: 1 },
});
