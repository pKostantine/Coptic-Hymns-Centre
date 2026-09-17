import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import LearningBackHeader from '@/components/learning/LearningBackHeader';
import LearningMiniPlayer from '@/components/learning/LearningMiniPlayer';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { learningService } from '@/services/learningService';
import type { LearningSearchPayload } from '@/types/learningPlatform';

const EMPTY_RESULTS: LearningSearchPayload = {
  cantors: [],
  seasons: [],
  hymns: [],
  albums: [],
  lessonSets: [],
  lessons: [],
};

export default function LearningSearchScreen() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LearningSearchPayload>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = query.trim();
    if (!value) return;

    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      learningService.search(value, locale)
        .then((payload) => { if (active) setResults(payload); })
        .catch((cause) => {
          if (active) setError(cause instanceof Error ? cause.message : 'Unable to search Learn & Study.');
        })
        .finally(() => { if (active) setLoading(false); });
    }, 280);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [locale, query]);

  const resultCount = useMemo(() => (
    results.cantors.length
    + results.seasons.length
    + results.hymns.length
    + results.albums.length
    + results.lessonSets.length
    + results.lessons.length
  ), [results]);
  const hasQuery = Boolean(query.trim());
  const changeQuery = (value: string) => {
    setQuery(value);
    setResults(EMPTY_RESULTS);
    setLoading(Boolean(value.trim()));
    setError(null);
  };

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{isArabic ? 'بحث التعلّم — كوبتك هيمنز سنتر' : 'Search Learn & Study — Coptic Hymns Centre'}</title></Head>
      <LearningBackHeader title={isArabic ? 'بحث التعلّم' : 'Search Learn & Study'} isArabic={isArabic} />
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onChangeText={changeQuery}
            placeholder={isArabic ? 'ابحث عن لحن أو معلّم أو درس…' : 'Search hymns, cantors, lessons…'}
            placeholderTextColor={COLORS.muted}
            returnKeyType="search"
            style={[styles.input, isArabic && styles.arabic]}
            value={query}
          />
          {query ? (
            <Pressable accessibilityLabel="Clear search" onPress={() => changeQuery('')} style={styles.clear}>
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          ) : null}
        </View>
        {hasQuery && !loading && !error ? (
          <Text style={[styles.count, isArabic && styles.arabic]}>
            {isArabic ? `${resultCount} نتيجة` : `${resultCount} ${resultCount === 1 ? 'result' : 'results'}`}
          </Text>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator color={COLORS.learning} style={styles.loader} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!hasQuery ? (
          <View style={styles.prompt}>
            <View style={styles.promptIcon}><Text style={styles.promptGlyph}>♬</Text></View>
            <Text style={[styles.promptTitle, isArabic && styles.arabic]}>
              {isArabic ? 'ابحث في مكتبة التعلّم' : 'Search the learning library'}
            </Text>
            <Text style={[styles.promptBody, isArabic && styles.arabic]}>
              {isArabic
                ? 'ابحث باسم اللحن أو الموسم أو المعلّم أو مجموعة الدروس.'
                : 'Find a hymn, season, cantor, learning album, course, or individual lesson.'}
            </Text>
          </View>
        ) : null}
        {hasQuery && !loading && !error && !resultCount ? (
          <View style={styles.prompt}>
            <Text style={[styles.promptTitle, isArabic && styles.arabic]}>{isArabic ? 'لا توجد نتائج' : 'No results found'}</Text>
            <Text style={[styles.promptBody, isArabic && styles.arabic]}>
              {isArabic ? 'جرّب كلمة أقصر أو تهجئة مختلفة.' : 'Try a shorter phrase or a different spelling.'}
            </Text>
          </View>
        ) : null}

        <ResultSection title={isArabic ? 'المعلّمون' : 'Cantors'} count={results.cantors.length} isArabic={isArabic}>
          {results.cantors.map((item) => (
            <SearchRow key={item.id} icon="♬" title={item.displayName} subtitle={item.biography} isArabic={isArabic} onPress={() => router.push('/learn/cantor/' + item.id)} />
          ))}
        </ResultSection>
        <ResultSection title={isArabic ? 'المواسم' : 'Seasons'} count={results.seasons.length} isArabic={isArabic}>
          {results.seasons.map((item) => (
            <SearchRow key={item.id} icon="✦" title={item.title} subtitle={item.description} isArabic={isArabic} onPress={() => router.push('/learn/season/' + item.id)} />
          ))}
        </ResultSection>
        <ResultSection title={isArabic ? 'الألحان' : 'Hymns'} count={results.hymns.length} isArabic={isArabic}>
          {results.hymns.map((item) => (
            <SearchRow key={item.id} icon="Ϯ" title={item.title} subtitle={item.subtitle} isArabic={isArabic} onPress={() => router.push('/learn/hymn/' + item.id)} />
          ))}
        </ResultSection>
        <ResultSection title={isArabic ? 'ألبومات التعلّم' : 'Learning Albums'} count={results.albums.length} isArabic={isArabic}>
          {results.albums.map((item) => (
            <SearchRow key={item.id} icon="♪" title={item.title} subtitle={item.description} isArabic={isArabic} onPress={() => router.push('/learn/album/' + item.id)} />
          ))}
        </ResultSection>
        <ResultSection title={isArabic ? 'مجموعات الدروس' : 'Lesson Sets'} count={results.lessonSets.length} isArabic={isArabic}>
          {results.lessonSets.map((item) => (
            <SearchRow key={item.id} icon="1·2" title={item.title} subtitle={item.description} isArabic={isArabic} onPress={() => router.push('/learn/lesson-set/' + item.id)} />
          ))}
        </ResultSection>
        <ResultSection title={isArabic ? 'الدروس' : 'Lessons'} count={results.lessons.length} isArabic={isArabic}>
          {results.lessons.map((item) => (
            <SearchRow
              key={item.id}
              icon={item.mediaType === 'video' ? '▣' : '▶'}
              title={item.title}
              subtitle={`${item.lessonSetTitle} · ${item.cantorName}`}
              isArabic={isArabic}
              onPress={() => router.push('/learn/lesson/' + item.id + '?setId=' + item.lessonSetId)}
            />
          ))}
        </ResultSection>
      </ScrollView>
      <LearningMiniPlayer />
    </SafeAreaView>
  );
}

function ResultSection({
  title,
  count,
  isArabic,
  children,
}: {
  title: string;
  count: number;
  isArabic: boolean;
  children: React.ReactNode;
}) {
  if (!count) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{title}</Text>
        <Text style={styles.sectionCount}>{count}</Text>
      </View>
      <View style={styles.resultList}>{children}</View>
    </View>
  );
}

function SearchRow({
  icon,
  title,
  subtitle,
  isArabic,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle?: string | null;
  isArabic: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.resultRow} onPress={onPress}>
      <View style={styles.resultIcon}><Text style={styles.resultGlyph}>{icon}</Text></View>
      <View style={styles.resultInfo}>
        <Text numberOfLines={1} style={[styles.resultTitle, isArabic && styles.arabic]}>{title}</Text>
        {subtitle ? <Text numberOfLines={2} style={[styles.resultSubtitle, isArabic && styles.arabic]}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  searchWrap: { padding: SPACING.md, paddingBottom: SPACING.sm },
  searchBox: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.learningLine,
  },
  searchGlyph: { color: COLORS.learning, fontSize: 26 },
  input: { flex: 1, color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, paddingVertical: 12 },
  clear: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: COLORS.muted, fontSize: 25 },
  count: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: SPACING.sm },
  content: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl },
  loader: { marginTop: SPACING.xl },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center', margin: SPACING.xl },
  prompt: { alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: 56 },
  promptIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learningSoft, borderWidth: 1, borderColor: COLORS.learningLine },
  promptGlyph: { color: COLORS.learningBright, fontSize: 34 },
  promptTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700', textAlign: 'center', marginTop: SPACING.lg },
  promptBody: { maxWidth: 480, color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: SPACING.sm },
  section: { marginTop: SPACING.lg },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  sectionTitle: { flex: 1, color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 19, fontWeight: '700' },
  sectionCount: { minWidth: 28, color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '900', textAlign: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: RADII.pill, backgroundColor: COLORS.learningSoft },
  resultList: { overflow: 'hidden', borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  resultRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  resultIcon: { width: 48, height: 48, borderRadius: RADII.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learningDeep, borderWidth: 1, borderColor: COLORS.learningLine },
  resultGlyph: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.title, fontSize: 16, fontWeight: '800' },
  resultInfo: { flex: 1, minWidth: 0 },
  resultTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  resultSubtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, lineHeight: 16, marginTop: 3 },
  chevron: { color: COLORS.learning, fontSize: 27 },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
