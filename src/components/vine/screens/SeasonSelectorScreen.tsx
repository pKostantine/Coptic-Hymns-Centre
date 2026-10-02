'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import Icon from '@/components/vine/ui/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageGlow } from '@/components/vine/screens/BookPage';
import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import SubPageHeader from '@/components/vine/ui/SubPageHeader';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { getEventFormalName, getSeasonFormalName } from '@/constants/seasonNames';
import { useBottomChrome } from '@/context/BottomChromeContext';
import { useCalendar } from '@/context/CalendarContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import {
  getCopticDatesBetween,
  getCopticYearForDate,
  getGregorianRangeForCopticYear,
  getSeasonRanges,
  getSingleDayEventsForCopticYear,
  type CopticDate,
} from '@/utils/calendarService';
import { localDateAtUtcMidnight, todayIsoDate } from '@/utils/dateUtils';
import {
  formatCopticDayMonth,
  formatCopticYear,
  formatGregorianDate,
  formatGregorianDateRange,
} from '@/utils/localeFormat';
import { goBack } from '@/utils/navigation';
import { useLayoutMode } from '@/utils/useLayoutMode';
import { DISABLED_TEXT_SELECTION_STYLE } from '@/utils/textSelection';

import { tr } from '../../../utils/appText';

interface ChildRow {
  key: string;
  title: string;
  arabic: string;
  date: string;
}

interface SeasonRow {
  type: 'season';
  key: string;
  title: string;
  arabic: string;
  startDate: string;
  endDate: string;
  children: ChildRow[];
}

interface DayRow {
  type: 'day';
  key: string;
  title: string;
  arabic: string;
  date: string;
}

type TopRow = SeasonRow | DayRow;

function rowStart(row: TopRow) {
  return row.type === 'season' ? row.startDate : row.date;
}
function rowEnd(row: TopRow) {
  return row.type === 'season' ? row.endDate : row.date;
}

interface SeasonSelectorScreenProps {
  /** Set when this screen is rendered inside a modal rather than as its own route (see DocumentModal) — returns to whatever the host was showing instead of popping the navigation stack. */
  onClose?: () => void;
}

/**
 * The year's seasons and feasts (Coptic Vine design system, "SeasonList"):
 * single-day feasts on green cards, each with its Gregorian and Coptic date;
 * the multi-day seasons on gold cards with their span, their own feasts
 * hanging off a gold rail beneath; a red LIVE rule where today falls, and the
 * season or feast today falls in (or the next to come) raised. The year is
 * changed from a bar floating at the foot of the list. Choosing a row moves
 * the whole app to that day.
 */
export default function SeasonSelectorScreen({ onClose }: SeasonSelectorScreenProps) {
  const router = useRouter();
  const isHosted = Boolean(onClose);
  const closeScreen = () => (onClose ? onClose() : goBack(router, '/books'));
  const { selectDate } = useCalendar();
  const { preferences } = useReadingPreferences();
  const insets = useSafeAreaInsets();
  // The bar sits at the very bottom, so it has to ride above the now-playing
  // bar when one is up rather than hide under it.
  const { nowPlayingInset } = useBottomChrome();
  // On the iPad and desktop the list keeps a centred column, the year bar beneath it.
  const wide = useLayoutMode() !== 'phone';
  const isArabic = preferences.appLanguage === 'ar';
  const appLanguage = preferences.appLanguage;
  const [year, setYear] = useState<number | null>(null);
  const [currentCopticYear, setCurrentCopticYear] = useState<number | null>(null);
  const [rows, setRows] = useState<TopRow[] | null>(null);
  const [copticDates, setCopticDates] = useState<Map<string, CopticDate>>(new Map());
  const [yearRange, setYearRange] = useState<{ startDate: string; endDate: string } | null>(null);

  useEffect(() => {
    // Real "today" in the device's own calendar day, not whatever date is
    // selected elsewhere in the app — this seeds which Coptic year to show.
    getCopticYearForDate(localDateAtUtcMidnight(new Date())).then((y) => {
      setCurrentCopticYear(y);
      setYear(y);
    });
  }, []);

  useEffect(() => {
    if (year === null) return;
    let cancelled = false;
    setRows(null);
    setYearRange(null);

    getGregorianRangeForCopticYear(year).then(async ({ startDate, endDate }) => {
      if (cancelled || !startDate || !endDate) return;
      const [periods, dates] = await Promise.all([
        getSeasonRanges(startDate, endDate),
        getCopticDatesBetween(startDate, endDate).catch(() => new Map<string, CopticDate>()),
      ]);
      const singleDayEvents = await getSingleDayEventsForCopticYear(year, periods);
      if (cancelled) return;

      const seasonRows: SeasonRow[] = periods
        .filter((row) => row.startDate >= startDate && row.startDate < endDate)
        .map((row) => {
          const formal = getSeasonFormalName(row.rangeKey, row.activeSeason);
          return {
            type: 'season',
            key: row.rangeKey,
            // Shown whenever the Arabic isn't: French in French.
            title: tr(formal.english, formal.french || formal.english, formal.english),
            arabic: formal.arabic,
            startDate: row.startDate,
            endDate: row.endDate,
            children: [],
          };
        });

      const looseDays: DayRow[] = [];
      for (const event of singleDayEvents.filter((e) => e.date >= startDate && e.date < endDate)) {
        // A day that exactly completes a season (its endDate) belongs to that
        // season, even if it also happens to be the next season's startDate
        // (e.g. Resurrection ends Holy Week and begins Holy 50 Days).
        const assigned =
          seasonRows.find((s) => event.date === s.endDate) ||
          seasonRows.find((s) => event.date > s.startDate && event.date < s.endDate) ||
          seasonRows.find((s) => event.date === s.startDate);

        const formal = getEventFormalName(event.key, event.title);
        const title = tr(formal.english, formal.french || formal.english, formal.english);
        if (assigned) {
          assigned.children.push({ key: event.key, title, arabic: formal.arabic, date: event.date });
        } else {
          looseDays.push({ type: 'day', key: event.key, title, arabic: formal.arabic, date: event.date });
        }
      }
      seasonRows.forEach((s) => s.children.sort((a, b) => a.date.localeCompare(b.date)));

      const merged: TopRow[] = [...seasonRows, ...looseDays].sort(
        (a, b) => rowStart(a).localeCompare(rowStart(b)) || rowEnd(a).localeCompare(rowEnd(b)),
      );

      setRows(merged);
      setCopticDates(dates);
      setYearRange({ startDate, endDate });
    });

    return () => {
      cancelled = true;
    };
  }, [year, isArabic, appLanguage]);

  const todayIso = todayIsoDate();
  const todayInViewedYear = Boolean(yearRange && todayIso >= yearRange.startDate && todayIso < yearRange.endDate);

  // Where the "Live · Today" rule goes: before the row (or nested feast) that
  // is today, before the season today falls in, or after the last row already
  // past.
  const { liveTopKey, liveChildKey, lineAfterKey } = useMemo(() => {
    if (!rows || !todayInViewedYear) {
      return { liveTopKey: null as string | null, liveChildKey: null as string | null, lineAfterKey: null as string | null };
    }

    for (const row of rows) {
      if (row.type === 'season') {
        const child = row.children.find((c) => c.date === todayIso);
        if (child) return { liveTopKey: null, liveChildKey: child.key, lineAfterKey: null };
        if (todayIso >= row.startDate && todayIso <= row.endDate) {
          return { liveTopKey: row.key, liveChildKey: null, lineAfterKey: null };
        }
      } else if (row.date === todayIso) {
        return { liveTopKey: row.key, liveChildKey: null, lineAfterKey: null };
      }
    }

    const before = [...rows].filter((row) => rowEnd(row) < todayIso).sort((a, b) => rowEnd(a).localeCompare(rowEnd(b))).pop();
    return { liveTopKey: null, liveChildKey: null, lineAfterKey: before?.key ?? '__start__' };
  }, [rows, todayInViewedYear, todayIso]);

  // The row raised: the season or feast today falls in, or failing that the
  // next one to come, just after the Live rule.
  const raisedKey = useMemo(() => {
    if (!rows || !todayInViewedYear) return null;
    if (liveTopKey) return liveTopKey;
    if (liveChildKey) return null;
    return rows.find((row) => rowStart(row) > todayIso)?.key ?? null;
  }, [rows, todayInViewedYear, liveTopKey, liveChildKey, todayIso]);

  function selectDay(date: string) {
    selectDate(new Date(`${date}T00:00:00Z`));
    closeScreen();
  }

  const copticSubtitle = (date: string) => {
    const coptic = copticDates.get(date);
    return coptic ? formatCopticDayMonth(coptic.monthName, coptic.day, isArabic) : '';
  };
  const liveBar = <LiveBar isArabic={isArabic} />;
  const title = tr('Seasons', 'Temps liturgiques', 'الفترات');

  /** "Sep 27, 2026 · Tout 17": a feast's day in both calendars. */
  const dayLine = (date: string) => [formatGregorianDate(date, isArabic), copticSubtitle(date)].filter(Boolean).join(' · ');

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.screen, DISABLED_TEXT_SELECTION_STYLE]}>
      {/* Hosted over a document (DocumentModal) it's an overlay, not a page of its own. */}
      {isHosted ? null : (
        <Head>
          <title>{`Coptic Vine ${title}`}</title>
        </Head>
      )}
      {wide ? <PageGlow kind="green" tall /> : null}
      <View style={[styles.frame, wide && styles.frameWide]}>
        <SubPageHeader title={title} arabic={isArabic} onBack={closeScreen} backLabel={tr('Close the seasons', 'Fermer les temps liturgiques', 'أغلق الفترات')} />

        {year === null || !rows ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
        ) : (
          <NowPlayingAwareScrollView contentContainerStyle={[styles.list, { paddingBottom: YEAR_BAR_CLEARANCE + insets.bottom }]} showsVerticalScrollIndicator={false}>
            {lineAfterKey === '__start__' ? liveBar : null}
            {rows.map((row) => (
              <Fragment key={row.key}>
                {liveTopKey === row.key ? liveBar : null}
                <SeasonCard
                  title={isArabic ? row.arabic || row.title : row.title}
                  subtitle={row.type === 'season' ? formatGregorianDateRange(row.startDate, row.endDate, isArabic) : dayLine(row.date)}
                  kind={row.type === 'season' ? 'season' : 'day'}
                  current={raisedKey === row.key}
                  isArabic={isArabic}
                  onPress={() => selectDay(rowStart(row))}
                />
                {row.type === 'season' && row.children.length ? (
                  <View style={[styles.nest, isArabic && styles.nestArabic]}>
                    {row.children.map((child) => (
                      <Fragment key={child.key}>
                        {liveChildKey === child.key ? liveBar : null}
                        <SeasonCard
                          title={isArabic ? child.arabic || child.title : child.title}
                          subtitle={formatGregorianDate(child.date, isArabic)}
                          kind="nested"
                          isArabic={isArabic}
                          onPress={() => selectDay(child.date)}
                        />
                      </Fragment>
                    ))}
                  </View>
                ) : null}
                {lineAfterKey === row.key ? liveBar : null}
              </Fragment>
            ))}
          </NowPlayingAwareScrollView>
        )}
      </View>

      {year !== null ? (
        <View style={[
          styles.yearBar,
          wide ? styles.yearBarWide : null,
          { bottom: (wide ? 12 : 12 + insets.bottom) + nowPlayingInset },
          isArabic && styles.rowReverse,
        ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('Previous year', 'Année précédente', 'السنة السابقة')}
            style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
            onPress={() => setYear((y) => (y ?? 0) - 1)}
          >
            <Icon name={isArabic ? 'chevron-forward' : 'chevron-back'} size={17} color={COLORS.gold} />
          </Pressable>
          <View style={[styles.yearLabel, isArabic && styles.rowReverse]}>
            {year === currentCopticYear ? <View style={styles.yearDot} /> : null}
            <Text style={[styles.yearText, isArabic && styles.arabicText]}>{formatCopticYear(year, isArabic)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('Next year', 'Année suivante', 'السنة التالية')}
            style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
            onPress={() => setYear((y) => (y ?? 0) + 1)}
          >
            <Icon name={isArabic ? 'chevron-back' : 'chevron-forward'} size={17} color={COLORS.gold} />
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/**
 * Room under the list for the floating year bar: its height and the gap
 * beneath it. There is no tab bar on this screen, so the bar sits close to the
 * window's edge rather than where one would have been.
 */
const YEAR_BAR_CLEARANCE = 60 + 12 + 20;

/** Each kind of card's fill: single days green, seasons gold, a season's own feasts a quieter green. */
const CARD_FILLS = {
  day: { colors: ['#173A1F', '#0D2213'], locations: [0, 1] },
  dayCurrent: { colors: [COLORS.greenGlow, '#1F4A26', COLORS.greenDeep], locations: [0, 0.55, 1] },
  season: { colors: ['#F0C74E', '#D6A52C', '#A87C17'], locations: [0, 0.6, 1] },
  nested: { colors: ['#12301A', COLORS.surface], locations: [0, 1] },
} as const;

function SeasonCard({
  title,
  subtitle,
  kind,
  current = false,
  isArabic,
  onPress,
}: {
  title: string;
  subtitle: string;
  kind: 'day' | 'season' | 'nested';
  current?: boolean;
  isArabic: boolean;
  onPress: () => void;
}) {
  const gold = kind === 'season';
  const fill = gold ? CARD_FILLS.season : kind === 'nested' ? CARD_FILLS.nested : current ? CARD_FILLS.dayCurrent : CARD_FILLS.day;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        kind === 'nested' && styles.cardNested,
        current && styles.cardCurrent,
        current && (gold ? styles.glowGold : styles.glowGreen),
        isArabic && styles.rowReverse,
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient colors={fill.colors} locations={fill.locations} start={{ x: 0.33, y: 0 }} end={{ x: 0.67, y: 1 }} style={[StyleSheet.absoluteFill, styles.cardFill]} pointerEvents="none" />
      <View style={styles.text}>
        <Text style={[styles.title, kind === 'nested' && styles.titleNested, current && styles.titleCurrent, gold && styles.onGold, isArabic && styles.arabicText]}>
          {title}
        </Text>
        <Text style={[styles.subtitle, kind === 'nested' && styles.subtitleNested, current && !gold && styles.subtitleCurrent, gold && styles.subtitleOnGold, isArabic && styles.arabicText]}>
          {subtitle}
        </Text>
      </View>
      {/* Wrapped so it stacks above the gradient on web, where a bare SVG paints beneath positioned siblings. */}
      <View><Icon name={isArabic ? 'chevron-back' : 'chevron-forward'} size={17} color={gold ? COLORS.greenDeep : COLORS.gold} /></View>
    </Pressable>
  );
}

function LiveBar({ isArabic }: { isArabic: boolean }) {
  return (
    <View style={[styles.liveBar, isArabic && styles.rowReverse]} accessibilityRole="text">
      <View style={styles.liveDotHalo}>
        <View style={styles.liveDot} />
      </View>
      <Text style={[styles.liveText, isArabic && styles.arabicSmall]}>{tr('LIVE', 'EN DIRECT', 'الآن')}</Text>
      <View style={styles.liveLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.black },
  frame: { flex: 1 },
  // The design's 720pt column, with the list's own 16pt gutters either side.
  frameWide: { alignSelf: 'center', maxWidth: 752, paddingTop: 22, width: '100%' },
  yearBarWide: { left: '50%', marginLeft: -260, right: undefined, width: 520 },
  rowReverse: { flexDirection: 'row-reverse' },
  list: { gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  card: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  cardFill: { borderRadius: 16 },
  cardNested: { paddingVertical: 10 },
  cardCurrent: { padding: 16 },
  glowGold: { boxShadow: '0px 10px 28px rgba(227, 181, 59, 0.3)' },
  glowGreen: { boxShadow: '0px 10px 28px rgba(58, 122, 63, 0.35)' },
  pressed: { opacity: 0.82 },
  text: { flex: 1, minWidth: 0 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 16, fontWeight: '600' },
  titleNested: { fontSize: 15 },
  titleCurrent: { fontFamily: TYPOGRAPHY.title, fontSize: 20, fontWeight: '700' },
  onGold: { color: COLORS.greenDeep },
  subtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: 3 },
  subtitleNested: { fontSize: 12.5 },
  subtitleCurrent: { color: COLORS.goldBright },
  subtitleOnGold: { color: '#2B4A1F' },
  // A season's own feasts hang off a solid gold rail.
  nest: { borderLeftColor: COLORS.gold, borderLeftWidth: 2, gap: 8, marginLeft: 10, paddingLeft: 18 },
  nestArabic: { borderLeftWidth: 0, borderRightColor: COLORS.gold, borderRightWidth: 2, marginLeft: 0, marginRight: 10, paddingLeft: 0, paddingRight: 18 },
  liveBar: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 6 },
  liveDotHalo: { alignItems: 'center', backgroundColor: 'rgba(214, 69, 69, 0.2)', borderRadius: 8, height: 16, justifyContent: 'center', width: 16 },
  liveDot: { backgroundColor: COLORS.priest, borderRadius: 4, height: 8, width: 8 },
  liveText: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  liveLine: { backgroundColor: COLORS.priest, flex: 1, height: 1, opacity: 0.6 },
  // Floats over the foot of the list (nearly opaque, as the design's blurred bar reads).
  yearBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(11, 28, 16, 0.92)',
    borderRadius: 22,
    boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.55)',
    flexDirection: 'row',
    height: 60,
    justifyContent: 'space-between',
    left: 16,
    paddingHorizontal: 10,
    position: 'absolute',
    right: 16,
  },
  arrow: { alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.06)', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  yearLabel: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  yearDot: { backgroundColor: COLORS.priest, borderRadius: 4, height: 8, width: 8 },
  yearText: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 24, fontWeight: '700' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  arabicSmall: { fontFamily: TYPOGRAPHY.arabic, letterSpacing: 0 },
});
