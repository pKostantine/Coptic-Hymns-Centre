'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getSeasonAppearance } from '../../../constants/seasonAppearance';
import { HOLY_WEEK_DAYS, HOLY_WEEK_ROWS, type HolyWeekDayDef } from '../../../constants/manifest';
import { COLORS, TYPOGRAPHY } from '../../../constants/theme';
import { useCalendar } from '../../../context/CalendarContext';
import { getCopticDate, getSeasonIndicatorLabel, type CopticDate } from '../../../utils/calendarService';
import { holyWeekRowDate, type HolyWeekSchedule } from '../../../utils/holyWeek';
import { formatCopticDate, formatCopticMonthName, formatWeekdayDate, toEasternArabicDigits } from '../../../utils/localeFormat';
import CopticCross from './CopticCross';
import Icon from './Icon';

import { entryLabel, tr } from '../../../utils/appText';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
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
  const [season, setSeason] = useState<{ key: string; indicatorKey: string | null; label: string | null } | null>(null);
  // The season's name is read in the App Language, so it belongs to that too.
  const { preferences } = useReadingPreferences();
  const seasonKey = `${dateKey}:${preferences.appLanguage}`;

  useEffect(() => {
    let active = true;
    void getCopticDate(new Date(`${dateKey}T00:00:00Z`)).then((date) => { if (active) setCoptic({ key: dateKey, date }); });
    void getSeasonIndicatorLabel(dateKey).then((result) => {
      if (active) setSeason({ key: seasonKey, indicatorKey: result?.key ?? null, label: result?.label ?? null });
    });
    return () => { active = false; };
  }, [dateKey, seasonKey]);

  const copticDate = coptic?.key === dateKey ? coptic.date : null;
  const seasonLabel = season?.key === seasonKey ? season.label : null;
  const current = holyWeek ? HOLY_WEEK_DAYS.find((day) => day.id === holyWeek.currentDayId) ?? null : null;
  const pascha = Boolean(holyWeek && current);
  // The card wears the day's own season. While Holy Week is being prayed the
  // card is its navigation, so it takes Holy Week's colours whatever the
  // indicator resolved to for the particular day.
  const theme = getSeasonAppearance(pascha ? 'holy-week' : season?.key === seasonKey ? season.indicatorKey : null);

  let chip = seasonLabel ?? '';
  let overline = formatWeekdayDate(effectiveDate, arabic);
  let heading = overline;
  let footnote = '';

  if (pascha && holyWeek && current) {
    const rowIndex = HOLY_WEEK_ROWS.findIndex((row) => row.days.some((day) => day.id === current.id));
    const eve = current.id.endsWith('-eve');
    chip = tr('PASCHA', 'PÂQUE', 'البصخة المقدسة');
    overline = eve
      ? `${tr('Tonight', 'Ce soir', 'الليلة')} · ${formatWeekdayDate(holyWeekRowDate(holyWeek.palmSunday, rowIndex), arabic)}`
      : `${tr('Today', 'Aujourd’hui', 'اليوم')} · ${formatWeekdayDate(effectiveDate, arabic)}`;
    heading = entryLabel(current);
    footnote = copticDate
      ? (arabic
        ? `${toEasternArabicDigits(copticDate.day)} ${formatCopticMonthName(copticDate.monthName, true)} ${toEasternArabicDigits(copticDate.year)}`
        : formatCopticDate(copticDate.monthName, copticDate.day, copticDate.year, false))
      : '';
  } else if (copticDate) {
    heading = arabic
      ? `${toEasternArabicDigits(copticDate.day)} ${formatCopticMonthName(copticDate.monthName, true)}`
      : tr(`${copticDate.monthName} ${copticDate.day}`, `${copticDate.day} ${copticDate.monthName}`, '');
    footnote = arabic
      ? `سنة ${toEasternArabicDigits(copticDate.year)} للشهداء`
      : tr(`Year of the Martyrs ${copticDate.year}`, `An ${copticDate.year} des Martyrs`, '');
  }
  if (!isLive && !pascha) overline = arabic ? `تاريخ مختار · ${overline}` : `${tr('Viewing', 'Date choisie', '')} · ${overline}`;

  return (
    // A plain card: one full-size tap target lies behind the text, and the
    // calendar button and pills sit beside it rather than inside it, so no
    // button is ever nested in another (invalid on web).
    <View style={[styles.card, { borderColor: `${theme.accent}73` }]}>
      <LinearGradient colors={theme.gradient} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.watermark, arabic ? styles.watermarkLeft : styles.watermarkRight]} pointerEvents="none">
        <CopticCross size={230} color={`${theme.accent}24`} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={pascha ? `${heading}. ${overline}` : `${heading}. ${tr('Open the calendar', 'Ouvrir le calendrier', 'افتح التقويم')}`}
        onPress={pascha && current ? () => onOpenHolyWeekDay(current) : onOpenCalendar}
        style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.pressed]}
      />

      <View style={[styles.topRow, arabic && styles.rowReverse]} pointerEvents="box-none">
        {chip ? (
          <View style={[styles.chip, { borderColor: `${theme.accent}59` }]} pointerEvents="none">
            <Text style={[styles.chipText, { color: theme.accent }, arabic && styles.arabicChip]} maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={2}>
              {chip}
            </Text>
          </View>
        ) : <View pointerEvents="none" />}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('Open the calendar', 'Ouvrir le calendrier', 'افتح التقويم')}
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
                <Text style={[styles.pillText, { color: theme.accent }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{tr('All of Holy Week', 'Toute la Semaine sainte', 'أسبوع الآلام')}</Text>
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
                <Text style={[styles.pillText, { color: theme.accent }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{tr('Back to today', 'Revenir à aujourd’hui', 'العودة إلى اليوم')}</Text>
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
  chipText: { fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '700', letterSpacing: 0.2, lineHeight: 15 },
  arabicChip: { fontFamily: TYPOGRAPHY.arabic, fontSize: 12.5, letterSpacing: 0, lineHeight: 19 },
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
