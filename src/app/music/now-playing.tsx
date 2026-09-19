import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon from '@/components/chc/ui/Icon';
import MusicArtwork from '@/components/music/MusicArtwork';
import MusicPlaybackModeControls from '@/components/music/MusicPlaybackModeControls';
import MusicQueueList from '@/components/music/MusicQueueList';
import SeekBar from '@/components/music/SeekBar';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useMusicPlayer } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import type { PublishedLyricSet } from '@/types/musicConsumer';
import { formatMusicTrackPerformers } from '@/utils/musicCredits';

function lyricSetLabel(set: PublishedLyricSet): string {
  const localeNames: Record<string, string> = { en: 'English', ar: 'Arabic', cop: 'Coptic', fr: 'French' };
  const base = localeNames[set.locale] ?? set.locale.toUpperCase();
  if (set.kind === 'transliteration') return `${base} Transliteration`;
  if (set.kind === 'translation') return `${base} Translation`;
  return base;
}

export default function MusicNowPlayingScreen() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const {
    currentItem,
    queue,
    queueKeys,
    currentIndex,
    playing,
    buffering,
    currentTimeMs,
    durationMs,
    togglePlayback,
    next,
    previous,
    seekToMs,
    selectQueueIndex,
    moveQueueItem,
    clearUpcoming,
  } = useMusicPlayer();
  const [queueDragActive, setQueueDragActive] = useState(false);
  const [lyricSets, setLyricSets] = useState<PublishedLyricSet[]>([]);
  const [selectedLyricSetId, setSelectedLyricSetId] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [liked, setLiked] = useState(false);
  const [libraryAuthenticated, setLibraryAuthenticated] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  useEffect(() => {
    if (!currentItem) {
      setLyricSets([]);
      setSelectedLyricSetId(null);
      return;
    }
    let active = true;
    setLyricsLoading(true);
    musicService.getLyrics(currentItem.track.id)
      .then((payload) => {
        if (!active) return;
        setLyricSets(payload.lyricSets);
        const preferredLocale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
        const preferred = payload.lyricSets.find((set) => set.locale === preferredLocale)
          ?? payload.lyricSets.find((set) => set.kind === 'original')
          ?? payload.lyricSets[0]
          ?? null;
        setSelectedLyricSetId(preferred?.id ?? null);
      })
      .catch(() => {
        if (active) {
          setLyricSets([]);
          setSelectedLyricSetId(null);
        }
      })
      .finally(() => { if (active) setLyricsLoading(false); });
    return () => { active = false; };
  }, [currentItem?.track.id, preferences.appLanguage]);

  useEffect(() => {
    if (!currentItem) return;
    let active = true;
    musicService.getLibrary(preferences.appLanguage === 'ar' ? 'ar' : 'en')
      .then((library) => {
        if (!active) return;
        setLibraryAuthenticated(library.authenticated);
        setLiked(library.likedTracks.some((track) => track.id === currentItem.track.id));
      })
      .catch(() => {
        if (active) {
          setLibraryAuthenticated(false);
          setLiked(false);
        }
      });
    return () => { active = false; };
  }, [currentItem?.track.id, preferences.appLanguage]);

  const selectedSet = lyricSets.find((set) => set.id === selectedLyricSetId) ?? null;
  const activeLineId = useMemo(() => {
    if (!selectedSet) return null;
    const active = selectedSet.lines.find((line, index) => {
      if (line.startMs == null) return false;
      const nextStart = selectedSet.lines[index + 1]?.startMs ?? null;
      const effectiveEnd = line.endMs ?? nextStart ?? Number.POSITIVE_INFINITY;
      return currentTimeMs >= line.startMs && currentTimeMs < effectiveEnd;
    });
    return active?.id ?? null;
  }, [currentTimeMs, selectedSet]);

  const toggleLike = async () => {
    if (!currentItem || likeBusy) return;
    if (!libraryAuthenticated) {
      Alert.alert(
        isArabic ? 'الأغاني المعجبة' : 'Liked Songs',
        isArabic ? 'سجّل الدخول إلى حساب CHC لحفظ الأغاني المعجبة.' : 'Sign in to your CHC account to save Liked Songs.',
      );
      return;
    }
    setLikeBusy(true);
    try {
      const nextLiked = !liked;
      await musicService.setLiked(currentItem.track.id, nextLiked);
      setLiked(nextLiked);
    } catch (cause) {
      Alert.alert(isArabic ? 'الأغاني المعجبة' : 'Liked Songs', cause instanceof Error ? cause.message : 'Unable to update Liked Songs.');
    } finally {
      setLikeBusy(false);
    }
  };

  const showDownloadAction = () => {
    Alert.alert(
      isArabic ? 'التنزيل' : 'Download',
      isArabic
        ? 'تم تجهيز إجراء التنزيل في تجربة الموسيقى. التخزين الكامل والاستماع بلا اتصال سيتم تفعيله في مرحلة التنزيلات.'
        : 'The download action is part of the Music experience. Full local storage and offline playback are implemented in the dedicated Offline Downloads phase.',
    );
  };

  if (!currentItem) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onBack={() => router.back()} />
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Nothing playing</Text>
          <Text style={styles.emptyBody}>Choose a track from Music to start listening.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/music')}><Text style={styles.primaryButtonText}>Browse Music</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const performerLine = formatMusicTrackPerformers(currentItem.track, 'Coptic Hymns Centre');

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Header onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!queueDragActive}
      >
        <View style={styles.playerHero}>
          <MusicArtwork asset={currentItem.coverAsset} size={260} label={currentItem.releaseTitle ?? currentItem.track.title} />
          <Text numberOfLines={2} style={styles.trackTitle}>{currentItem.track.title}</Text>
          <Text numberOfLines={1} style={styles.artist}>{performerLine}</Text>
          {currentItem.releaseTitle ? <Text numberOfLines={1} style={styles.release}>{currentItem.releaseTitle}</Text> : null}

          <View style={styles.seekBar}>
            <SeekBar
              positionMs={currentTimeMs}
              durationMs={durationMs || currentItem.track.durationMs || 0}
              onSeek={(positionMs) => void seekToMs(positionMs)}
            />
          </View>

          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous track"
              onPress={previous}
              style={({ pressed }) => [styles.sideControl, pressed && styles.pressedControl]}
            >
              <Icon name="play-skip-back" size={26} color={COLORS.white} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pause' : 'Play'}
              onPress={togglePlayback}
              style={({ pressed }) => [styles.playButton, pressed && styles.pressedControl]}
            >
              {buffering ? (
                <ActivityIndicator color={COLORS.black} />
              ) : (
                <Icon name={playing ? 'pause' : 'play'} size={28} color={COLORS.black} style={playing ? undefined : styles.playNudge} />
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next track"
              onPress={next}
              style={({ pressed }) => [styles.sideControl, pressed && styles.pressedControl]}
            >
              <Icon name="play-skip-forward" size={26} color={COLORS.white} />
            </Pressable>
          </View>

          <MusicPlaybackModeControls />

          <View style={styles.trackActions}>
            <Pressable disabled={likeBusy} style={[styles.trackAction, liked && styles.trackActionActive]} onPress={() => void toggleLike()}>
              <Text style={[styles.trackActionText, liked && styles.trackActionTextActive]}>{liked ? '♥' : '♡'} {isArabic ? 'إعجاب' : 'Like'}</Text>
            </Pressable>
            {Platform.OS !== 'web' ? (
              <Pressable style={styles.trackAction} onPress={showDownloadAction}>
                <Text style={styles.trackActionText}>↓ {isArabic ? 'تنزيل' : 'Download'}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.segmentRow}>
          <Pressable style={[styles.segment, !showQueue && styles.segmentActive]} onPress={() => setShowQueue(false)}><Text style={[styles.segmentText, !showQueue && styles.segmentTextActive]}>{isArabic ? 'الكلمات' : 'Lyrics'}</Text></Pressable>
          <Pressable style={[styles.segment, showQueue && styles.segmentActive]} onPress={() => setShowQueue(true)}><Text style={[styles.segmentText, showQueue && styles.segmentTextActive]}>{isArabic ? 'قائمة الانتظار' : 'Queue'}</Text></Pressable>
        </View>

        {showQueue ? (
          <MusicQueueList
            queue={queue}
            queueKeys={queueKeys}
            currentIndex={currentIndex}
            playing={playing}
            isArabic={isArabic}
            onSelect={selectQueueIndex}
            onMove={moveQueueItem}
            onClear={clearUpcoming}
            onDragActiveChange={setQueueDragActive}
          />
        ) : (
          <View style={styles.lyricsSection}>
            {lyricsLoading ? <ActivityIndicator color={COLORS.gold} style={styles.lyricsLoader} /> : null}
            {lyricSets.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lyricSetTabs}>
                {lyricSets.map((set) => (
                  <Pressable key={set.id} style={[styles.lyricSetTab, selectedLyricSetId === set.id && styles.lyricSetTabActive]} onPress={() => setSelectedLyricSetId(set.id)}>
                    <Text style={[styles.lyricSetTabText, selectedLyricSetId === set.id && styles.lyricSetTabTextActive]}>{lyricSetLabel(set)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {selectedSet ? (
              <View style={[styles.lyricCard, selectedSet.locale === 'ar' && styles.rtlCard]}>
                {selectedSet.lines.map((line) => {
                  const active = line.id === activeLineId;
                  return (
                    <Pressable key={line.id} disabled={line.startMs == null} onPress={() => line.startMs != null && void seekToMs(line.startMs)}>
                      <Text style={[
                        styles.lyricLine,
                        selectedSet.locale === 'ar' && styles.arabicLyric,
                        selectedSet.locale === 'cop' && styles.copticLyric,
                        active && styles.lyricLineActive,
                      ]}>{line.text}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : !lyricsLoading ? (
              <View style={styles.noLyrics}><Text style={styles.noLyricsTitle}>No synchronized lyrics yet</Text><Text style={styles.noLyricsBody}>This recording can still be played normally.</Text></View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backText}>⌄</Text></Pressable>
      <Text style={styles.headerTitle}>Now Playing</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  header: { height: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { color: COLORS.gold, fontSize: 28, fontWeight: '700' },
  headerTitle: { flex: 1, textAlign: 'center', color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 44 },
  content: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl },
  playerHero: { alignItems: 'center', paddingTop: SPACING.md },
  trackTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 27, fontWeight: '700', textAlign: 'center', marginTop: SPACING.lg, maxWidth: 680 },
  artist: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '700', marginTop: SPACING.sm },
  release: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  seekBar: { width: '100%', maxWidth: 620, marginTop: SPACING.lg },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xl, marginTop: SPACING.sm },
  playButton: { width: 68, height: 68, borderRadius: 34, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  playNudge: { marginLeft: 4 },
  sideControl: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  pressedControl: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  trackActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  trackAction: { minHeight: 36, minWidth: 100, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.md, borderRadius: RADII.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  trackActionActive: { borderColor: COLORS.goldLine, backgroundColor: COLORS.goldSoft },
  trackActionText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '700' },
  trackActionTextActive: { color: COLORS.goldBright },
  segmentRow: { flexDirection: 'row', alignSelf: 'center', marginTop: SPACING.xl, backgroundColor: COLORS.surface, borderRadius: RADII.pill, padding: 4, borderWidth: 1, borderColor: COLORS.border },
  segment: { minWidth: 110, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: RADII.pill },
  segmentActive: { backgroundColor: COLORS.goldSoft },
  segmentText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontWeight: '700', fontSize: 13 },
  segmentTextActive: { color: COLORS.goldBright },
  lyricsSection: { marginTop: SPACING.lg },
  lyricsLoader: { margin: SPACING.lg },
  lyricSetTabs: { gap: SPACING.sm, paddingBottom: SPACING.md },
  lyricSetTab: { minHeight: 34, justifyContent: 'center', paddingHorizontal: SPACING.md, borderRadius: RADII.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  lyricSetTabActive: { borderColor: COLORS.goldLine, backgroundColor: COLORS.goldSoft },
  lyricSetTabText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '700' },
  lyricSetTabTextActive: { color: COLORS.goldBright },
  lyricCard: { padding: SPACING.lg, borderRadius: RADII.lg, backgroundColor: COLORS.navyDark, borderWidth: 1, borderColor: COLORS.border },
  rtlCard: { writingDirection: 'rtl' },
  lyricLine: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 22, lineHeight: 31, fontWeight: '600', paddingVertical: SPACING.sm, opacity: 0.62 },
  lyricLineActive: { color: COLORS.white, opacity: 1, fontSize: 25 },
  arabicLyric: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
  copticLyric: { fontFamily: TYPOGRAPHY.coptic },
  noLyrics: { padding: SPACING.lg, borderRadius: RADII.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  noLyricsTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 18, fontWeight: '700' },
  noLyricsBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: SPACING.sm },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 25, fontWeight: '700' },
  emptyBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center', marginTop: SPACING.sm },
  primaryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.lg, borderRadius: RADII.pill, backgroundColor: COLORS.gold, marginTop: SPACING.lg },
  primaryButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontWeight: '800' },
});
