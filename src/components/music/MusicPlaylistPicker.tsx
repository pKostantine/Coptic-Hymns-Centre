import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import Icon from '@/components/chc/ui/Icon';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import type { MusicLibraryPlaylist } from '@/types/musicConsumer';
import type { MusicPlaylistVisibility } from '@/types/mediaPlatform';

export default function MusicPlaylistPicker({ trackId, compact = false, label = 'Add to playlist' }: {
  trackId: string;
  compact?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const [visible, setVisible] = useState(false);
  const [playlists, setPlaylists] = useState<MusicLibraryPlaylist[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newVisibility, setNewVisibility] = useState<MusicPlaylistVisibility>('private');
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    if (!user) {
      router.push('/account');
      return;
    }
    setVisible(true);
    setLoading(true);
    setError(null);
    try {
      const library = await musicService.getLibrary(locale);
      setPlaylists(library.playlists);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load your playlists.');
    } finally {
      setLoading(false);
    }
  };

  const addToPlaylist = async (playlistId: string) => {
    setBusyId(playlistId);
    setError(null);
    try {
      await musicService.addToPlaylist(playlistId, trackId);
      setAddedIds((current) => new Set(current).add(playlistId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add this track.');
    } finally {
      setBusyId(null);
    }
  };

  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      const playlistId = await musicService.createPlaylist(name, newDescription.trim() || null, newVisibility);
      await musicService.addToPlaylist(playlistId, trackId);
      setPlaylists((current) => [{
        id: playlistId,
        name,
        description: newDescription.trim() || null,
        visibility: newVisibility,
        trackCount: 1,
        coverAsset: null,
      }, ...current]);
      setAddedIds((current) => new Set(current).add(playlistId));
      setNewName('');
      setNewDescription('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the playlist.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Pressable
        accessibilityLabel={label}
        onPress={(event) => { event.stopPropagation(); void open(); }}
        style={compact ? styles.compactTrigger : styles.trigger}
      >
        <Icon name="list-outline" size={compact ? 18 : 20} color={COLORS.goldBright} />
        {!compact ? <Text style={styles.triggerText}>{label}</Text> : null}
      </Pressable>

      <Modal animationType="slide" transparent visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel="Close playlist picker" style={styles.backdrop} onPress={() => setVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.title}>Add to playlist</Text>
                <Text style={styles.subtitle}>Choose one or create a new playlist.</Text>
              </View>
              <Pressable accessibilityLabel="Close" style={styles.closeButton} onPress={() => setVisible(false)}>
                <Icon name="close" size={22} color={COLORS.white} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
              {loading ? <ActivityIndicator color={COLORS.gold} style={styles.loader} /> : null}
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

              {!loading && playlists.length ? (
                <View style={styles.playlistList}>
                  {playlists.map((playlist) => {
                    const added = addedIds.has(playlist.id);
                    const busy = busyId === playlist.id;
                    return (
                      <Pressable key={playlist.id} disabled={busy || added} style={styles.playlistRow} onPress={() => void addToPlaylist(playlist.id)}>
                        <View style={styles.playlistInfo}>
                          <Text numberOfLines={1} style={styles.playlistName}>{playlist.name}</Text>
                          <Text style={styles.playlistMeta}>{playlist.trackCount} track{playlist.trackCount === 1 ? '' : 's'} - {playlist.visibility}</Text>
                        </View>
                        {busy ? <ActivityIndicator color={COLORS.gold} /> : <Text style={[styles.addText, added && styles.addedText]}>{added ? 'Added' : 'Add'}</Text>}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              <View style={styles.creator}>
                <Text style={styles.creatorTitle}>New playlist</Text>
                <TextInput value={newName} onChangeText={setNewName} placeholder="Playlist name" placeholderTextColor={COLORS.muted} style={styles.input} />
                <TextInput value={newDescription} onChangeText={setNewDescription} placeholder="Description (optional)" placeholderTextColor={COLORS.muted} style={[styles.input, styles.descriptionInput]} multiline />
                <View style={styles.visibilityControl}>
                  {(['private', 'public'] as const).map((visibility) => (
                    <Pressable key={visibility} accessibilityRole="radio" accessibilityState={{ checked: newVisibility === visibility }} style={[styles.visibilityButton, newVisibility === visibility && styles.visibilityButtonActive]} onPress={() => setNewVisibility(visibility)}>
                      <Text style={[styles.visibilityText, newVisibility === visibility && styles.visibilityTextActive]}>{visibility === 'private' ? 'Private' : 'Public'}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable disabled={!newName.trim() || creating} style={[styles.createButton, (!newName.trim() || creating) && styles.disabled]} onPress={() => void createAndAdd()}>
                  {creating ? <ActivityIndicator color={COLORS.black} /> : <Text style={styles.createButtonText}>Create and add track</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: SPACING.sm, justifyContent: 'center', minHeight: 42, paddingHorizontal: SPACING.md },
  triggerText: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  compactTrigger: { alignItems: 'center', borderRadius: 8, height: 34, justifyContent: 'center', width: 34 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.7)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  sheet: { backgroundColor: COLORS.black, borderColor: COLORS.border, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderTopWidth: 1, maxHeight: '88%', paddingBottom: SPACING.lg },
  sheetHeader: { alignItems: 'center', borderBottomColor: COLORS.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.md },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 23, fontWeight: '700' },
  subtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  closeButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  sheetContent: { alignSelf: 'center', gap: SPACING.lg, maxWidth: 680, padding: SPACING.md, width: '100%' },
  loader: { marginVertical: SPACING.lg },
  error: { color: '#FF8A8A', fontFamily: TYPOGRAPHY.body, fontSize: 13 },
  playlistList: { borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  playlistRow: { alignItems: 'center', borderBottomColor: COLORS.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: SPACING.md, minHeight: 62, paddingHorizontal: SPACING.md },
  playlistInfo: { flex: 1, minWidth: 0 },
  playlistName: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '800' },
  playlistMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 3, textTransform: 'capitalize' },
  addText: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '900' },
  addedText: { color: COLORS.learningBright },
  creator: { borderTopColor: COLORS.border, borderTopWidth: 1, gap: SPACING.sm, paddingTop: SPACING.lg },
  creatorTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 20, fontWeight: '700' },
  input: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, minHeight: 46, paddingHorizontal: SPACING.md },
  descriptionInput: { minHeight: 72, paddingTop: 12, textAlignVertical: 'top' },
  visibilityControl: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', padding: 3 },
  visibilityButton: { alignItems: 'center', borderRadius: 6, flex: 1, justifyContent: 'center', minHeight: 40 },
  visibilityButtonActive: { backgroundColor: COLORS.gold },
  visibilityText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  visibilityTextActive: { color: COLORS.black },
  createButton: { alignItems: 'center', backgroundColor: COLORS.gold, borderRadius: 8, justifyContent: 'center', minHeight: 46 },
  createButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});
