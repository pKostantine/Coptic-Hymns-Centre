import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import LearningBackHeader from '@/components/learning/LearningBackHeader';
import LearningDownloadButton from '@/components/learning/LearningDownloadButton';
import LearningMediaRow from '@/components/learning/LearningMediaRow';
import LearningMiniPlayer from '@/components/learning/LearningMiniPlayer';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { type LearningQueueItem, useLearningPlayer } from '@/context/LearningPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { learningService } from '@/services/learningService';
import type { LearningPlaylistDetail, LearningPlaylistItem } from '@/types/learningPlatform';

function toQueueItem(item: LearningPlaylistItem): LearningQueueItem | null {
  if (item.kind === 'album_recording') {
    return {
      kind: 'recording',
      id: item.recording.id,
      title: item.recording.title,
      subtitle: item.recording.subtitle,
      durationMs: item.recording.durationMs,
      mediaAsset: item.recording.mediaAsset,
      containerId: item.recording.albumId,
      containerTitle: item.recording.albumTitle,
      cantorName: 'Coptic Hymns Centre',
      coverAsset: null,
      hymnId: item.recording.hymnId ?? null,
    };
  }
  if (item.lesson.mediaType === 'video') return null;
  return {
    kind: 'lesson',
    id: item.lesson.id,
    title: item.lesson.title,
    subtitle: item.lesson.description,
    durationMs: item.lesson.durationMs,
    mediaAsset: item.lesson.mediaAsset,
    containerId: item.lesson.lessonSetId,
    containerTitle: item.lesson.lessonSetTitle,
    cantorName: 'Coptic Hymns Centre',
    coverAsset: null,
    hymnId: null,
  };
}

export default function LearningPlaylistScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const playlistId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [playlist, setPlaylist] = useState<LearningPlaylistDetail | null>(null);
  const [owned, setOwned] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { currentItem, playQueue } = useLearningPlayer();
  const audioQueue = useMemo(() => (
    playlist?.items.map(toQueueItem).filter((item): item is LearningQueueItem => Boolean(item)) ?? []
  ), [playlist]);

  useEffect(() => {
    if (!playlistId) return;
    let active = true;
    Promise.all([
      learningService.getPlaylist(playlistId, locale),
      learningService.getPlaylists(locale),
    ])
      .then(([detail, library]) => {
        if (!active) return;
        setError(null);
        setPlaylist(detail);
        setOwned(library.authenticated && library.playlists.some((item) => item.id === playlistId));
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load learning playlist.');
      });
    return () => { active = false; };
  }, [locale, playlistId]);

  const openItem = (item: LearningPlaylistItem) => {
    if (item.kind === 'lesson' && item.lesson.mediaType === 'video') {
      router.push('/learn/lesson/' + item.lesson.id + '?setId=' + item.lesson.lessonSetId);
      return;
    }
    const id = item.kind === 'album_recording' ? item.recording.id : item.lesson.id;
    const index = audioQueue.findIndex((entry) => entry.id === id);
    if (index >= 0) playQueue(audioQueue, index);
  };

  const removeItem = async (item: LearningPlaylistItem) => {
    if (!playlist || !owned || removingId) return;
    setRemovingId(item.id);
    setError(null);
    try {
      const updated = await learningService.removePlaylistItem(playlist.id, item.id);
      setPlaylist(updated);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to remove this item.';
      setError(message);
      Alert.alert(isArabic ? 'تعذّرت الإزالة' : 'Could not remove item', message);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{playlist ? playlist.name + ' — Learn & Study' : 'Learning Playlist'}</title></Head>
      <LearningBackHeader title={isArabic ? 'قائمة تعلّم' : 'Learning Playlist'} isArabic={isArabic} />
      {!playlist && !error ? <ActivityIndicator color={COLORS.learning} style={styles.loader} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {playlist ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.heroIcon}><Text style={styles.heroGlyph}>≡</Text></View>
            <Text style={[styles.eyebrow, isArabic && styles.arabic]}>
              {isArabic ? visibilityLabel(playlist.visibility, true) + ' · قائمة مخصّصة' : visibilityLabel(playlist.visibility, false).toUpperCase() + ' · CUSTOM PLAYLIST'}
            </Text>
            <Text style={[styles.title, isArabic && styles.arabic]}>{playlist.name}</Text>
            {playlist.description ? <Text style={[styles.description, isArabic && styles.arabic]}>{playlist.description}</Text> : null}
            <Text style={[styles.itemCount, isArabic && styles.arabic]}>
              {isArabic ? `${playlist.items.length} عنصر` : `${playlist.items.length} ${playlist.items.length === 1 ? 'item' : 'items'}`}
            </Text>
            <View style={styles.actions}>
              <Pressable disabled={!audioQueue.length} style={[styles.playAll, !audioQueue.length && styles.disabled]} onPress={() => audioQueue.length && playQueue(audioQueue, 0)}>
                <Text style={styles.playAllText}>▶  {isArabic ? 'تشغيل الصوت' : 'Play Audio'}</Text>
              </Pressable>
              <LearningDownloadButton isArabic={isArabic} />
            </View>
          </View>

          <View style={styles.headingRow}>
            <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'محتوى القائمة' : 'Playlist Items'}</Text>
            {owned ? <Text style={[styles.ownerBadge, isArabic && styles.arabic]}>{isArabic ? 'قائمتك' : 'YOURS'}</Text> : null}
          </View>
          <View style={styles.mediaList}>
            {playlist.items.map((item, index) => {
              const content = item.kind === 'album_recording' ? item.recording : item.lesson;
              const subtitle = item.kind === 'album_recording'
                ? item.recording.albumTitle
                : item.lesson.lessonSetTitle;
              const mediaType = item.kind === 'lesson' ? item.lesson.mediaType : 'audio';
              return (
                <LearningMediaRow
                  key={item.id}
                  title={content.title}
                  subtitle={subtitle}
                  durationMs={content.durationMs}
                  index={index}
                  mediaType={mediaType}
                  active={mediaType === 'audio' && currentItem?.id === content.id}
                  isArabic={isArabic}
                  onPress={() => openItem(item)}
                  trailing={owned ? (
                    <Pressable
                      accessibilityLabel="Remove from learning playlist"
                      disabled={Boolean(removingId)}
                      onPress={() => void removeItem(item)}
                      style={styles.remove}
                    >
                      <Text style={styles.removeText}>{removingId === item.id ? '…' : '×'}</Text>
                    </Pressable>
                  ) : null}
                />
              );
            })}
            {!playlist.items.length ? (
              <View style={styles.empty}>
                <Text style={[styles.emptyTitle, isArabic && styles.arabic]}>{isArabic ? 'القائمة فارغة' : 'This playlist is empty'}</Text>
                <Text style={[styles.emptyBody, isArabic && styles.arabic]}>
                  {owned
                    ? (isArabic ? 'أضف تسجيلات أو دروسًا من صفحات المحتوى.' : 'Add recordings or lessons from their content pages.')
                    : (isArabic ? 'لم تُضف عناصر إلى هذه القائمة بعد.' : 'No items have been added yet.')}
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      ) : null}
      <LearningMiniPlayer />
    </SafeAreaView>
  );
}

function visibilityLabel(value: 'private' | 'unlisted' | 'public', isArabic: boolean): string {
  if (isArabic) {
    if (value === 'public') return 'عامّة';
    if (value === 'unlisted') return 'غير مدرجة';
    return 'خاصّة';
  }
  if (value === 'public') return 'Public';
  if (value === 'unlisted') return 'Unlisted';
  return 'Private';
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  loader: { marginTop: SPACING.xl },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center', margin: SPACING.xl },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  hero: { alignItems: 'center', padding: SPACING.lg, borderRadius: 24, backgroundColor: COLORS.learningDeep, borderWidth: 1, borderColor: COLORS.learningLine },
  heroIcon: { width: 116, height: 116, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learningSoft, borderWidth: 1, borderColor: COLORS.learningLine },
  heroGlyph: { color: COLORS.learningBright, fontSize: 54, fontWeight: '800' },
  eyebrow: { color: COLORS.learning, fontFamily: TYPOGRAPHY.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginTop: SPACING.lg },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 29, fontWeight: '700', textAlign: 'center', marginTop: SPACING.sm },
  description: { maxWidth: 620, color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: SPACING.sm },
  itemCount: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: SPACING.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg },
  playAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.xl, borderRadius: RADII.pill, backgroundColor: COLORS.learning },
  playAllText: { color: COLORS.learningDeep, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.4 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.xl, marginBottom: SPACING.md },
  sectionTitle: { flex: 1, color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
  ownerBadge: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 9, fontWeight: '900', letterSpacing: 1, paddingVertical: 5, paddingHorizontal: 9, borderRadius: RADII.pill, backgroundColor: COLORS.learningSoft },
  mediaList: { overflow: 'hidden', borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  remove: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: 'rgba(214, 69, 69, 0.13)', borderWidth: 1, borderColor: 'rgba(214, 69, 69, 0.4)' },
  removeText: { color: COLORS.priest, fontSize: 22, lineHeight: 24, fontWeight: '700' },
  empty: { alignItems: 'center', padding: SPACING.xl },
  emptyTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyBody: { maxWidth: 460, color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: SPACING.sm },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
