import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import LearningArtwork from '@/components/learning/LearningArtwork';
import LearningBackHeader from '@/components/learning/LearningBackHeader';
import LearningDownloadButton from '@/components/learning/LearningDownloadButton';
import LearningPlaylistPicker from '@/components/learning/LearningPlaylistPicker';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useLearningPlayer } from '@/context/LearningPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';

function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

export default function LearningNowPlayingScreen() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const {
    currentItem,
    queue,
    currentIndex,
    playing,
    buffering,
    currentTimeMs,
    durationMs,
    repeatMode,
    playbackError,
    togglePlayback,
    next,
    previous,
    seekToMs,
    selectQueueIndex,
    cycleRepeatMode,
  } = useLearningPlayer();
  const [showQueue, setShowQueue] = useState(false);

  if (!currentItem) {
    return (
      <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
        <Head><title>{isArabic ? 'المشغّل — تعلّم وادرس' : 'Player — Learn & Study'}</title></Head>
        <LearningBackHeader title={isArabic ? 'المشغّل' : 'Now Playing'} isArabic={isArabic} />
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Text style={styles.emptyGlyph}>♪</Text></View>
          <Text style={[styles.emptyTitle, isArabic && styles.arabic]}>{isArabic ? 'لا يوجد محتوى قيد التشغيل' : 'Nothing is playing'}</Text>
          <Text style={[styles.emptyBody, isArabic && styles.arabic]}>{isArabic ? 'اختر تسجيلًا أو درسًا صوتيًا للبدء.' : 'Choose a recording or audio lesson to begin.'}</Text>
          <Pressable style={styles.browseButton} onPress={() => router.replace('/learn')}>
            <Text style={styles.browseButtonText}>{isArabic ? 'استكشف التعلّم' : 'Browse Learn & Study'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const progress = durationMs > 0 ? Math.max(0, Math.min(1, currentTimeMs / durationMs)) : 0;
  const openCollection = () => {
    router.push(currentItem.kind === 'recording'
      ? '/learn/album/' + currentItem.containerId
      : '/learn/lesson-set/' + currentItem.containerId);
  };
  const repeatLabel = repeatMode === 'off'
    ? (isArabic ? 'التكرار متوقف' : 'Repeat Off')
    : repeatMode === 'all'
      ? (isArabic ? 'تكرار القائمة' : 'Repeat Queue')
      : (isArabic ? 'تكرار المقطع' : 'Repeat One');

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{currentItem.title + ' — Learn & Study'}</title></Head>
      <LearningBackHeader title={isArabic ? 'المشغّل' : 'Now Playing'} isArabic={isArabic} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.player}>
          <LearningArtwork asset={currentItem.coverAsset} label={currentItem.containerTitle} size={270} />
          <Text style={[styles.kind, isArabic && styles.arabic]}>
            {currentItem.kind === 'recording'
              ? (isArabic ? 'تسجيل تعلّم' : 'LEARNING RECORDING')
              : (isArabic ? 'درس صوتي' : 'AUDIO LESSON')}
          </Text>
          <Text numberOfLines={2} style={[styles.title, isArabic && styles.arabic]}>{currentItem.title}</Text>
          <Text numberOfLines={1} style={[styles.cantor, isArabic && styles.arabic]}>{currentItem.cantorName}</Text>
          <Pressable onPress={openCollection}>
            <Text numberOfLines={1} style={[styles.collection, isArabic && styles.arabic]}>{currentItem.containerTitle}</Text>
          </Pressable>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.time}>{formatTime(currentTimeMs)}</Text>
            <Text style={styles.time}>{formatTime(durationMs)}</Text>
          </View>

          <View style={styles.controls}>
            <Pressable accessibilityLabel="Seek back 15 seconds" onPress={() => void seekToMs(currentTimeMs - 15000)} style={styles.seekControl}>
              <Text style={styles.seekText}>−15</Text>
            </Pressable>
            <Pressable accessibilityLabel="Previous" onPress={previous} style={styles.sideControl}>
              <Text style={styles.sideText}>|◀</Text>
            </Pressable>
            <Pressable accessibilityLabel={playing ? 'Pause' : 'Play'} onPress={togglePlayback} style={styles.playButton}>
              <Text style={styles.playText}>{buffering ? '…' : playing ? 'Ⅱ' : '▶'}</Text>
            </Pressable>
            <Pressable accessibilityLabel="Next" onPress={next} style={styles.sideControl}>
              <Text style={styles.sideText}>▶|</Text>
            </Pressable>
            <Pressable accessibilityLabel="Seek forward 15 seconds" onPress={() => void seekToMs(currentTimeMs + 15000)} style={styles.seekControl}>
              <Text style={styles.seekText}>+15</Text>
            </Pressable>
          </View>

          <View style={styles.modeRow}>
            <Pressable style={[styles.modeButton, repeatMode !== 'off' && styles.modeButtonActive]} onPress={cycleRepeatMode}>
              <Text style={[styles.modeText, repeatMode !== 'off' && styles.modeTextActive]}>↻  {repeatLabel}</Text>
            </Pressable>
            <LearningDownloadButton isArabic={isArabic} />
            <LearningPlaylistPicker
              itemKind={currentItem.kind === 'recording' ? 'album_recording' : 'lesson'}
              itemId={currentItem.id}
              locale={isArabic ? 'ar' : 'en'}
              isArabic={isArabic}
            />
          </View>
          {playbackError ? <Text style={styles.error}>{playbackError}</Text> : null}
        </View>

        <View style={styles.segments}>
          <Pressable style={[styles.segment, !showQueue && styles.segmentActive]} onPress={() => setShowQueue(false)}>
            <Text style={[styles.segmentText, !showQueue && styles.segmentTextActive]}>{isArabic ? 'حول الدرس' : 'Details'}</Text>
          </Pressable>
          <Pressable style={[styles.segment, showQueue && styles.segmentActive]} onPress={() => setShowQueue(true)}>
            <Text style={[styles.segmentText, showQueue && styles.segmentTextActive]}>{isArabic ? 'قائمة الانتظار' : 'Queue'}</Text>
          </Pressable>
        </View>

        {showQueue ? (
          <View style={styles.queueCard}>
            {queue.map((item, index) => (
              <Pressable
                key={`${item.kind}-${item.id}-${index}`}
                onPress={() => selectQueueIndex(index)}
                style={[styles.queueRow, index === currentIndex && styles.queueRowActive]}
              >
                <Text style={[styles.queueIndex, index === currentIndex && styles.activeText]}>{index + 1}</Text>
                <View style={styles.queueInfo}>
                  <Text numberOfLines={1} style={[styles.queueTitle, isArabic && styles.arabic, index === currentIndex && styles.activeText]}>{item.title}</Text>
                  <Text numberOfLines={1} style={[styles.queueSubtitle, isArabic && styles.arabic]}>{item.containerTitle}</Text>
                </View>
                {index === currentIndex ? <Text style={styles.nowBadge}>{playing ? 'PLAYING' : 'PAUSED'}</Text> : <Text style={styles.queueChevron}>›</Text>}
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.detailsCard}>
            <Text style={[styles.detailsTitle, isArabic && styles.arabic]}>{currentItem.containerTitle}</Text>
            <Text style={[styles.detailsBody, isArabic && styles.arabic]}>
              {currentItem.subtitle || (isArabic
                ? 'جزء من تجربة CHC المتكاملة للاستماع والتعلّم وتتبع التقدّم.'
                : 'Part of CHC’s integrated experience for listening, learning, and tracking progress.')}
            </Text>
            <Pressable style={styles.collectionButton} onPress={openCollection}>
              <Text style={styles.collectionButtonText}>{isArabic ? 'فتح المجموعة' : 'Open Collection'}  ›</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  player: { alignItems: 'center' },
  kind: { color: COLORS.learning, fontFamily: TYPOGRAPHY.body, fontSize: 9, fontWeight: '900', letterSpacing: 1.3, marginTop: SPACING.lg },
  title: { maxWidth: 680, color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 27, fontWeight: '700', textAlign: 'center', marginTop: SPACING.sm },
  cantor: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800', textAlign: 'center', marginTop: SPACING.sm },
  collection: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, textAlign: 'center', marginTop: 4 },
  progressTrack: { width: '100%', maxWidth: 680, height: 4, overflow: 'hidden', borderRadius: 2, backgroundColor: COLORS.surfaceSoft, marginTop: SPACING.xl },
  progressFill: { height: 4, backgroundColor: COLORS.learning },
  timeRow: { width: '100%', maxWidth: 680, flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  time: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 10, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg },
  seekControl: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21 },
  seekText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800' },
  sideControl: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  sideText: { color: COLORS.learningBright, fontSize: 18, fontWeight: '800' },
  playButton: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 36, backgroundColor: COLORS.learning },
  playText: { color: COLORS.learningDeep, fontSize: 27, fontWeight: '900' },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg },
  modeButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: SPACING.md, borderRadius: RADII.pill, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  modeButtonActive: { backgroundColor: COLORS.learningSoft, borderColor: COLORS.learningLine },
  modeText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800' },
  modeTextActive: { color: COLORS.learningBright },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, fontSize: 12, textAlign: 'center', marginTop: SPACING.md },
  segments: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.xl, padding: 4, borderRadius: RADII.md, backgroundColor: COLORS.surface },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  segmentActive: { backgroundColor: COLORS.learningSoft, borderWidth: 1, borderColor: COLORS.learningLine },
  segmentText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800' },
  segmentTextActive: { color: COLORS.learningBright },
  queueCard: { marginTop: SPACING.sm, overflow: 'hidden', borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  queueRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  queueRowActive: { backgroundColor: COLORS.learningSoft },
  queueIndex: { width: 22, color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  queueInfo: { flex: 1, minWidth: 0 },
  queueTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  queueSubtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 3 },
  nowBadge: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  queueChevron: { color: COLORS.learning, fontSize: 24 },
  activeText: { color: COLORS.learningBright },
  detailsCard: { marginTop: SPACING.sm, padding: SPACING.lg, borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  detailsTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 19, fontWeight: '700' },
  detailsBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 20, marginTop: SPACING.sm },
  collectionButton: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: SPACING.md, borderRadius: RADII.pill, backgroundColor: COLORS.learningSoft, marginTop: SPACING.md },
  collectionButtonText: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '900' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyIcon: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learningSoft, borderWidth: 1, borderColor: COLORS.learningLine },
  emptyGlyph: { color: COLORS.learningBright, fontSize: 40 },
  emptyTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: SPACING.lg },
  emptyBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, textAlign: 'center', marginTop: SPACING.sm },
  browseButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.xl, borderRadius: RADII.pill, backgroundColor: COLORS.learning, marginTop: SPACING.lg },
  browseButtonText: { color: COLORS.learningDeep, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '900' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
