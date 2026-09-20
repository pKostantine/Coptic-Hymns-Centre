import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon from '@/components/chc/ui/Icon';
import ShareMetadata from '@/components/chc/ui/ShareMetadata';
import MusicArtwork from '@/components/music/MusicArtwork';
import MusicDownloadButton from '@/components/music/MusicDownloadButton';
import MusicMiniPlayer from '@/components/music/MusicMiniPlayer';
import MusicTrackRow from '@/components/music/MusicTrackRow';
import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useMusicPlayer, type MusicQueueItem } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import {
  musicReleaseDownloadRequest,
  musicTrackDownloadRequest,
} from '@/services/offlineDownloadRequests';
import type { MusicConsumerRelease, PublishedTrackLyricsPayload } from '@/types/musicConsumer';
import { goBack } from '@/utils/navigation';
import { publicUrl } from '@/utils/publicUrl';
import { shareLink } from '@/utils/shareLink';

export default function MusicReleaseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; track?: string }>();
  const { width } = useWindowDimensions();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const releaseId = Array.isArray(params.id) ? params.id[0] : params.id;
  const linkedTrackId = Array.isArray(params.track) ? params.track[0] : params.track;
  const desktop = width >= 900;
  const [release, setRelease] = useState<MusicConsumerRelease | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
  const [releaseLiked, setReleaseLiked] = useState(false);
  const [releaseLikeBusy, setReleaseLikeBusy] = useState(false);
  const [libraryAuthenticated, setLibraryAuthenticated] = useState(false);
  const { currentItem, playQueue } = useMusicPlayer();

  useEffect(() => {
    if (!releaseId) return;
    let active = true;
    setRelease(null);
    setError(null);
    musicService.getRelease(releaseId, locale)
      .then((payload) => { if (active) setRelease(payload); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load release.'); });
    return () => { active = false; };
  }, [locale, releaseId]);

  const tracks = Array.isArray(release?.tracks) ? release.tracks : [];
  const queue = useMemo<MusicQueueItem[]>(() => tracks.map((track) => ({
    track: { ...track, artists: Array.isArray(track.artists) ? track.artists : [] },
    releaseId: release?.id ?? null,
    releaseTitle: release?.title ?? null,
    releaseType: release?.releaseType ?? null,
    musicType: release?.musicType ?? null,
    recordingType: release?.recordingType ?? null,
    coverAsset: release?.coverAsset ?? null,
  })), [release, tracks]);
  const downloadRequest = useMemo(
    () => release ? musicReleaseDownloadRequest(release, locale) : null,
    [locale, release],
  );

  useEffect(() => {
    if (!releaseId) return;
    let active = true;
    Promise.all([
      musicService.getLibrary(locale),
      musicService.getReleaseLiked(releaseId),
    ])
      .then(([library, liked]) => {
        if (!active) return;
        setLibraryAuthenticated(library.authenticated);
        setLikedTrackIds(new Set(library.likedTracks.map((track) => track.id)));
        setReleaseLiked(liked);
      })
      .catch(() => {
        if (!active) return;
        setLibraryAuthenticated(false);
        setLikedTrackIds(new Set());
        setReleaseLiked(false);
      });
    return () => { active = false; };
  }, [locale, releaseId]);

  const prepareReleaseDownload = async () => {
    if (!release) throw new Error('Release is not loaded.');
    const lyrics = await Promise.all(tracks.map(async (track) => {
      try { return [track.id, await musicService.getLyrics(track.id, locale)] as const; }
      catch { return [track.id, null] as const; }
    }));
    return musicReleaseDownloadRequest(
      release,
      locale,
      Object.fromEntries(lyrics) as Record<string, PublishedTrackLyricsPayload | null>,
    );
  };

  const handleShareRelease = async () => {
    if (!release) return;
    const deepLink = publicUrl(`/share/music/release/${release.id}?v=4`);
    await shareLink({
      title: release.title,
      text: release.primaryArtist?.displayName
        ? `${release.title} — ${release.primaryArtist.displayName}`
        : release.title,
      url: deepLink,
    });
  };

  const handleToggleReleaseLike = async () => {
    if (!release || releaseLikeBusy) return;
    if (!libraryAuthenticated) {
      Alert.alert(
        isArabic ? 'الإصدارات المعجبة' : 'Liked Releases',
        isArabic ? 'سجّل الدخول إلى حساب CHC لحفظ الإصدارات.' : 'Sign in to your CHC account to save liked releases.',
      );
      return;
    }

    setReleaseLikeBusy(true);
    try {
      const nextLiked = !releaseLiked;
      await musicService.setReleaseLiked(release.id, nextLiked);
      setReleaseLiked(nextLiked);
    } catch (cause) {
      Alert.alert(
        isArabic ? 'الإصدارات المعجبة' : 'Liked Releases',
        cause instanceof Error ? cause.message : 'Unable to update this release.',
      );
    } finally {
      setReleaseLikeBusy(false);
    }
  };

  const handleToggleTrackLike = async (trackId: string) => {
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
      Alert.alert(isArabic ? 'الأغاني المعجبة' : 'Liked Songs', cause instanceof Error ? cause.message : 'Unable to update Liked Songs.');
    }
  };

  if (!release) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onBack={() => goBack(router, '/music')} title={isArabic ? 'الإصدار' : 'Release'} isArabic={isArabic} />
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={COLORS.gold} style={styles.loader} />}
      </SafeAreaView>
    );
  }

  const artistName = release.primaryArtist?.displayName ?? 'Coptic Hymns Centre';
  const releaseType = isArabic
    ? release.releaseType === 'album' ? 'ألبوم' : release.releaseType === 'ep' ? 'EP' : 'أغنية منفردة'
    : release.releaseType === 'album' ? 'Album' : release.releaseType === 'ep' ? 'EP' : 'Single';
  const releaseMeta = [
    release.recordingType,
    release.musicType,
    releaseType,
    release.releaseDate?.slice(0, 4),
    isArabic ? `${tracks.length} ترنيمة` : `${tracks.length} track${tracks.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' • ');

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <ShareMetadata
        title={release.title}
        description={release.primaryArtist?.displayName
          ? `${release.title} — ${release.primaryArtist.displayName}`
          : release.description}
        canonicalUrl={publicUrl(`/music/release/${release.id}`)}
        imageUrl={musicService.resolveAsset(release.coverAsset ?? null)}
        type="music.album"
      />
      <Header onBack={() => goBack(router, '/music')} title={releaseType} isArabic={isArabic} />
      <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, desktop && styles.heroDesktop]}>
          <View style={[styles.artBox, desktop && styles.artBoxDesktop]}>
            <MusicArtwork asset={release.coverAsset} size={desktop ? 270 : 220} label={release.title} />
          </View>

          <View style={[styles.meta, desktop && styles.metaDesktop]}>
            <Text style={[styles.title, desktop && styles.desktopText, isArabic && styles.arabic]}>{release.title}</Text>
            {release.subtitle ? <Text style={[styles.subtitle, desktop && styles.desktopText, isArabic && styles.arabic]}>{release.subtitle}</Text> : null}
            <Pressable disabled={!release.primaryArtist?.id} onPress={() => release.primaryArtist?.id && router.push(`/music/artist/${release.primaryArtist.id}`)}>
              <Text style={[styles.artist, desktop && styles.desktopText, isArabic && styles.arabic]}>{artistName}</Text>
            </Pressable>
            <Text style={[styles.releaseMeta, desktop && styles.desktopText, isArabic && styles.arabic]}>{releaseMeta}</Text>
            {release.description ? <Text style={[styles.description, desktop && styles.descriptionDesktop, isArabic && styles.arabic]}>{release.description}</Text> : null}

            <View style={[styles.actions, desktop && styles.actionsDesktop]}>
              <Pressable style={styles.playAll} onPress={() => queue.length && playQueue(queue, 0)}>
                <Icon name="play" size={16} color={COLORS.black} />
                <Text style={styles.playAllText}>{isArabic ? 'تشغيل' : 'Play'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={releaseLiked ? 'Unlike release' : 'Like release'}
                disabled={releaseLikeBusy}
                style={[styles.actionButton, releaseLikeBusy && styles.disabledButton]}
                onPress={() => void handleToggleReleaseLike()}
              >
                <Icon name={releaseLiked ? 'heart' : 'heart-outline'} size={19} color={releaseLiked ? COLORS.goldBright : COLORS.white} />
                <Text style={styles.actionButtonText}>{isArabic ? 'إعجاب' : 'Like'}</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => void handleShareRelease()}>
                <Icon name="share-outline" size={19} color={COLORS.goldBright} />
                <Text style={styles.actionButtonText}>{isArabic ? 'مشاركة' : 'Share'}</Text>
              </Pressable>
              {downloadRequest ? (
                <MusicDownloadButton
                  packageKey={downloadRequest.packageKey}
                  request={prepareReleaseDownload}
                  isArabic={isArabic}
                />
              ) : null}
            </View>
          </View>
        </View>

        <View style={[styles.trackList, desktop && styles.trackListDesktop]}>
          {tracks.map((track, index) => {
            const trackRequest = musicTrackDownloadRequest({
              track,
              locale,
              releaseTitle: release.title,
              coverAsset: release.coverAsset,
            });
            return (
              <MusicTrackRow
                key={track.id}
                track={track}
                index={index}
                active={currentItem?.track.id === track.id || (!currentItem && linkedTrackId === track.id)}
                onPress={() => playQueue(queue, index)}
                onTitlePress={() => router.push(`/music/track/${track.id}`)}
                showLikeButton
                liked={likedTrackIds.has(track.id)}
                onToggleLike={() => void handleToggleTrackLike(track.id)}
                trailing={(
                  <MusicDownloadButton
                    packageKey={trackRequest.packageKey}
                    request={async () => {
                      let lyrics: PublishedTrackLyricsPayload | null = null;
                      try { lyrics = await musicService.getLyrics(track.id, locale); } catch { /* optional offline metadata */ }
                      return musicTrackDownloadRequest({
                        track,
                        locale,
                        releaseTitle: release.title,
                        coverAsset: release.coverAsset,
                        lyrics,
                      });
                    }}
                    isArabic={isArabic}
                    compact
                    label=""
                  />
                )}
              />
            );
          })}
        </View>
      </NowPlayingAwareScrollView>
      <MusicMiniPlayer />
    </SafeAreaView>
  );
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.errorBoundary}>
        <Text style={styles.errorBoundaryTitle}>Release could not be displayed</Text>
        <Text style={styles.error}>{error.message || 'An unexpected error occurred while opening this release.'}</Text>
        <View style={styles.errorBoundaryActions}>
          <Pressable style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
          <Pressable style={styles.backLink} onPress={() => router.replace('/music')}>
            <Text style={styles.backLinkText}>Back to Music</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Header({ onBack, title, isArabic }: { onBack: () => void; title: string; isArabic: boolean }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="Back" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable>
      <Text numberOfLines={1} style={[styles.headerTitle, isArabic && styles.arabic]}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { color: COLORS.gold, fontSize: 38, lineHeight: 40 },
  headerTitle: { flex: 1, textAlign: 'center', color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontWeight: '700', fontSize: 17 },
  headerSpacer: { width: 44 },
  content: { paddingBottom: SPACING.xl },
  hero: { alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  heroDesktop: {
    width: '94%',
    maxWidth: 1120,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 0,
    paddingTop: 0,
    marginTop: SPACING.lg,
    overflow: 'hidden',
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  artBox: { alignItems: 'center', justifyContent: 'center' },
  artBoxDesktop: { padding: SPACING.lg, backgroundColor: '#0B1E33', borderRightWidth: 1, borderRightColor: COLORS.border },
  meta: { width: '100%', maxWidth: 680, alignItems: 'center', marginTop: SPACING.lg },
  metaDesktop: { flex: 1, maxWidth: undefined, alignItems: 'flex-start', justifyContent: 'center', marginTop: 0, padding: SPACING.xl },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, textAlign: 'center', marginTop: SPACING.xs },
  artist: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '700', marginTop: SPACING.sm, textAlign: 'center' },
  releaseMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: SPACING.sm, textAlign: 'center' },
  desktopText: { textAlign: 'left' },
  description: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: SPACING.md },
  descriptionDesktop: { textAlign: 'left', maxWidth: 680 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg },
  actionsDesktop: { justifyContent: 'flex-start' },
  playAll: { flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.xl, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: RADII.pill, backgroundColor: COLORS.gold },
  playAllText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '800' },
  actionButton: { minHeight: 46, paddingHorizontal: SPACING.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: RADII.pill, borderWidth: 1, borderColor: COLORS.goldLine, backgroundColor: COLORS.surface },
  actionButtonText: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '700' },
  disabledButton: { opacity: 0.45 },
  trackList: { marginTop: SPACING.lg, marginHorizontal: SPACING.md, borderRadius: RADII.md, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  trackListDesktop: { width: '94%', maxWidth: 1120, alignSelf: 'center', marginHorizontal: 0 },
  loader: { marginTop: SPACING.xl },
  errorBoundary: { flex: 1, padding: SPACING.xl, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  errorBoundaryTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  errorBoundaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, justifyContent: 'center' },
  retryButton: { minHeight: 44, paddingHorizontal: SPACING.lg, borderRadius: RADII.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold },
  retryButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontWeight: '800' },
  backLink: { minHeight: 44, paddingHorizontal: SPACING.lg, borderRadius: RADII.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.goldLine },
  backLinkText: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontWeight: '700' },
  error: { color: COLORS.priest, textAlign: 'center', margin: SPACING.xl, fontFamily: TYPOGRAPHY.body },
  arabic: { fontFamily: TYPOGRAPHY.arabic, writingDirection: 'rtl' },
});
