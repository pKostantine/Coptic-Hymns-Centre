import { type ErrorBoundaryProps, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import AppHeader from '@/components/chc/ui/AppHeader';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import MusicArtwork from '@/components/music/MusicArtwork';
import MusicArtistArtwork from '@/components/music/MusicArtistArtwork';
import MusicDownloadButton from '@/components/music/MusicDownloadButton';
import MusicSectionNav from '@/components/music/MusicSectionNav';
import MusicTrackActionsMenu from '@/components/music/MusicTrackActionsMenu';
import MusicTrackRow from '@/components/music/MusicTrackRow';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useMusicPlayer } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import {
  musicLikedSongsDownloadRequest,
  musicTrackDownloadRequest,
} from '@/services/offlineDownloadRequests';
import type { MusicLibraryPayload, PublishedTrackLyricsPayload } from '@/types/musicConsumer';
import type { MusicPlaylistVisibility } from '@/types/mediaPlatform';


export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter();

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <AppHeader
        title={{ english: 'Your Library', arabic: 'مكتبتك' }}
        visibleLanguages={{ english: true, arabic: false }}
      />
      <View style={styles.crashCard}>
        <Text style={styles.crashTitle}>Library could not be displayed</Text>
        <Text selectable style={styles.crashBody}>{error.message}</Text>
        <View style={styles.crashActions}>
          <Pressable style={styles.accountButton} onPress={() => void retry()}>
            <Text style={styles.accountButtonText}>Try again</Text>
          </Pressable>
          <Pressable style={styles.crashSecondaryButton} onPress={() => router.replace('/music')}>
            <Text style={styles.crashSecondaryText}>Back to Music</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function MusicLibraryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { preferences } = useReadingPreferences();
  const { currentItem, playQueue } = useMusicPlayer();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const [library, setLibrary] = useState<MusicLibraryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDescription, setNewPlaylistDescription] = useState('');
  const [newPlaylistVisibility, setNewPlaylistVisibility] = useState<MusicPlaylistVisibility>('private');
  const [showPlaylistCreator, setShowPlaylistCreator] = useState(false);
  const [creating, setCreating] = useState(false);
  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLibrary(await musicService.getLibrary(locale));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load your music library.');
    } finally {
      setLoading(false);
    }
  }, [locale, user?.id]);

  useEffect(() => { void loadLibrary(); }, [loadLibrary]);

  const createPlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      const playlistId = await musicService.createPlaylist(
        name,
        newPlaylistDescription.trim() || null,
        newPlaylistVisibility,
      );
      setNewPlaylistName('');
      setNewPlaylistDescription('');
      setShowPlaylistCreator(false);
      await loadLibrary();
      router.push(`/music/playlist/${playlistId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create playlist.');
    } finally {
      setCreating(false);
    }
  };

  const unlikeRelease = async (releaseId: string) => {
    try {
      await musicService.setReleaseLiked(releaseId, false);
      setLibrary((current) => current ? {
        ...current,
        likedReleases: current.likedReleases.filter((release) => release.id !== releaseId),
      } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update liked releases.');
    }
  };

  const unfollowArtist = async (artistId: string) => {
    try {
      await musicService.setArtistFollowed(artistId, false);
      setLibrary((current) => current ? {
        ...current,
        followedArtists: current.followedArtists.filter((artist) => artist.id !== artistId),
      } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update followed artists.');
    }
  };

  const playLiked = (startIndex = 0) => {
    if (!library?.likedTracks.length) return;
    playQueue(library.likedTracks.map((track) => ({ track, releaseId: track.releaseId })), startIndex);
  };

  const unlikeTrack = async (trackId: string) => {
    try {
      await musicService.setLiked(trackId, false);
      setLibrary((current) => current ? {
        ...current,
        likedTracks: current.likedTracks.filter((track) => track.id !== trackId),
      } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update Liked Songs.');
    }
  };

  const prepareLikedDownload = async () => {
    if (!library) throw new Error('Music library is not loaded.');
    const lyrics = await Promise.all(library.likedTracks.map(async (track) => {
      try { return [track.id, await musicService.getLyrics(track.id, locale)] as const; }
      catch { return [track.id, null] as const; }
    }));
    return musicLikedSongsDownloadRequest(
      library,
      locale,
      Object.fromEntries(lyrics) as Record<string, PublishedTrackLyricsPayload | null>,
    );
  };

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{isArabic ? 'مكتبتي — كوبتك هيمنز سنتر' : 'Your Library — Coptic Hymns Centre'}</title></Head>
      <AppHeader
        title={{ english: 'Your Library', arabic: 'مكتبتك' }}
        visibleLanguages={{ english: !isArabic, arabic: isArabic }}
      />
      <MusicSectionNav active="library" />

      <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator color={COLORS.gold} style={styles.loader} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && library && !library.authenticated ? (
          <View style={styles.authCard}>
            <Text style={[styles.authTitle, isArabic && styles.arabic]}>{isArabic ? 'سجّل الدخول إلى حساب CHC' : 'Sign in to your CHC account'}</Text>
            <Text style={[styles.authBody, isArabic && styles.arabic]}>
              {isArabic
                ? 'الأغاني المعجبة وقوائم التشغيل مرتبطة بحسابك. تصفح الموسيقى والاستماع متاحان بدون تسجيل الدخول.'
                : 'Liked Songs and playlists are tied to your account. Browsing and listening still work without signing in.'}
            </Text>
            <Pressable style={styles.accountButton} onPress={() => router.push('/account')}>
              <Text style={styles.accountButtonText}>{isArabic ? 'فتح الحساب' : 'Open Account'}</Text>
            </Pressable>
          </View>
        ) : null}

        {library?.authenticated ? (
          <>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'الإصدارات المعجبة' : 'Liked Releases'}</Text>
                <Text style={[styles.sectionMeta, isArabic && styles.arabic]}>{isArabic ? `${library.likedReleases.length} إصدار` : `${library.likedReleases.length} saved`}</Text>
              </View>
            </View>
            {library.likedReleases.length ? (
              <View style={styles.savedList}>
                {library.likedReleases.map((release) => (
                  <View key={release.id} style={styles.savedRow}>
                    <Pressable style={styles.savedMain} onPress={() => router.push(`/music/release/${release.id}`)}>
                      <MusicArtwork asset={release.coverAsset} size={54} radius={8} label={release.title} />
                      <View style={styles.savedInfo}>
                        <Text numberOfLines={1} style={[styles.savedTitle, isArabic && styles.arabic]}>{release.title}</Text>
                        <Text numberOfLines={1} style={[styles.savedMeta, isArabic && styles.arabic]}>{release.primaryArtist?.displayName ?? release.releaseType}</Text>
                      </View>
                    </Pressable>
                    <Pressable accessibilityLabel={`Unlike ${release.title}`} style={styles.heartAction} onPress={() => void unlikeRelease(release.id)}>
                      <Text style={styles.heartActionText}>♥</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : <EmptyCard text={isArabic ? 'أعجب بإصدار ليظهر هنا.' : 'Like a release and it will appear here.'} />}

            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'الأغاني المعجبة' : 'Liked Songs'}</Text>
                <Text style={[styles.sectionMeta, isArabic && styles.arabic]}>
                  {isArabic ? `${library.likedTracks.length} ترنيمة` : `${library.likedTracks.length} ${library.likedTracks.length === 1 ? 'track' : 'tracks'}`}
                </Text>
              </View>
              {library.likedTracks.length ? (
                <View style={styles.likedActions}>
                  <Pressable style={styles.playAll} onPress={() => playLiked(0)}>
                    <Text style={styles.playAllText}>▶ {isArabic ? 'تشغيل' : 'Play'}</Text>
                  </Pressable>
                  {Platform.OS !== 'web' ? (
                    <MusicDownloadButton
                      packageKey={`music_liked_songs:liked-songs:${locale}`}
                      request={prepareLikedDownload}
                      isArabic={isArabic}
                      compact
                    />
                  ) : null}
                </View>
              ) : null}
            </View>

            {library.likedTracks.length ? (
              <View style={styles.trackList}>
                {library.likedTracks.map((track, index) => (
                    <MusicTrackRow
                      key={track.id}
                      track={track}
                      index={index}
                      active={currentItem?.track.id === track.id}
                      onPress={() => playLiked(index)}
                      showLikeButton
                      liked
                      onToggleLike={() => void unlikeTrack(track.id)}
                      trailing={(
                        <View style={styles.trackActions}>
                          <MusicTrackActionsMenu item={{ track, releaseId: track.releaseId }} isArabic={isArabic} />
                          {Platform.OS !== 'web' ? (
                            <MusicDownloadButton
                              packageKey={`music_track:${track.id}:${locale}`}
                              request={async () => {
                                let lyrics: PublishedTrackLyricsPayload | null = null;
                                try { lyrics = await musicService.getLyrics(track.id, locale); } catch { /* optional */ }
                                return musicTrackDownloadRequest({ track, locale, lyrics });
                              }}
                              isArabic={isArabic}
                              compact
                              label=""
                            />
                          ) : null}
                        </View>
                      )}
                    />
                  ))}
              </View>
            ) : (
              <EmptyCard text={isArabic ? 'ضع علامة إعجاب على ترنيمة لتظهر هنا.' : 'Like a track and it will appear here.'} />
            )}

            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'قوائم التشغيل' : 'Playlists'}</Text>
                <Text style={[styles.sectionMeta, isArabic && styles.arabic]}>{isArabic ? 'نظّم الترانيم بطريقتك' : 'Organize your listening'}</Text>
              </View>
            </View>

            <Pressable style={styles.newPlaylistButton} onPress={() => setShowPlaylistCreator((current) => !current)}>
              <Text style={styles.newPlaylistButtonText}>{showPlaylistCreator ? (isArabic ? 'إلغاء' : 'Cancel') : (isArabic ? 'قائمة تشغيل جديدة' : 'New playlist')}</Text>
            </Pressable>
            {showPlaylistCreator ? (
              <View style={styles.playlistCreator}>
                <TextInput value={newPlaylistName} onChangeText={setNewPlaylistName} placeholder={isArabic ? 'اسم قائمة التشغيل' : 'Playlist name'} placeholderTextColor={COLORS.muted} style={[styles.input, isArabic && styles.arabicInput]} />
                <TextInput value={newPlaylistDescription} onChangeText={setNewPlaylistDescription} placeholder={isArabic ? 'الوصف (اختياري)' : 'Description (optional)'} placeholderTextColor={COLORS.muted} style={[styles.input, styles.descriptionInput, isArabic && styles.arabicInput]} multiline />
                <View style={styles.visibilityControl}>
                  {(['private', 'public'] as const).map((visibility) => (
                    <Pressable key={visibility} accessibilityRole="radio" accessibilityState={{ checked: newPlaylistVisibility === visibility }} style={[styles.visibilityButton, newPlaylistVisibility === visibility && styles.visibilityButtonActive]} onPress={() => setNewPlaylistVisibility(visibility)}>
                      <Text style={[styles.visibilityText, newPlaylistVisibility === visibility && styles.visibilityTextActive]}>{visibility === 'private' ? (isArabic ? 'خاصة' : 'Private') : (isArabic ? 'عامة' : 'Public')}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable disabled={!newPlaylistName.trim() || creating} style={[styles.createPlaylistButton, (!newPlaylistName.trim() || creating) && styles.disabled]} onPress={() => void createPlaylist()}>
                  <Text style={styles.createPlaylistButtonText}>{creating ? (isArabic ? 'جارٍ الإنشاء…' : 'Creating…') : (isArabic ? 'إنشاء قائمة التشغيل' : 'Create playlist')}</Text>
                </Pressable>
              </View>
            ) : null}

            {library.playlists.length ? (
              <View style={styles.playlistGrid}>
                {library.playlists.map((playlist) => (
                  <Pressable key={playlist.id} style={styles.playlistCard} onPress={() => router.push(`/music/playlist/${playlist.id}`)}>
                    <MusicArtwork asset={playlist.coverAsset} size={74} label={playlist.name} />
                    <View style={styles.playlistInfo}>
                      <Text numberOfLines={1} style={[styles.playlistName, isArabic && styles.arabic]}>{playlist.name}</Text>
                      <Text numberOfLines={1} style={[styles.playlistMeta, isArabic && styles.arabic]}>
                        {isArabic ? `${playlist.trackCount} ترنيمة` : `${playlist.trackCount} ${playlist.trackCount === 1 ? 'track' : 'tracks'} · ${playlist.visibility}`}
                      </Text>
                      {playlist.description ? <Text numberOfLines={1} style={[styles.playlistDescription, isArabic && styles.arabic]}>{playlist.description}</Text> : null}
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <EmptyCard text={isArabic ? 'أنشئ قائمة تشغيل لتبدأ.' : 'Create your first playlist above.'} />
            )}

            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'الفنانون المتابَعون' : 'Followed Artists'}</Text>
                <Text style={[styles.sectionMeta, isArabic && styles.arabic]}>{isArabic ? 'آخر الإصدارات من الفنانين الذين تتابعهم' : 'Keep up with the artists you follow'}</Text>
              </View>
            </View>
            {library.followedArtists.length ? (
              <View style={styles.savedList}>
                {library.followedArtists.map((artist) => (
                  <View key={artist.id} style={styles.savedRow}>
                    <Pressable style={styles.savedMain} onPress={() => router.push(`/music/artist/${artist.id}`)}>
                      <MusicArtistArtwork asset={artist.profileImageAsset} size={54} label={artist.displayName} />
                      <View style={styles.savedInfo}>
                        <Text numberOfLines={1} style={[styles.savedTitle, isArabic && styles.arabic]}>{artist.displayName}</Text>
                        <Text numberOfLines={1} style={[styles.savedMeta, isArabic && styles.arabic]}>{isArabic ? 'فنان متابَع' : 'Following'}</Text>
                      </View>
                    </Pressable>
                    <Pressable accessibilityLabel={`Unfollow ${artist.displayName}`} style={styles.savedAction} onPress={() => void unfollowArtist(artist.id)}>
                      <Text style={styles.savedActionText}>{isArabic ? 'إلغاء' : 'Unfollow'}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : <EmptyCard text={isArabic ? 'تابع فناناً ليظهر هنا.' : 'Follow an artist and they will appear here.'} />}

          </>
        ) : null}
      </NowPlayingAwareScrollView>

      <BottomTabBar active="music" />
    </SafeAreaView>
  );
}

function EmptyCard({ text }: { text: string }) {
  return <View style={styles.emptyCard}><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl, gap: SPACING.md },
  loader: { marginVertical: SPACING.xl },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center' },
  crashCard: { margin: SPACING.md, padding: SPACING.lg, gap: SPACING.md, borderRadius: RADII.lg, borderWidth: 1, borderColor: COLORS.goldLine, backgroundColor: COLORS.navyDark },
  crashTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700' },
  crashBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19 },
  crashActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  crashSecondaryButton: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: SPACING.md },
  crashSecondaryText: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  authCard: { padding: SPACING.lg, borderRadius: RADII.lg, borderWidth: 1, borderColor: COLORS.goldLine, backgroundColor: COLORS.navyDark },
  authTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
  authBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 20, marginTop: SPACING.sm },
  accountButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: COLORS.gold, borderRadius: 8, justifyContent: 'center', marginTop: SPACING.md, minHeight: 42, paddingHorizontal: SPACING.md },
  accountButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md, marginTop: SPACING.sm },
  sectionTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700' },
  sectionMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  likedActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  playAll: { minHeight: 40, paddingHorizontal: SPACING.md, borderRadius: RADII.pill, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  playAllText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  trackList: { borderRadius: RADII.lg, overflow: 'hidden', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  trackActions: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  savedList: { borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  savedRow: { alignItems: 'center', borderBottomColor: COLORS.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 72, padding: SPACING.sm },
  savedMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: SPACING.md, minWidth: 0 },
  savedInfo: { flex: 1, minWidth: 0 },
  savedTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '800' },
  savedMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 4, textTransform: 'capitalize' },
  savedAction: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 34, paddingHorizontal: SPACING.sm },
  savedActionText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800' },
  heartAction: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  heartActionText: { color: COLORS.goldBright, fontSize: 21 },
  emptyCard: { padding: SPACING.lg, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  emptyText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center' },
  createRow: { flexDirection: 'row', gap: SPACING.sm },
  input: { flex: 1, minHeight: 46, paddingHorizontal: SPACING.md, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, color: COLORS.white, fontFamily: TYPOGRAPHY.body },
  arabicInput: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  createButton: { width: 46, height: 46, borderRadius: RADII.md, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  createButtonText: { color: COLORS.black, fontSize: 25, fontWeight: '800' },
  newPlaylistButton: { alignItems: 'center', alignSelf: 'flex-start', borderColor: COLORS.goldLine, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: SPACING.md },
  newPlaylistButtonText: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '900' },
  playlistCreator: { borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, gap: SPACING.sm, padding: SPACING.md },
  descriptionInput: { minHeight: 76, paddingTop: 12, textAlignVertical: 'top' },
  visibilityControl: { backgroundColor: COLORS.black, borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', padding: 3 },
  visibilityButton: { alignItems: 'center', borderRadius: 6, flex: 1, justifyContent: 'center', minHeight: 40 },
  visibilityButtonActive: { backgroundColor: COLORS.gold },
  visibilityText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  visibilityTextActive: { color: COLORS.black },
  createPlaylistButton: { alignItems: 'center', backgroundColor: COLORS.gold, borderRadius: 8, justifyContent: 'center', minHeight: 46 },
  createPlaylistButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  playlistGrid: { gap: SPACING.sm },
  playlistCard: { minHeight: 94, padding: SPACING.sm, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  playlistInfo: { flex: 1, minWidth: 0 },
  playlistName: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '800' },
  playlistMeta: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 4, textTransform: 'capitalize' },
  playlistDescription: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 4 },
  chevron: { color: COLORS.gold, fontSize: 28, paddingHorizontal: SPACING.xs },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
