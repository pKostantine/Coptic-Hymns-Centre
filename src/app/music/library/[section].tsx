import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import Icon from '@/components/chc/ui/Icon';
import MusicArtwork from '@/components/music/MusicArtwork';
import MusicMiniPlayer from '@/components/music/MusicMiniPlayer';
import MusicTrackActionsMenu from '@/components/music/MusicTrackActionsMenu';
import MusicTrackRow from '@/components/music/MusicTrackRow';
import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useMusicPlayer } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { downloadManager } from '@/services/downloadManager';
import { musicService } from '@/services/musicService';
import type { MusicLibraryPayload, MusicRecentTrack } from '@/types/musicConsumer';
import type { MusicPlaylistVisibility } from '@/types/mediaPlatform';
import type { OfflineDownloadProgress } from '@/types/offlineDownloads';
import { goBack } from '@/utils/navigation';

type LibrarySection = 'likes' | 'playlists' | 'releases' | 'following' | 'downloads' | 'recent-tracks' | 'recent-releases';

const VALID_SECTIONS = new Set<LibrarySection>([
  'likes',
  'playlists',
  'releases',
  'following',
  'downloads',
  'recent-tracks',
  'recent-releases',
]);

function includesSearch(values: (string | null | undefined)[], query: string): boolean {
  if (!query) return true;
  return values.some((value) => value?.toLocaleLowerCase().includes(query));
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(value >= 10 * 1024 ** 2 ? 0 : 1)} MB`;
}

export default function MusicLibraryFolderScreen() {
  const params = useLocalSearchParams<{ section: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { preferences } = useReadingPreferences();
  const { currentItem, playQueue } = useMusicPlayer();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const rawSection = Array.isArray(params.section) ? params.section[0] : params.section;
  const section = VALID_SECTIONS.has(rawSection as LibrarySection) ? rawSection as LibrarySection : 'likes';
  const [library, setLibrary] = useState<MusicLibraryPayload | null>(null);
  const [downloads, setDownloads] = useState<OfflineDownloadProgress[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDescription, setNewPlaylistDescription] = useState('');
  const [newPlaylistVisibility, setNewPlaylistVisibility] = useState<MusicPlaylistVisibility>('private');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (_activeUserId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const nextLibrary = await musicService.getLibrary(locale);
      setLibrary(nextLibrary);
      if (section === 'downloads' && Platform.OS !== 'web') {
        const nextDownloads = await downloadManager.listDownloads();
        setDownloads(nextDownloads.filter((item) => item.domain === 'music'));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load this Library folder.');
    } finally {
      setLoading(false);
    }
  }, [locale, section]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- route entry starts an async data load
    void load(user?.id);
  }, [load, user?.id]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const likedTracks = useMemo(() => (library?.likedTracks ?? []).filter((track) => includesSearch([
    track.title,
    track.subtitle,
    ...track.artists.map((artist) => artist.displayName),
  ], normalizedQuery)), [library?.likedTracks, normalizedQuery]);
  const recentTracks = useMemo(() => (library?.recentTracks ?? []).filter((recent) => includesSearch([
    recent.track.title,
    recent.track.subtitle,
    recent.release?.title,
    ...recent.track.artists.map((artist) => artist.displayName),
  ], normalizedQuery)), [library?.recentTracks, normalizedQuery]);

  const recentQueue = (items: MusicRecentTrack[]) => items.map(({ track, release }) => ({
    track,
    releaseId: release?.id ?? track.releaseId,
    releaseTitle: release?.title ?? null,
    releaseType: release?.releaseType ?? null,
    musicType: release?.musicType ?? null,
    recordingType: release?.recordingType ?? null,
    coverAsset: release?.coverAsset ?? null,
  }));

  const titles: Record<LibrarySection, { en: string; ar: string; searchEn: string; searchAr: string }> = {
    likes: { en: 'Liked tracks', ar: 'الترانيم المعجبة', searchEn: 'Search liked tracks', searchAr: 'ابحث في الترانيم المعجبة' },
    playlists: { en: 'Playlists', ar: 'قوائم التشغيل', searchEn: 'Search playlists', searchAr: 'ابحث في قوائم التشغيل' },
    releases: { en: 'Liked releases', ar: 'الإصدارات المعجبة', searchEn: 'Search liked releases', searchAr: 'ابحث في الإصدارات المعجبة' },
    following: { en: 'Following', ar: 'الفنانون المتابَعون', searchEn: 'Search followed artists', searchAr: 'ابحث في الفنانين' },
    downloads: { en: 'Downloads', ar: 'التنزيلات', searchEn: 'Search downloads', searchAr: 'ابحث في التنزيلات' },
    'recent-tracks': { en: 'Recently played tracks', ar: 'الترانيم المشغّلة مؤخراً', searchEn: 'Search recent tracks', searchAr: 'ابحث في الترانيم الأخيرة' },
    'recent-releases': { en: 'Recently played releases', ar: 'الإصدارات المشغّلة مؤخراً', searchEn: 'Search recent releases', searchAr: 'ابحث في الإصدارات الأخيرة' },
  };
  const labels = titles[section];

  const unlikeTrack = async (trackId: string) => {
    try {
      await musicService.setLiked(trackId, false);
      setLibrary((current) => current ? { ...current, likedTracks: current.likedTracks.filter((track) => track.id !== trackId) } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update Liked tracks.');
    }
  };

  const unlikeRelease = async (releaseId: string) => {
    try {
      await musicService.setReleaseLiked(releaseId, false);
      setLibrary((current) => current ? { ...current, likedReleases: current.likedReleases.filter((release) => release.id !== releaseId) } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update liked releases.');
    }
  };

  const unfollowArtist = async (artistId: string) => {
    try {
      await musicService.setArtistFollowed(artistId, false);
      setLibrary((current) => current ? { ...current, followedArtists: current.followedArtists.filter((artist) => artist.id !== artistId) } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update followed artists.');
    }
  };

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
      router.push(`/music/playlist/${playlistId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create playlist.');
      setCreating(false);
    }
  };

  const removeDownload = async (packageKey: string) => {
    await downloadManager.remove(packageKey);
    setDownloads((current) => current.filter((item) => item.packageKey !== packageKey));
  };

  const content = (() => {
    if (!library) return null;
    if (!library.authenticated && section !== 'downloads') {
      return (
        <View style={styles.emptyCard}>
          <Text style={[styles.emptyTitle, isArabic && styles.arabic]}>{isArabic ? 'تسجيل الدخول مطلوب' : 'Sign in required'}</Text>
          <Text style={[styles.emptyText, isArabic && styles.arabic]}>{isArabic ? 'افتح حسابك للوصول إلى هذه القائمة.' : 'Open your account to access this list.'}</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/account')}><Text style={styles.primaryButtonText}>{isArabic ? 'فتح الحساب' : 'Open Account'}</Text></Pressable>
        </View>
      );
    }

    if (section === 'likes') {
      return likedTracks.length ? (
        <View style={styles.trackList}>
          {likedTracks.map((track, index) => (
            <MusicTrackRow
              key={track.id}
              track={track}
              index={index}
              active={currentItem?.track.id === track.id}
              onPress={() => playQueue(likedTracks.map((item) => ({ track: item, releaseId: item.releaseId })), index)}
              showLikeButton
              liked
              onToggleLike={() => void unlikeTrack(track.id)}
              trailing={<MusicTrackActionsMenu item={{ track, releaseId: track.releaseId }} isArabic={isArabic} />}
            />
          ))}
        </View>
      ) : <Empty query={normalizedQuery} isArabic={isArabic} />;
    }

    if (section === 'recent-tracks') {
      return recentTracks.length ? (
        <View style={styles.trackList}>
          {recentTracks.map((recent, index) => (
            <MusicTrackRow
              key={recent.track.id}
              track={recent.track}
              index={index}
              active={currentItem?.track.id === recent.track.id}
              onPress={() => playQueue(recentQueue(recentTracks), index)}
              trailing={<MusicTrackActionsMenu item={recentQueue([recent])[0]} isArabic={isArabic} />}
            />
          ))}
        </View>
      ) : <Empty query={normalizedQuery} isArabic={isArabic} />;
    }

    if (section === 'playlists') {
      const playlists = library.playlists.filter((playlist) => includesSearch([playlist.name, playlist.description], normalizedQuery));
      return (
        <>
          <Pressable style={styles.newPlaylistButton} onPress={() => setShowCreator((current) => !current)}>
            <Icon name={showCreator ? 'close' : 'add'} size={18} color={COLORS.black} />
            <Text style={styles.newPlaylistText}>{showCreator ? (isArabic ? 'إلغاء' : 'Cancel') : (isArabic ? 'قائمة جديدة' : 'New playlist')}</Text>
          </Pressable>
          {showCreator ? (
            <View style={styles.creator}>
              <TextInput value={newPlaylistName} onChangeText={setNewPlaylistName} placeholder={isArabic ? 'اسم قائمة التشغيل' : 'Playlist name'} placeholderTextColor={COLORS.muted} style={[styles.input, isArabic && styles.arabicInput]} />
              <TextInput value={newPlaylistDescription} onChangeText={setNewPlaylistDescription} placeholder={isArabic ? 'الوصف (اختياري)' : 'Description (optional)'} placeholderTextColor={COLORS.muted} style={[styles.input, styles.descriptionInput, isArabic && styles.arabicInput]} multiline />
              <View style={styles.visibilityControl}>
                {(['private', 'public'] as const).map((visibility) => (
                  <Pressable key={visibility} style={[styles.visibilityButton, newPlaylistVisibility === visibility && styles.visibilityActive]} onPress={() => setNewPlaylistVisibility(visibility)}>
                    <Text style={[styles.visibilityText, newPlaylistVisibility === visibility && styles.visibilityTextActive]}>{visibility === 'private' ? (isArabic ? 'خاصة' : 'Private') : (isArabic ? 'عامة' : 'Public')}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable disabled={!newPlaylistName.trim() || creating} style={[styles.createButton, (!newPlaylistName.trim() || creating) && styles.disabled]} onPress={() => void createPlaylist()}>
                {creating ? <ActivityIndicator color={COLORS.black} /> : <Text style={styles.createButtonText}>{isArabic ? 'إنشاء' : 'Create playlist'}</Text>}
              </Pressable>
            </View>
          ) : null}
          {playlists.length ? <View style={styles.list}>{playlists.map((playlist) => (
            <Pressable key={playlist.id} style={styles.entityRow} onPress={() => router.push(`/music/playlist/${playlist.id}`)}>
              <MusicArtwork asset={playlist.coverAsset} size={58} label={playlist.name} />
              <View style={styles.entityInfo}>
                <Text numberOfLines={1} style={[styles.entityTitle, isArabic && styles.arabic]}>{playlist.name}</Text>
                <Text numberOfLines={1} style={[styles.entityMeta, isArabic && styles.arabic]}>{playlist.trackCount} {playlist.trackCount === 1 ? 'track' : 'tracks'} · {playlist.visibility}</Text>
              </View>
              <Icon name={isArabic ? 'chevron-back' : 'chevron-forward'} size={18} color={COLORS.muted} />
            </Pressable>
          ))}</View> : <Empty query={normalizedQuery} isArabic={isArabic} />}
        </>
      );
    }

    if (section === 'releases' || section === 'recent-releases') {
      const releases = (section === 'releases' ? library.likedReleases : library.recentReleases)
        .filter((release) => includesSearch([release.title, release.subtitle, release.primaryArtist?.displayName], normalizedQuery));
      return releases.length ? <View style={styles.list}>{releases.map((release) => (
        <View key={release.id} style={styles.entityRow}>
          <Pressable style={styles.entityMain} onPress={() => router.push(`/music/release/${release.id}`)}>
            <MusicArtwork asset={release.coverAsset} size={58} label={release.title} />
            <View style={styles.entityInfo}>
              <Text numberOfLines={1} style={[styles.entityTitle, isArabic && styles.arabic]}>{release.title}</Text>
              <Text numberOfLines={1} style={[styles.entityMeta, isArabic && styles.arabic]}>{release.primaryArtist?.displayName ?? release.releaseType}</Text>
            </View>
          </Pressable>
          {section === 'releases' ? (
            <Pressable accessibilityLabel={`Unlike ${release.title}`} style={styles.circleAction} onPress={() => void unlikeRelease(release.id)}>
              <Icon name="heart" size={18} color={COLORS.goldBright} />
            </Pressable>
          ) : <Icon name={isArabic ? 'chevron-back' : 'chevron-forward'} size={18} color={COLORS.muted} />}
        </View>
      ))}</View> : <Empty query={normalizedQuery} isArabic={isArabic} />;
    }

    if (section === 'following') {
      const artists = library.followedArtists.filter((artist) => includesSearch([artist.displayName, artist.biography], normalizedQuery));
      return artists.length ? <View style={styles.list}>{artists.map((artist) => (
        <View key={artist.id} style={styles.entityRow}>
          <Pressable style={styles.entityMain} onPress={() => router.push(`/music/artist/${artist.id}`)}>
            <MusicArtwork asset={artist.profileImageAsset} size={58} rounded label={artist.displayName} />
            <View style={styles.entityInfo}>
              <Text numberOfLines={1} style={[styles.entityTitle, isArabic && styles.arabic]}>{artist.displayName}</Text>
              <Text style={[styles.entityMeta, isArabic && styles.arabic]}>{isArabic ? 'فنان متابَع' : 'Following'}</Text>
            </View>
          </Pressable>
          <Pressable style={styles.textAction} onPress={() => void unfollowArtist(artist.id)}><Text style={styles.textActionLabel}>{isArabic ? 'إلغاء' : 'Unfollow'}</Text></Pressable>
        </View>
      ))}</View> : <Empty query={normalizedQuery} isArabic={isArabic} />;
    }

    const visibleDownloads = downloads.filter((item) => includesSearch([item.title, item.entityType, item.status], normalizedQuery));
    if (Platform.OS === 'web') {
      return <View style={styles.emptyCard}><Text style={[styles.emptyText, isArabic && styles.arabic]}>{isArabic ? 'تتوفر التنزيلات في تطبيق CHC للهاتف.' : 'Offline downloads are available in the CHC iOS and Android apps.'}</Text></View>;
    }
    return visibleDownloads.length ? <View style={styles.list}>{visibleDownloads.map((item) => (
      <View key={item.packageKey} style={styles.entityRow}>
        <View style={styles.downloadIcon}><Icon name="musical-notes" size={21} color={COLORS.goldBright} /></View>
        <View style={styles.entityInfo}>
          <Text numberOfLines={1} style={[styles.entityTitle, isArabic && styles.arabic]}>{item.title}</Text>
          <Text style={[styles.entityMeta, isArabic && styles.arabic]}>{item.status} · {bytes(item.bytesWritten)}</Text>
        </View>
        <Pressable style={styles.textAction} onPress={() => void removeDownload(item.packageKey)}><Text style={styles.textActionLabel}>{isArabic ? 'إزالة' : 'Remove'}</Text></Pressable>
      </View>
    ))}</View> : <Empty query={normalizedQuery} isArabic={isArabic} />;
  })();

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <AppHeader
        title={{ english: labels.en, arabic: labels.ar }}
        canGoBack
        onBack={() => goBack(router, '/music/library')}
        visibleLanguages={{ english: !isArabic, arabic: isArabic }}
      />
      <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.searchBox}>
          <Icon name="search-outline" size={18} color={COLORS.muted} />
          <TextInput
            accessibilityLabel={isArabic ? labels.searchAr : labels.searchEn}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder={isArabic ? labels.searchAr : labels.searchEn}
            placeholderTextColor={COLORS.muted}
            style={[styles.searchInput, isArabic && styles.arabicInput]}
            value={query}
          />
          {query ? <Pressable accessibilityLabel="Clear search" onPress={() => setQuery('')}><Icon name="close" size={18} color={COLORS.muted} /></Pressable> : null}
        </View>
        {loading ? <ActivityIndicator color={COLORS.gold} style={styles.loader} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading ? content : null}
      </NowPlayingAwareScrollView>
      <MusicMiniPlayer />
    </SafeAreaView>
  );
}

function Empty({ query, isArabic }: { query: string; isArabic: boolean }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={[styles.emptyText, isArabic && styles.arabic]}>
        {query
          ? (isArabic ? 'لا توجد نتائج مطابقة.' : 'No matching results.')
          : (isArabic ? 'لا توجد عناصر هنا بعد.' : 'Nothing here yet.')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: COLORS.black, flex: 1 },
  content: { alignSelf: 'center', gap: SPACING.md, maxWidth: 900, padding: SPACING.md, paddingBottom: SPACING.xl * 2, width: '100%' },
  loader: { marginVertical: SPACING.xl },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center' },
  searchBox: { alignItems: 'center', backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: RADII.pill, borderWidth: 1, flexDirection: 'row', gap: SPACING.sm, minHeight: 46, paddingHorizontal: SPACING.md },
  searchInput: { color: COLORS.white, flex: 1, fontFamily: TYPOGRAPHY.body, fontSize: 14, minWidth: 0, paddingVertical: 0 },
  trackList: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: RADII.lg, borderWidth: 1, overflow: 'hidden' },
  list: { borderBottomColor: COLORS.border, borderBottomWidth: StyleSheet.hairlineWidth },
  entityRow: { alignItems: 'center', borderTopColor: COLORS.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: SPACING.md, minHeight: 78, paddingVertical: SPACING.sm },
  entityMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: SPACING.md, minWidth: 0 },
  entityInfo: { flex: 1, minWidth: 0 },
  entityTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '800' },
  entityMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 4 },
  circleAction: { alignItems: 'center', backgroundColor: COLORS.goldSoft, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  textAction: { alignItems: 'center', borderColor: COLORS.border, borderRadius: RADII.pill, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: SPACING.md },
  textActionLabel: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800' },
  downloadIcon: { alignItems: 'center', backgroundColor: COLORS.goldSoft, borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  emptyCard: { backgroundColor: COLORS.navyDark, borderColor: COLORS.border, borderRadius: RADII.lg, borderWidth: 1, gap: SPACING.sm, padding: SPACING.lg },
  emptyTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 20, fontWeight: '800' },
  emptyText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19 },
  primaryButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: COLORS.gold, borderRadius: RADII.pill, justifyContent: 'center', minHeight: 40, paddingHorizontal: SPACING.lg },
  primaryButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '900' },
  newPlaylistButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: COLORS.gold, borderRadius: RADII.pill, flexDirection: 'row', gap: SPACING.xs, minHeight: 40, paddingHorizontal: SPACING.lg },
  newPlaylistText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '900' },
  creator: { backgroundColor: COLORS.navyDark, borderColor: COLORS.border, borderRadius: RADII.lg, borderWidth: 1, gap: SPACING.sm, padding: SPACING.md },
  input: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, minHeight: 46, paddingHorizontal: SPACING.md },
  descriptionInput: { minHeight: 78, paddingTop: 12, textAlignVertical: 'top' },
  visibilityControl: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', padding: 3 },
  visibilityButton: { alignItems: 'center', borderRadius: 6, flex: 1, justifyContent: 'center', minHeight: 40 },
  visibilityActive: { backgroundColor: COLORS.gold },
  visibilityText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  visibilityTextActive: { color: COLORS.black },
  createButton: { alignItems: 'center', backgroundColor: COLORS.gold, borderRadius: 8, justifyContent: 'center', minHeight: 44 },
  createButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.4 },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  arabicInput: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
