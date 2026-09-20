import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import Icon from '@/components/chc/ui/Icon';
import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { homeService, type SynaxariumYearRow } from '@/services/homeService';
import { localDateAtUtcMidnight } from '@/utils/dateUtils';
import { goBack } from '@/utils/navigation';

interface SynaxariumEntry {
  entryKey: string;
  entryOrder: number;
  titleEnglish: string | null;
  titleArabic: string | null;
}

interface SynaxariumDay {
  gregorianDate: string;
  copticYear: number;
  copticMonth: number;
  copticMonthName: string;
  copticDay: number;
  weekdayNumber: number;
  entries: SynaxariumEntry[];
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function groupRows(rows: SynaxariumYearRow[]): SynaxariumDay[] {
  const days = new Map<string, SynaxariumDay>();

  for (const row of rows) {
    let day = days.get(row.gregorianDate);
    if (!day) {
      day = {
        gregorianDate: row.gregorianDate,
        copticYear: row.copticYear,
        copticMonth: row.copticMonth,
        copticMonthName: row.copticMonthName,
        copticDay: row.copticDay,
        weekdayNumber: row.weekdayNumber,
        entries: [],
      };
      days.set(row.gregorianDate, day);
    }

    if (row.entryKey) {
      day.entries.push({
        entryKey: row.entryKey,
        entryOrder: row.entryOrder ?? 0,
        titleEnglish: row.titleEnglish,
        titleArabic: row.titleArabic,
      });
    }
  }

  return [...days.values()].sort((a, b) => a.gregorianDate.localeCompare(b.gregorianDate));
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.’'"]/g, '')
    .replace(/\bst\b/g, 'saint')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatGregorianDate(iso: string, locale: 'en' | 'ar'): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(
    locale === 'ar' ? 'ar-EG' : 'en-CA',
    {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    },
  );
}

export default function SynaxariumBrowserScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const didAutoScroll = useRef(false);
  const { preferences } = useReadingPreferences();
  const locale: 'en' | 'ar' = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';

  // This page is intentionally independent from the Books calendar picker.
  const liveDate = useMemo(() => localDateAtUtcMidnight(new Date()), []);
  const liveIso = isoDate(liveDate);

  const [rows, setRows] = useState<SynaxariumYearRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    homeService.getSynaxariumYear(liveIso)
      .then((payload) => {
        if (active) setRows(payload);
      })
      .catch((cause) => {
        if (!active) return;
        setRows([]);
        setError(cause instanceof Error ? cause.message : 'Unable to load the Synaxarium.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [liveIso]);

  const days = useMemo(() => groupRows(rows), [rows]);
  const normalizedQuery = useMemo(() => normalizeSearch(query), [query]);

  const visibleDays = useMemo(() => {
    if (!normalizedQuery) return days;

    return days
      .map((day) => ({
        ...day,
        entries: day.entries.filter((entry) => {
          const searchable = normalizeSearch(
            [entry.titleEnglish, entry.titleArabic].filter(Boolean).join(' '),
          );
          return searchable.includes(normalizedQuery);
        }),
      }))
      .filter((day) => day.entries.length > 0);
  }, [days, normalizedQuery]);

  useEffect(() => {
    if (normalizedQuery) {
      didAutoScroll.current = false;
    }
  }, [normalizedQuery]);

  const yearNumber = days[0]?.copticYear;

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>Synaxarium — Coptic Hymns Centre</title></Head>

      <AppHeader
        title={{ english: 'Synaxarium', arabic: 'السنكسار' }}
        canGoBack
        onBack={() => goBack(router, '/')}
        visibleLanguages={{ english: !isArabic, arabic: isArabic }}
      />

      <View style={styles.searchArea}>
        <View style={styles.searchBox}>
          <Icon name="search-outline" size={19} color={COLORS.muted} />
          <TextInput
            ref={inputRef}
            accessibilityLabel={isArabic ? 'بحث في السنكسار' : 'Search Synaxarium'}
            value={query}
            onChangeText={setQuery}
            placeholder={isArabic ? 'ابحث عن قديس أو حدث' : 'Search saints and events'}
            placeholderTextColor="rgba(201,211,220,0.55)"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
            selectionColor={COLORS.gold}
            style={[
              styles.searchInput,
              Platform.OS === 'web' && styles.searchInputWeb,
              isArabic && styles.arabic,
            ]}
          />
          {query && Platform.OS !== 'ios' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isArabic ? 'مسح البحث' : 'Clear search'}
              onPress={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            >
              <Icon name="close" size={14} color={COLORS.muted} />
            </Pressable>
          ) : null}
        </View>

        <Text style={[styles.searchHint, isArabic && styles.arabic]}>
          {normalizedQuery
            ? (isArabic
                ? `${visibleDays.length} يوم مطابق`
                : `${visibleDays.length} matching day${visibleDays.length === 1 ? '' : 's'}`)
            : (isArabic
                ? `السنة القبطية ${yearNumber ?? ''}`
                : `Coptic Year ${yearNumber ?? ''}`)}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.gold} />
          <Text style={[styles.stateText, isArabic && styles.arabic]}>
            {isArabic ? 'جارٍ تحميل السنكسار…' : 'Loading Synaxarium…'}
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={[styles.errorTitle, isArabic && styles.arabic]}>
            {isArabic ? 'تعذر تحميل السنكسار' : 'Unable to load Synaxarium'}
          </Text>
          <Text style={[styles.stateText, isArabic && styles.arabic]}>{error}</Text>
        </View>
      ) : visibleDays.length === 0 ? (
        <View style={styles.centerState}>
          <Icon name="search-outline" size={30} color={COLORS.goldBright} />
          <Text style={[styles.errorTitle, isArabic && styles.arabic]}>
            {isArabic ? 'لا توجد نتائج' : 'No results'}
          </Text>
          <Text style={[styles.stateText, isArabic && styles.arabic]}>
            {isArabic
              ? 'جرّب اسماً آخر أو صيغة مختلفة.'
              : 'Try another name or spelling.'}
          </Text>
        </View>
      ) : (
        <NowPlayingAwareScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {visibleDays.map((day) => {
            const isToday = day.gregorianDate === liveIso;
            return (
              <View
                key={day.gregorianDate}
                onLayout={(event) => {
                  if (!isToday || normalizedQuery || didAutoScroll.current) return;
                  didAutoScroll.current = true;
                  const y = event.nativeEvent.layout.y;
                  setTimeout(() => {
                    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: false });
                  }, 0);
                }}
                style={[styles.dayCard, isToday && styles.dayCardToday]}
              >
                <View style={styles.dayHeader}>
                  <View style={styles.dayHeaderText}>
                    <View style={styles.dayTitleRow}>
                      <Text style={[styles.dayTitle, isArabic && styles.arabic]}>
                        {formatGregorianDate(day.gregorianDate, locale)}
                      </Text>
                      {isToday && !normalizedQuery ? (
                        <View style={styles.todayBadge}>
                          <Text style={[styles.todayBadgeText, isArabic && styles.arabic]}>
                            {isArabic ? 'اليوم' : 'Today'}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.copticDate, isArabic && styles.arabic]}>
                      {day.copticMonthName} {day.copticDay}
                    </Text>
                  </View>
                </View>

                {day.entries.length ? (
                  <View style={styles.entries}>
                    {day.entries.map((entry) => (
                      <View key={entry.entryKey} style={styles.entryRow}>
                        <View style={styles.entryDot} />
                        <Text style={[styles.entryText, isArabic && styles.arabic]}>
                          {isArabic
                            ? entry.titleArabic || entry.titleEnglish
                            : entry.titleEnglish || entry.titleArabic}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.noEntries, isArabic && styles.arabic]}>
                    {isArabic ? 'لا توجد أحداث مدرجة.' : 'No events listed.'}
                  </Text>
                )}
              </View>
            );
          })}
        </NowPlayingAwareScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  searchArea: {
    paddingHorizontal: SPACING.md,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.black,
  },
  searchBox: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.goldLine,
    backgroundColor: 'rgba(255,255,255,0.075)',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 42,
    paddingVertical: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 16,
  },
  searchInputWeb: {
    outlineStyle: 'none',
    outlineWidth: 0,
    boxShadow: 'none',
  } as any,
  clearButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  searchHint: {
    color: COLORS.muted,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 11,
    marginTop: 7,
    marginHorizontal: 2,
  },
  content: {
    width: '100%',
    maxWidth: 880,
    alignSelf: 'center',
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
    gap: 12,
  },
  dayCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.navyDark,
    padding: SPACING.lg,
  },
  dayCardToday: {
    borderColor: COLORS.goldLine,
    backgroundColor: '#08213B',
  },
  dayHeader: { flexDirection: 'row', alignItems: 'center' },
  dayHeaderText: { flex: 1, minWidth: 0 },
  dayTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  dayTitle: {
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 18,
    fontWeight: '800',
  },
  copticDate: {
    color: COLORS.goldBright,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  todayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: COLORS.goldLine,
    backgroundColor: COLORS.goldSoft,
  },
  todayBadgeText: {
    color: COLORS.goldBright,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 10,
    fontWeight: '900',
  },
  entries: { gap: 10, marginTop: SPACING.md },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  entryDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.gold,
    marginTop: 8,
  },
  entryText: {
    flex: 1,
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 14,
    lineHeight: 20,
  },
  noEntries: {
    color: COLORS.muted,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 13,
    marginTop: SPACING.md,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  errorTitle: {
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.title,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 10,
    textAlign: 'center',
  },
  stateText: {
    color: COLORS.muted,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  pressed: { opacity: 0.68, transform: [{ scale: 0.96 }] },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
