'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import Icon from '@/components/chc/ui/Icon';
import { CrownOrnament, VineDivider } from '@/components/chc/ui/Ornaments';
import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import { getSeasonIndicatorFullName } from '@/constants/seasonNames';
import { COLORS, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { homeService, type HomeSynaxariumEvent } from '@/services/homeService';
import { getCopticDate, getDayOverview, type CopticDate } from '@/utils/calendarService';
import { localDateAtUtcMidnight } from '@/utils/dateUtils';
import { formatCopticDayMonth, formatDayMonthDate } from '@/utils/localeFormat';
import { agpeyaHourAt } from '@/utils/agpeyaHours';
import { getSundayMessageForDate } from '@/utils/readingsService';

import { tr } from '../../../utils/appText';

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** This Sunday's message on a Sunday morning and from Saturday evening; otherwise last Sunday's. */
function sundayForHome(rawDate: Date, period: 'morning' | 'evening') {
  const weekday = rawDate.getUTCDay();
  if (weekday === 6 && period === 'evening') return { date: addUtcDays(rawDate, 1), relation: 'this' as const };
  if (weekday === 0) return { date: rawDate, relation: period === 'morning' ? 'this' as const : 'last' as const };
  return { date: addUtcDays(rawDate, -weekday), relation: 'last' as const };
}

/**
 * "The Departure of Pope Athanasius the Second, the Twenty-Eighth Patriarch…"
 * reads as the saint, then who he was: the design sets the second part on its
 * own line, smaller. Only an English title with such a clause is split.
 */
function splitSaintTitle(title: string): { main: string; detail: string | null } {
  const match = /^(.+?), the (.+)$/.exec(title);
  if (!match) return { main: title, detail: null };
  return { main: match[1], detail: match[2].charAt(0).toUpperCase() + match[2].slice(1) };
}

/**
 * Home (Coptic Vine design system, "HomeHero"): the seal on a green glow with the day beneath it,
 * the Agpeya hour to pray now, the Sunday message under a gold crown, and the
 * saints of today and tomorrow. Home always shows the live day, whatever date
 * the Books screen has been moved to.
 */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preferences } = useReadingPreferences();
  const [now, setNow] = useState(() => new Date());
  const arabic = preferences.appLanguage === 'ar';

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Stable within a day, so the cards don't re-query every minute the clock ticks.
  const liveIso = isoDate(localDateAtUtcMidnight(now));
  const liveDate = useMemo(() => new Date(`${liveIso}T00:00:00Z`), [liveIso]);
  const livePeriod = now.getHours() >= 17 ? 'evening' as const : 'morning' as const;
  const sunday = useMemo(() => sundayForHome(liveDate, livePeriod), [liveDate, livePeriod]);
  const sundayIso = isoDate(sunday.date);
  const tomorrow = useMemo(() => addUtcDays(liveDate, 1), [liveDate]);
  const hour = agpeyaHourAt(now.getHours());

  const [coptic, setCoptic] = useState<CopticDate | null>(null);
  const [sundayMessage, setSundayMessage] = useState<string | null>(null);
  const [sundayName, setSundayName] = useState<string | null>(null);
  const [sundayLoading, setSundayLoading] = useState(true);
  const [synaxDay, setSynaxDay] = useState<'today' | 'tomorrow'>('today');
  const [todayEvents, setTodayEvents] = useState<HomeSynaxariumEvent[]>([]);
  const [tomorrowEvents, setTomorrowEvents] = useState<HomeSynaxariumEvent[]>([]);
  const [synaxLoading, setSynaxLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void getCopticDate(liveDate).then((value) => { if (active) setCoptic(value); });
    return () => { active = false; };
  }, [liveDate]);

  useEffect(() => {
    let active = true;
    setSundayLoading(true);
    getSundayMessageForDate(sunday.date)
      .then((message) => { if (active) setSundayMessage(message); })
      .catch(() => { if (active) setSundayMessage(null); })
      .finally(() => { if (active) setSundayLoading(false); });
    void getDayOverview(sundayIso).then((overview) => {
      if (active) setSundayName(overview?.indicatorKey ? getSeasonIndicatorFullName(overview.indicatorKey) : null);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the Sunday's date, not the Date instance
  }, [sundayIso]);

  useEffect(() => {
    let active = true;
    setSynaxLoading(true);
    Promise.all([homeService.getSynaxariumEvents(liveIso), homeService.getSynaxariumEvents(isoDate(tomorrow))])
      .then(([today, next]) => {
        if (!active) return;
        setTodayEvents(today);
        setTomorrowEvents(next);
      })
      .catch(() => {
        if (!active) return;
        setTodayEvents([]);
        setTomorrowEvents([]);
      })
      .finally(() => { if (active) setSynaxLoading(false); });
    return () => { active = false; };
  }, [liveIso, tomorrow]);

  const sundayTitle = sunday.relation === 'this'
    ? tr("This Sunday's Message", 'Message de ce dimanche', 'رسالة هذا الأحد')
    : tr("Last Sunday's Message", 'Message de dimanche dernier', 'رسالة الأحد الماضي');
  const sundayDate = formatDayMonthDate(sunday.date, arabic);
  const events = synaxDay === 'today' ? todayEvents : tomorrowEvents;

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head>
        <title>{tr('Coptic Vine', 'Coptic Vine', 'كوبتك فاين')}</title>
      </Head>

      <NowPlayingAwareScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <HeroGlow />
        <View style={styles.column}>
          <View style={[styles.hero, { paddingTop: insets.top + 30 }]}>
            <View style={styles.halo}>
              {/* The seal's shadow, cast by a circle the seal's own size behind
                  it. On the image itself it was clipped to the image's square
                  box on the web, which drew a dark square behind the logo. */}
              <View style={styles.sealShadow} pointerEvents="none" />
              <Image
                accessible
                accessibilityLabel="Coptic Vine"
                source={require('../../../../assets/images/coptic-vine-seal.png')}
                style={styles.logo}
              />
            </View>
            <Text style={[styles.tagline, arabic && styles.arabic]} maxFontSizeMultiplier={1.3}>
              {tr('Pray. Read. Learn.', 'Prier. Lire. Apprendre.', 'صلِّ. اقرأ. تعلّم.')}
            </Text>
            <Text style={[styles.heroDate, arabic && styles.arabic]} maxFontSizeMultiplier={1.3}>
              {formatDayMonthDate(liveDate, arabic)}
              {coptic ? <Text style={styles.heroCoptic}>{` · ${formatCopticDayMonth(coptic.monthName, coptic.day, arabic)}`}</Text> : null}
            </Text>
          </View>

          <View style={styles.heroDivider} pointerEvents="none">
            <VineDivider width={250} height={32} />
          </View>

          <View style={[styles.card, styles.pray, arabic && styles.rowReverse]}>
            <View style={styles.flex}>
              <Text style={[styles.prayKicker, arabic && styles.arabic]}>{tr('Pray now · Agpeya', 'Prier maintenant · Agpia', 'صلِّ الآن · الأجبية')}</Text>
              <Text style={[styles.prayTitle, arabic && styles.arabic]} numberOfLines={1}>{tr(hour.prayer.english, hour.prayer.french, hour.prayer.arabic)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${tr('Pray', 'Prier', 'صلِّ')}: ${tr(hour.prayer.english, hour.prayer.french, hour.prayer.arabic)}`}
              onPress={() => router.push(`/agpeya/${hour.id}` as never)}
              style={({ pressed }) => [styles.prayButton, arabic && styles.rowReverse, pressed && styles.pressed]}
            >
              <Icon name="play" size={16} color={COLORS.greenDeep} />
              <Text style={[styles.prayButtonText, arabic && styles.arabicTight]}>{tr('Pray', 'Prier', 'صلِّ')}</Text>
            </Pressable>
          </View>

          <View style={[styles.card, styles.message]}>
            <LinearGradient colors={['#173A1F', COLORS.greenDeep]} style={StyleSheet.absoluteFill} pointerEvents="none" />
            <View style={styles.crown} pointerEvents="none">
              <CrownOrnament width={300} height={58} />
            </View>
            <View style={styles.messageBody}>
              <Text style={[styles.messageKicker, arabic && styles.arabicTight]}>{sundayTitle}</Text>
              <Text style={[styles.messageTitle, arabic && styles.arabicCentered]}>{sundayName ?? sundayDate}</Text>
              {sundayName ? <Text style={[styles.messageDate, arabic && styles.arabicCentered]}>{sundayDate}</Text> : null}
              <Text style={[styles.messageText, arabic && styles.arabicCentered]}>
                {sundayLoading
                  ? tr('Loading message…', 'Chargement du message…', 'جارٍ تحميل الرسالة…')
                  : sundayMessage ?? tr('A message has not been added for this Sunday yet.', 'Aucun message n’a encore été ajouté pour ce dimanche.', 'لم تتم إضافة رسالة لهذا الأحد بعد.')}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={[styles.synaxHeader, arabic && styles.rowReverse]}>
              <View style={styles.flex}>
                <Text style={[styles.synaxTitle, arabic && styles.arabic]}>{tr('Synaxarium', 'Synaxaire', 'السنكسار')}</Text>
                <Text style={[styles.synaxSubtitle, arabic && styles.arabic]}>{tr('Saints commemorated', 'Saints commémorés', 'تذكارات القديسين')}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr('Search the Synaxarium', 'Rechercher dans le Synaxaire', 'ابحث في السنكسار')}
                onPress={() => router.push('/synaxarium')}
                style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
              >
                <Icon name="search-outline" size={20} color={COLORS.gold} />
              </Pressable>
            </View>

            <View style={[styles.segment, arabic && styles.rowReverse]}>
              {(['today', 'tomorrow'] as const).map((option) => {
                const active = synaxDay === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSynaxDay(option)}
                    style={[styles.segmentOption, active && styles.segmentOptionActive]}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive, arabic && styles.arabicTight]}>
                      {option === 'today' ? tr('Today', 'Aujourd’hui', 'اليوم') : tr('Tomorrow', 'Demain', 'غدًا')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.saints}>
              {synaxLoading ? (
                <Text style={[styles.empty, arabic && styles.arabic]}>{tr('Loading…', 'Chargement…', 'جارٍ التحميل…')}</Text>
              ) : events.length ? (
                events.map((event, index) => {
                  const title = arabic ? event.titleArabic || event.titleEnglish || '' : event.titleEnglish || event.titleArabic || '';
                  const { main, detail } = arabic || preferences.appLanguage === 'fr' ? { main: title, detail: null } : splitSaintTitle(title);
                  return (
                    <View key={event.entryKey} style={[styles.saint, index === events.length - 1 && styles.saintLast, arabic && styles.rowReverse]}>
                      <View style={styles.saintDot} />
                      <View style={styles.flex}>
                        <Text style={[styles.saintName, arabic && styles.arabic]}>{main}</Text>
                        {detail ? <Text style={styles.saintDetail}>{detail}</Text> : null}
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={[styles.empty, arabic && styles.arabic]}>{tr('No saints listed.', 'Aucun saint indiqué.', 'لا توجد تذكارات مدرجة.')}</Text>
              )}
            </View>
          </View>
        </View>
      </NowPlayingAwareScrollView>

      <BottomTabBar active="home" />
    </SafeAreaView>
  );
}

/** The green glow behind the seal: a radial light over a green-to-black fall. */
function HeroGlow() {
  return (
    <View style={styles.glow} pointerEvents="none">
      <LinearGradient colors={[COLORS.greenMid, COLORS.greenDeep, '#000000']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="homeGlow" cx="50%" cy="18%" rx="120%" ry="75%" fx="50%" fy="18%">
            <Stop offset="0" stopColor="#346E3A" stopOpacity="0.85" />
            <Stop offset="0.28" stopColor="#224C28" stopOpacity="0.7" />
            <Stop offset="0.55" stopColor="#14301B" stopOpacity="0.45" />
            <Stop offset="0.85" stopColor="#000000" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#homeGlow)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { paddingBottom: 28 },
  column: { alignSelf: 'center', maxWidth: 640, width: '100%' },
  flex: { flex: 1, minWidth: 0 },
  rowReverse: { flexDirection: 'row-reverse' },
  glow: { height: 560, left: 0, position: 'absolute', right: 0, top: 0 },
  hero: { alignItems: 'center', paddingHorizontal: 24 },
  halo: { alignItems: 'center', height: 212, justifyContent: 'center', width: 212 },
  logo: { height: 188, resizeMode: 'contain', width: 188 },
  // The seal fills 184 of its 188 points inside a gold rim; the shadow circle
  // hides behind it, in the seal's own deep green.
  sealShadow: {
    backgroundColor: '#14301A',
    borderRadius: 92,
    boxShadow: '0px 16px 30px rgba(0, 0, 0, 0.55)',
    height: 184,
    position: 'absolute',
    width: 184,
  },
  tagline: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 24, fontWeight: '700', marginTop: 26, textAlign: 'center' },
  heroDate: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 15, marginTop: 8, textAlign: 'center' },
  heroCoptic: { color: COLORS.goldBright, fontWeight: '600' },
  heroDivider: { alignItems: 'center', marginBottom: 22, marginTop: 20 },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  pray: { alignItems: 'center', flexDirection: 'row', gap: 14, paddingBottom: 14, paddingLeft: 18, paddingRight: 14, paddingTop: 14 },
  prayKicker: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12 },
  prayTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 19, fontWeight: '700', marginTop: 2 },
  prayButton: {
    alignItems: 'center',
    backgroundColor: COLORS.gold,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  prayButtonText: { color: COLORS.greenDeep, fontFamily: TYPOGRAPHY.title, fontSize: 15, fontWeight: '700' },
  message: { borderColor: 'rgba(227, 181, 59, 0.3)' },
  crown: { alignItems: 'center', left: 8, opacity: 0.85, position: 'absolute', right: 8, top: 8 },
  messageBody: { alignItems: 'center', paddingBottom: 22, paddingHorizontal: 22, paddingTop: 44 },
  messageKicker: { color: COLORS.gold, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '700', letterSpacing: 1.7, textAlign: 'center', textTransform: 'uppercase' },
  messageTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 25, fontWeight: '700', lineHeight: 30, marginTop: 10, textAlign: 'center' },
  messageDate: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: 6, textAlign: 'center' },
  messageText: { color: '#DFE6EC', fontFamily: TYPOGRAPHY.body, fontSize: 15, lineHeight: 24, marginTop: 14, textAlign: 'center' },
  synaxHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingTop: 18 },
  synaxTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
  synaxSubtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: 2 },
  roundButton: { alignItems: 'center', borderColor: COLORS.goldLine, borderRadius: 20, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  segment: {
    backgroundColor: COLORS.black,
    borderColor: COLORS.border,
    borderRadius: 99,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
    marginHorizontal: 18,
    marginTop: 14,
    padding: 4,
  },
  segmentOption: { alignItems: 'center', borderRadius: 99, flex: 1, paddingVertical: 8 },
  segmentOptionActive: { backgroundColor: COLORS.gold },
  segmentText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: COLORS.greenDeep },
  saints: { paddingBottom: 8, paddingHorizontal: 18, paddingTop: 2 },
  saint: { borderBottomColor: 'rgba(255, 255, 255, 0.07)', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingVertical: 13 },
  saintLast: { borderBottomWidth: 0 },
  saintDot: { backgroundColor: COLORS.gold, borderRadius: 3, height: 6, marginTop: 8, width: 6 },
  saintName: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 16, lineHeight: 22 },
  saintDetail: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: 2 },
  empty: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, paddingVertical: 13 },
  pressed: { opacity: 0.7 },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  arabicCentered: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
  arabicTight: { fontFamily: TYPOGRAPHY.arabic, letterSpacing: 0 },
});
