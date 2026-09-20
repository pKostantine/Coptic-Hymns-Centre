import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon from '@/components/chc/ui/Icon';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import LearningArtwork from '@/components/learning/LearningArtwork';
import MusicArtwork from '@/components/music/MusicArtwork';
import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { type LearningQueueItem, useLearningPlayer } from '@/context/LearningPlayerContext';
import { type MusicQueueItem, useMusicPlayer } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import { unifiedSearchService } from '@/services/unifiedSearchService';
import type { MusicConsumerAsset, MusicConsumerTrack } from '@/types/musicConsumer';
import type { UnifiedSearchKind, UnifiedSearchResult } from '@/types/unifiedSearch';
import { formatMusicTrackPerformers } from '@/utils/musicCredits';
import { goBack } from '@/utils/navigation';

type SearchSection = 'music' | 'learning';

interface SectionSearchScreenProps {
  section: SearchSection;
}

const MUSIC_GROUPS: { kind: UnifiedSearchKind; en: string; ar: string }[] = [
  { kind: 'music_artist', en: 'Artists', ar: 'الفنانون' },
  { kind: 'music_release', en: 'Albums & Releases', ar: 'الألبومات والإصدارات' },
  { kind: 'music_track', en: 'Tracks', ar: 'الترانيم' },
];

const LEARNING_GROUPS: { kind: UnifiedSearchKind; en: string; ar: string }[] = [
  { kind: 'learning_cantor', en: 'Cantors', ar: 'المعلمون' },
  { kind: 'learning_hymn', en: 'Hymns', ar: 'الألحان' },
  { kind: 'learning_season', en: 'Seasons', ar: 'المواسم' },
  { kind: 'learning_album', en: 'Albums', ar: 'الألبومات' },
  { kind: 'learning_lesson', en: 'Lessons', ar: 'الدروس' },
];

function resultSubtitle(result: UnifiedSearchResult): string | null {
  if (result.kind === 'music_artist') return result.body;
  if (result.kind === 'music_release') {
    return result.metadata.primaryArtist?.displayName ?? result.subtitle;
  }
  if (result.kind === 'music_track') {
    return formatMusicTrackPerformers({ artists: result.metadata.artists }) || null;
  }
  if (result.kind === 'learning_cantor') return result.body;
  if (result.kind === 'learning_album') return result.metadata.cantorName;
  if (result.kind === 'learning_lesson') {
    return [result.metadata.lessonSetTitle, result.metadata.cantorName].filter(Boolean).join(' • ');
  }
  return result.subtitle ?? result.body;
}

function musicTrackItem(result: Extract<UnifiedSearchResult, { kind: 'music_track' }>): MusicQueueItem {
  const track: MusicConsumerTrack = {
    id: result.entityId,
    title: result.title,
    subtitle: result.subtitle,
    durationMs: result.metadata.durationMs,
    releaseId: result.metadata.releaseId,
    mediaAsset: result.metadata.mediaAsset,
    artists: result.metadata.artists,
  };
  return {
    track,
    releaseId: result.metadata.releaseId,
    releaseTitle: result.metadata.releaseTitle,
    coverAsset: result.metadata.coverAsset,
  };
}

export default function SectionSearchScreen({ section }: SectionSearchScreenProps) {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const music = section === 'music';
  const accent = music ? COLORS.gold : COLORS.learning;
  const accentBright = music ? COLORS.goldBright : COLORS.learningBright;
  const fallback: '/music' | '/learn' = music ? '/music' : '/learn';
  const musicPlayer = useMusicPlayer();
  const learningPlayer = useLearningPlayer();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
  const [libraryAuthenticated, setLibraryAuthenticated] = useState(false);
  const [artistFallbackArt, setArtistFallbackArt] = useState<Record<string, MusicConsumerAsset | null>>({});

  useEffect(() => {
    if (!music) return;
    let active = true;
    musicService.getLibrary(locale)
      .then((library) => {
        if (!active) return;
        setLibraryAuthenticated(library.authenticated);
        setLikedTrackIds(new Set(library.likedTracks.map((track) => track.id)));
      })
      .catch(() => {
        if (!active) return;
        setLibraryAuthenticated(false);
        setLikedTrackIds(new Set());
      });
    return () => { active = false; };
  }, [locale, music]);

  useEffect(() => {
    const value = query.trim();
    if (!value) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      unifiedSearchService.search(value, locale, section, 48)
        .then((payload) => {
          if (active) setResults(payload.results);
        })
        .catch((cause) => {
          if (!active) return;
          setResults([]);
          setError(cause instanceof Error ? cause.message : 'Unable to search.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [locale, query, section]);

  // Some artists intentionally have no profile image. For search, use the
  // artwork of their latest published release as a useful visual fallback.
  useEffect(() => {
    if (!music) return;
    const missing = results.filter(
      (result): result is Extract<UnifiedSearchResult, { kind: 'music_artist' }> => (
        result.kind === 'music_artist'
        && !result.metadata.profileImageAsset
        && !(result.entityId in artistFallbackArt)
      ),
    );
    if (!missing.length) return;

    let active = true;
    void Promise.all(missing.map(async (result) => {
      try {
        return [result.entityId, await musicService.getArtistSearchArt(result.entityId)] as const;
      } catch {
        return [result.entityId, null] as const;
      }
    })).then((pairs) => {
      if (!active) return;
      setArtistFallbackArt((current) => ({ ...current, ...Object.fromEntries(pairs) }));
    });

    return () => { active = false; };
  }, [artistFallbackArt, music, results]);

  const grouped = useMemo(() => {
    const groups = music ? MUSIC_GROUPS : LEARNING_GROUPS;
    return groups
      .map((group) => ({
        ...group,
        results: results.filter((result) => result.kind === group.kind),
      }))
      .filter((group) => group.results.length > 0);
  }, [music, results]);

  const changeQuery = (value: string) => {
    setQuery(value);
    setError(null);
  };

  const toggleTrackLike = async (trackId: string) => {
    if (!libraryAuthenticated) {
      Alert.alert(
        isArabic ? 'الأغاني المعجبة' : 'Liked Songs',
        isArabic ? 'سجّل الدخول إلى حساب CHC لحفظ الأغاني المعجبة.' : 'Sign in to your CHC account to save Liked Songs.',
      );
      return;
    }

    const liked = likedTrackIds.has(trackId);
    try {
      await musicService.setLiked(trackId, !liked);
      setLikedTrackIds((current) => {
        const next = new Set(current);
        if (liked) next.delete(trackId); else next.add(trackId);
        return next;
      });
    } catch (cause) {
      Alert.alert(
        isArabic ? 'الأغاني المعجبة' : 'Liked Songs',
        cause instanceof Error ? cause.message : 'Unable to update Liked Songs.',
      );
    }
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
        musicPlayer.playItem(musicTrackItem(result));
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

  const openTrackPage = (result: Extract<UnifiedSearchResult, { kind: 'music_track' }>) => {
    router.push('/music/track/' + result.entityId);
  };

  const hasQuery = Boolean(query.trim());

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <Head>
        <title>{music ? 'Search Music' : 'Search Learn & Study'}</title>
      </Head>

      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isArabic ? 'رجوع' : 'Back'}
          onPress={() => goBack(router, fallback)}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Icon name="chevron-back" size={23} color={COLORS.white} />
        </Pressable>

        <View style={[
          styles.searchBox,
          { borderColor: music ? 'rgba(201,162,39,0.34)' : 'rgba(151,126,216,0.38)' },
        ]}>
          <Icon name="search-outline" size={19} color={COLORS.muted} />
          <TextInput
            ref={inputRef}
            accessibilityLabel={music
              ? (isArabic ? 'بحث في الترانيم' : 'Search Music')
              : (isArabic ? 'بحث في التعلّم' : 'Search Learn & Study')}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
            onChangeText={changeQuery}
            placeholder={music
              ? (isArabic ? 'فنان أو ألبوم أو ترنيمة' : 'Artists, albums, and tracks')
              : (isArabic ? 'معلّم أو لحن أو درس' : 'Cantors, hymns, albums, and lessons')}
            placeholderTextColor="rgba(201,211,220,0.52)"
            returnKeyType="search"
            selectionColor={accent}
            style={[styles.input, isArabic && styles.arabic]}
            value={query}
          />
          {query && Platform.OS !== 'ios' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isArabic ? 'مسح البحث' : 'Clear search'}
              onPress={() => {
                changeQuery('');
                inputRef.current?.focus();
              }}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            >
              <Icon name="close" size={14} color={COLORS.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <NowPlayingAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {!hasQuery ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptySearchIcon, { borderColor: accent, backgroundColor: music ? COLORS.goldSoft : COLORS.learningSoft }]}>
              <Icon name="search-outline" size={28} color={accentBright} />
            </View>
            <Text style={[styles.emptyTitle, isArabic && styles.arabic]}>
              {music
                ? (isArabic ? 'ابحث في الترانيم' : 'Search Music')
                : (isArabic ? 'ابحث في التعلّم' : 'Search Learn & Study')}
            </Text>
            <Text style={[styles.emptyBody, isArabic && styles.arabic]}>
              {music
                ? (isArabic ? 'ابحث عن فنان أو ألبوم أو ترنيمة.' : 'Find an artist, album, EP, single, or track.')
                : (isArabic ? 'ابحث عن معلّم أو لحن أو ألبوم أو درس.' : 'Find a cantor, hymn, season, album, or lesson.')}
            </Text>
          </View>
        ) : null}

        {loading ? <ActivityIndicator color={accent} style={styles.loader} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {hasQuery && !loading && !error && results.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, isArabic && styles.arabic]}>
              {isArabic ? 'لا توجد نتائج' : 'No results'}
            </Text>
            <Text style={[styles.emptyBody, isArabic && styles.arabic]}>
              {isArabic ? 'جرّب تهجئة مختلفة أو كلمة أقصر.' : 'Try another spelling or a shorter search.'}
            </Text>
          </View>
        ) : null}

        {!loading && grouped.map((group) => (
          <View key={group.kind} style={styles.group}>
            <Text style={[styles.groupTitle, { color: accentBright }, isArabic && styles.arabic]}>
              {isArabic ? group.ar : group.en}
            </Text>
            <View style={styles.resultCard}>
              {group.results.map((result, index) => (
                <SearchResultRow
                  key={result.kind + ':' + result.entityId}
                  result={result}
                  music={music}
                  active={
                    result.kind === 'music_track'
                      ? musicPlayer.currentItem?.track.id === result.entityId
                      : result.kind === 'learning_lesson'
                        ? learningPlayer.currentItem?.id === result.entityId
                        : false
                  }
                  playing={
                    result.kind === 'music_track'
                      ? musicPlayer.currentItem?.track.id === result.entityId && musicPlayer.playing
                      : result.kind === 'learning_lesson'
                        ? learningPlayer.currentItem?.id === result.entityId && learningPlayer.playing
                        : false
                  }
                  liked={result.kind === 'music_track' && likedTrackIds.has(result.entityId)}
                  artistFallbackArt={artistFallbackArt[result.entityId] ?? null}
                  isLast={index === group.results.length - 1}
                  onPress={() => openResult(result)}
                  onTrackTitlePress={result.kind === 'music_track' ? () => openTrackPage(result) : undefined}
                  onToggleLike={result.kind === 'music_track' ? () => void toggleTrackLike(result.entityId) : undefined}
                />
              ))}
            </View>
          </View>
        ))}
      </NowPlayingAwareScrollView>

      <BottomTabBar active={music ? 'music' : 'learn'} />
    </SafeAreaView>
  );
}

function SearchResultRow({
  result,
  music,
  active,
  playing,
  liked,
  artistFallbackArt,
  isLast,
  onPress,
  onTrackTitlePress,
  onToggleLike,
}: {
  result: UnifiedSearchResult;
  music: boolean;
  active: boolean;
  playing: boolean;
  liked: boolean;
  artistFallbackArt: MusicConsumerAsset | null;
  isLast: boolean;
  onPress: () => void;
  onTrackTitlePress?: () => void;
  onToggleLike?: () => void;
}) {
  const subtitle = resultSubtitle(result);
  const accent = music ? COLORS.goldBright : COLORS.learningBright;

  let artwork = null;
  if (result.kind === 'music_artist') {
    artwork = (
      <MusicArtwork
        asset={result.metadata.profileImageAsset ?? artistFallbackArt}
        size={56}
        rounded
        label={result.title}
      />
    );
  } else if (result.kind === 'music_release') {
    artwork = <MusicArtwork asset={result.metadata.coverAsset} size={56} radius={9} label={result.title} />;
  } else if (result.kind === 'music_track') {
    artwork = <MusicArtwork asset={result.metadata.coverAsset} size={56} radius={9} label={result.metadata.releaseTitle ?? result.title} />;
  } else if (result.kind === 'learning_cantor') {
    artwork = <LearningArtwork asset={result.metadata.profileImageAsset} size={56} rounded label={result.title} />;
  } else if (result.kind === 'learning_album' || result.kind === 'learning_lesson') {
    artwork = <LearningArtwork asset={result.metadata.coverAsset} size={56} radius={9} label={result.title} />;
  } else {
    artwork = <LearningArtwork asset={null} size={56} radius={9} label={result.title} />;
  }

  const track = result.kind === 'music_track' ? result : null;
  const audioLesson = result.kind === 'learning_lesson' && result.metadata.mediaType === 'audio';
  const playable = Boolean(track || audioLesson);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.resultRow,
        active && (music ? styles.musicActive : styles.learningActive),
        !isLast && styles.resultDivider,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.artwork}>{artwork}</View>

      <View style={styles.resultInfo}>
        {track ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={'Open ' + track.title}
            onPress={(event) => {
              event.stopPropagation();
              onTrackTitlePress?.();
            }}
            style={({ pressed }) => pressed && styles.titlePressed}
          >
            <Text numberOfLines={1} style={styles.trackIdentity}>
              <Text style={[styles.trackTitle, active && { color: accent }]}>{track.title}</Text>
              {track.metadata.releaseTitle ? (
                <Text style={styles.trackAlbum}> — {track.metadata.releaseTitle}</Text>
              ) : null}
            </Text>
          </Pressable>
        ) : (
          <Text numberOfLines={1} style={[styles.resultTitle, active && { color: accent }]}>{result.title}</Text>
        )}

        {subtitle ? <Text numberOfLines={1} style={styles.resultSubtitle}>{subtitle}</Text> : null}

        {result.kind === 'music_release' ? (
          <Text numberOfLines={1} style={styles.tertiary}>
            {[result.metadata.releaseType === 'ep' ? 'EP' : result.metadata.releaseType === 'album' ? 'Album' : 'Single', result.metadata.releaseDate?.slice(0, 4)]
              .filter(Boolean)
              .join(' • ')}
          </Text>
        ) : null}
      </View>

      {track && onToggleLike ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike track' : 'Like track'}
          onPress={(event) => {
            event.stopPropagation();
            onToggleLike();
          }}
          style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
        >
          <Icon name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? COLORS.goldBright : COLORS.muted} />
        </Pressable>
      ) : null}

      {playable ? (
        <View style={[styles.playAction, { backgroundColor: music ? COLORS.goldSoft : COLORS.learningSoft }]}>
          <Icon name={playing ? 'pause' : 'play'} size={16} color={accent} />
        </View>
      ) : (
        <Icon name="chevron-forward" size={18} color={COLORS.muted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  searchBox: {
    flex: 1,
    minWidth: 0,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.085)',
    borderWidth: 1,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 42,
    paddingVertical: 0,
    color: COLORS.white,
    fontFamily: TYPOGRAPHY.body,
    fontSize: 16,
  },
  arabic: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
  clearButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  content: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 36 },
  loader: { marginTop: 28 },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center', padding: SPACING.xl },
  emptyState: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 58 },
  emptySearchIcon: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  emptyTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 20, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  emptyBody: { maxWidth: 440, color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
  group: { marginBottom: 20 },
  groupTitle: { fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '800', marginHorizontal: 4, marginBottom: 8 },
  resultCard: { overflow: 'hidden', borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  resultRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 10, paddingVertical: 9 },
  resultDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.055)' },
  musicActive: { backgroundColor: COLORS.goldSoft },
  learningActive: { backgroundColor: COLORS.learningSoft },
  artwork: { width: 56, height: 56 },
  resultInfo: { flex: 1, minWidth: 0 },
  resultTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '700' },
  trackIdentity: { fontFamily: TYPOGRAPHY.body, fontSize: 15, lineHeight: 20 },
  trackTitle: { color: COLORS.white, fontWeight: '800' },
  trackAlbum: { color: COLORS.muted, fontWeight: '400' },
  titlePressed: { opacity: 0.65 },
  resultSubtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 4 },
  tertiary: { color: 'rgba(201,211,220,0.55)', fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 3 },
  iconAction: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  playAction: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65, transform: [{ scale: 0.94 }] },
});
