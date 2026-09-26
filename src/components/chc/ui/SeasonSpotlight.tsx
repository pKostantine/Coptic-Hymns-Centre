import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SPOTLIGHT_THEMES } from '../../../constants/bookTheme';
import { HOLY_WEEK_DAYS, HOLY_WEEK_ROWS, type HolyWeekDayDef } from '../../../constants/manifest';
import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import { useCalendar } from '../../../context/CalendarContext';
import { getCopticDate, getSeasonIndicatorLabel, type CopticDate } from '../../../utils/calendarService';
import { holyWeekRowDate, type HolyWeekSchedule } from '../../../utils/holyWeek';
import { formatCopticMonthName, formatWeekdayDate, toEasternArabicDigits } from '../../../utils/localeFormat';
import CopticCross from './CopticCross';
import Icon from './Icon';

const MAX_FONT_SCALE = 1.25;

interface SeasonSpotlightProps {
  arabic: boolean;
  /** The Holy Week in progress, if any — the card then becomes the way into it. */
  holyWeek: HolyWeekSchedule | null;
  onOpenCalendar: () => void;
  onOpenHolyWeekDay: (day: HolyWeekDayDef) => void;
  onOpenHolyWeek: () => void;
}

/**
 * The top of the Books menu: the liturgical day the books are read against.
 *
 * On an ordinary day it is the date — the Coptic day large, the season named
 * in a chip, the Gregorian date above — and opens the calendar. While Holy
 * Week is being prayed it turns crimson and becomes the way into the day or
 * eve being prayed right now (with a second way into the whole week), so the
 * shelf below does not need a Holy Week cover of its own during Pascha.
 */
export default function SeasonSpotlight({ arabic, holyWeek, onOpenCalendar, onOpenHolyWeekDay, onOpenHolyWeek }: SeasonSpotlightProps) {
  const { isLive, effectiveDate, goLive } = useCalendar();
  const dateKey = effectiveDate.toISOString().slice(0, 10);
  // Both are kept with the day they belong to, so a stale value drops out by key.
  const [coptic, setCoptic] = useState<{ key: string; date: CopticDate | null } | null>(null);
  const [season, setSeason] = useState<{ key: string; label: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    void getCopticDate(new Date(`${dateKey}T00:00:00Z`)).then((date) => { if (active) setCoptic({ key: dateKey, date }); });
    void getSeasonIndicatorLabel(dateKey).then((label) => { if (active) setSeason({ key: dateKey, label }); });
    return () => { active = false; };
  }, [dateKey]);

  const copticDate = coptic?.key === dateKey ? coptic.date : null;
  const seasonLabel = season?.key === dateKey ? season.label : null;
  const current = holyWeek ? HOLY_WEEK_DAYS.find((day) => day.id === holyWeek.currentDayId) ?? null : null;
  const pascha = Boolean(holyWeek && current);
  const theme = pascha ? SPOTLIGHT_THEMES.pascha : SPOTLIGHT_THEMES.day;

  let chip = seasonLabel ?? '';
  let overline = formatWeekdayDate(effectiveDate, arabic);
  let heading = overline;
  let footnote = '';

  if (pascha && holyWeek && current) {
    const rowIndex = HOLY_WEEK_ROWS.findIndex((row) => row.days.some((day) => day.id === current.id));
    const eve = current.id.endsWith('-eve');
    chip = arabic ? 'البصخة المقدسة' : 'PASCHA';
    overline = eve
      ? (arabic ? `الليلة · ${formatWeekdayDate(holyWeekRowDate(holyWeek.palmSunday, rowIndex), true)}` : `Tonight · ${formatWeekdayDate(holyWeekRowDate(holyWeek.palmSunday, rowIndex), false)}`)
      : (arabic ? `اليوم · ${formatWeekdayDate(effectiveDate, true)}` : `Today · ${formatWeekdayDate(effectiveDate, false)}`);
    heading = arabic ? current.arabic : current.title;
    footnote = copticDate
      ? (arabic
        ? `${toEasternArabicDigits(copticDate.day)} ${formatCopticMonthName(copticDate.monthName, true)} ${toEasternArabicDigits(copticDate.year)}`
        : `${copticDate.monthName} ${copticDate.day}, ${copticDate.year}`)
      : '';
  } else if (copticDate) {
    heading = arabic
      ? `${toEasternArabicDigits(copticDate.day)} ${formatCopticMonthName(copticDate.monthName, true)}`
      : `${copticDate.monthName} ${copticDate.day}`;
    footnote = arabic ? `سنة ${toEasternArabicDigits(copticDate.year)} للشهداء` : `Year of the Martyrs ${copticDate.year}`;
  }
  if (!isLive && !pascha) overline = arabic ? `تاريخ مختار · ${overline}` : `Viewing · ${overline}`;

  return (
    // A plain card: one full-size tap target lies behind the text, and the
    // calendar button and pills sit beside it rather than inside it, so no
    // button is ever nested in another (invalid on web).
    <View style={[styles.card, { borderColor: pascha ? 'rgba(231,196,106,0.5)' : 'rgba(216,199,122,0.45)' }]}>
      <LinearGradient colors={theme.gradient} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.watermark, arabic ? styles.watermarkLeft : styles.watermarkRight]} pointerEvents="none">
        <CopticCross size={230} color={pascha ? 'rgba(231,196,106,0.14)' : 'rgba(255,233,168,0.14)'} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={pascha ? `${heading}. ${overline}` : `${heading}. ${arabic ? 'افتح التقويم' : 'Open the calendar'}`}
        onPress={pascha && current ? () => onOpenHolyWeekDay(current) : onOpenCalendar}
        style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.pressed]}
      />

      <View style={[styles.topRow, arabic && styles.rowReverse]} pointerEvents="box-none">
        {chip ? (
          <View style={[styles.chip, { borderColor: `${theme.accent}59` }]} pointerEvents="none">
            <Text style={[styles.chipText, { color: theme.accent }, arabic && styles.arabicChip]} maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}>
              {arabic ? chip : chip.toUpperCase()}
            </Text>
          </View>
        ) : <View pointerEvents="none" />}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={arabic ? 'افتح التقويم' : 'Open the calendar'}
          hitSlop={8}
          onPress={onOpenCalendar}
          style={[styles.roundButton, { borderColor: `${theme.accent}59` }]}
        >
          <Icon name="calendar-outline" size={19} color={theme.accent} />
        </Pressable>
      </View>

      <View style={styles.body} pointerEvents="box-none">
        <View pointerEvents="none">
        <Text style={[styles.overline, { color: theme.accent }, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}>
          {overline}
        </Text>
        <Text
          style={[styles.heading, arabic && styles.arabicHeading]}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {heading}
        </Text>
        {footnote ? (
          <Text style={[styles.footnote, arabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}>{footnote}</Text>
        ) : null}
        </View>

        {pascha || !isLive ? (
          <View style={[styles.actions, arabic && styles.rowReverse]} pointerEvents="box-none">
            {pascha ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={6}
                onPress={onOpenHolyWeek}
                style={[styles.pill, { borderColor: `${theme.accent}66` }, arabic && styles.rowReverse]}
              >
                <Text style={[styles.pillText, { color: theme.accent }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{arabic ? 'أسبوع الآلام' : 'All of Holy Week'}</Text>
                <Icon name={arabic ? 'chevron-back' : 'chevron-forward'} size={14} color={theme.accent} />
              </Pressable>
            ) : null}
            {!isLive ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={6}
                onPress={goLive}
                style={[styles.pill, { borderColor: `${theme.accent}66` }, arabic && styles.rowReverse]}
              >
                <Icon name="time-outline" size={14} color={theme.accent} />
                <Text style={[styles.pillText, { color: theme.accent }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{arabic ? 'العودة إلى اليوم' : 'Back to today'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    borderWidth: 1,
    justifyContent: 'space-between',
    minHeight: 206,
    overflow: 'hidden',
    padding: 20,
  },
  // Pressing darkens the whole card a touch.
  pressed: { backgroundColor: 'rgba(0, 0, 0, 0.18)' },
  watermark: { bottom: -70, position: 'absolute' },
  watermarkRight: { right: -56 },
  watermarkLeft: { left: -56 },
  rowReverse: { flexDirection: 'row-reverse' },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  chip: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 1,
    marginRight: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  arabicChip: { fontFamily: TYPOGRAPHY.arabic, fontSize: 12, letterSpacing: 0 },
  roundButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  body: { marginTop: 22 },
  overline: { fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '700' },
  heading: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 34, fontWeight: '700', marginTop: 4 },
  arabicHeading: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  footnote: { color: 'rgba(255, 240, 210, 0.8)', fontFamily: TYPOGRAPHY.body, fontSize: 14, marginTop: 4 },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  pill: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: { fontFamily: TYPOGRAPHY.body, fontSize: 12.5, fontWeight: '700' },
});
