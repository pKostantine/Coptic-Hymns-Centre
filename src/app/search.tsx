import { useLocalSearchParams, useRouter } from 'expo-router';
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

import AppHeader from '@/components/chc/ui/AppHeader';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import LearningMiniPlayer from '@/components/learning/LearningMiniPlayer';
import MusicMiniPlayer from '@/components/music/MusicMiniPlayer';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { type LearningQueueItem, useLearningPlayer } from '@/context/LearningPlayerContext';
import { type MusicQueueItem, useMusicPlayer } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { unifiedSearchService } from '@/services/unifiedSearchService';
import type { MusicConsumerTrack } from '@/types/musicConsumer';
import type {
  UnifiedSearchKind,
  UnifiedSearchResult,
  UnifiedSearchScope,
} from '@/types/unifiedSearch';

const KIND_LABELS: Record<UnifiedSearchKind, { en: string; ar: string }> = {
  music_artist: { en: 'Artist', ar: 'فنان' },
  music_release: { en: 'Release', ar: 'إصدار' },
  music_track: { en: 'Track', ar: 'ترنيمة' },
  learning_cantor: { en: 'Cantor', ar: 'معلّم' },
  learning_season: { en: 'Season', ar: 'موسم' },
  learning_hymn: { en: 'Hymn', ar: 'لحن' },
  learning_album: { en: 'Learning album', ar: 'ألبوم تعليمي' },
  learning_lesson: { en: 'Lesson', ar: 'درس' },
};

const KIND_GLYPHS: Record<UnifiedSearchKind, string> = {
  music_artist: '♬',
  music_release: '◉',
  music_track: '♪',
  learning_cantor: '♬',
  learning_season: '✦',
  learning_hymn: 'Ϯ',
  learning_album: '♫',
  learning_lesson: '▶',
};

function scopeFromParam(value: string | string[] | undefined): UnifiedSearchScope {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'music' || candidate === 'learning' ? candidate : 'all';
}

function resultSubtitle(result: UnifiedSearchResult): string | null {
  if (result.kind === 'music_release') {
    return result.metadata.primaryArtist?.displayName ?? result.subtitle;
  }
  if (result.kind === 'music_track') {
    const artists = result.metadata.artists.map((artist) => artist.displayName).join(', ');
    return [artists, result.metadata.releaseTitle].filter(Boolean).join(' · ') || result.subtitle;
  }
  if (result.kind === 'learning_album') return result.metadata.cantorName;
  if (result.kind === 'learning_lesson') {
    return result.metadata.lessonSetTitle + ' · ' + result.metadata.cantorName;
  }
  return result.subtitle ?? result.body;
}

export default function UnifiedSearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scope?: string }>();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const routeScope = scopeFromParam(params.scope);
  const [scope, setScope] = useState<UnifiedSearchScope>(routeScope);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const musicPlayer = useMusicPlayer();
  const learningPlayer = useLearningPlayer();

  useEffect(() => {
    const value = query.trim();
    if (!value) return;

    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      unifiedSearchService.search(value, locale, scope)
        .then((payload) => { if (active) setResults(payload.results); })
        .catch((cause) => {
          if (active) setError(cause instanceof Error ? cause.message : 'Unable to search CHC.');
        })
        .finally(() => { if (active) setLoading(false); });
    }, 260);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [locale, query, scope]);

  const scopes = useMemo<{ id: UnifiedSearchScope; en: string; ar: string }[]>(() => [
    { id: 'all', en: 'All', ar: 'الكل' },
    { id: 'music', en: 'Music', ar: 'الترانيم' },
    { id: 'learning', en: 'Learn', ar: 'التعلّم' },
  ], []);

  const selectScope = (nextScope: UnifiedSearchScope) => {
    setScope(nextScope);
    setResults([]);
    setLoading(Boolean(query.trim()));
    router.setParams({ scope: nextScope });
  };

  const changeQuery = (value: string) => {
    setQuery(value);
    setResults([]);
    setLoading(Boolean(value.trim()));
    setError(null);
  };

  const openResult = (result: UnifiedSearchResult) => {
    switch (result.kind) {
      case 'music_artist':
        router.push('/music/artist/' + result.entityId);
        return;
      case 'music_release':
        router.push('/music/release/' + result.entityId);
        return;
      case 'music_track': {
        if (musicPlayer.currentItem?.track.id === result.entityId) {
          musicPlayer.togglePlayback();
          return;
        }
        const track: MusicConsumerTrack = {
          id: result.entityId,
          title: result.title,
          subtitle: result.subtitle,
          durationMs: result.metadata.durationMs,
          releaseId: result.metadata.releaseId,
          mediaAsset: result.metadata.mediaAsset,
          artists: result.metadata.artists,
        };
        const item: MusicQueueItem = {
          track,
          releaseId: result.metadata.releaseId,
          releaseTitle: result.metadata.releaseTitle,
          coverAsset: result.metadata.coverAsset,
        };
        musicPlayer.playItem(item);
        return;
      }
      case 'learning_cantor':
        router.push('/learn/cantor/' + result.entityId);
        return;
      case 'learning_season':
        router.push('/learn/season/' + result.entityId);
        return;
      case 'learning_hymn':
        router.push('/learn/hymn/' + result.entityId);
        return;
      case 'learning_album':
        router.push('/learn/album/' + result.entityId);
        return;
      case 'learning_lesson': {
        if (result.metadata.mediaType === 'video') {
          router.push('/learn/lesson/' + result.entityId + '?setId=' + result.metadata.lessonSetId);
          return;
        }
        if (learningPlayer.currentItem?.id === result.entityId) {
          learningPlayer.togglePlayback();
          return;
        }
        const item: LearningQueueItem = {
          kind: 'lesson',
          id: result.entityId,
          title: result.title,
          subtitle: result.body,
          durationMs: result.metadata.durationMs,
          mediaAsset: result.metadata.mediaAsset,
          containerId: result.metadata.lessonSetId,
          containerTitle: result.metadata.lessonSetTitle,
          cantorName: result.metadata.cantorName,
          coverAsset: result.metadata.coverAsset,
          hymnId: result.metadata.hymnId,
        };
        learningPlayer.playItem(item);
      }
    }
  };

  const hasQuery = Boolean(query.trim());

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{isArabic ? 'بحث CHC الشامل' : 'Search CHC'}</title></Head>
      <AppHeader
        title={{ english: 'Search CHC', arabic: 'بحث CHC الشامل' }}
        visibleLanguages={{ english: !isArabic, arabic: isArabic }}
      />

      <View style={styles.searchArea}>
        <View style={styles.searchBox}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <TextInput
            accessibilityLabel={isArabic ? 'بحث CHC' : 'Search CHC'}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onChangeText={changeQuery}
            placeholder={isArabic ? 'فنان، لحن، موسم، أو درس…' : 'Artist, track, hymn, season, or lesson…'}
            placeholderTextColor={COLORS.muted}
            returnKeyType="search"
            style={[styles.input, isArabic && styles.arabic]}
            value={query}
          />
          {query ? (
            <Pressable accessibilityLabel="Clear search" onPress={() => changeQuery('')} style={styles.clearButton}>
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.scopeRow}>
          {scopes.map((item) => {
            const active = scope === item.id;
            const learning = item.id === 'learning';
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => selectScope(item.id)}
                style={[
                  styles.scopeButton,
                  active && (learning ? styles.scopeLearningActive : styles.scopeGoldActive),
                ]}
              >
                <Text style={[
                  styles.scopeLabel,
                  isArabic && styles.arabic,
                  active && (learning ? styles.scopeLearningLabel : styles.scopeGoldLabel),
                ]}>
                  {isArabic ? item.ar : item.en}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading ? <ActivityIndicator color={scope === 'learning' ? COLORS.learning : COLORS.gold} style={styles.loader} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!hasQuery ? (
          <View style={styles.prompt}>
            <View style={styles.promptMark}>
              <Text style={styles.promptMusic}>♪</Text>
              <Text style={styles.promptLearning}>Ϯ</Text>
            </View>
            <Text style={[styles.promptTitle, isArabic && styles.arabic]}>
              {isArabic ? 'اكتشف مكتبة CHC' : 'One search across CHC'}
            </Text>
            <Text style={[styles.promptBody, isArabic && styles.arabic]}>
              {isArabic
                ? 'ابحث بالعربية أو الإنجليزية أو بتهجئة بديلة في الترانيم ومحتوى التعلّم.'
                : 'Find Music and Learn & Study content in English, Arabic, or an alternate spelling.'}
            </Text>
          </View>
        ) : null}

        {hasQuery && !loading && !error && !results.length ? (
          <View style={styles.prompt}>
            <Text style={[styles.promptTitle, isArabic && styles.arabic]}>
              {isArabic ? 'لا توجد نتائج' : 'No results found'}
            </Text>
            <Text style={[styles.promptBody, isArabic && styles.arabic]}>
              {isArabic ? 'جرّب كلمة أقصر أو تهجئة مختلفة.' : 'Try a shorter phrase or another spelling.'}
            </Text>
          </View>
        ) : null}

        {hasQuery && !loading && results.length ? (
          <Text style={[styles.resultCount, isArabic && styles.arabic]}>
            {isArabic ? `${results.length} نتيجة` : `${results.length} ${results.length === 1 ? 'result' : 'results'}`}
          </Text>
        ) : null}

        {results.length ? <View style={styles.resultsList}>
          {results.map((result) => {
            const learning = result.domain === 'learning';
            const active = result.kind === 'music_track'
              ? musicPlayer.currentItem?.track.id === result.entityId
              : result.kind === 'learning_lesson'
                ? learningPlayer.currentItem?.id === result.entityId
                : false;
            const playing = result.kind === 'music_track'
              ? active && musicPlayer.playing
              : result.kind === 'learning_lesson'
                ? active && learningPlayer.playing
                : false;
            return (
              <Pressable
                key={result.kind + ':' + result.entityId}
                onPress={() => openResult(result)}
                style={[styles.resultRow, active && (learning ? styles.learningPlaying : styles.musicPlaying)]}
              >
                <View style={[styles.resultIcon, learning ? styles.learningIcon : styles.musicIcon]}>
                  <Text style={[styles.resultGlyph, learning ? styles.learningGlyph : styles.musicGlyph]}>
                    {KIND_GLYPHS[result.kind]}
                  </Text>
                </View>
                <View style={styles.resultInfo}>
                  <View style={[styles.resultMeta, isArabic && styles.rowReverse]}>
                    <Text style={[styles.kindLabel, learning ? styles.learningKind : styles.musicKind, isArabic && styles.arabic]}>
                      {isArabic ? KIND_LABELS[result.kind].ar : KIND_LABELS[result.kind].en}
                    </Text>
                    {result.matchedLocale !== result.displayLocale ? (
                      <Text style={styles.matchLocale}>{result.matchedLocale.toUpperCase()}</Text>
                    ) : null}
                  </View>
                  <Text numberOfLines={1} style={[styles.resultTitle, isArabic && styles.arabic]}>{result.title}</Text>
                  {resultSubtitle(result) ? (
                    <Text numberOfLines={2} style={[styles.resultSubtitle, isArabic && styles.arabic]}>
                      {resultSubtitle(result)}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.actionGlyph, learning ? styles.learningGlyph : styles.musicGlyph]}>
                  {result.kind === 'music_track' || (result.kind === 'learning_lesson' && result.metadata.mediaType === 'audio')
                    ? (playing ? 'Ⅱ' : '▶')
                    : '›'}
                </Text>
              </Pressable>
            );
          })}
        </View> : null}
      </ScrollView>

      <MusicMiniPlayer />
      <LearningMiniPlayer />
      <BottomTabBar active={scope === 'music' ? 'music' : scope === 'learning' ? 'learn' : null} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  searchArea: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  searchBox: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.goldLine },
  searchGlyph: { width: 24, color: COLORS.goldBright, fontSize: 26, textAlign: 'center' },
  input: { flex: 1, minHeight: 50, color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15 },
  clearButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: COLORS.muted, fontSize: 25 },
  scopeRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  scopeButton: { minWidth: 78, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.md, borderRadius: RADII.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  scopeGoldActive: { borderColor: COLORS.goldLine, backgroundColor: COLORS.goldSoft },
  scopeLearningActive: { borderColor: COLORS.learningLine, backgroundColor: COLORS.learningSoft },
  scopeLabel: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800' },
  scopeGoldLabel: { color: COLORS.goldBright },
  scopeLearningLabel: { color: COLORS.learningBright },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  loader: { marginTop: SPACING.xl },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center', margin: SPACING.xl },
  prompt: { alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: 54 },
  promptMark: { width: 76, height: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 38, backgroundColor: COLORS.navyDark, borderWidth: 1, borderColor: COLORS.goldLine },
  promptMusic: { color: COLORS.goldBright, fontSize: 30, fontWeight: '800' },
  promptLearning: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.title, fontSize: 25, fontWeight: '800' },
  promptTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: SPACING.lg },
  promptBody: { maxWidth: 500, color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: SPACING.sm },
  resultCount: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginBottom: SPACING.sm },
  resultsList: { overflow: 'hidden', borderRadius: RADII.lg, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  resultRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  musicPlaying: { backgroundColor: COLORS.goldSoft },
  learningPlaying: { backgroundColor: COLORS.learningSoft },
  resultIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: RADII.md, borderWidth: 1 },
  musicIcon: { backgroundColor: COLORS.goldSoft, borderColor: COLORS.goldLine },
  learningIcon: { backgroundColor: COLORS.learningDeep, borderColor: COLORS.learningLine },
  resultGlyph: { fontFamily: TYPOGRAPHY.title, fontSize: 19, fontWeight: '800' },
  musicGlyph: { color: COLORS.goldBright },
  learningGlyph: { color: COLORS.learningBright },
  resultInfo: { flex: 1, minWidth: 0 },
  resultMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 3 },
  rowReverse: { flexDirection: 'row-reverse' },
  kindLabel: { fontFamily: TYPOGRAPHY.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  musicKind: { color: COLORS.goldBright },
  learningKind: { color: COLORS.learningBright },
  matchLocale: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 8, fontWeight: '900' },
  resultTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '800' },
  resultSubtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, lineHeight: 16, marginTop: 3 },
  actionGlyph: { width: 28, textAlign: 'center', fontSize: 19, fontWeight: '900' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
