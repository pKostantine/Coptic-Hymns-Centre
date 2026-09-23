import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import LearningArtwork from '@/components/learning/LearningArtwork';
import LearningBackHeader from '@/components/learning/LearningBackHeader';
import LearningDownloadButton from '@/components/learning/LearningDownloadButton';
import LearningMediaRow from '@/components/learning/LearningMediaRow';
import LearningMiniPlayer from '@/components/learning/LearningMiniPlayer';
import LearningPlaylistPicker from '@/components/learning/LearningPlaylistPicker';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { learningLessonSetAudioQueue, useLearningPlayer } from '@/context/LearningPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { learningService } from '@/services/learningService';
import {
  learningLessonDownloadRequest,
  learningLessonSetDownloadRequest,
} from '@/services/offlineDownloadRequests';
import type { LearningLessonSetDetail } from '@/types/learningPlatform';

export default function LearningLessonSetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const lessonSetId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [lessonSet, setLessonSet] = useState<LearningLessonSetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { currentItem, playQueue } = useLearningPlayer();
  const audioQueue = useMemo(() => lessonSet ? learningLessonSetAudioQueue(lessonSet) : [], [lessonSet]);
  const downloadRequest = useMemo(
    () => lessonSet ? learningLessonSetDownloadRequest(lessonSet, locale) : null,
    [lessonSet, locale],
  );

  useEffect(() => {
    if (!lessonSetId) return;
    let active = true;
    learningService.getLessonSet(lessonSetId, locale)
      .then((payload) => {
        if (!active) return;
        setError(null);
        setLessonSet(payload);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load lesson set.'); });
    return () => { active = false; };
  }, [lessonSetId, locale]);

  const openLesson = (lessonId: string, mediaType: 'audio' | 'video') => {
    if (!lessonSet) return;
    if (mediaType === 'video') {
      router.push({ pathname: '/learn/lesson/[id]', params: { id: lessonId, setId: lessonSet.id } });
      return;
    }
    const audioIndex = audioQueue.findIndex((item) => item.id === lessonId);
    if (audioIndex >= 0) playQueue(audioQueue, audioIndex);
  };

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{lessonSet ? lessonSet.title + ' — Learn & Study' : 'Lesson Set'}</title></Head>
      <LearningBackHeader title={isArabic ? 'مجموعة دروس' : 'Lesson Set'} isArabic={isArabic} />
      {!lessonSet && !error ? <ActivityIndicator color={COLORS.learning} style={styles.loader} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {lessonSet ? (
        <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <LearningArtwork asset={lessonSet.coverAsset} size={190} label={lessonSet.title} />
            <View style={styles.heroInfo}>
              <Text style={[styles.eyebrow, isArabic && styles.arabic]}>{isArabic ? 'منهج لحن' : 'HYMN COURSE'}</Text>
              <Text style={[styles.title, isArabic && styles.arabic]}>{lessonSet.title}</Text>
              <Pressable onPress={() => router.push({ pathname: '/learn/hymn/[id]', params: { id: lessonSet.hymn.id } })}>
                <Text style={[styles.hymn, isArabic && styles.arabic]}>{lessonSet.hymn.title}</Text>
              </Pressable>
              <Pressable onPress={() => router.push({ pathname: '/learn/cantor/[id]', params: { id: lessonSet.cantor.id } })}>
                <Text style={[styles.cantor, isArabic && styles.arabic]}>{lessonSet.cantor.displayName}</Text>
              </Pressable>
              {lessonSet.season ? (
                <Pressable onPress={() => router.push({ pathname: '/learn/season/[id]', params: { id: lessonSet.season!.id } })}>
                  <Text style={[styles.season, isArabic && styles.arabic]}>{lessonSet.season.title}</Text>
                </Pressable>
              ) : null}
              {lessonSet.description ? <Text style={[styles.description, isArabic && styles.arabic]}>{lessonSet.description}</Text> : null}
              <View style={styles.actions}>
                <Pressable disabled={!audioQueue.length} style={[styles.playAll, !audioQueue.length && styles.disabled]} onPress={() => audioQueue.length && playQueue(audioQueue, 0)}>
                  <Text style={styles.playAllText}>▶  {isArabic ? 'تشغيل الدروس الصوتية' : 'Play Audio Lessons'}</Text>
                </Pressable>
                {downloadRequest ? (
                  <LearningDownloadButton packageKey={downloadRequest.packageKey} request={downloadRequest} isArabic={isArabic} />
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.headingRow}>
            <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'الدروس' : 'Lessons'}</Text>
            <Text style={[styles.sectionMeta, isArabic && styles.arabic]}>
              {lessonSet.lessons.length + (isArabic ? ' درس' : lessonSet.lessons.length === 1 ? ' lesson' : ' lessons')}
            </Text>
          </View>
          <View style={styles.mediaList}>
            {lessonSet.lessons.map((lesson, index) => {
              const lessonDownload = learningLessonDownloadRequest(lessonSet, lesson, locale);
              return (
                <LearningMediaRow
                  key={lesson.id}
                  title={lesson.title}
                  subtitle={lesson.description}
                  durationMs={lesson.durationMs}
                  index={index}
                  mediaType={lesson.mediaType}
                  active={lesson.mediaType === 'audio' && currentItem?.id === lesson.id}
                  isArabic={isArabic}
                  onPress={() => openLesson(lesson.id, lesson.mediaType)}
                  trailing={(
                    <View style={styles.rowActions}>
                      <LearningDownloadButton
                        packageKey={lessonDownload.packageKey}
                        request={lessonDownload}
                        isArabic={isArabic}
                        compact
                        label=""
                      />
                      <LearningPlaylistPicker
                        itemKind="lesson"
                        itemId={lesson.id}
                        locale={locale}
                        isArabic={isArabic}
                      />
                    </View>
                  )}
                />
              );
            })}
            {!lessonSet.lessons.length ? <Text style={styles.empty}>{isArabic ? 'لا توجد دروس منشورة.' : 'No published lessons.'}</Text> : null}
          </View>
        </NowPlayingAwareScrollView>
      ) : null}
      <LearningMiniPlayer />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  loader: { marginTop: SPACING.xl },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center', margin: SPACING.xl },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  hero: { alignItems: 'center' },
  heroInfo: { width: '100%', maxWidth: 680, alignItems: 'center', marginTop: SPACING.lg },
  eyebrow: { color: COLORS.learning, fontFamily: TYPOGRAPHY.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 28, fontWeight: '700', textAlign: 'center', marginTop: SPACING.sm },
  hymn: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.title, fontSize: 18, fontWeight: '700', textAlign: 'center', marginTop: SPACING.sm },
  cantor: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: SPACING.xs },
  season: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: SPACING.xs },
  description: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: SPACING.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg },
  playAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.lg, borderRadius: RADII.pill, backgroundColor: COLORS.learning },
  playAllText: { color: COLORS.learningDeep, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  headingRow: { marginTop: SPACING.xl, marginBottom: SPACING.md },
  sectionTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
  sectionMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  mediaList: { overflow: 'hidden', borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  empty: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center', padding: SPACING.lg },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
