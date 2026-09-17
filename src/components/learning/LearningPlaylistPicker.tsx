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

import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { learningService } from '@/services/learningService';
import type {
  LearningPlaylistItemKind,
  LearningPlaylistSummary,
} from '@/types/learningPlatform';

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
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const show = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const payload = await learningService.getPlaylists(locale);
      if (!payload.authenticated) {
        setOpen(false);
        Alert.alert(
          isArabic ? 'تسجيل الدخول مطلوب' : 'Sign in required',
          isArabic
            ? 'سجّل الدخول لإضافة الدروس إلى قوائمك.'
            : 'Sign in to add learning media to your playlists.',
        );
        return;
      }
      setPlaylists(payload.playlists);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load playlists.');
    } finally {
      setLoading(false);
    }
  };

  const add = async (playlist: LearningPlaylistSummary) => {
    if (addingId) return;
    setAddingId(playlist.id);
    setError(null);
    try {
      await learningService.addPlaylistItem(playlist.id, itemKind, itemId);
      setOpen(false);
      Alert.alert(
        isArabic ? 'تمت الإضافة' : 'Added',
        isArabic ? 'تمت إضافة المحتوى إلى قائمتك.' : 'Added to ' + playlist.name + '.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add this item.');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <>
      <Pressable accessibilityLabel="Add to learning playlist" style={styles.trigger} onPress={() => void show()}>
        <Text style={styles.triggerText}>＋</Text>
      </Pressable>
      <Modal
        animationType="fade"
        transparent
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={[styles.title, isArabic && styles.arabic]}>
                  {isArabic ? 'أضف إلى قائمة' : 'Add to playlist'}
                </Text>
                <Text style={[styles.subtitle, isArabic && styles.arabic]}>
                  {isArabic ? 'اختر قائمة تعلّم' : 'Choose a learning playlist'}
                </Text>
              </View>
              <Pressable style={styles.close} onPress={() => setOpen(false)}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            {loading ? <ActivityIndicator color={COLORS.learning} style={styles.loader} /> : null}
            {!loading && !playlists.length ? (
              <Text style={[styles.empty, isArabic && styles.arabic]}>
                {isArabic
                  ? 'أنشئ قائمة أولاً من صفحة «تعلّمي».'
                  : 'Create a playlist first from My Learning.'}
              </Text>
            ) : null}
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {playlists.map((playlist) => (
                <Pressable key={playlist.id} style={styles.playlist} onPress={() => void add(playlist)}>
                  <View style={styles.playlistIcon}><Text style={styles.playlistIconText}>≡</Text></View>
                  <View style={styles.playlistInfo}>
                    <Text numberOfLines={1} style={[styles.playlistName, isArabic && styles.arabic]}>{playlist.name}</Text>
                    <Text style={[styles.playlistMeta, isArabic && styles.arabic]}>
                      {playlist.itemCount + (playlist.itemCount === 1 ? ' item' : ' items')}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>{addingId === playlist.id ? '…' : '›'}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: COLORS.learningSoft,
    borderWidth: 1,
    borderColor: COLORS.learningLine,
  },
  triggerText: { color: COLORS.learningBright, fontSize: 21, lineHeight: 23, fontWeight: '700' },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  sheet: {
    maxHeight: '72%',
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: COLORS.navyDark,
    borderWidth: 1,
    borderColor: COLORS.learningLine,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  headerText: { flex: 1 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
  subtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  close: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: COLORS.muted, fontSize: 30 },
  loader: { marginVertical: SPACING.xl },
  empty: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center', padding: SPACING.lg },
  list: { marginTop: SPACING.md },
  listContent: { gap: SPACING.sm },
  playlist: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.sm,
    borderRadius: RADII.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  playlistIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.sm,
    backgroundColor: COLORS.learningSoft,
  },
  playlistIconText: { color: COLORS.learningBright, fontSize: 22, fontWeight: '800' },
  playlistInfo: { flex: 1, minWidth: 0 },
  playlistName: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  playlistMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 3 },
  chevron: { color: COLORS.learning, fontSize: 27 },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: SPACING.sm },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
