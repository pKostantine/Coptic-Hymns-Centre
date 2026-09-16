import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import MusicArtwork from '@/components/music/MusicArtwork';
import MusicMiniPlayer from '@/components/music/MusicMiniPlayer';
import MusicSectionNav from '@/components/music/MusicSectionNav';
import MusicTrackRow from '@/components/music/MusicTrackRow';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useMusicPlayer, type MusicQueueItem } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import type { MusicSearchPayload } from '@/types/musicConsumer';

const EMPTY_RESULTS: MusicSearchPayload = { artists: [], releases: [], tracks: [] };

export default function MusicSearchScreen() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const { currentItem, playQueue } = useMusicPlayer();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MusicSearchPayload>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      musicService.search(trimmed, locale)
        .then((payload) => { if (active) setResults(payload); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Search failed.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [locale, query]);

  const trackQueue = useMemo<MusicQueueItem[]>(() => results.tracks.map((track) => ({ track, releaseId: track.releaseId })), [results.tracks]);
  const hasResults = results.artists.length + results.releases.length + results.tracks.length > 0;

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <AppHeader
        title={{ english: 'Search Music', arabic: 'ابحث في الترانيم' }}
        visibleLanguages={{ english: !isArabic, arabic: isArabic }}
      />
      <MusicSectionNav active="search" />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.searchBox}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            value={query}
            onChangeText={setQuery}
            placeholder={isArabic ? 'فنان، إصدار، أو ترنيمة' : 'Artist, release, or track'}
            placeholderTextColor={COLORS.muted}
            style={[styles.input, isArabic && styles.arabic]}
          />
          {query ? <Pressable onPress={() => setQuery('')}><Text style={styles.clear}>×</Text></Pressable> : null}
        </View>

        {loading ? <ActivityIndicator color={COLORS.gold} style={styles.loader} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!query.trim() ? (
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>{isArabic ? 'اكتشف مكتبة CHC' : 'Discover the CHC library'}</Text>
            <Text style={styles.promptBody}>{isArabic ? 'ابحث عن الفنانين والألبومات والترانيم المنشورة.' : 'Search published artists, albums, singles, EPs, and tracks.'}</Text>
          </View>
        ) : null}

        {!loading && query.trim() && !hasResults && !error ? (
          <Text style={styles.noResults}>{isArabic ? 'لا توجد نتائج.' : 'No results found.'}</Text>
        ) : null}

        {results.artists.length ? (
          <>
            <Text style={styles.sectionTitle}>{isArabic ? 'الفنانون' : 'Artists'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
              {results.artists.map((artist) => (
                <Pressable key={artist.id} style={styles.artistCard} onPress={() => router.push(`/music/artist/${artist.id}`)}>
                  <MusicArtwork asset={artist.profileImageAsset} size={96} rounded label={artist.displayName} />
                  <Text numberOfLines={1} style={[styles.artistName, isArabic && styles.arabic]}>{artist.displayName}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {results.releases.length ? (
          <>
            <Text style={styles.sectionTitle}>{isArabic ? 'الإصدارات' : 'Releases'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
              {results.releases.map((release) => (
                <Pressable key={release.id} style={styles.releaseCard} onPress={() => router.push(`/music/release/${release.id}`)}>
                  <MusicArtwork asset={release.coverAsset} size={132} label={release.title} />
                  <Text numberOfLines={1} style={[styles.releaseTitle, isArabic && styles.arabic]}>{release.title}</Text>
                  <Text numberOfLines={1} style={[styles.releaseArtist, isArabic && styles.arabic]}>{release.primaryArtist?.displayName ?? release.releaseType.toUpperCase()}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {results.tracks.length ? (
          <>
            <Text style={styles.sectionTitle}>{isArabic ? 'الترانيم' : 'Tracks'}</Text>
            <View style={styles.trackList}>
              {results.tracks.map((track, index) => (
                <MusicTrackRow
                  key={track.id}
                  track={track}
                  index={index}
                  active={currentItem?.track.id === track.id}
                  onPress={() => playQueue(trackQueue, index)}
                />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <MusicMiniPlayer />
      <BottomTabBar active="music" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  searchBox: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADII.pill, backgroundColor: COLORS.surfaceSoft, borderWidth: 1, borderColor: COLORS.border },
  searchGlyph: { color: COLORS.gold, fontSize: 24, width: 24, textAlign: 'center' },
  input: { flex: 1, minHeight: 46, color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15 },
  clear: { color: COLORS.muted, fontSize: 26, paddingHorizontal: 4 },
  loader: { marginTop: SPACING.lg },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center', marginTop: SPACING.lg },
  promptCard: { marginTop: SPACING.lg, padding: SPACING.lg, borderRadius: RADII.lg, backgroundColor: COLORS.navyDark, borderWidth: 1, borderColor: COLORS.goldLine },
  promptTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
  promptBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, lineHeight: 20, marginTop: SPACING.sm },
  noResults: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center', marginTop: SPACING.xl },
  sectionTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700', marginTop: SPACING.xl, marginBottom: SPACING.md },
  horizontalList: { gap: SPACING.md, paddingRight: SPACING.md },
  artistCard: { width: 100, alignItems: 'center' },
  artistName: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: SPACING.sm },
  releaseCard: { width: 132 },
  releaseTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '700', marginTop: SPACING.sm },
  releaseArtist: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 3 },
  trackList: { borderRadius: RADII.md, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
