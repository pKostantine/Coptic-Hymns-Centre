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
import { learningAlbumQueue, useLearningPlayer } from '@/context/LearningPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { learningService } from '@/services/learningService';
import {
  learningAlbumDownloadRequest,
  learningRecordingDownloadRequest,
} from '@/services/offlineDownloadRequests';
import type { LearningAlbumDetail } from '@/types/learningPlatform';

export default function LearningAlbumScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const albumId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [album, setAlbum] = useState<LearningAlbumDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { currentItem, playQueue } = useLearningPlayer();
  const queue = useMemo(() => album ? learningAlbumQueue(album) : [], [album]);
  const downloadRequest = useMemo(() => album ? learningAlbumDownloadRequest(album, locale) : null, [album, locale]);

  useEffect(() => {
    if (!albumId) return;
    let active = true;
    learningService.getAlbum(albumId, locale)
      .then((payload) => {
        if (!active) return;
        setError(null);
        setAlbum(payload);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load learning album.'); });
    return () => { active = false; };
  }, [albumId, locale]);

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{album ? album.title + ' — Learn & Study' : 'Learning Album'}</title></Head>
      <LearningBackHeader title={isArabic ? 'ألبوم تعلّم' : 'Learning Album'} isArabic={isArabic} />
      {!album && !error ? <ActivityIndicator color={COLORS.learning} style={styles.loader} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {album ? (
        <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <LearningArtwork asset={album.coverAsset} size={210} label={album.title} />
            <View style={styles.heroInfo}>
              <Text style={[styles.eyebrow, isArabic && styles.arabic]}>{isArabic ? 'ألبوم تعلّم' : 'LEARNING ALBUM'}</Text>
              <Text style={[styles.title, isArabic && styles.arabic]}>{album.title}</Text>
              <Pressable onPress={() => router.push('/learn/cantor/' + album.cantor.id)}>
                <Text style={[styles.cantor, isArabic && styles.arabic]}>{album.cantor.displayName}</Text>
              </Pressable>
              {album.season ? (
                <Pressable onPress={() => router.push('/learn/season/' + album.season?.id)}>
                  <Text style={[styles.season, isArabic && styles.arabic]}>{album.season.title}</Text>
                </Pressable>
              ) : null}
              {album.description ? <Text style={[styles.description, isArabic && styles.arabic]}>{album.description}</Text> : null}
              <View style={styles.actions}>
                <Pressable disabled={!queue.length} style={[styles.playAll, !queue.length && styles.disabled]} onPress={() => queue.length && playQueue(queue, 0)}>
                  <Text style={styles.playAllText}>▶  {isArabic ? 'تشغيل الكل' : 'Play All'}</Text>
                </Pressable>
                {downloadRequest ? (
                  <LearningDownloadButton
                    packageKey={downloadRequest.packageKey}
                    request={downloadRequest}
                    isArabic={isArabic}
                  />
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.headingRow}>
            <View>
              <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'التسجيلات' : 'Recordings'}</Text>
              <Text style={[styles.sectionMeta, isArabic && styles.arabic]}>
                {album.recordings.length + (isArabic ? ' تسجيل' : album.recordings.length === 1 ? ' recording' : ' recordings')}
              </Text>
            </View>
          </View>
          <View style={styles.mediaList}>
            {album.recordings.map((recording, index) => {
              const recordingDownload = learningRecordingDownloadRequest(album, recording, locale);
              return (
                <LearningMediaRow
                  key={recording.id}
                  title={recording.title}
                  subtitle={recording.subtitle}
                  durationMs={recording.durationMs}
                  index={index}
                  active={currentItem?.id === recording.id}
                  isArabic={isArabic}
                  onPress={() => playQueue(queue, index)}
                  trailing={(
                    <View style={styles.rowActions}>
                      <LearningDownloadButton
                        packageKey={recordingDownload.packageKey}
                        request={recordingDownload}
                        isArabic={isArabic}
                        compact
                        label=""
                      />
                      <LearningPlaylistPicker
                        itemKind="album_recording"
                        itemId={recording.id}
                        locale={locale}
                        isArabic={isArabic}
                      />
                    </View>
                  )}
                />
              );
            })}
            {!album.recordings.length ? <Text style={styles.empty}>{isArabic ? 'لا توجد تسجيلات منشورة.' : 'No published recordings.'}</Text> : null}
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
  cantor: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '800', textAlign: 'center', marginTop: SPACING.sm },
  season: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: SPACING.xs },
  description: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: SPACING.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg },
  playAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.xl, borderRadius: RADII.pill, backgroundColor: COLORS.learning },
  playAllText: { color: COLORS.learningDeep, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  headingRow: { marginTop: SPACING.xl, marginBottom: SPACING.md },
  sectionTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
  sectionMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  mediaList: { overflow: 'hidden', borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  empty: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center', padding: SPACING.lg },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
