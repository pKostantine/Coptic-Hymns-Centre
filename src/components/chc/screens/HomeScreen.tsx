import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import Icon from '@/components/chc/ui/Icon';
import MusicArtwork from '@/components/music/MusicArtwork';
import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { homeService, type HomeSynaxariumEvent } from '@/services/homeService';
import { getSundayMessageForDate } from '@/utils/readingsService';
import { musicService } from '@/services/musicService';
import type { MusicConsumerReleaseSummary } from '@/types/musicConsumer';
import { localDateAtUtcMidnight } from '@/utils/dateUtils';

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sundayForHome(rawDate: Date, period: 'morning' | 'evening') {
  const weekday = rawDate.getUTCDay();

  if (weekday === 6 && period === 'evening') {
    return { date: addUtcDays(rawDate, 1), relation: 'this' as const };
  }

  if (weekday === 0) {
    return {
      date: rawDate,
      relation: period === 'morning' ? 'this' as const : 'last' as const,
    };
  }

  return {
    date: addUtcDays(rawDate, -weekday),
    relation: 'last' as const,
  };
}

function formatDate(date: Date, locale: string) {
  return date.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { preferences } = useReadingPreferences();
  const [now, setNow] = useState(() => new Date());
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const wide = width >= 760;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Home is always live. Books can be pinned to another calendar date without
  // changing anything here. Keep the date object stable within a day so the
  // home cards do not re-query every minute just because the live clock ticks.
  const liveIso = isoDate(localDateAtUtcMidnight(now));
  const liveDate = useMemo(() => new Date(`${liveIso}T00:00:00Z`), [liveIso]);
  const livePeriod = now.getHours() >= 17 ? 'evening' as const : 'morning' as const;
  const sunday = useMemo(
    () => sundayForHome(liveDate, livePeriod),
    [liveDate, livePeriod],
  );
  const sundayIso = isoDate(sunday.date);
  const synaxToday = liveDate;
  const synaxTomorrow = useMemo(() => addUtcDays(liveDate, 1), [liveDate]);

  const [sundayMessage, setSundayMessage] = useState<string | null>(null);
  const [sundayLoading, setSundayLoading] = useState(true);
  const [todayEvents, setTodayEvents] = useState<HomeSynaxariumEvent[]>([]);
  const [tomorrowEvents, setTomorrowEvents] = useState<HomeSynaxariumEvent[]>([]);
  const [synaxLoading, setSynaxLoading] = useState(true);
  const [releases, setReleases] = useState<MusicConsumerReleaseSummary[]>([]);
  const [musicLoading, setMusicLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setSundayLoading(true);
    getSundayMessageForDate(sunday.date)
      .then((message) => { if (active) setSundayMessage(message); })
      .catch(() => { if (active) setSundayMessage(null); })
      .finally(() => { if (active) setSundayLoading(false); });
    return () => { active = false; };
  }, [sundayIso]);

  useEffect(() => {
    let active = true;
    setSynaxLoading(true);
    Promise.all([
      homeService.getSynaxariumEvents(isoDate(synaxToday)),
      homeService.getSynaxariumEvents(isoDate(synaxTomorrow)),
    ])
      .then(([today, tomorrow]) => {
        if (!active) return;
        setTodayEvents(today);
        setTomorrowEvents(tomorrow);
      })
      .catch(() => {
        if (!active) return;
        setTodayEvents([]);
        setTomorrowEvents([]);
      })
      .finally(() => { if (active) setSynaxLoading(false); });
    return () => { active = false; };
  }, [synaxToday, synaxTomorrow]);

  useEffect(() => {
    let active = true;
    setMusicLoading(true);
    musicService.getHome(locale)
      .then((payload) => {
        if (active) setReleases(payload.latestReleases.slice(0, 8));
      })
      .catch(() => { if (active) setReleases([]); })
      .finally(() => { if (active) setMusicLoading(false); });
    return () => { active = false; };
  }, [locale]);

  const sundayTitle = sunday.relation === 'this'
    ? (isArabic ? 'رسالة هذا الأحد' : "This Sunday's Message")
    : (isArabic ? 'رسالة الأحد الماضي' : "Last Sunday's Message");

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head>
        <title>{isArabic ? 'كوبتك هيمنز سنتر' : 'Coptic Hymns Centre'}</title>
      </Head>

      <AppHeader
        title={{ english: 'Coptic Hymns Centre', arabic: 'كوبتك هيمنز سنتر' }}
        visibleLanguages={{ english: !isArabic, arabic: isArabic }}
      />

      <NowPlayingAwareScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.intro}>
          <Text style={[styles.introEyebrow, isArabic && styles.arabic]}>
            {isArabic ? 'اليوم في الكنيسة' : 'TODAY IN THE CHURCH'}
          </Text>
          <Text style={[styles.introTitle, isArabic && styles.arabic]}>
            {isArabic ? 'صلِّ. اقرأ. استمع. تعلّم.' : 'Pray. Read. Listen. Learn.'}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <View style={styles.headingIcon}>
              <Icon name="book" size={19} color={COLORS.goldBright} />
            </View>
            <View style={styles.headingText}>
              <Text style={[styles.cardTitle, isArabic && styles.arabic]}>{sundayTitle}</Text>
              <Text style={[styles.cardSubtitle, isArabic && styles.arabic]}>
                {formatDate(sunday.date, locale)}
              </Text>
            </View>
          </View>

          <Text style={[styles.messageText, isArabic && styles.arabic]}>
            {sundayLoading
              ? (isArabic ? 'جارٍ تحميل الرسالة…' : 'Loading message…')
              : sundayMessage
                ? sundayMessage
                : (isArabic ? 'لم تتم إضافة رسالة لهذا الأحد بعد.' : 'A message has not been added for this Sunday yet.')}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <View style={styles.headingIcon}>
              <Icon name="calendar-outline" size={19} color={COLORS.goldBright} />
            </View>
            <View style={styles.headingText}>
              <Text style={[styles.cardTitle, isArabic && styles.arabic]}>
                {isArabic ? 'السنكسار' : 'Synaxarium'}
              </Text>
              <Text style={[styles.cardSubtitle, isArabic && styles.arabic]}>
                {isArabic ? 'اليوم وغداً' : 'Today and tomorrow'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isArabic ? 'بحث في السنكسار' : 'Search Synaxarium'}
              onPress={() => router.push('/synaxarium')}
              style={({ pressed }) => [styles.synaxSearchButton, pressed && styles.pressed]}
            >
              <Icon name="search-outline" size={17} color={COLORS.goldBright} />
              <Text style={[styles.synaxSearchText, isArabic && styles.arabic]}>
                {isArabic ? 'بحث' : 'Search'}
              </Text>
            </Pressable>
          </View>

          <View style={[styles.synaxColumns, wide && styles.synaxColumnsWide]}>
            <SynaxDay
              title={isArabic ? 'اليوم' : 'Today'}
              date={synaxToday}
              events={todayEvents}
              loading={synaxLoading}
              locale={locale}
            />
            <View style={wide ? styles.synaxDividerVertical : styles.synaxDividerHorizontal} />
            <SynaxDay
              title={isArabic ? 'غداً' : 'Tomorrow'}
              date={synaxTomorrow}
              events={tomorrowEvents}
              loading={synaxLoading}
              locale={locale}
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <View style={styles.headingIcon}>
              <Icon name="musical-notes" size={19} color={COLORS.goldBright} />
            </View>
            <View style={styles.headingText}>
              <Text style={[styles.cardTitle, isArabic && styles.arabic]}>
                {isArabic ? 'أحدث الإصدارات' : 'Latest Music Releases'}
              </Text>
              <Text style={[styles.cardSubtitle, isArabic && styles.arabic]}>
                {isArabic ? 'الجديد في CHC Music' : 'New on CHC Music'}
              </Text>
            </View>
            <Pressable onPress={() => router.push('/music')} style={styles.seeAllButton}>
              <Text style={[styles.seeAllText, isArabic && styles.arabic]}>{isArabic ? 'الكل' : 'See all'}</Text>
              <Icon name="chevron-forward" size={15} color={COLORS.goldBright} />
            </Pressable>
          </View>

          {musicLoading ? (
            <Text style={[styles.emptyText, isArabic && styles.arabic]}>
              {isArabic ? 'جارٍ تحميل الإصدارات…' : 'Loading releases…'}
            </Text>
          ) : releases.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.releaseRow}
            >
              {releases.map((release) => (
                <Pressable
                  key={release.id}
                  style={styles.releaseCard}
                  onPress={() => router.push(`/music/release/${release.id}`)}
                >
                  <MusicArtwork asset={release.coverAsset} size={144} label={release.title} />
                  <Text numberOfLines={1} style={[styles.releaseTitle, isArabic && styles.arabic]}>
                    {release.title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.releaseArtist, isArabic && styles.arabic]}>
                    {release.primaryArtist?.displayName ?? 'Coptic Hymns Centre'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={[styles.emptyText, isArabic && styles.arabic]}>
              {isArabic ? 'لا توجد إصدارات منشورة بعد.' : 'No published releases yet.'}
            </Text>
          )}
        </View>
      </NowPlayingAwareScrollView>

      <BottomTabBar active="home" />
    </SafeAreaView>
  );
}

function SynaxDay({
  title,
  date,
  events,
  loading,
  locale,
}: {
  title: string;
  date: Date;
  events: HomeSynaxariumEvent[];
  loading: boolean;
  locale: 'en' | 'ar';
}) {
  const isArabic = locale === 'ar';

  return (
    <View style={styles.synaxDay}>
      <Text style={[styles.synaxDayTitle, isArabic && styles.arabic]}>{title}</Text>
      <Text style={[styles.synaxDate, isArabic && styles.arabic]}>{formatDate(date, locale)}</Text>
      {loading ? (
        <Text style={[styles.emptyText, isArabic && styles.arabic]}>
          {isArabic ? 'جارٍ التحميل…' : 'Loading…'}
        </Text>
      ) : events.length ? (
        <View style={styles.eventList}>
          {events.map((event) => (
            <View key={event.entryKey} style={styles.eventRow}>
              <View style={styles.eventDot} />
              <Text style={[styles.eventText, isArabic && styles.arabic]}>
                {isArabic ? event.titleArabic || event.titleEnglish : event.titleEnglish || event.titleArabic}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.emptyText, isArabic && styles.arabic]}>
          {isArabic ? 'لا توجد أحداث مدرجة.' : 'No events listed.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { width: '100%', maxWidth: 1120, alignSelf: 'center', padding: SPACING.md, paddingBottom: SPACING.xl * 2, gap: SPACING.md },
  intro: { paddingHorizontal: 4, paddingVertical: SPACING.sm },
  introEyebrow: { color: COLORS.gold, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  introTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 27, fontWeight: '700', marginTop: 5 },
  card: { backgroundColor: COLORS.navyDark, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.lg, padding: SPACING.lg, overflow: 'hidden' },
  cardHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headingIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.goldSoft, borderWidth: 1, borderColor: COLORS.goldLine },
  headingText: { flex: 1, minWidth: 0 },
  cardTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 20, fontWeight: '800' },
  cardSubtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 2 },
  messageText: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 16, lineHeight: 25, marginTop: SPACING.lg },
  synaxColumns: { marginTop: SPACING.lg, gap: SPACING.lg },
  synaxColumnsWide: { flexDirection: 'row', gap: SPACING.lg },
  synaxDay: { flex: 1, minWidth: 0 },
  synaxDayTitle: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.title, fontSize: 16, fontWeight: '800' },
  synaxDate: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3, marginBottom: SPACING.sm },
  synaxDividerHorizontal: { height: 1, backgroundColor: COLORS.border },
  synaxDividerVertical: { width: 1, backgroundColor: COLORS.border },
  eventList: { gap: 8 },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  eventDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.gold, marginTop: 8 },
  eventText: { flex: 1, color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 20 },
  emptyText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19, marginTop: SPACING.sm },
  seeAllButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8 },
  seeAllText: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800' },
  releaseRow: { gap: SPACING.md, paddingTop: SPACING.lg, paddingRight: SPACING.lg },
  releaseCard: { width: 144 },
  releaseTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800', marginTop: 8 },
  releaseArtist: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 3 },
  synaxSearchButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 11, borderRadius: RADII.pill, borderWidth: 1, borderColor: COLORS.goldLine, backgroundColor: COLORS.goldSoft },
  synaxSearchText: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.68, transform: [{ scale: 0.97 }] },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
