import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import MusicArtwork from '@/components/music/MusicArtwork';
import MusicDownloadButton from '@/components/music/MusicDownloadButton';
import MusicSectionNav from '@/components/music/MusicSectionNav';
import MusicTrackRow from '@/components/music/MusicTrackRow';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useMusicPlayer } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import {
  musicLikedSongsDownloadRequest,
  musicTrackDownloadRequest,
} from '@/services/offlineDownloadRequests';
import type { MusicLibraryPayload, PublishedTrackLyricsPayload } from '@/types/musicConsumer';

export default function MusicLibraryScreen() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const { currentItem, playQueue } = useMusicPlayer();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const [library, setLibrary] = useState<MusicLibraryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creating, setCreating] = useState(false);
  const likedDownload = useMemo(
    () => library?.authenticated ? musicLikedSongsDownloadRequest(library, locale) : null,
    [library, locale],
  );

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
  }, [locale]);

  useEffect(() => { void loadLibrary(); }, [loadLibrary]);

  const createPlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      const playlistId = await musicService.createPlaylist(name);
      setNewPlaylistName('');
      await loadLibrary();
      router.push(`/music/playlist/${playlistId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create playlist.');
    } finally {
      setCreating(false);
    }
  };

  const playLiked = (startIndex = 0) => {
    if (!library?.likedTracks.length) return;
    playQueue(library.likedTracks.map((track) => ({ track, releaseId: track.releaseId })), startIndex);
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

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
          </View>
        ) : null}

        {library?.authenticated ? (
          <>
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
                  {likedDownload ? (
                    <MusicDownloadButton
                      packageKey={likedDownload.packageKey}
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
                {library.likedTracks.map((track, index) => {
                  const trackDownload = musicTrackDownloadRequest({ track, locale });
                  return (
                    <MusicTrackRow
                      key={track.id}
                      track={track}
                      index={index}
                      active={currentItem?.track.id === track.id}
                      onPress={() => playLiked(index)}
                      trailing={(
                        <MusicDownloadButton
                          packageKey={trackDownload.packageKey}
                          request={async () => {
                            let lyrics: PublishedTrackLyricsPayload | null = null;
                            try { lyrics = await musicService.getLyrics(track.id, locale); } catch { /* optional */ }
                            return musicTrackDownloadRequest({ track, locale, lyrics });
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
            ) : (
              <EmptyCard text={isArabic ? 'ضع علامة إعجاب على ترنيمة لتظهر هنا.' : 'Like a track and it will appear here.'} />
            )}

            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'قوائم التشغيل' : 'Playlists'}</Text>
                <Text style={[styles.sectionMeta, isArabic && styles.arabic]}>{isArabic ? 'نظّم الترانيم بطريقتك' : 'Organize your listening'}</Text>
              </View>
            </View>

            <View style={styles.createRow}>
              <TextInput
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                onSubmitEditing={() => void createPlaylist()}
                placeholder={isArabic ? 'اسم قائمة جديدة' : 'New playlist name'}
                placeholderTextColor={COLORS.muted}
                style={[styles.input, isArabic && styles.arabicInput]}
                returnKeyType="done"
              />
              <Pressable disabled={!newPlaylistName.trim() || creating} style={[styles.createButton, (!newPlaylistName.trim() || creating) && styles.disabled]} onPress={() => void createPlaylist()}>
                <Text style={styles.createButtonText}>{creating ? '…' : '+'}</Text>
              </Pressable>
            </View>

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
          </>
        ) : null}
      </ScrollView>

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
  authCard: { padding: SPACING.lg, borderRadius: RADII.lg, borderWidth: 1, borderColor: COLORS.goldLine, backgroundColor: COLORS.navyDark },
  authTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
  authBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 20, marginTop: SPACING.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md, marginTop: SPACING.sm },
  sectionTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700' },
  sectionMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  likedActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  playAll: { minHeight: 40, paddingHorizontal: SPACING.md, borderRadius: RADII.pill, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  playAllText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  trackList: { borderRadius: RADII.lg, overflow: 'hidden', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  emptyCard: { padding: SPACING.lg, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  emptyText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center' },
  createRow: { flexDirection: 'row', gap: SPACING.sm },
  input: { flex: 1, minHeight: 46, paddingHorizontal: SPACING.md, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, color: COLORS.white, fontFamily: TYPOGRAPHY.body },
  arabicInput: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  createButton: { width: 46, height: 46, borderRadius: RADII.md, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  createButtonText: { color: COLORS.black, fontSize: 25, fontWeight: '800' },
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
