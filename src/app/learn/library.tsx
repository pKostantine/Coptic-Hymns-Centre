import { useFocusEffect, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import LearningBackHeader from '@/components/learning/LearningBackHeader';
import LearningMiniPlayer from '@/components/learning/LearningMiniPlayer';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { learningService } from '@/services/learningService';
import type {
  LearningPlaylistLibraryPayload,
  LearningProgressPayload,
  LearningProgressState,
} from '@/types/learningPlatform';

const EMPTY_PROGRESS: LearningProgressPayload = { authenticated: false, items: [] };
const EMPTY_PLAYLISTS: LearningPlaylistLibraryPayload = { authenticated: false, playlists: [] };

export default function LearningLibraryScreen() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const [progress, setProgress] = useState<LearningProgressPayload>(EMPTY_PROGRESS);
  const [playlistLibrary, setPlaylistLibrary] = useState<LearningPlaylistLibraryPayload>(EMPTY_PLAYLISTS);
  const [activeState, setActiveState] = useState<LearningProgressState>('learning');
  const [playlistName, setPlaylistName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (active: { current: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const [nextProgress, nextPlaylists] = await Promise.all([
        learningService.getProgress(locale),
        learningService.getPlaylists(locale),
      ]);
      if (!active.current) return;
      setProgress(nextProgress);
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
      router.push('/learn/playlist/' + created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create playlist.');
    } finally {
      setCreating(false);
    }
  };

  const authenticated = progress.authenticated || playlistLibrary.authenticated;
  const filteredProgress = progress.items.filter((item) => item.state === activeState);
  const progressOptions: { id: LearningProgressState; label: string; shortLabel: string }[] = [
    { id: 'will_learn', label: isArabic ? 'سأتعلّم' : 'Will Learn', shortLabel: isArabic ? 'سأتعلّم' : 'Will' },
    { id: 'learning', label: isArabic ? 'أتعلّم الآن' : 'Currently Learning', shortLabel: isArabic ? 'الآن' : 'Learning' },
    { id: 'finished', label: isArabic ? 'أكملت التعلّم' : 'Finished Learning', shortLabel: isArabic ? 'أكملت' : 'Finished' },
  ];
  const activeLabel = progressOptions.find((option) => option.id === activeState)?.label ?? '';

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{isArabic ? 'تعلّمي — كوبتك هيمنز سنتر' : 'My Learning — Coptic Hymns Centre'}</title></Head>
      <LearningBackHeader title={isArabic ? 'تعلّمي' : 'My Learning'} isArabic={isArabic} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={[styles.eyebrow, isArabic && styles.arabic]}>CHC LEARN & STUDY</Text>
          <Text style={[styles.heroTitle, isArabic && styles.arabic]}>{isArabic ? 'مسار تعلّمك' : 'Your learning path'}</Text>
          <Text style={[styles.heroBody, isArabic && styles.arabic]}>
            {isArabic
              ? 'تابع الألحان التي تريد تعلّمها، وما تدرسه الآن، وما أكملته.'
              : 'Keep the hymns you want to learn, what you are studying now, and what you have finished in one place.'}
          </Text>
        </View>

        {loading ? <ActivityIndicator color={COLORS.learning} style={styles.loader} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && !authenticated ? (
          <View style={styles.authCard}>
            <View style={styles.authIcon}><Text style={styles.authGlyph}>✓</Text></View>
            <View style={styles.authInfo}>
              <Text style={[styles.authTitle, isArabic && styles.arabic]}>{isArabic ? 'سجّل الدخول لحفظ تقدّمك' : 'Sign in to save your progress'}</Text>
              <Text style={[styles.authBody, isArabic && styles.arabic]}>
                {isArabic
                  ? 'المحتوى متاح للجميع. يحتاج تتبّع التعلّم والقوائم المخصّصة إلى حساب CHC.'
                  : 'The catalog stays open to everyone. Progress tracking and custom playlists use your CHC account.'}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'تقدّم الألحان' : 'Hymn Progress'}</Text>
          <Text style={styles.sectionMeta}>{progress.items.length}</Text>
        </View>
        <View style={styles.segments}>
          {progressOptions.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => setActiveState(option.id)}
              style={[styles.segment, activeState === option.id && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, isArabic && styles.arabic, activeState === option.id && styles.segmentTextActive]}>{option.shortLabel}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.progressList}>
          {filteredProgress.map((item, index) => (
            <Pressable key={item.hymnId} style={styles.progressRow} onPress={() => router.push('/learn/hymn/' + item.hymnId)}>
              <View style={styles.progressNumber}><Text style={styles.progressNumberText}>{index + 1}</Text></View>
              <View style={styles.progressInfo}>
                <Text numberOfLines={1} style={[styles.progressTitle, isArabic && styles.arabic]}>{item.title}</Text>
                <Text numberOfLines={1} style={[styles.progressSubtitle, isArabic && styles.arabic]}>{item.subtitle || activeLabel}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
          {!loading && !filteredProgress.length ? (
            <Text style={[styles.empty, isArabic && styles.arabic]}>
              {authenticated
                ? (isArabic ? `لا توجد ألحان في «${activeLabel}» بعد.` : `No hymns in “${activeLabel}” yet.`)
                : (isArabic ? 'سيظهر تقدّمك هنا بعد تسجيل الدخول.' : 'Your saved progress will appear here after sign-in.')}
            </Text>
          ) : null}
        </View>

        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'قوائم التعلّم' : 'Learning Playlists'}</Text>
          <Text style={styles.sectionMeta}>{playlistLibrary.playlists.length}</Text>
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
            disabled={!playlistName.trim() || creating}
            onPress={() => void createPlaylist()}
            style={[styles.createButton, (!playlistName.trim() || creating) && styles.disabled]}
          >
            <Text style={styles.createButtonText}>{creating ? '…' : '+'}</Text>
          </Pressable>
        </View>
        <View style={styles.playlistList}>
          {playlistLibrary.playlists.map((playlist) => (
            <Pressable key={playlist.id} style={styles.playlistRow} onPress={() => router.push('/learn/playlist/' + playlist.id)}>
              <View style={styles.playlistIcon}><Text style={styles.playlistGlyph}>≡</Text></View>
              <View style={styles.playlistInfo}>
                <Text numberOfLines={1} style={[styles.playlistName, isArabic && styles.arabic]}>{playlist.name}</Text>
                <Text numberOfLines={1} style={[styles.playlistMeta, isArabic && styles.arabic]}>
                  {isArabic ? `${playlist.itemCount} عنصر · ${visibilityLabel(playlist.visibility, true)}` : `${playlist.itemCount} ${playlist.itemCount === 1 ? 'item' : 'items'} · ${visibilityLabel(playlist.visibility, false)}`}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
          {!loading && !playlistLibrary.playlists.length ? (
            <Text style={[styles.empty, isArabic && styles.arabic]}>
              {authenticated
                ? (isArabic ? 'أنشئ أول قائمة لتجميع تسجيلاتك ودروسك.' : 'Create your first playlist to collect recordings and lessons.')
                : (isArabic ? 'سجّل الدخول لإنشاء قوائم مخصّصة.' : 'Sign in to create custom learning playlists.')}
            </Text>
          ) : null}
        </View>
      </ScrollView>
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
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  hero: { padding: SPACING.lg, borderRadius: RADII.lg, backgroundColor: COLORS.learningDeep, borderWidth: 1, borderColor: COLORS.learningLine },
  eyebrow: { color: COLORS.learning, fontFamily: TYPOGRAPHY.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  heroTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 26, fontWeight: '700', marginTop: SPACING.sm },
  heroBody: { maxWidth: 620, color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 20, marginTop: SPACING.sm },
  loader: { marginVertical: SPACING.lg },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center', marginVertical: SPACING.md },
  authCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.md, padding: SPACING.md, borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.learningLine },
  authIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learningSoft },
  authGlyph: { color: COLORS.learningBright, fontSize: 22, fontWeight: '900' },
  authInfo: { flex: 1, minWidth: 0 },
  authTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 16, fontWeight: '700' },
  authBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, lineHeight: 18, marginTop: 4 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xl, marginBottom: SPACING.sm },
  sectionTitle: { flex: 1, color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
  sectionMeta: { minWidth: 28, color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '900', textAlign: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: RADII.pill, backgroundColor: COLORS.learningSoft },
  segments: { flexDirection: 'row', gap: SPACING.xs, padding: 4, borderRadius: RADII.md, backgroundColor: COLORS.surface },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xs, borderRadius: 12 },
  segmentActive: { backgroundColor: COLORS.learningSoft, borderWidth: 1, borderColor: COLORS.learningLine },
  segmentText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  segmentTextActive: { color: COLORS.learningBright },
  progressList: { marginTop: SPACING.sm, overflow: 'hidden', borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  progressRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  progressNumber: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learningDeep },
  progressNumberText: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '900' },
  progressInfo: { flex: 1, minWidth: 0 },
  progressTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  progressSubtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 3 },
  chevron: { color: COLORS.learning, fontSize: 27 },
  empty: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, lineHeight: 18, textAlign: 'center', padding: SPACING.lg },
  createRow: { flexDirection: 'row', gap: SPACING.sm },
  createInput: { flex: 1, minHeight: 48, color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, paddingHorizontal: SPACING.md, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  createButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: COLORS.learning },
  createButtonText: { color: COLORS.learningDeep, fontSize: 26, lineHeight: 28, fontWeight: '900' },
  disabled: { opacity: 0.4 },
  playlistList: { gap: SPACING.sm, marginTop: SPACING.sm },
  playlistRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.sm, borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  playlistIcon: { width: 52, height: 52, borderRadius: RADII.md, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learningDeep, borderWidth: 1, borderColor: COLORS.learningLine },
  playlistGlyph: { color: COLORS.learningBright, fontSize: 25, fontWeight: '800' },
  playlistInfo: { flex: 1, minWidth: 0 },
  playlistName: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '800' },
  playlistMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 4 },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
