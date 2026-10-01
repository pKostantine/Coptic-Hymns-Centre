'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import Icon, { type IconName } from '@/components/chc/ui/Icon';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { learningService } from '@/services/learningService';
import type {
  LearningPlaylistItemKind,
  LearningPlaylistSummary,
  LearningProgressState,
} from '@/types/learningPlatform';

import { tr } from '../../utils/appText';
const BUILT_IN_LISTS: { state: LearningProgressState; label: string; labelAr: string; labelFr: string; icon: IconName }[] = [
  { state: 'will_learn', label: 'Will Learn', labelAr: 'سأتعلم', labelFr: 'À apprendre', icon: 'bookmark-outline' },
  { state: 'learning', label: 'Learning', labelAr: 'أتعلّم الآن', labelFr: 'En cours', icon: 'school-outline' },
  { state: 'finished', label: 'Finished Learning', labelAr: 'أكملت التعلّم', labelFr: 'Apprentissage terminé', icon: 'checkmark' },
];

export default function LearningPlaylistPicker({
  itemKind,
  itemId,
  locale,
  isArabic = false,
}: {
  itemKind: LearningPlaylistItemKind;
  itemId: string;
  locale: string;
  isArabic?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<LearningPlaylistSummary[]>([]);
  const [currentState, setCurrentState] = useState<LearningProgressState | null>(null);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const show = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const [playlistPayload, itemLibrary] = await Promise.all([
        learningService.getPlaylists(locale),
        learningService.getItemLibrary(locale),
      ]);
      if (!playlistPayload.authenticated || !itemLibrary.authenticated) {
        setOpen(false);
        Alert.alert(
          tr('Sign in required', 'Connexion requise', 'تسجيل الدخول مطلوب'),
          tr('Sign in to save learning progress and playlists.', 'Connectez-vous pour enregistrer votre progression et vos playlists.', 'سجّل الدخول لحفظ تقدّمك وقوائم التعلّم.'),
        );
        return;
      }
      setPlaylists(playlistPayload.playlists);
      setCurrentState(itemLibrary.items.find((item) => item.itemKind === itemKind && item.itemId === itemId)?.state ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load My Learning.');
    } finally {
      setLoading(false);
    }
  };

  const selectBuiltIn = async (state: LearningProgressState) => {
    if (addingId || currentState === state) return;
    setAddingId(state);
    setError(null);
    try {
      await learningService.setItemProgress(itemKind, itemId, state);
      setCurrentState(state);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update My Learning.');
    } finally {
      setAddingId(null);
    }
  };

  const addToCustom = async (playlist: LearningPlaylistSummary) => {
    if (addingId) return;
    setAddingId(playlist.id);
    setError(null);
    try {
      await learningService.addPlaylistItem(playlist.id, itemKind, itemId);
      setOpen(false);
      Alert.alert(
        tr('Added', 'Ajouté', 'تمت الإضافة'),
        tr(`Added to ${playlist.name}.`, `Ajouté à ${playlist.name}.`, 'تمت إضافة المحتوى إلى قائمتك.'),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add this item.');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <>
      <Pressable accessibilityLabel="Add to My Learning" style={styles.trigger} onPress={() => void show()}>
        <Icon name="playlist-add" size={20} color={COLORS.learningBright} />
      </Pressable>
      <Modal animationType="fade" transparent visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={[styles.title, isArabic && styles.arabic]}>{tr('Add to My Learning', 'Ajouter à Mon apprentissage', 'أضف إلى تعلّمي')}</Text>
                <Text style={[styles.subtitle, isArabic && styles.arabic]}>{tr('Choose a built-in or custom playlist', 'Choisissez une playlist intégrée ou personnelle', 'اختر قائمة أساسية أو مخصّصة')}</Text>
              </View>
              <Pressable accessibilityLabel="Close" style={styles.close} onPress={() => setOpen(false)}>
                <Icon name="close" size={20} color={COLORS.muted} />
              </Pressable>
            </View>
            {loading ? <ActivityIndicator color={COLORS.learning} style={styles.loader} /> : null}
            {!loading ? (
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                <Text style={[styles.groupLabel, isArabic && styles.arabic]}>{tr('MY LEARNING', 'MON APPRENTISSAGE', 'قوائم التعلّم')}</Text>
                {BUILT_IN_LISTS.map((entry) => {
                  const selected = currentState === entry.state;
                  return (
                    <Pressable
                      key={entry.state}
                      disabled={selected || Boolean(addingId)}
                      onPress={() => void selectBuiltIn(entry.state)}
                      style={[styles.playlist, selected && styles.playlistSelected]}
                    >
                      <View style={styles.playlistIcon}><Icon name={entry.icon} size={21} color={selected ? COLORS.learningBright : COLORS.muted} /></View>
                      <View style={styles.playlistInfo}>
                        <Text style={[styles.playlistName, isArabic && styles.arabic]}>{tr(entry.label, entry.labelFr, entry.labelAr)}</Text>
                        {selected ? <Text style={[styles.selectedText, isArabic && styles.arabic]}>{tr('Currently in this list', 'Déjà dans cette liste', 'في هذه القائمة')}</Text> : null}
                      </View>
                      {addingId === entry.state
                        ? <ActivityIndicator color={COLORS.learning} />
                        : <Icon name={selected ? 'checkmark' : 'chevron-forward'} size={18} color={selected ? COLORS.learningBright : COLORS.learning} />}
                    </Pressable>
                  );
                })}

                <Text style={[styles.groupLabel, styles.customLabel, isArabic && styles.arabic]}>{tr('CUSTOM PLAYLISTS', 'PLAYLISTS PERSONNELLES', 'قوائم مخصّصة')}</Text>
                {playlists.map((playlist) => (
                  <Pressable key={playlist.id} disabled={Boolean(addingId)} style={styles.playlist} onPress={() => void addToCustom(playlist)}>
                    <View style={styles.playlistIcon}><Icon name="list-outline" size={21} color={COLORS.learningBright} /></View>
                    <View style={styles.playlistInfo}>
                      <Text numberOfLines={1} style={[styles.playlistName, isArabic && styles.arabic]}>{playlist.name}</Text>
                      <Text style={[styles.playlistMeta, isArabic && styles.arabic]}>{playlist.itemCount} {playlist.itemCount === 1 ? 'item' : 'items'}</Text>
                    </View>
                    {addingId === playlist.id ? <ActivityIndicator color={COLORS.learning} /> : <Icon name="chevron-forward" size={18} color={COLORS.learning} />}
                  </Pressable>
                ))}
                {!playlists.length ? (
                  <Text style={[styles.empty, isArabic && styles.arabic]}>{tr('Create custom playlists from My Learning.', 'Créez des playlists personnelles depuis Mon apprentissage.', 'أنشئ قائمة مخصّصة من صفحة «تعلّمي».')}</Text>
                ) : null}
              </ScrollView>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: COLORS.learningSoft, borderWidth: 1, borderColor: COLORS.learningLine },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.72)' },
  sheet: { maxHeight: '78%', padding: SPACING.md, paddingBottom: SPACING.xl, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: COLORS.greenDeep, borderWidth: 1, borderColor: COLORS.learningLine },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  headerCopy: { flex: 1 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
  subtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  close: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  loader: { marginVertical: SPACING.xl },
  list: { marginTop: SPACING.md },
  listContent: { gap: SPACING.sm },
  groupLabel: { color: COLORS.learning, fontFamily: TYPOGRAPHY.body, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  customLabel: { marginTop: SPACING.md },
  playlist: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.sm, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  playlistSelected: { borderColor: COLORS.learning, backgroundColor: COLORS.learningDeep },
  playlistIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: RADII.sm, backgroundColor: COLORS.learningSoft },
  playlistInfo: { flex: 1, minWidth: 0 },
  playlistName: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  playlistMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 3 },
  selectedText: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 10, fontWeight: '700', marginTop: 3 },
  empty: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, textAlign: 'center', padding: SPACING.md },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: SPACING.sm },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
