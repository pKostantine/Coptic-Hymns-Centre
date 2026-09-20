import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon from '@/components/chc/ui/Icon';
import ShareMetadata from '@/components/chc/ui/ShareMetadata';
import MusicArtwork from '@/components/music/MusicArtwork';
import MusicLyricsView from '@/components/music/MusicLyricsView';
import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import RoundIconButton from '@/components/playback/RoundIconButton';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { type MusicQueueItem, useMusicPlayer } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import type { MusicConsumerTrackDetail, PublishedTrackLyricsPayload, PublishedLyricSet } from '@/types/musicConsumer';
import { formatMusicTrackPerformers } from '@/utils/musicCredits';
import { goBack } from '@/utils/navigation';
import { publicUrl } from '@/utils/publicUrl';
import { shareLink } from '@/utils/shareLink';

function formatDuration(durationMs: number | null): string | null {
  if (!durationMs || durationMs <= 0) return null;
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function MusicTrackDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const trackId = Array.isArray(params.id) ? params.id[0] : params.id;
  const desktop = width >= 860;

  const [track, setTrack] = useState<MusicConsumerTrackDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [libraryAuthenticated, setLibraryAuthenticated] = useState(false);
  const [lyrics, setLyrics] = useState<PublishedTrackLyricsPayload | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(true);
  const [selectedLyricSetId, setSelectedLyricSetId] = useState<string | null>(null);
  const player = useMusicPlayer();

  useEffect(() => {
    if (!trackId) return;
    let active = true;
    setLoading(true);
    setError(null);
    musicService.getTrack(trackId, locale)
      .then((payload) => {
        if (active) setTrack(payload);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load track.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [locale, trackId]);

  useEffect(() => {
    if (!trackId) return;
    let active = true;
    musicService.getLibrary(locale)
      .then((library) => {
        if (!active) return;
        setLibraryAuthenticated(library.authenticated);
        setLiked(library.likedTracks.some((item) => item.id === trackId));
      })
      .catch(() => {
        if (!active) return;
        setLibraryAuthenticated(false);
        setLiked(false);
      });
    return () => { active = false; };
  }, [locale, trackId]);

  useEffect(() => {
    if (!trackId) return;
    let active = true;
    setLyricsLoading(true);
    musicService.getLyrics(trackId)
      .then((payload) => {
        if (!active) return;
        setLyrics(payload);
        const preferred = [...payload.lyricSets].sort((a, b) => {
          const order: Record<string, number> = { en: 0, fr: 1, cop: 2, ar: 3 };
          return (order[a.locale] ?? 99) - (order[b.locale] ?? 99);
        })[0] ?? null;
        setSelectedLyricSetId((current) => (
          current && payload.lyricSets.some((set) => set.id === current)
            ? current
            : preferred?.id ?? null
        ));
      })
      .catch(() => {
        if (!active) return;
        setLyrics({ trackId, lyricSets: [] });
        setSelectedLyricSetId(null);
      })
      .finally(() => {
        if (active) setLyricsLoading(false);
      });
    return () => { active = false; };
  }, [trackId]);

  const queueItem = useMemo<MusicQueueItem | null>(() => {
    if (!track) return null;
    return {
      track: {
        id: track.id,
        title: track.title,
        subtitle: track.subtitle,
        durationMs: track.durationMs,
        discNumber: track.discNumber,
        trackNumber: track.trackNumber,
        releaseId: track.release?.id ?? null,
        mediaAsset: track.mediaAsset,
        artists: track.artists,
      },
      releaseId: track.release?.id ?? null,
      releaseTitle: track.release?.title ?? null,
      releaseType: track.release?.releaseType ?? null,
      musicType: track.release?.musicType ?? null,
      recordingType: track.release?.recordingType ?? null,
      coverAsset: track.release?.coverAsset ?? null,
    };
  }, [track]);

  const isCurrent = Boolean(track && player.currentItem?.track.id === track.id);
  const isPlaying = isCurrent && player.playing;
  const lyricSets = useMemo<PublishedLyricSet[]>(() => {
    const order: Record<string, number> = { en: 0, fr: 1, cop: 2, ar: 3 };
    return [...(lyrics?.lyricSets ?? [])].sort((a, b) => (
      (order[a.locale] ?? 99) - (order[b.locale] ?? 99)
    ));
  }, [lyrics]);
  const selectedLyricSet = lyricSets.find((set) => set.id === selectedLyricSetId) ?? null;
  const activeLineId = useMemo(() => {
    if (!isCurrent || !selectedLyricSet) return null;
    const timed = selectedLyricSet.lines.filter((line) => line.startMs != null);
    let active: string | null = null;
    for (const line of timed) {
      if ((line.startMs ?? 0) <= player.currentTimeMs) active = line.id;
      else break;
    }
    return active;
  }, [isCurrent, player.currentTimeMs, selectedLyricSet]);

  const togglePlayback = () => {
    if (!queueItem) return;
    if (isCurrent) {
      player.togglePlayback();
      return;
    }
    player.playItem(queueItem);
  };

  const toggleLike = async () => {
    if (!track || likeBusy) return;
    if (!libraryAuthenticated) {
      Alert.alert(
        isArabic ? 'الأغاني المعجبة' : 'Liked Songs',
        isArabic ? 'سجّل الدخول إلى حساب CHC لحفظ الأغاني المعجبة.' : 'Sign in to your CHC account to save Liked Songs.',
      );
      return;
    }
    setLikeBusy(true);
    try {
      const next = !liked;
      await musicService.setLiked(track.id, next);
      setLiked(next);
    } catch (cause) {
      Alert.alert(
        isArabic ? 'الأغاني المعجبة' : 'Liked Songs',
        cause instanceof Error ? cause.message : 'Unable to update Liked Songs.',
      );
    } finally {
      setLikeBusy(false);
    }
  };

  const seekLyricLine = (startMs: number) => {
    if (!queueItem) return;
    if (isCurrent) {
      void player.seekToMs(startMs);
      return;
    }
    player.playItem(queueItem);
    setTimeout(() => { void player.seekToMs(startMs); }, 100);
  };

  const shareTrack = async () => {
    if (!track) return;
    const url = publicUrl(`/music/track/${track.id}?share=3`);
    await shareLink({
      title: track.title,
      text: track.release?.title ? `${track.title} — ${track.release.title}` : track.title,
      url,
    });
  };

  if (loading && !track) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onBack={() => goBack(router, '/music')} />
        <ActivityIndicator color={COLORS.gold} style={styles.loader} />
      </SafeAreaView>
    );
  }

  if (!track) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onBack={() => goBack(router, '/music')} />
        <View style={styles.errorState}>
          <Text style={styles.errorTitle}>Track unavailable</Text>
          <Text style={styles.error}>{error ?? 'This track could not be loaded.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const performers = formatMusicTrackPerformers(track, 'Coptic Hymns Centre');
  const release = track.release;
  const meta = [
    release?.recordingType,
    release?.musicType,
    release?.releaseDate?.slice(0, 4),
    formatDuration(track.durationMs),
  ].filter(Boolean).join(' • ');
  const artSize = desktop ? 310 : Math.min(280, Math.max(210, width - 96));

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ShareMetadata
        title={track.title}
        description={track.release?.title ? `${track.title} — ${track.release.title}` : performers}
        canonicalUrl={publicUrl(`/music/track/${track.id}`)}
        imageUrl={musicService.resolveAsset(track.release?.coverAsset ?? null)}
        type="music.song"
      />
      <Header onBack={() => goBack(router, '/music')} />

      <NowPlayingAwareScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={[styles.hero, desktop && styles.heroDesktop]}>
          <View style={styles.artColumn}>
            <MusicArtwork
              asset={release?.coverAsset ?? null}
              size={artSize}
              radius={18}
              label={release?.title ?? track.title}
            />
          </View>

          <View style={[styles.details, desktop && styles.detailsDesktop]}>
            <Text style={[styles.eyebrow, isArabic && styles.arabic]}>
              {isArabic ? 'ترنيمة' : 'TRACK'}
            </Text>
            <Text style={[styles.title, isArabic && styles.arabic]}>{track.title}</Text>

            {release ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push(`/music/release/${release.id}`)}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text numberOfLines={1} style={[styles.album, isArabic && styles.arabic]}>{release.title}</Text>
              </Pressable>
            ) : null}

            <Text numberOfLines={2} style={[styles.artists, isArabic && styles.arabic]}>{performers}</Text>
            {meta ? <Text style={[styles.meta, isArabic && styles.arabic]}>{meta}</Text> : null}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                onPress={togglePlayback}
                style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} size={23} color={COLORS.black} />
                <Text style={styles.playLabel}>{isPlaying ? (isArabic ? 'إيقاف' : 'Pause') : (isArabic ? 'تشغيل' : 'Play')}</Text>
              </Pressable>

              <RoundIconButton
                icon={liked ? 'heart' : 'heart-outline'}
                accessibilityLabel={liked ? 'Unlike track' : 'Like track'}
                active={liked}
                disabled={likeBusy}
                onPress={() => void toggleLike()}
                size={46}
              />
              <RoundIconButton
                icon="share-outline"
                accessibilityLabel="Share track"
                onPress={() => void shareTrack()}
                size={46}
              />
            </View>
          </View>
        </View>

        {release ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/music/release/${release.id}`)}
            style={({ pressed }) => [styles.albumCard, pressed && styles.rowPressed]}
          >
            <MusicArtwork asset={release.coverAsset} size={72} radius={10} label={release.title} />
            <View style={styles.albumCardText}>
              <Text style={[styles.albumCardLabel, isArabic && styles.arabic]}>{isArabic ? 'من الإصدار' : 'From the release'}</Text>
              <Text numberOfLines={1} style={[styles.albumCardTitle, isArabic && styles.arabic]}>{release.title}</Text>
              <Text numberOfLines={1} style={[styles.albumCardMeta, isArabic && styles.arabic]}>
                {[
                  release.releaseType === 'album' ? 'Album' : release.releaseType === 'ep' ? 'EP' : 'Single',
                  release.primaryArtist?.displayName,
                ].filter(Boolean).join(' • ')}
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} color={COLORS.muted} />
          </Pressable>
        ) : null}

        <View style={styles.creditsCard}>
          <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'الفنانون' : 'Artists'}</Text>
          {track.artists.map((artist, index) => (
            <Pressable
              key={artist.id + ':' + artist.role + ':' + index}
              accessibilityRole="link"
              onPress={() => router.push(`/music/artist/${artist.id}`)}
              style={({ pressed }) => [styles.artistRow, pressed && styles.rowPressed]}
            >
              <View style={styles.artistText}>
                <Text numberOfLines={1} style={[styles.artistName, isArabic && styles.arabic]}>{artist.displayName}</Text>
                <Text style={[styles.artistRole, isArabic && styles.arabic]}>
                  {artist.role === 'primary' ? (isArabic ? 'فنان رئيسي' : 'Primary artist') : (isArabic ? 'فنان مشارك' : 'Featured artist')}
                </Text>
              </View>
              <Icon name="chevron-forward" size={17} color={COLORS.muted} />
            </Pressable>
          ))}
        </View>

        <View style={styles.lyricsCard}>
          <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'الكلمات' : 'Lyrics'}</Text>
          <View style={[styles.lyricsViewport, desktop && styles.lyricsViewportDesktop]}>
            <MusicLyricsView
              lyricSets={lyricSets}
              selectedSetId={selectedLyricSetId}
              onSelectSet={setSelectedLyricSetId}
              activeLineId={activeLineId}
              loading={lyricsLoading}
              onSeekLine={seekLyricLine}
              forceCompact={!desktop}
            />
          </View>
        </View>
      </NowPlayingAwareScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Icon name="chevron-back" size={22} color={COLORS.white} />
      </Pressable>
      <Text style={styles.headerTitle}>Track</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  headerTitle: { flex: 1, textAlign: 'center', color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 16, fontWeight: '700' },
  headerSpacer: { width: 40 },
  content: { padding: SPACING.lg, paddingBottom: 44 },
  hero: { alignItems: 'center' },
  heroDesktop: { maxWidth: 1060, width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 46, paddingVertical: 22 },
  artColumn: { alignItems: 'center', justifyContent: 'center' },
  details: { width: '100%', maxWidth: 680, alignItems: 'center', marginTop: 24 },
  detailsDesktop: { flex: 1, alignItems: 'flex-start', marginTop: 0 },
  eyebrow: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 32, lineHeight: 39, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  album: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 17, fontWeight: '600', marginTop: 10, textAlign: 'center' },
  artists: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  meta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 8, textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 22, flexWrap: 'wrap' },
  playButton: { minHeight: 46, paddingHorizontal: 22, borderRadius: RADII.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: COLORS.gold },
  playLabel: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '900' },
  albumCard: { maxWidth: 760, width: '100%', alignSelf: 'center', marginTop: 34, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  albumCardText: { flex: 1, minWidth: 0 },
  albumCardLabel: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  albumCardTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '800', marginTop: 4 },
  albumCardMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  creditsCard: { maxWidth: 760, width: '100%', alignSelf: 'center', marginTop: 18, overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  lyricsCard: { maxWidth: 760, width: '100%', alignSelf: 'center', marginTop: 18, overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  lyricsViewport: { height: 390, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, paddingTop: 10 },
  lyricsViewportDesktop: { height: 470 },
  sectionTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '800', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },
  artistRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  artistText: { flex: 1, minWidth: 0 },
  artistName: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '700' },
  artistRole: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 2 },
  loader: { marginTop: 60 },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '800' },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: 8, textAlign: 'center' },
  pressed: { opacity: 0.68, transform: [{ scale: 0.98 }] },
  rowPressed: { opacity: 0.72 },
  arabic: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
});
