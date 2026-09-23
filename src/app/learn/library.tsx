import { useFocusEffect, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import Icon from '@/components/chc/ui/Icon';
import LearningArtwork from '@/components/learning/LearningArtwork';
import LearningMiniPlayer from '@/components/learning/LearningMiniPlayer';
import LearningSectionNav from '@/components/learning/LearningSectionNav';
import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { type LearningQueueItem, useLearningPlayer } from '@/context/LearningPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { learningService } from '@/services/learningService';
import type {
  LearningItemLibraryPayload,
  LearningLibraryItem,
  LearningPlaylistLibraryPayload,
  LearningProgressState,
} from '@/types/learningPlatform';

const EMPTY_LIBRARY: LearningItemLibraryPayload = { authenticated: false, likedItemIds: [], items: [] };
const EMPTY_PLAYLISTS: LearningPlaylistLibraryPayload = { authenticated: false, playlists: [] };

const STATE_ORDER: LearningProgressState[] = ['will_learn', 'learning', 'finished'];

function toQueueItem(item: LearningLibraryItem): LearningQueueItem {
  return {
    kind: item.itemKind === 'album_recording' ? 'recording' : 'lesson',
    id: item.itemId,
    title: item.title,
    subtitle: item.subtitle,
    durationMs: item.durationMs,
    mediaAsset: item.mediaAsset,
    containerId: item.containerId,
    containerTitle: item.containerTitle,
    cantorName: item.cantorName,
    coverAsset: item.coverAsset,
    hymnId: item.hymnId,
  };
}

function formatDuration(durationMs: number | null): string {
  if (!durationMs || durationMs < 0) return '';
  const totalSeconds = Math.round(durationMs / 1000);
  return Math.floor(totalSeconds / 60) + ':' + String(totalSeconds % 60).padStart(2, '0');
}

export default function LearningLibraryScreen() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const { currentItem, playQueue } = useLearningPlayer();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const [library, setLibrary] = useState(EMPTY_LIBRARY);
  const [playlistLibrary, setPlaylistLibrary] = useState(EMPTY_PLAYLISTS);
  const [activeState, setActiveState] = useState<LearningProgressState>('will_learn');
  const [playlistName, setPlaylistName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (active: { current: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const [nextLibrary, nextPlaylists] = await Promise.all([
        learningService.getItemLibrary(locale),
        learningService.getPlaylists(locale),
      ]);
      if (!active.current) return;
      setLibrary(nextLibrary);
      setPlaylistLibrary(nextPlaylists);
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : 'Unable to load My Learning.');
    } finally {
      if (active.current) setLoading(false);
    }
  }, [locale]);

  useFocusEffect(useCallback(() => {
    const active = { current: true };
    void load(active);
    return () => { active.current = false; };
  }, [load]));

  const stateItems = useMemo(
    () => library.items.filter((item) => item.state === activeState),
    [activeState, library.items],
  );
  const audioQueue = useMemo(
    () => stateItems.filter((item) => item.mediaType === 'audio').map(toQueueItem),
    [stateItems],
  );

  const labels: Record<LearningProgressState, { title: string; short: string; empty: string }> = isArabic
    ? {
        will_learn: { title: 'سأتعلم', short: 'سأتعلم', empty: 'أضف درساً أو تسجيلاً تريد تعلّمه.' },
        learning: { title: 'أتعلّم الآن', short: 'أتعلّم', empty: 'ابدأ عنصراً من قائمة «سأتعلم».' },
        finished: { title: 'أكملت التعلّم', short: 'أكملت', empty: 'ستظهر الدروس التي أكملتها هنا.' },
      }
    : {
        will_learn: { title: 'Will Learn', short: 'Will Learn', empty: 'Add a recording or lesson you want to learn.' },
        learning: { title: 'Learning', short: 'Learning', empty: 'Start an item from your Will Learn list.' },
        finished: { title: 'Finished Learning', short: 'Finished', empty: 'Completed lessons and recordings will appear here.' },
      };

  const openItem = (item: LearningLibraryItem) => {
    if (item.mediaType === 'video') {
      router.push({
        pathname: '/learn/lesson/[id]',
        params: { id: item.itemId, setId: item.containerId },
      });
      return;
    }
    const index = audioQueue.findIndex((entry) => entry.id === item.itemId);
    if (index >= 0) playQueue(audioQueue, index);
  };

  const moveItem = async (item: LearningLibraryItem, nextState: LearningProgressState) => {
    if (movingId || item.state === nextState) return;
    const previousItems = library.items;
    setMovingId(item.itemId);
    setError(null);
    setLibrary((current) => ({
      ...current,
      items: current.items.map((entry) => entry.itemId === item.itemId ? { ...entry, state: nextState } : entry),
    }));
    try {
      await learningService.setItemProgress(item.itemKind, item.itemId, nextState);
    } catch (cause) {
      setLibrary((current) => ({ ...current, items: previousItems }));
      const message = cause instanceof Error ? cause.message : 'Unable to update this learning item.';
      setError(message);
      Alert.alert(isArabic ? 'تعذّر تحديث القائمة' : 'Could not update list', message);
    } finally {
      setMovingId(null);
    }
  };

  const createPlaylist = async () => {
    const name = playlistName.trim();
    if (!name || creating) return;
    if (!playlistLibrary.authenticated) {
      Alert.alert(
        isArabic ? 'تسجيل الدخول مطلوب' : 'Sign in required',
        isArabic ? 'سجّل الدخول لإنشاء قوائم تعلّم مخصّصة.' : 'Sign in to create custom learning playlists.',
      );
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await learningService.createPlaylist(name);
      setPlaylistLibrary((current) => ({ ...current, playlists: [created, ...current.playlists] }));
      setPlaylistName('');
      Keyboard.dismiss();
      router.push({ pathname: '/learn/playlist/[id]', params: { id: created.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create playlist.');
    } finally {
      setCreating(false);
    }
  };

  const authenticated = library.authenticated || playlistLibrary.authenticated;

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{isArabic ? 'تعلّمي - مركز الألحان القبطية' : 'My Learning - Coptic Hymns Centre'}</title></Head>
      <AppHeader title={{ english: 'Learn & Study', arabic: 'التعلّم والدراسة' }} />
      <LearningSectionNav active="library" />
      <NowPlayingAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text style={[styles.pageTitle, isArabic && styles.arabic]}>{isArabic ? 'تعلّمي' : 'My Learning'}</Text>
            <Text style={[styles.pageBody, isArabic && styles.arabic]}>
              {isArabic ? 'نظّم ما ستتعلّمه، وما تدرسه الآن، وما أكملته.' : 'Move each recording or lesson forward as you learn it.'}
            </Text>
          </View>
          {audioQueue.length ? (
            <Pressable accessibilityLabel="Play this list" style={styles.playListButton} onPress={() => playQueue(audioQueue, 0)}>
              <Icon name="play" size={18} color={COLORS.learningDeep} />
            </Pressable>
          ) : null}
        </View>

        {loading ? <ActivityIndicator color={COLORS.learning} style={styles.loader} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && !authenticated ? (
          <View style={styles.authCard}>
            <Icon name="person-circle-outline" size={32} color={COLORS.learningBright} />
            <View style={styles.authCopy}>
              <Text style={[styles.authTitle, isArabic && styles.arabic]}>{isArabic ? 'احفظ تعلّمك على كل أجهزتك' : 'Keep your learning across devices'}</Text>
              <Text style={[styles.authBody, isArabic && styles.arabic]}>
                {isArabic ? 'المحتوى متاح للجميع. سجّل الدخول لحفظ القوائم والتقدّم.' : 'All lessons remain available. Sign in to save progress and playlists.'}
              </Text>
            </View>
            <Pressable accessibilityLabel="Open account" style={styles.authButton} onPress={() => router.push('/account')}>
              <Icon name="chevron-forward" size={18} color={COLORS.learningDeep} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.defaultPlaylists}>
          {STATE_ORDER.map((state) => {
            const count = library.items.filter((item) => item.state === state).length;
            const active = state === activeState;
            return (
              <Pressable
                key={state}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setActiveState(state)}
                style={[styles.defaultPlaylist, active && styles.defaultPlaylistActive]}
              >
                <View style={[styles.stateIcon, active && styles.stateIconActive]}>
                  <Icon
                    name={state === 'will_learn' ? 'bookmark-outline' : state === 'learning' ? 'school-outline' : 'checkmark'}
                    size={22}
                    color={active ? COLORS.learningBright : COLORS.muted}
                  />
                </View>
                <Text style={[styles.stateCount, active && styles.stateCountActive]}>{count}</Text>
                <Text numberOfLines={2} style={[styles.stateLabel, isArabic && styles.arabic, active && styles.stateLabelActive]}>
                  {labels[state].short}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.listHeader}>
          <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{labels[activeState].title}</Text>
          <Text style={styles.itemCount}>{stateItems.length}</Text>
        </View>
        <View style={styles.itemList}>
          {stateItems.map((item) => {
            const stateIndex = STATE_ORDER.indexOf(item.state);
            const busy = movingId === item.itemId;
            return (
              <View key={item.itemKind + ':' + item.itemId} style={styles.itemRow}>
                <Pressable style={styles.itemMain} onPress={() => openItem(item)}>
                  <LearningArtwork asset={item.coverAsset} size={54} radius={7} label={item.containerTitle} />
                  <View style={styles.itemCopy}>
                    <Text numberOfLines={1} style={[styles.itemTitle, isArabic && styles.arabic]}>{item.title}</Text>
                    <Text numberOfLines={1} style={[styles.itemMeta, isArabic && styles.arabic]}>{item.cantorName}</Text>
                    <Text numberOfLines={1} style={[styles.itemContext, isArabic && styles.arabic]}>
                      {item.containerTitle}{formatDuration(item.durationMs) ? '  ·  ' + formatDuration(item.durationMs) : ''}
                    </Text>
                  </View>
                  <Icon name={item.mediaType === 'video' ? 'eye-outline' : currentItem?.id === item.itemId ? 'pause' : 'play'} size={19} color={COLORS.learningBright} />
                </Pressable>
                <View style={styles.moveActions}>
                  {stateIndex > 0 ? (
                    <Pressable
                      accessibilityLabel={stateIndex === 2 ? 'Move back to Learning' : 'Move back to Will Learn'}
                      disabled={busy}
                      onPress={() => void moveItem(item, STATE_ORDER[stateIndex - 1])}
                      style={styles.moveButton}
                    >
                      <Icon name="chevron-back" size={16} color={COLORS.muted} />
                      <Text style={styles.moveText}>{stateIndex === 2 ? (isArabic ? 'أعد التعلّم' : 'Revisit') : (isArabic ? 'لاحقاً' : 'Later')}</Text>
                    </Pressable>
                  ) : null}
                  {stateIndex < STATE_ORDER.length - 1 ? (
                    <Pressable
                      accessibilityLabel={stateIndex === 0 ? 'Start learning' : 'Finish learning'}
                      disabled={busy}
                      onPress={() => void moveItem(item, STATE_ORDER[stateIndex + 1])}
                      style={[styles.moveButton, styles.moveButtonPrimary]}
                    >
                      <Text style={[styles.moveText, styles.moveTextPrimary]}>{stateIndex === 0 ? (isArabic ? 'ابدأ' : 'Start') : (isArabic ? 'أكملت' : 'Finish')}</Text>
                      <Icon name={stateIndex === 1 ? 'checkmark' : 'chevron-forward'} size={16} color={COLORS.learningDeep} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
          {!loading && !stateItems.length ? (
            <View style={styles.emptyState}>
              <Icon name="school-outline" size={32} color={COLORS.learning} />
              <Text style={[styles.emptyTitle, isArabic && styles.arabic]}>{labels[activeState].empty}</Text>
              {!authenticated ? (
                <Pressable onPress={() => router.push('/account')}>
                  <Text style={styles.emptyAction}>{isArabic ? 'تسجيل الدخول' : 'Sign in'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.customHeader}>
          <View style={styles.customTitleRow}>
            <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'قوائم مخصّصة' : 'Custom Playlists'}</Text>
            <Text style={styles.itemCount}>{playlistLibrary.playlists.length}</Text>
          </View>
          <Text style={[styles.sectionBody, isArabic && styles.arabic]}>
            {isArabic ? 'اجمع الدروس والتسجيلات في قوائمك الخاصة.' : 'Group any lessons and recordings your way.'}
          </Text>
        </View>
        <View style={styles.createRow}>
          <TextInput
            editable={!creating}
            onChangeText={setPlaylistName}
            onSubmitEditing={() => void createPlaylist()}
            placeholder={isArabic ? 'اسم قائمة جديدة' : 'New playlist name'}
            placeholderTextColor={COLORS.muted}
            returnKeyType="done"
            style={[styles.createInput, isArabic && styles.arabic]}
            value={playlistName}
          />
          <Pressable
            accessibilityLabel="Create playlist"
            disabled={!playlistName.trim() || creating}
            onPress={() => void createPlaylist()}
            style={[styles.createButton, (!playlistName.trim() || creating) && styles.disabled]}
          >
            {creating ? <ActivityIndicator color={COLORS.learningDeep} /> : <Icon name="add" size={22} color={COLORS.learningDeep} />}
          </Pressable>
        </View>
        <View style={styles.playlistList}>
          {playlistLibrary.playlists.map((playlist) => (
            <Pressable
              key={playlist.id}
              style={styles.playlistRow}
              onPress={() => router.push({ pathname: '/learn/playlist/[id]', params: { id: playlist.id } })}
            >
              <View style={styles.playlistIcon}><Icon name="list-outline" size={24} color={COLORS.learningBright} /></View>
              <View style={styles.playlistCopy}>
                <Text numberOfLines={1} style={[styles.playlistName, isArabic && styles.arabic]}>{playlist.name}</Text>
                <Text style={[styles.playlistMeta, isArabic && styles.arabic]}>
                  {playlist.itemCount + (playlist.itemCount === 1 ? ' item' : ' items') + '  ·  ' + playlist.visibility}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={COLORS.learning} />
            </Pressable>
          ))}
        </View>
      </NowPlayingAwareScrollView>
      <LearningMiniPlayer />
      <BottomTabBar active="learn" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  titleCopy: { flex: 1, minWidth: 0 },
  pageTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 28, fontWeight: '700' },
  pageBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19, marginTop: 4 },
  playListButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learning },
  loader: { marginVertical: SPACING.lg },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, fontSize: 12, textAlign: 'center', marginBottom: SPACING.md },
  authCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, borderRadius: RADII.md, backgroundColor: COLORS.learningDeep, borderWidth: 1, borderColor: COLORS.learningLine },
  authCopy: { flex: 1, minWidth: 0 },
  authTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  authBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, lineHeight: 16, marginTop: 3 },
  authButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learning },
  defaultPlaylists: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  defaultPlaylist: { flex: 1, minHeight: 118, padding: SPACING.sm, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  defaultPlaylistActive: { backgroundColor: COLORS.learningDeep, borderColor: COLORS.learning },
  stateIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceSoft },
  stateIconActive: { backgroundColor: COLORS.learningSoft },
  stateCount: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 24, fontWeight: '700', marginTop: SPACING.sm },
  stateCountActive: { color: COLORS.learningBright },
  stateLabel: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', lineHeight: 15, marginTop: 2 },
  stateLabelActive: { color: COLORS.white },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xl, marginBottom: SPACING.sm },
  sectionTitle: { flex: 1, color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
  itemCount: { minWidth: 28, color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '900', textAlign: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: RADII.pill, backgroundColor: COLORS.learningSoft },
  itemList: { overflow: 'hidden', borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  itemRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  itemMain: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.sm },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  itemMeta: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '700', marginTop: 3 },
  itemContext: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 10, marginTop: 2 },
  moveActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm, paddingHorizontal: SPACING.sm, paddingBottom: SPACING.sm },
  moveButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center', paddingHorizontal: SPACING.sm, borderRadius: RADII.pill, backgroundColor: COLORS.surfaceSoft, borderWidth: 1, borderColor: COLORS.border },
  moveButtonPrimary: { backgroundColor: COLORS.learning, borderColor: COLORS.learning },
  moveText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 10, fontWeight: '800' },
  moveTextPrimary: { color: COLORS.learningDeep },
  emptyState: { alignItems: 'center', padding: SPACING.xl },
  emptyTitle: { maxWidth: 360, color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: SPACING.sm },
  emptyAction: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '900', marginTop: SPACING.md },
  customHeader: { marginTop: SPACING.xl },
  customTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  sectionBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  createRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  createInput: { flex: 1, minHeight: 46, color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, paddingHorizontal: SPACING.md, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  createButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learning },
  disabled: { opacity: 0.42 },
  playlistList: { gap: SPACING.sm, marginTop: SPACING.md },
  playlistRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.sm, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  playlistIcon: { width: 44, height: 44, borderRadius: RADII.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learningDeep },
  playlistCopy: { flex: 1, minWidth: 0 },
  playlistName: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  playlistMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 10, marginTop: 4, textTransform: 'capitalize' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
