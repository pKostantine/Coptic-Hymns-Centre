import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import AppHeader from '../ui/AppHeader';
import Icon from '../ui/Icon';
import { CopticCross } from './HolyWeekMenu';
import { bookmarkKeyFor, HOLY_WEEK_ROWS, holyWeekHourHref, type HolyWeekDayDef, type HolyWeekHourDef } from '../../../constants/manifest';
import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';
import { formatLongDate, formatMonthDay, holyWeekRowDate, loadHourGospelSummaries, toArabicDigits, weekdayName, type HourGospelSummary } from '../../../utils/holyWeek';
import { goBack } from '../../../utils/navigation';
import { useHolyWeekSchedule } from '../../../utils/useHolyWeekSchedule';

const MAX_FONT_SCALE = 1.3;

/** The line under the day's title: when it is prayed. An eve belongs to the evening before its day. */
function whenLine(day: HolyWeekDayDef, rowIndex: number, palmSunday: Date | null, arabic: boolean): string {
  const eve = day.id.endsWith('-eve');
  if (palmSunday) {
    const date = holyWeekRowDate(palmSunday, rowIndex);
    if (!eve) return formatLongDate(date, arabic);
    return arabic ? `مساء ${formatLongDate(date, true)}` : `${weekdayName(rowIndex, false)} evening · ${formatMonthDay(date)}`;
  }
  if (!eve) return weekdayName(rowIndex, arabic);
  return arabic ? `مساء ${weekdayName(rowIndex, true)}` : `${weekdayName(rowIndex, false)} evening`;
}

interface HourRowProps {
  hour: HolyWeekHourDef;
  accent: string;
  accentSoft: string;
  accentLine: string;
  isArabic: boolean;
  isBookmarked: boolean;
  gospel?: HourGospelSummary;
  onPress: () => void;
}

function HourRow({ hour, accent, accentSoft, accentLine, isArabic, isBookmarked, gospel, onPress }: HourRowProps) {
  const subtitle = gospel ? (isArabic ? gospel.arabic : gospel.english) : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${isArabic ? hour.shortArabic : hour.shortTitle}${subtitle ? `, ${subtitle}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.hourRow, isArabic && styles.rowReverse, pressed && styles.hourRowPressed]}
    >
      <View style={styles.rail}>
        <View style={[styles.badge, { backgroundColor: accentSoft, borderColor: accentLine }]}>
          {hour.hourNumber ? (
            <Text style={[styles.badgeText, { color: accent }]} maxFontSizeMultiplier={1.15}>
              {isArabic ? toArabicDigits(hour.hourNumber) : hour.hourNumber}
            </Text>
          ) : (
            <CopticCross size={18} color={accent} />
          )}
        </View>
      </View>

      <View style={styles.hourText}>
        <Text style={[styles.hourTitle, isArabic && styles.arabicTitle]} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {isArabic ? hour.shortArabic : hour.shortTitle}
        </Text>
        {subtitle ? (
          <Text style={[styles.hourSubtitle, isArabic && styles.arabicText]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {isBookmarked ? <Icon name="bookmark" size={16} color={COLORS.gold} /> : null}
      <Icon name={isArabic ? 'chevron-back' : 'chevron-forward'} size={18} color={accent} style={styles.hourChevron} />
    </Pressable>
  );
}

/** One Holy Week day or eve: its hours in prayer order, each with the Gospel it reads. */
export default function HolyWeekDay({ day }: { day: HolyWeekDayDef }) {
  const router = useRouter();
  const { preferences, isBookmarked } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const schedule = useHolyWeekSchedule();
  const [gospels, setGospels] = useState<Record<string, HourGospelSummary>>({});

  const eve = day.id.endsWith('-eve');
  const accent = eve ? COLORS.night : COLORS.gold;
  const accentSoft = eve ? COLORS.nightSoft : COLORS.goldSoft;
  const accentLine = eve ? COLORS.nightLine : COLORS.goldLine;
  const rowIndex = Math.max(0, HOLY_WEEK_ROWS.findIndex((row) => row.days.some((entry) => entry.id === day.id)));
  const isCurrent = schedule?.currentDayId === day.id;
  const hourKeys = day.hours.map((hour) => hour.id).join(',');

  useEffect(() => {
    let active = true;
    loadHourGospelSummaries(hourKeys.split(','))
      .then((next) => { if (active) setGospels(next); })
      // The Gospel lines are a preview; the hours open fine without them.
      .catch(() => undefined);
    return () => { active = false; };
  }, [hourKeys]);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>{`CHC ${day.title}`}</title>
      </Head>
      <AppHeader
        title={{ english: day.title, arabic: day.arabic }}
        canGoBack
        onBack={() => goBack(router, '/holy-week')}
        visibleLanguages={{ english: !isArabic, arabic: isArabic }}
      />
      <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <View style={[styles.intro, isArabic && styles.rowReverse]}>
            <View style={[styles.introIcon, { backgroundColor: accentSoft, borderColor: accentLine }]}>
              <Icon name={eve ? 'moon' : 'sunny'} size={22} color={accent} />
            </View>
            <View style={styles.introText}>
              <View style={[styles.introOverlineRow, isArabic && styles.rowReverse]}>
                <Text style={[styles.introOverline, { color: accent }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {eve ? (isArabic ? 'ليلة' : 'EVE') : (isArabic ? 'نهار' : 'DAY')}
                </Text>
                {isCurrent ? (
                  <View style={[styles.nowPill, { backgroundColor: accent }]}>
                    <Text style={styles.nowText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                      {eve ? (isArabic ? 'الليلة' : 'TONIGHT') : (isArabic ? 'اليوم' : 'TODAY')}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.introWhen, isArabic && styles.arabicText]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {whenLine(day, rowIndex, schedule?.palmSunday ?? null, isArabic)}
              </Text>
            </View>
          </View>

          <View style={[styles.card, { borderColor: eve ? COLORS.nightLine : COLORS.cardLine }, eve && styles.cardEve]}>
            {day.hours.map((hour, index) => (
              <View key={hour.id}>
                {index > 0 ? <View style={[styles.separator, isArabic ? styles.separatorArabic : null]} /> : null}
                <HourRow
                  hour={hour}
                  accent={accent}
                  accentSoft={accentSoft}
                  accentLine={accentLine}
                  isArabic={isArabic}
                  isBookmarked={isBookmarked(bookmarkKeyFor(hour.schema, hour.table, hour.id))}
                  gospel={gospels[hour.id]}
                  onPress={() => router.push(holyWeekHourHref(hour) as never)}
                />
              </View>
            ))}
          </View>
        </View>
      </NowPlayingAwareScrollView>
    </SafeAreaView>
  );
}

const RAIL_WIDTH = 44;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.xl * 2 },
  column: { alignSelf: 'center', maxWidth: 640, width: '100%' },
  rowReverse: { flexDirection: 'row-reverse' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  arabicTitle: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },

  intro: { alignItems: 'center', flexDirection: 'row', gap: 14, marginBottom: SPACING.md, paddingHorizontal: 4 },
  introIcon: { alignItems: 'center', borderRadius: 16, borderWidth: 1, height: 48, justifyContent: 'center', width: 48 },
  introText: { flex: 1 },
  introOverlineRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  introOverline: { fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  introWhen: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '700', marginTop: 3 },
  nowPill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  nowText: { color: COLORS.navyDark, fontFamily: TYPOGRAPHY.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },

  card: { backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  cardEve: { backgroundColor: COLORS.nightSurface },
  separator: { backgroundColor: 'rgba(255, 255, 255, 0.07)', height: StyleSheet.hairlineWidth, marginLeft: 14 + RAIL_WIDTH + 12 },
  separatorArabic: { marginLeft: 0, marginRight: 14 + RAIL_WIDTH + 12 },

  hourRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 72, paddingHorizontal: 14 },
  hourRowPressed: { backgroundColor: 'rgba(255, 255, 255, 0.04)' },
  rail: { alignItems: 'center', justifyContent: 'center', width: RAIL_WIDTH },
  badge: { alignItems: 'center', borderRadius: 20, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  badgeText: { fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '700' },
  hourText: { flex: 1, paddingVertical: 12 },
  hourTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '700' },
  hourSubtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: 3 },
  hourChevron: { opacity: 0.85 },
});
