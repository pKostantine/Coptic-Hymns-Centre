import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Rect } from 'react-native-svg';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import AppHeader from '../ui/AppHeader';
import Icon from '../ui/Icon';
import { HOLY_WEEK_DAYS, HOLY_WEEK_ROWS, holyWeekDayHref, type HolyWeekDayDef } from '../../../constants/manifest';
import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import {
  formatLongDate,
  formatRowDate,
  holyWeekRowDate,
  toArabicDigits,
  weekdayName,
  type HolyWeekSchedule,
} from '../../../utils/holyWeek';
import { goBack } from '../../../utils/navigation';
import { useHolyWeekSchedule } from '../../../utils/useHolyWeekSchedule';

/** Menu text never grows past this multiple of its design size, so large accessibility text keeps the two-column rows intact. */
const MAX_FONT_SCALE = 1.25;

function isEve(day: HolyWeekDayDef): boolean {
  return day.id.endsWith('-eve');
}

/** "5 hours" for a day or eve of hours; "3 services" where other services are mixed in. */
function countLabel(day: HolyWeekDayDef, arabic: boolean): string {
  const count = day.hours.length;
  const allHours = day.hours.every((hour) => hour.hourNumber);
  if (arabic) {
    if (allHours) return `${toArabicDigits(count)} ساعات`;
    return count === 1 ? 'صلاة واحدة' : `${toArabicDigits(count)} صلوات`;
  }
  if (allHours) return `${count} hours`;
  return count === 1 ? '1 service' : `${count} services`;
}

/** A Coptic cross — four equal arms, each ending in a trefoil of three buds. Decorative. */
export function CopticCross({ size, color }: { size: number; color: string }) {
  // One trefoil per arm end: the tip bud on the arm's axis, two beside it.
  const buds = [
    [50, 9], [41, 16], [59, 16],
    [50, 91], [41, 84], [59, 84],
    [9, 50], [16, 41], [16, 59],
    [91, 50], [84, 41], [84, 59],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={44} y={16} width={12} height={68} rx={3} fill={color} />
      <Rect x={16} y={44} width={68} height={12} rx={3} fill={color} />
      {buds.map(([cx, cy]) => <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={6.5} fill={color} />)}
    </Svg>
  );
}

function Hero({ schedule, isArabic, onOpen }: { schedule: HolyWeekSchedule | null; isArabic: boolean; onOpen: (day: HolyWeekDayDef) => void }) {
  const current = schedule?.currentDayId ? HOLY_WEEK_DAYS.find((day) => day.id === schedule.currentDayId) ?? null : null;

  let overline = isArabic ? 'البصخة المقدسة' : 'PASCHA';
  let title = isArabic ? 'أسبوع الآلام' : 'Holy Week';
  let body = isArabic ? 'من أحد الشعانين إلى سبت الفرح' : 'From Palm Sunday to Bright Saturday';

  if (schedule && current) {
    const rowIndex = HOLY_WEEK_ROWS.findIndex((row) => row.days.some((day) => day.id === current.id));
    const date = holyWeekRowDate(schedule.palmSunday, rowIndex);
    overline = isEve(current) ? (isArabic ? 'الليلة' : 'TONIGHT') : (isArabic ? 'اليوم' : 'TODAY');
    title = isArabic ? current.arabic : current.title;
    body = isEve(current)
      ? (isArabic ? `مساء ${formatLongDate(date, true)}` : `${formatLongDate(date, false)} · evening`)
      : formatLongDate(date, isArabic);
  } else if (schedule && schedule.daysUntil > 0) {
    const days = schedule.daysUntil;
    overline = isArabic ? 'البصخة القادمة' : 'NEXT PASCHA';
    title = isArabic ? 'أحد الشعانين' : 'Palm Sunday';
    body = isArabic
      ? `${formatLongDate(schedule.palmSunday, true)} · بعد ${toArabicDigits(days)} ${days === 1 ? 'يوم' : 'يوماً'}`
      : `${formatLongDate(schedule.palmSunday, false)} · in ${days} ${days === 1 ? 'day' : 'days'}`;
  }

  return (
    <LinearGradient
      colors={['#0B3D70', '#062443', '#040E1C']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={[styles.heroCross, isArabic ? styles.heroCrossLeft : styles.heroCrossRight]} pointerEvents="none">
        <CopticCross size={92} color="rgba(201, 162, 39, 0.22)" />
      </View>
      <Text style={[styles.heroOverline, isArabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{overline}</Text>
      <Text style={[styles.heroTitle, isArabic && styles.arabicTitle]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {title}
      </Text>
      <Text style={[styles.heroBody, isArabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{body}</Text>
      {current ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isArabic ? `افتح ${current.arabic}` : `Open ${current.title}`}
          onPress={() => onOpen(current)}
          style={({ pressed }) => [styles.heroButton, isArabic && styles.heroButtonArabic, pressed && styles.pressed]}
        >
          <Text style={styles.heroButtonText} maxFontSizeMultiplier={MAX_FONT_SCALE}>{isArabic ? 'افتح' : 'Open'}</Text>
          <Icon name={isArabic ? 'chevron-back' : 'chevron-forward'} size={16} color={COLORS.navyDark} />
        </Pressable>
      ) : null}
    </LinearGradient>
  );
}

interface DayTileProps {
  day: HolyWeekDayDef;
  isCurrent: boolean;
  isArabic: boolean;
  onPress: () => void;
}

function DayTile({ day, isCurrent, isArabic, onPress }: DayTileProps) {
  const eve = isEve(day);
  const accent = eve ? COLORS.night : COLORS.gold;
  const kind = eve ? (isArabic ? 'ليلة' : 'EVE') : (isArabic ? 'نهار' : 'DAY');
  const nowLabel = eve ? (isArabic ? 'الليلة' : 'TONIGHT') : (isArabic ? 'اليوم' : 'TODAY');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${isArabic ? day.arabic : day.title}${isCurrent ? `, ${nowLabel}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        eve ? styles.tileEve : styles.tileDay,
        isCurrent && (eve ? styles.tileCurrentEve : styles.tileCurrentDay),
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.tileTop, isArabic && styles.rowReverse]}>
        <View style={[styles.kind, isArabic && styles.rowReverse]}>
          <Icon name={eve ? 'moon' : 'sunny'} size={13} color={accent} />
          <Text style={[styles.kindText, { color: accent }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{kind}</Text>
        </View>
        {isCurrent ? (
          <View style={[styles.nowPill, { backgroundColor: accent }]}>
            <Text style={styles.nowText} maxFontSizeMultiplier={MAX_FONT_SCALE}>{nowLabel}</Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[styles.tileTitle, isArabic && styles.arabicTitle]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
      >
        {isArabic ? day.arabic : day.title}
      </Text>
      <View style={[styles.tileBottom, isArabic && styles.rowReverse]}>
        <Text style={[styles.tileMeta, isArabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{countLabel(day, isArabic)}</Text>
        <Icon name={isArabic ? 'chevron-back' : 'chevron-forward'} size={15} color={accent} style={styles.tileChevron} />
      </View>
    </Pressable>
  );
}

/**
 * Holy Week menu: a dated timeline of the week, one row per day — the day
 * itself beside the eve prayed on its evening (see HOLY_WEEK_ROWS). The row
 * being prayed right now is marked, and a banner up top either opens it or
 * counts down to the next Palm Sunday.
 */
export default function HolyWeekMenu() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const schedule = useHolyWeekSchedule();

  const open = (day: HolyWeekDayDef) => router.push(holyWeekDayHref(day) as never);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>CHC Holy Week</title>
      </Head>
      <AppHeader
        title={{ english: 'Holy Week', arabic: 'أسبوع الآلام' }}
        canGoBack
        onBack={() => goBack(router, '/books')}
        visibleLanguages={{ english: !isArabic, arabic: isArabic }}
      />
      <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <Hero schedule={schedule} isArabic={isArabic} onOpen={open} />

          {HOLY_WEEK_ROWS.map((row, index) => {
            const label = schedule ? formatRowDate(holyWeekRowDate(schedule.palmSunday, index), isArabic) : weekdayName(index, isArabic).toUpperCase();
            return (
              <View key={row.id} style={styles.row}>
                <View style={[styles.rowHeader, isArabic && styles.rowReverse]}>
                  <Text style={[styles.rowLabel, isArabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{label}</Text>
                  <View style={styles.rowRule} />
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
        </View>
      </NowPlayingAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.xl * 2 },
  // Phones use the full width; wider screens keep the timeline at a readable measure.
  column: { alignSelf: 'center', maxWidth: 640, width: '100%' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  rowReverse: { flexDirection: 'row-reverse' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  arabicTitle: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },

  hero: {
    borderColor: COLORS.goldLine,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  heroCross: { bottom: 0, justifyContent: 'center', position: 'absolute', top: 0 },
  heroCrossRight: { right: 18 },
  heroCrossLeft: { left: 18 },
  heroOverline: { color: COLORS.gold, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  heroTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 27, fontWeight: '700', marginTop: 6 },
  heroBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, marginTop: 4 },
  heroButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.gold,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    marginTop: SPACING.md,
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 8,
  },
  heroButtonArabic: { alignSelf: 'flex-end', flexDirection: 'row-reverse', paddingLeft: 12, paddingRight: 16 },
  heroButtonText: { color: COLORS.navyDark, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },

  row: { marginBottom: SPACING.lg - 4 },
  rowHeader: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm, marginBottom: 10 },
  rowLabel: { color: COLORS.gold, fontFamily: TYPOGRAPHY.body, fontSize: 11.5, fontWeight: '800', letterSpacing: 1.4 },
  rowRule: { backgroundColor: 'rgba(201, 162, 39, 0.22)', flex: 1, height: StyleSheet.hairlineWidth },
  tiles: { flexDirection: 'row', gap: 10 },

  tile: {
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    minHeight: 104,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  tileDay: { backgroundColor: COLORS.surface, borderColor: 'rgba(201, 162, 39, 0.24)' },
  tileEve: { backgroundColor: COLORS.nightSurface, borderColor: COLORS.nightLine },
  tileCurrentDay: {
    borderColor: COLORS.gold,
    borderWidth: 1.5,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  tileCurrentEve: {
    borderColor: COLORS.night,
    borderWidth: 1.5,
    shadowColor: COLORS.night,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  tileTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 20 },
  kind: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  kindText: { fontFamily: TYPOGRAPHY.body, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.3 },
  nowPill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  nowText: { color: COLORS.navyDark, fontFamily: TYPOGRAPHY.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  // 17 keeps the longest names ("Wednesday Eve", "Holy Thursday") on one line
  // in a half-width tile on a 390pt phone; narrower phones shrink to fit.
  tileTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '700', marginTop: 10 },
  tileBottom: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  tileMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12.5 },
  tileChevron: { opacity: 0.85 },
});
