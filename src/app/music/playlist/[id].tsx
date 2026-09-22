import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import Icon from '@/components/chc/ui/Icon';
import ShareMetadata from '@/components/chc/ui/ShareMetadata';
import MusicArtwork from '@/components/music/MusicArtwork';
import MusicDownloadButton from '@/components/music/MusicDownloadButton';
import MusicMiniPlayer from '@/components/music/MusicMiniPlayer';
import PlaylistTrackEditorRow from '@/components/music/PlaylistTrackEditorRow';
import MusicTrackActionsMenu from '@/components/music/MusicTrackActionsMenu';
import MusicTrackRow from '@/components/music/MusicTrackRow';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useMusicPlayer } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import { playlistCoverService } from '@/services/playlistCoverService';
import {
  musicPlaylistDownloadRequest,
} from '@/services/offlineDownloadRequests';
import type { MusicPlaylistPayload, PublishedTrackLyricsPayload } from '@/types/musicConsumer';
import type { MusicPlaylistVisibility } from '@/types/mediaPlatform';
import { goBack } from '@/utils/navigation';
import { publicShareUrl, publicUrl } from '@/utils/publicUrl';
import { shareLink } from '@/utils/shareLink';

export default function MusicPlaylistScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { preferences } = useReadingPreferences();
  const { currentItem, playQueue } = useMusicPlayer();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const playlistId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [playlist, setPlaylist] = useState<MusicPlaylistPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editVisibility, setEditVisibility] = useState<MusicPlaylistVisibility>('private');
  const [saving, setSaving] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const queue = useMemo(() => (playlist?.tracks ?? []).map((track) => ({ track, releaseId: track.releaseId, coverAsset: playlist?.coverAsset })), [playlist]);
  useEffect(() => {
    let active = true;
    musicService.getLibrary(locale)
      .then((library) => {
        if (active) setLikedTrackIds(new Set(library.likedTracks.map((track) => track.id)));
      })
      .catch(() => {
        if (active) setLikedTrackIds(new Set());
      });
    return () => { active = false; };
  }, [locale, user?.id]);

  useEffect(() => {
    if (!playlistId) return;
    let active = true;
    musicService.getPlaylist(playlistId, locale)
      .then((payload) => {
        if (!active) return;
        setError(null);
        setPlaylist(payload);
        setEditName(payload.name);
        setEditDescription(payload.description ?? '');
        setEditVisibility(payload.visibility);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load playlist.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [locale, playlistId, user?.id]);

  const preparePlaylistDownload = async () => {
    if (!playlist) throw new Error('Playlist is not loaded.');
    const lyrics = await Promise.all(playlist.tracks.map(async (track) => {
      try { return [track.id, await musicService.getLyrics(track.id, locale)] as const; }
      catch { return [track.id, null] as const; }
    }));
    return musicPlaylistDownloadRequest(
      playlist,
      locale,
      Object.fromEntries(lyrics) as Record<string, PublishedTrackLyricsPayload | null>,
    );
  };

  const toggleTrackLike = async (trackId: string) => {
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

  const removeTrack = async (trackId: string) => {
    if (!playlistId || !playlist) return;
    const previousPlaylist = playlist;
    const nextPlaylist = {
      ...playlist,
      tracks: playlist.tracks.filter((track) => track.id !== trackId),
    };
    setPlaylist(nextPlaylist);
    try {
      await musicService.removeFromPlaylist(playlistId, trackId);
    } catch (cause) {
      setPlaylist(previousPlaylist);
      Alert.alert('Playlist', cause instanceof Error ? cause.message : 'Unable to remove track.');
      return;
    }

    try {
      setPlaylist(await musicService.getPlaylist(playlistId, locale));
    } catch {
      // The remove already succeeded. Keep the accurate optimistic track list;
      // the dynamic artwork will refresh on the next successful playlist load.
      setPlaylist(nextPlaylist);
    }
  };

  const savePlaylist = async () => {
    if (!playlistId || !editName.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await musicService.updatePlaylist(playlistId, editName.trim(), editDescription.trim() || null, editVisibility);
      setPlaylist((current) => current ? {
        ...current,
        name: editName.trim(),
        description: editDescription.trim() || null,
        visibility: editVisibility,
      } : current);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this playlist.');
    } finally {
      setSaving(false);
    }
  };

  const deletePlaylist = async () => {
    if (!playlistId || saving) return;
    setSaving(true);
    setError(null);
    try {
      await musicService.deletePlaylist(playlistId);
      router.replace('/music/library');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete this playlist.');
      setSaving(false);
    }
  };

  const moveTrack = async (index: number, nextIndex: number) => {
    if (!playlistId || !playlist || reordering) return;
    if (nextIndex < 0 || nextIndex >= playlist.tracks.length || nextIndex === index) return;
    const previousTracks = playlist.tracks;
    const nextTracks = [...previousTracks];
    const [movedTrack] = nextTracks.splice(index, 1);
    nextTracks.splice(nextIndex, 0, movedTrack);
    setPlaylist({ ...playlist, tracks: nextTracks });
    setReordering(true);
    setError(null);
    try {
      await musicService.setPlaylistTrackOrder(playlistId, nextTracks.map((track) => track.id));
    } catch (cause) {
      setPlaylist({ ...playlist, tracks: previousTracks });
      setError(cause instanceof Error ? cause.message : 'Unable to reorder this playlist.');
      setReordering(false);
      return;
    }

    try {
      setPlaylist(await musicService.getPlaylist(playlistId, locale));
    } catch {
      // The order is already saved. Keep it instead of showing a false
      // rollback if only the follow-up artwork refresh is unavailable.
      setPlaylist({ ...playlist, tracks: nextTracks });
    } finally {
      setReordering(false);
    }
  };

  const choosePlaylistCover = async () => {
    if (!playlistId || !playlist || !user || coverBusy) return;
    setCoverBusy(true);
    setError(null);
    try {
      const coverAsset = await playlistCoverService.pickAndUpload(user.id, playlistId);
      if (coverAsset) {
        setPlaylist({ ...playlist, coverAsset, hasCustomCover: true });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update the playlist cover.');
    } finally {
      setCoverBusy(false);
    }
  };

  const clearPlaylistCover = async () => {
    if (!playlistId || !user || coverBusy) return;
    setCoverBusy(true);
    setError(null);
    try {
      await playlistCoverService.remove(user.id, playlistId);
      setPlaylist(await musicService.getPlaylist(playlistId, locale));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove the playlist cover.');
    } finally {
      setCoverBusy(false);
    }
  };

  const sharePlaylist = async () => {
    if (!playlist || playlist.visibility !== 'public') return;
    await shareLink({
      title: playlist.name,
      text: playlist.description || `Listen to ${playlist.name} on Coptic Hymns Centre.`,
      url: publicShareUrl(`/share/music/playlist/${playlist.id}`, playlist.coverAsset?.id),
    });
  };

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      {playlist?.visibility === 'public' ? (
        <ShareMetadata
          title={playlist.name}
          description={playlist.description || `Listen to ${playlist.name} on Coptic Hymns Centre.`}
          canonicalUrl={publicUrl(`/music/playlist/${playlist.id}`)}
          imageUrl={musicService.resolveAsset(playlist.coverAsset)}
          type="music.album"
        />
      ) : null}
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" onPress={() => goBack(router, '/music')} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable>
        <Text numberOfLines={1} style={[styles.headerTitle, isArabic && styles.arabic]}>{isArabic ? 'قائمة التشغيل' : 'Playlist'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? <ActivityIndicator color={COLORS.gold} style={styles.loader} /> : null}
      {error ? <View style={styles.center}><Text style={styles.error}>{error}</Text></View> : null}

      {playlist ? (
        <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <MusicArtwork asset={playlist.coverAsset} size={184} label={playlist.name} />
            <View style={styles.heroText}>
              <Text style={[styles.eyebrow, isArabic && styles.arabic]}>{playlist.visibility.toUpperCase()}</Text>
              <Text style={[styles.title, isArabic && styles.arabic]}>{playlist.name}</Text>
              {playlist.description ? <Text style={[styles.description, isArabic && styles.arabic]}>{playlist.description}</Text> : null}
              <Text style={[styles.meta, isArabic && styles.arabic]}>
                {isArabic ? `${playlist.tracks.length} ترنيمة` : `${playlist.tracks.length} ${playlist.tracks.length === 1 ? 'track' : 'tracks'}`}
              </Text>
              <View style={styles.actions}>
                {playlist.tracks.length ? (
                  <>
                  <Pressable style={styles.playButton} onPress={() => playQueue(queue, 0)}><Text style={styles.playButtonText}>▶ {isArabic ? 'تشغيل' : 'Play'}</Text></Pressable>
                  {Platform.OS !== 'web' ? (
                    <MusicDownloadButton
                      packageKey={`music_playlist:${playlist.id}:${locale}`}
                      request={preparePlaylistDownload}
                      isArabic={isArabic}
                    />
                  ) : null}
                  </>
                ) : null}
                {playlist.visibility === 'public' ? (
                  <Pressable style={styles.actionButton} onPress={() => void sharePlaylist()}>
                    <Icon name="share-outline" size={18} color={COLORS.goldBright} />
                    <Text style={styles.actionButtonText}>{isArabic ? 'مشاركة' : 'Share'}</Text>
                  </Pressable>
                ) : null}
                {playlist.isOwner ? (
                  <Pressable style={styles.actionButton} onPress={() => setEditing((current) => !current)}>
                    <Icon name="settings-outline" size={18} color={COLORS.goldBright} />
                    <Text style={styles.actionButtonText}>{editing ? (isArabic ? 'إغلاق' : 'Close') : (isArabic ? 'تعديل' : 'Edit')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>

          {playlist.isOwner && editing ? (
            <View style={styles.editor}>
              <Text style={styles.editorTitle}>{isArabic ? 'تعديل قائمة التشغيل' : 'Edit playlist'}</Text>
              <View style={styles.coverEditor}>
                <MusicArtwork asset={playlist.coverAsset} size={84} label={playlist.name} />
                <View style={styles.coverEditorText}>
                  <Text style={[styles.coverLabel, isArabic && styles.arabic]}>{isArabic ? 'غلاف قائمة التشغيل' : 'Playlist cover'}</Text>
                  <Text style={[styles.coverHelp, isArabic && styles.arabic]}>
                    {isArabic
                      ? 'بدون صورة مخصصة، يتبع الغلاف تلقائياً صورة أول ترنيمة.'
                      : 'Without a custom image, the cover automatically follows the first track.'}
                  </Text>
                  <View style={styles.coverActions}>
                    <Pressable disabled={coverBusy} style={[styles.coverButton, coverBusy && styles.disabled]} onPress={() => void choosePlaylistCover()}>
                      <Text style={styles.coverButtonText}>{playlist.hasCustomCover ? (isArabic ? 'استبدال' : 'Replace') : (isArabic ? 'اختيار صورة' : 'Choose image')}</Text>
                    </Pressable>
                    {playlist.hasCustomCover ? (
                      <Pressable disabled={coverBusy} style={[styles.coverRemoveButton, coverBusy && styles.disabled]} onPress={() => void clearPlaylistCover()}>
                        <Text style={styles.coverRemoveText}>{isArabic ? 'إزالة' : 'Remove'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
              <TextInput value={editName} onChangeText={setEditName} placeholder="Playlist name" placeholderTextColor={COLORS.muted} style={styles.input} />
              <TextInput value={editDescription} onChangeText={setEditDescription} placeholder="Description (optional)" placeholderTextColor={COLORS.muted} style={[styles.input, styles.descriptionInput]} multiline />
              <View style={styles.visibilityControl}>
                {(['private', 'public'] as const).map((visibility) => (
                  <Pressable key={visibility} accessibilityRole="radio" accessibilityState={{ checked: editVisibility === visibility }} style={[styles.visibilityButton, editVisibility === visibility && styles.visibilityButtonActive]} onPress={() => setEditVisibility(visibility)}>
                    <Text style={[styles.visibilityText, editVisibility === visibility && styles.visibilityTextActive]}>{visibility === 'private' ? (isArabic ? 'خاصة' : 'Private') : (isArabic ? 'عامة' : 'Public')}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.visibilityHelp}>{editVisibility === 'public' ? 'Anyone with the link can open and play this playlist.' : 'Only you can open this playlist.'}</Text>
              <Pressable disabled={!editName.trim() || saving} style={[styles.saveButton, (!editName.trim() || saving) && styles.disabled]} onPress={() => void savePlaylist()}>
                {saving ? <ActivityIndicator color={COLORS.black} /> : <Text style={styles.saveButtonText}>{isArabic ? 'حفظ التغييرات' : 'Save changes'}</Text>}
              </Pressable>
              {!confirmDelete ? (
                <Pressable style={styles.deleteButton} onPress={() => setConfirmDelete(true)}><Text style={styles.deleteButtonText}>{isArabic ? 'حذف قائمة التشغيل' : 'Delete playlist'}</Text></Pressable>
              ) : (
                <View style={styles.deleteConfirm}>
                  <Text style={styles.deleteConfirmText}>Delete this playlist? This cannot be undone.</Text>
                  <View style={styles.deleteActions}>
                    <Pressable style={styles.cancelDeleteButton} onPress={() => setConfirmDelete(false)}><Text style={styles.cancelDeleteText}>Cancel</Text></Pressable>
                    <Pressable disabled={saving} style={styles.confirmDeleteButton} onPress={() => void deletePlaylist()}><Text style={styles.confirmDeleteText}>Delete</Text></Pressable>
                  </View>
                </View>
              )}
            </View>
          ) : null}

          <View style={styles.trackList}>
            {playlist.tracks.length ? playlist.tracks.map((track, index) => (
                playlist.isOwner && editing ? (
                  <PlaylistTrackEditorRow
                    key={track.id}
                    track={track}
                    index={index}
                    count={playlist.tracks.length}
                    active={currentItem?.track.id === track.id}
                    liked={likedTrackIds.has(track.id)}
                    onPlay={() => playQueue(queue, index)}
                    onToggleLike={() => void toggleTrackLike(track.id)}
                    onRemove={() => void removeTrack(track.id)}
                    onMove={(fromIndex, toIndex) => void moveTrack(fromIndex, toIndex)}
                  />
                ) : (
                  <View key={track.id} style={styles.trackFlex}>
                    <MusicTrackRow
                      track={track}
                      index={index}
                      active={currentItem?.track.id === track.id}
                      onPress={() => playQueue(queue, index)}
                      showLikeButton
                      liked={likedTrackIds.has(track.id)}
                      onToggleLike={() => void toggleTrackLike(track.id)}
                      trailing={<MusicTrackActionsMenu item={queue[index]} isArabic={isArabic} />}
                    />
                  </View>
                )
              )) : (
              <View style={styles.empty}><Text style={[styles.emptyText, isArabic && styles.arabic]}>{isArabic ? 'هذه القائمة فارغة.' : 'This playlist is empty.'}</Text></View>
            )}
          </View>
        </NowPlayingAwareScrollView>
      ) : null}

      <MusicMiniPlayer />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { color: COLORS.gold, fontSize: 34, lineHeight: 36 },
  headerTitle: { flex: 1, color: COLORS.white, textAlign: 'center', fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 44 },
  loader: { marginTop: SPACING.xl },
  center: { padding: SPACING.lg, alignItems: 'center' },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center' },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  hero: { alignItems: 'center', padding: SPACING.lg, borderRadius: RADII.lg, backgroundColor: COLORS.navyDark, borderWidth: 1, borderColor: COLORS.goldLine },
  heroText: { width: '100%', maxWidth: 680, alignItems: 'center', marginTop: SPACING.lg },
  eyebrow: { color: COLORS.gold, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textAlign: 'center' },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 30, fontWeight: '700', marginTop: SPACING.xs, textAlign: 'center' },
  description: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19, marginTop: SPACING.sm, textAlign: 'center' },
  meta: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: SPACING.sm, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.md },
  playButton: { minHeight: 42, paddingHorizontal: SPACING.md, borderRadius: RADII.pill, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  playButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontWeight: '800' },
  actionButton: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: SPACING.sm, justifyContent: 'center', minHeight: 42, paddingHorizontal: SPACING.md },
  actionButtonText: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  editor: { borderBottomColor: COLORS.border, borderBottomWidth: 1, gap: SPACING.sm, paddingVertical: SPACING.lg },
  editorTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700' },
  coverEditor: { alignItems: 'center', backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: SPACING.md, padding: SPACING.md },
  coverEditorText: { flex: 1, minWidth: 0 },
  coverLabel: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  coverHelp: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, lineHeight: 16, marginTop: 3 },
  coverActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  coverButton: { alignItems: 'center', backgroundColor: COLORS.gold, borderRadius: RADII.pill, justifyContent: 'center', minHeight: 34, paddingHorizontal: SPACING.md },
  coverButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '900' },
  coverRemoveButton: { alignItems: 'center', borderColor: COLORS.border, borderRadius: RADII.pill, borderWidth: 1, justifyContent: 'center', minHeight: 34, paddingHorizontal: SPACING.md },
  coverRemoveText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800' },
  input: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, minHeight: 46, paddingHorizontal: SPACING.md },
  descriptionInput: { minHeight: 78, paddingTop: 12, textAlignVertical: 'top' },
  visibilityControl: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', padding: 3 },
  visibilityButton: { alignItems: 'center', borderRadius: 6, flex: 1, justifyContent: 'center', minHeight: 40 },
  visibilityButtonActive: { backgroundColor: COLORS.gold },
  visibilityText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  visibilityTextActive: { color: COLORS.black },
  visibilityHelp: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, lineHeight: 17 },
  saveButton: { alignItems: 'center', backgroundColor: COLORS.gold, borderRadius: 8, justifyContent: 'center', minHeight: 46 },
  saveButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '900' },
  deleteButton: { alignItems: 'center', borderColor: 'rgba(214,69,69,0.7)', borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 44 },
  deleteButtonText: { color: '#FF8A8A', fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  deleteConfirm: { borderColor: 'rgba(214,69,69,0.7)', borderRadius: 8, borderWidth: 1, gap: SPACING.sm, padding: SPACING.md },
  deleteConfirmText: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 13 },
  deleteActions: { flexDirection: 'row', gap: SPACING.sm },
  cancelDeleteButton: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 40 },
  cancelDeleteText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  confirmDeleteButton: { alignItems: 'center', backgroundColor: COLORS.priest, borderRadius: 8, flex: 1, justifyContent: 'center', minHeight: 40 },
  confirmDeleteText: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '900' },
  trackList: { marginTop: SPACING.lg, borderRadius: RADII.lg, overflow: 'hidden', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  trackFlex: { flex: 1 },
  disabled: { opacity: 0.35 },
  empty: { padding: SPACING.lg },
  emptyText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
