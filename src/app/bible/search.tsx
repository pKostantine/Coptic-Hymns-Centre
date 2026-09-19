import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import Icon from '@/components/chc/ui/Icon';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import {
    BIBLE_SEARCH_LANGUAGE_LABELS,
    BIBLE_SEARCH_LANGUAGES,
    formatBibleReference,
    parseBibleReference,
    searchBible,
    splitSnippet,
    type BibleReference,
    type BibleSearchLanguage,
    type BibleSearchMode,
    type BibleSearchResult,
    type BibleSearchSort,
    type BibleTestament,
} from '@/utils/bibleSearch';
import { getBibleBooks, type BibleBook } from '@/utils/bibleService';
import { goBack } from '@/utils/navigation';
import type { BibleVisibleLanguages } from '@/utils/preferencesStorage';
import { useBrowserFullscreen } from '@/utils/useBrowserFullscreen';

const PAGE_SIZE = 25;
/** Long enough that typing a word does not fire a search per letter, short enough not to feel held up. */
const TYPING_PAUSE_MS = 300;

const LABELS = {
  title: { english: 'Search the Bible', arabic: 'ابحث في الكتاب المقدس' },
  placeholder: { english: 'Words, a phrase, or a reference', arabic: 'كلمات أو عبارة أو شاهد' },
  filters: { english: 'Filters', arabic: 'عوامل التصفية' },
  modeAll: { english: 'All words', arabic: 'كل الكلمات' },
  modeAny: { english: 'Any word', arabic: 'أي كلمة' },
  modePhrase: { english: 'Exact phrase', arabic: 'عبارة حرفية' },
  modeWeb: { english: 'Advanced', arabic: 'متقدم' },
  scopeAll: { english: 'Whole Bible', arabic: 'الكتاب كله' },
  scopeOt: { english: 'Old Testament', arabic: 'العهد القديم' },
  scopeNt: { english: 'New Testament', arabic: 'العهد الجديد' },
  prefix: { english: 'Match word beginnings', arabic: 'مطابقة بدايات الكلمات' },
  sortRelevance: { english: 'Best match', arabic: 'الأنسب' },
  sortCanonical: { english: 'Bible order', arabic: 'ترتيب الكتاب' },
  languages: { english: 'Search in', arabic: 'ابحث في' },
  noResults: { english: 'Nothing found.', arabic: 'لا توجد نتائج.' },
  // Exact phrase is served by the full text index, which does not record the
  // most ordinary words, so a phrase made only of those cannot be looked up.
  noResultsPhrase: {
    english: 'Nothing found. A phrase of only common words (like "I am") cannot be searched exactly — try All words.',
    arabic: 'لا توجد نتائج. العبارة المكونة من كلمات شائعة فقط لا يمكن البحث عنها حرفيًا — جرّب "كل الكلمات".',
  },
  noLanguages: { english: 'Choose at least one language to search in.', arabic: 'اختر لغة واحدة على الأقل.' },
  hint: {
    english: 'Type words to search, or a reference like John 3:16 to go straight there.',
    arabic: 'اكتب كلمات للبحث، أو شاهدًا مثل يوحنا ٣:١٦ للانتقال إليه.',
  },
  advancedHint: {
    english: 'Advanced: "quoted words" for a phrase, -word to exclude, or between alternatives.',
    arabic: 'متقدم: "كلمات بين علامتي اقتباس" لعبارة، و-كلمة للاستبعاد، وor للبدائل.',
  },
  goTo: { english: 'Go to', arabic: 'اذهب إلى' },
  loadMore: { english: 'Show more', arabic: 'عرض المزيد' },
};

const MODES: { key: BibleSearchMode; label: keyof typeof LABELS }[] = [
  { key: 'all', label: 'modeAll' },
  { key: 'any', label: 'modeAny' },
  { key: 'phrase', label: 'modePhrase' },
  { key: 'websearch', label: 'modeWeb' },
];

const SCOPES: { key: BibleTestament | null; label: keyof typeof LABELS }[] = [
  { key: null, label: 'scopeAll' },
  { key: 'OT', label: 'scopeOt' },
  { key: 'NT', label: 'scopeNt' },
];

/** Each searchable rendering against the reading preference that governs it, so search starts on what the reader actually reads. */
const LANGUAGE_PREFERENCE_KEYS: Record<BibleSearchLanguage, keyof BibleVisibleLanguages> = {
  english: 'english',
  english_nkjv: 'englishNkjv',
  english_from_coptic: 'englishFromCoptic',
  coptic: 'coptic',
  greek: 'greek',
  arabic: 'arabic',
  arabic_from_coptic: 'arabicFromCoptic',
  french: 'french',
};

export default function BibleSearchScreen() {
  const router = useRouter();
  const { isFullscreen, toggle: toggleFullscreen, shouldShow: shouldShowFullscreen } = useBrowserFullscreen();
  const { preferences } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const label = (entry: { english: string; arabic: string }) => (isArabic ? entry.arabic : entry.english);
  const localized = isArabic && styles.arabicText;

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<BibleSearchMode>('all');
  const [prefix, setPrefix] = useState(false);
  const [testament, setTestament] = useState<BibleTestament | null>(null);
  const [sort, setSort] = useState<BibleSearchSort>('relevance');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [languages, setLanguages] = useState<BibleSearchLanguage[]>(() => {
    const chosen = BIBLE_SEARCH_LANGUAGES.filter(
      (language) => preferences.bibleVisibleLanguages[LANGUAGE_PREFERENCE_KEYS[language]],
    );
    return chosen.length ? chosen : ['english'];
  });

  const [books, setBooks] = useState<BibleBook[]>([]);
  // Results and failures are stamped with the search they came from, so a
  // result set is shown only while it still answers what is on screen -- no
  // stale count flashing under a half-typed word, and nothing to clear when
  // the query changes.
  const [page, setPage] = useState<{ key: string; results: BibleSearchResult[]; total: number } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Only the newest search may write to the screen. A slower earlier one
  // landing late would otherwise replace the results of a longer query with
  // those of its own prefix.
  const requestRef = useRef(0);
  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBibleBooks()
      .then((loaded) => {
        if (!cancelled) setBooks(loaded);
      })
      .catch(() => {
        // The book list only powers the reference shortcut; searching works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmed = query.trim();
  const active = Boolean(trimmed) && languages.length > 0;
  const searchKey = JSON.stringify([trimmed, languages, mode, prefix, testament, sort]);
  const current = page && page.key === searchKey ? page : null;
  const error = failure && failure.key === searchKey ? failure.message : null;
  const results = current?.results ?? [];
  const total = current?.total ?? 0;
  const loading = active && !current && !error;

  /** A typed reference is offered as a shortcut, never forced — the same words are searched for underneath. */
  const reference: BibleReference | null = useMemo(
    () => (trimmed && books.length ? parseBibleReference(trimmed, books) : null),
    [trimmed, books],
  );

  const runSearch = useCallback(
    async (offset: number) => {
      const key = searchKey;
      const id = requestRef.current + 1;
      requestRef.current = id;
      inFlightRef.current?.abort();
      const controller = new AbortController();
      inFlightRef.current = controller;

      if (offset > 0) setLoadingMore(true);

      try {
        const response = await searchBible({
          query: trimmed,
          languages,
          mode,
          prefix,
          testament,
          sort,
          limit: PAGE_SIZE,
          offset,
          signal: controller.signal,
        });
        if (requestRef.current !== id) return;
        setPage((previous) => ({
          key,
          total: response.total,
          results:
            offset > 0 && previous?.key === key ? [...previous.results, ...response.results] : response.results,
        }));
        setFailure(null);
      } catch (err) {
        if (controller.signal.aborted || requestRef.current !== id) return;
        setFailure({ key, message: (err as Error)?.message || 'Unable to search the Bible.' });
      } finally {
        if (requestRef.current === id) setLoadingMore(false);
      }
    },
    [trimmed, languages, mode, prefix, testament, sort, searchKey],
  );

  // Searching happens as the query settles and whenever an option changes,
  // rather than on a submit button: the results are the feedback for those
  // options, so they have to move with them.
  useEffect(() => {
    if (!active) {
      requestRef.current += 1;
      inFlightRef.current?.abort();
      return;
    }
    const timer = setTimeout(() => {
      void runSearch(0);
    }, TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [active, searchKey, runSearch]);

  useEffect(() => () => inFlightRef.current?.abort(), []);

  const openVerse = (bookKey: string, chapter: number, verseNumber?: string) => {
    router.push({
      pathname: '/bible/[bookKey]/[chapter]',
      params: {
        bookKey,
        chapter: String(chapter),
        ...(verseNumber ? { verse: verseNumber } : null),
      },
    });
  };

  const toggleLanguage = (language: BibleSearchLanguage) => {
    setLanguages((current) =>
      current.includes(language) ? current.filter((entry) => entry !== language) : [...current, language],
    );
  };

  const activeFilterCount =
    (testament ? 1 : 0) + (prefix ? 1 : 0) + (sort === 'canonical' ? 1 : 0) + (languages.length === 1 ? 0 : 1);

  const canLoadMore = results.length > 0 && results.length < total && !loadingMore;

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>CHC Bible Search</title>
      </Head>
      <AppHeader
        title={LABELS.title}
        canGoBack
        onBack={() => goBack(router, '/bible')}
        visibleLanguages={{ english: !isArabic, arabic: isArabic }}
        rightLeadingIcon={shouldShowFullscreen ? (isFullscreen ? 'close-fullscreen' : 'open-in-full') : undefined}
        onRightLeadingPress={shouldShowFullscreen ? toggleFullscreen : undefined}
      />

      <View style={styles.searchRow}>
        <Icon name="search-outline" size={20} color={COLORS.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={label(LABELS.placeholder)}
          placeholderTextColor={COLORS.muted}
          style={[styles.searchInput, localized]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          autoFocus
        />
        {query ? (
          <Pressable accessibilityLabel="Clear search" hitSlop={10} style={styles.clearButton} onPress={() => setQuery('')}>
            <Icon name="add" size={20} color={COLORS.muted} style={styles.clearGlyph} />
          </Pressable>
        ) : null}
      </View>

      {reference ? (
        <Pressable
          accessibilityLabel={`Go to ${formatBibleReference(reference)}`}
          style={styles.referenceRow}
          onPress={() => openVerse(reference.bookKey, reference.chapter, reference.verse ? String(reference.verse) : undefined)}
        >
          <Icon name="book" size={18} color={COLORS.gold} />
          <Text style={[styles.referenceText, localized]} numberOfLines={1}>
            {label(LABELS.goTo)} {formatBibleReference(reference, isArabic ? 'ar' : 'en')}
          </Text>
          <Icon name={isArabic ? 'chevron-back' : 'chevron-forward'} size={18} color={COLORS.gold} />
        </Pressable>
      ) : null}

      <View style={styles.chipRow}>
        {MODES.map((entry) => (
          <Chip
            key={entry.key}
            label={label(LABELS[entry.label])}
            active={mode === entry.key}
            isArabic={isArabic}
            onPress={() => setMode(entry.key)}
          />
        ))}
      </View>

      <Pressable style={styles.filtersToggle} onPress={() => setFiltersOpen((open) => !open)}>
        <Icon name={filtersOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={COLORS.gold} />
        <Text style={[styles.filtersToggleText, localized]}>
          {label(LABELS.filters)}
          {activeFilterCount ? ` · ${activeFilterCount}` : ''}
        </Text>
      </Pressable>

      {filtersOpen ? (
        <View style={styles.filters}>
          <View style={styles.chipRow}>
            {SCOPES.map((entry) => (
              <Chip
                key={String(entry.key)}
                label={label(LABELS[entry.label])}
                active={testament === entry.key}
                isArabic={isArabic}
                onPress={() => setTestament(entry.key)}
              />
            ))}
          </View>
          <View style={styles.chipRow}>
            <Chip label={label(LABELS.sortRelevance)} active={sort === 'relevance'} isArabic={isArabic} onPress={() => setSort('relevance')} />
            <Chip label={label(LABELS.sortCanonical)} active={sort === 'canonical'} isArabic={isArabic} onPress={() => setSort('canonical')} />
            <Chip label={label(LABELS.prefix)} active={prefix} isArabic={isArabic} onPress={() => setPrefix((on) => !on)} />
          </View>
          <Text style={[styles.filtersLabel, localized]}>{label(LABELS.languages)}</Text>
          <View style={styles.chipRow}>
            {BIBLE_SEARCH_LANGUAGES.map((language) => (
              <Chip
                key={language}
                label={label(BIBLE_SEARCH_LANGUAGE_LABELS[language])}
                active={languages.includes(language)}
                isArabic={isArabic}
                onPress={() => toggleLanguage(language)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {current && !error ? (
        <Text style={[styles.count, localized]}>
          {total.toLocaleString(isArabic ? 'ar-EG' : 'en-US')}
          {total === 1 ? ' verse' : ' verses'}
        </Text>
      ) : null}

      {!languages.length ? (
        <Text style={[styles.message, localized]}>{label(LABELS.noLanguages)}</Text>
      ) : !trimmed ? (
        <Text style={[styles.message, localized]}>
          {label(mode === 'websearch' ? LABELS.advancedHint : LABELS.hint)}
        </Text>
      ) : error ? (
        <Text style={[styles.message, localized]}>{error}</Text>
      ) : loading ? (
        <ActivityIndicator color={COLORS.gold} style={styles.loading} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.bookKey}:${item.chapterNumber}:${item.verseNumber}`}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          windowSize={9}
          ListEmptyComponent={
            <Text style={[styles.message, localized]}>
              {label(mode === 'phrase' ? LABELS.noResultsPhrase : LABELS.noResults)}
            </Text>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={COLORS.gold} style={styles.footerLoading} />
            ) : canLoadMore ? (
              <Pressable style={styles.loadMore} onPress={() => void runSearch(results.length)}>
                <Text style={[styles.loadMoreText, localized]}>{label(LABELS.loadMore)}</Text>
              </Pressable>
            ) : null
          }
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (canLoadMore) void runSearch(results.length);
          }}
          renderItem={({ item }) => (
            <ResultRow
              result={item}
              isArabic={isArabic}
              onPress={() => openVerse(item.bookKey, item.chapterNumber, item.verseNumber)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Chip({
  label,
  active,
  isArabic,
  onPress,
}: {
  label: string;
  active: boolean;
  isArabic: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive, isArabic && styles.arabicText]}>{label}</Text>
    </Pressable>
  );
}

/**
 * One verse. Every rendering it matched in is shown, because a hit in the
 * Coptic and a hit in the English are different facts about the verse and
 * which one it was is the reason the result is there.
 */
function ResultRow({
  result,
  isArabic,
  onPress,
}: {
  result: BibleSearchResult;
  isArabic: boolean;
  onPress: () => void;
}) {
  const title = isArabic ? result.titleArabic || result.titleEnglish : result.titleEnglish;

  return (
    <Pressable style={styles.resultRow} onPress={onPress}>
      <Text style={[styles.resultReference, isArabic && styles.arabicText]}>
        {title} {result.chapterNumber}:{result.verseNumber}
      </Text>
      {result.matchedLanguages.map((language) => {
        const segments = splitSnippet(result.snippets[language]);
        if (!segments.length) return null;
        const rightToLeft = language === 'arabic' || language === 'arabic_from_coptic';
        return (
          <View key={language} style={styles.snippetBlock}>
            <Text style={styles.snippetLanguage}>
              {BIBLE_SEARCH_LANGUAGE_LABELS[language][isArabic ? 'arabic' : 'english']}
            </Text>
            <Text
              style={[
                styles.snippet,
                language === 'coptic' && styles.snippetCoptic,
                rightToLeft && styles.snippetArabic,
              ]}
            >
              {segments.map((segment, index) => (
                <Text key={index} style={segment.match ? styles.snippetMatch : undefined}>
                  {segment.text}
                </Text>
              ))}
            </Text>
          </View>
        );
      })}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  searchRow: {
    alignItems: 'center',
    backgroundColor: '#111111',
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    minHeight: 48,
    paddingHorizontal: SPACING.md,
  },
  searchInput: { color: COLORS.white, flex: 1, fontSize: 16, paddingVertical: SPACING.sm + 2 },
  clearButton: { alignItems: 'center', height: 32, justifyContent: 'center', width: 32 },
  // The one "close" glyph this icon set has is the plus; a quarter turn makes it an x.
  clearGlyph: { transform: [{ rotate: '45deg' }] },
  referenceRow: {
    alignItems: 'center',
    backgroundColor: COLORS.goldSoft,
    borderColor: COLORS.goldLine,
    borderRadius: RADII.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    minHeight: 48,
    paddingHorizontal: SPACING.md,
  },
  referenceText: { color: COLORS.gold, flex: 1, fontSize: 15, fontWeight: '700' },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  chip: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: SPACING.md,
  },
  chipActive: { backgroundColor: COLORS.goldSoft, borderColor: COLORS.goldLine },
  chipText: { color: COLORS.muted, fontSize: 14, fontWeight: '700' },
  chipTextActive: { color: COLORS.gold },
  filtersToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  filtersToggleText: { color: COLORS.gold, fontSize: 14, fontWeight: '700' },
  filters: { paddingBottom: SPACING.sm },
  filtersLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    textTransform: 'uppercase',
  },
  count: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  loading: { paddingVertical: SPACING.xl },
  loadMore: {
    alignItems: 'center',
    borderColor: COLORS.goldLine,
    borderRadius: RADII.sm,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: SPACING.sm,
    minHeight: 48,
  },
  loadMoreText: { color: COLORS.gold, fontSize: 15, fontWeight: '700' },
  footerLoading: { paddingVertical: SPACING.lg },
  message: { color: COLORS.muted, fontSize: 14, padding: SPACING.lg, textAlign: 'center' },
  list: { flex: 1, marginTop: SPACING.sm },
  listContent: { paddingBottom: SPACING.xl, paddingHorizontal: SPACING.md },
  resultRow: {
    backgroundColor: '#111111',
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    borderWidth: 1,
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
  },
  resultReference: { color: COLORS.gold, fontFamily: TYPOGRAPHY.title, fontSize: 15, fontWeight: '800' },
  snippetBlock: { gap: 2 },
  snippetLanguage: { color: COLORS.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  snippet: { color: COLORS.white, fontSize: 15, lineHeight: 22 },
  snippetCoptic: { fontFamily: TYPOGRAPHY.coptic, fontSize: 17, lineHeight: 26 },
  snippetArabic: { fontFamily: TYPOGRAPHY.arabic, lineHeight: 26, textAlign: 'right', writingDirection: 'rtl' },
  snippetMatch: { color: COLORS.gold, fontWeight: '800' },
  arabicText: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
