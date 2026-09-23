import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import LearningBackHeader from '@/components/learning/LearningBackHeader';
import LearningDownloadButton from '@/components/learning/LearningDownloadButton';
import LearningMiniPlayer from '@/components/learning/LearningMiniPlayer';
import LearningPlaylistPicker from '@/components/learning/LearningPlaylistPicker';
import LearningVideoPlayer, { type LearningVideoPlayerHandle } from '@/components/learning/LearningVideoPlayer';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { learningLessonSetAudioQueue, useLearningPlayer } from '@/context/LearningPlayerContext';
import { usePlayback } from '@/context/PlaybackContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { downloadManager } from '@/services/downloadManager';
import { learningService, type LearningLessonDetailPayload } from '@/services/learningService';
import { learningLessonDownloadRequest } from '@/services/offlineDownloadRequests';
import { goBack } from '@/utils/navigation';

export default function LearningLessonScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; setId: string }>();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const lessonId = Array.isArray(params.id) ? params.id[0] : params.id;
  const lessonSetId = Array.isArray(params.setId) ? params.setId[0] : params.setId;
  const [data, setData] = useState<LearningLessonDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoMode, setVideoMode] = useState<'video' | 'audio'>('video');
  const [videoHandle, setVideoHandle] = useState<LearningVideoPlayerHandle | null>(null);
  const { playQueue, currentItem, playing } = useLearningPlayer();
  const globalPlayback = usePlayback();
  const audioQueue = useMemo(() => data ? learningLessonSetAudioQueue(data.lessonSet) : [], [data]);
  const linkIncomplete = !lessonId || !lessonSetId;
  const downloadRequest = useMemo(
    () => data ? learningLessonDownloadRequest(data.lessonSet, data.lesson, locale) : null,
    [data, locale],
  );

  useEffect(() => {
    if (!lessonId || !lessonSetId) return;
    let active = true;
    learningService.getLesson(lessonSetId, lessonId, locale)
      .then((payload) => {
        if (!active) return;
        setError(null);
        setData(payload);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load lesson.'); });
    return () => { active = false; };
  }, [lessonId, lessonSetId, locale]);

  useEffect(() => {
    if (data?.lesson.mediaType === 'video' && globalPlayback.playing) {
      globalPlayback.togglePlayback();
    }
  }, [data?.lesson.id, data?.lesson.mediaType, globalPlayback]);

  useEffect(() => {
    if (!data || data.lesson.mediaType !== 'video') {
      setVideoUri(null);
      return;
    }
    let active = true;
    const remoteUri = learningService.resolveAsset(data.lesson.mediaAsset);
    void downloadManager.resolvePlaybackUri('learning_video_audio', data.lesson.id, remoteUri)
      .then((uri) => { if (active) setVideoUri(uri); });
    return () => { active = false; };
  }, [data]);

  const playAudio = () => {
    if (!data) return;
    const index = audioQueue.findIndex((item) => item.id === data.lesson.id);
    if (index >= 0) playQueue(audioQueue, index);
  };

  const leaveLesson = async () => {
    if (Platform.OS !== 'web' && data?.lesson.mediaType === 'video' && videoMode === 'video' && videoHandle) {
      try {
        await videoHandle.enterPictureInPicture();
      } catch {
        // PiP can be disabled by the device or unavailable in Expo Go.
      }
    }
    goBack(router, '/learn');
  };

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{data ? data.lesson.title + ' — Learn & Study' : 'Lesson — Learn & Study'}</title></Head>
      <LearningBackHeader title={isArabic ? 'الدرس' : 'Lesson'} isArabic={isArabic} onBack={() => void leaveLesson()} />
      {!data && !error && !linkIncomplete ? <ActivityIndicator color={COLORS.learning} style={styles.loader} /> : null}
      {linkIncomplete || error ? <Text style={styles.error}>{linkIncomplete ? 'This lesson link is incomplete.' : error}</Text> : null}
      {data ? (
        <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {data.lesson.mediaType === 'video' ? (
            <View style={styles.videoSection}>
              <View style={styles.modeSwitch}>
                <Pressable onPress={() => setVideoMode('video')} style={[styles.modeButton, videoMode === 'video' && styles.modeButtonActive]}>
                  <Text style={[styles.modeText, videoMode === 'video' && styles.modeTextActive]}>{isArabic ? 'فيديو' : 'Video'}</Text>
                </Pressable>
                <Pressable
                  disabled={!data.lesson.audioAsset}
                  onPress={() => {
                    setVideoMode('audio');
                    playAudio();
                  }}
                  style={[styles.modeButton, videoMode === 'audio' && styles.modeButtonActive, !data.lesson.audioAsset && styles.disabled]}
                >
                  <Text style={[styles.modeText, videoMode === 'audio' && styles.modeTextActive]}>{isArabic ? 'صوت فقط' : 'Audio only'}</Text>
                </Pressable>
              </View>
              {videoMode === 'video' ? (
                <LearningVideoPlayer uri={videoUri} onHandle={setVideoHandle} />
              ) : (
                <View style={styles.audioHero}>
                  <View style={styles.audioIcon}><Text style={styles.audioGlyph}>♪</Text></View>
                  <Pressable style={styles.audioButton} onPress={playAudio}>
                    <Text style={styles.audioButtonText}>{currentItem?.id === data.lesson.id && playing ? 'Now Playing' : 'Play audio-only lesson'}</Text>
                  </Pressable>
                  <Text style={styles.dataNote}>Uses the smaller audio rendition instead of streaming video.</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.audioHero}>
              <View style={styles.audioIcon}><Text style={styles.audioGlyph}>♪</Text></View>
              <Pressable style={styles.audioButton} onPress={playAudio}>
                <Text style={styles.audioButtonText}>
                  {currentItem?.id === data.lesson.id && playing
                    ? (isArabic ? 'قيد التشغيل' : 'Now Playing')
                    : (isArabic ? 'تشغيل الدرس' : 'Play Lesson')}
                </Text>
              </Pressable>
            </View>
          )}

          <View style={styles.meta}>
            <Text style={[styles.type, isArabic && styles.arabic]}>
              {data.lesson.mediaType === 'video'
                ? (isArabic ? 'درس فيديو' : 'VIDEO LESSON')
                : (isArabic ? 'درس صوتي' : 'AUDIO LESSON')}
            </Text>
            <Text style={[styles.title, isArabic && styles.arabic]}>{data.lesson.title}</Text>
            <Pressable onPress={() => router.push('/learn/lesson-set/' + data.lessonSet.id)}>
              <Text style={[styles.setTitle, isArabic && styles.arabic]}>{data.lessonSet.title}</Text>
            </Pressable>
            <Text style={[styles.cantor, isArabic && styles.arabic]}>{data.lessonSet.cantor.displayName}</Text>
            {data.lesson.description ? <Text style={[styles.description, isArabic && styles.arabic]}>{data.lesson.description}</Text> : null}
            {downloadRequest ? (
              <View style={styles.downloadWrap}>
                <LearningDownloadButton packageKey={downloadRequest.packageKey} request={downloadRequest} isArabic={isArabic} />
              </View>
            ) : null}
            <View style={styles.libraryAction}>
              <LearningPlaylistPicker itemKind="lesson" itemId={data.lesson.id} locale={locale} isArabic={isArabic} />
            </View>
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
  videoSection: { width: '100%', gap: SPACING.sm },
  modeSwitch: { alignSelf: 'center', flexDirection: 'row', padding: 3, borderRadius: RADII.pill, borderWidth: 1, borderColor: COLORS.learningLine, backgroundColor: COLORS.surface },
  modeButton: { minHeight: 38, minWidth: 104, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.md, borderRadius: RADII.pill },
  modeButtonActive: { backgroundColor: COLORS.learning },
  modeText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800' },
  modeTextActive: { color: COLORS.learningDeep },
  disabled: { opacity: 0.4 },
  audioHero: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.learningDeep,
    borderWidth: 1,
    borderColor: COLORS.learningLine,
  },
  audioIcon: { width: 86, height: 86, borderRadius: 43, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learningSoft },
  audioGlyph: { color: COLORS.learningBright, fontSize: 42, fontWeight: '700' },
  audioButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.xl, borderRadius: RADII.pill, backgroundColor: COLORS.learning },
  audioButtonText: { color: COLORS.learningDeep, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '900' },
  dataNote: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, textAlign: 'center', paddingHorizontal: SPACING.lg },
  meta: { alignItems: 'center', maxWidth: 720, width: '100%', alignSelf: 'center', marginTop: SPACING.lg },
  type: { color: COLORS.learning, fontFamily: TYPOGRAPHY.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 27, fontWeight: '700', textAlign: 'center', marginTop: SPACING.sm },
  setTitle: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800', textAlign: 'center', marginTop: SPACING.sm },
  cantor: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, textAlign: 'center', marginTop: 4 },
  description: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: SPACING.md },
  downloadWrap: { marginTop: SPACING.lg },
  libraryAction: { marginTop: SPACING.md },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
