import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import LearningBackHeader from '@/components/learning/LearningBackHeader';
import LearningMiniPlayer from '@/components/learning/LearningMiniPlayer';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { learningService } from '@/services/learningService';
import type { LearningSeasonSummary } from '@/types/learningPlatform';

export default function LearningSeasonsScreen() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const [seasons, setSeasons] = useState<LearningSeasonSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    learningService.getHome(locale)
      .then((payload) => {
        if (!active) return;
        setError(null);
        setSeasons(payload.seasons);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load seasons.'); });
    return () => { active = false; };
  }, [locale]);

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{isArabic ? 'المواسم — تعلّم وادرس' : 'Seasons — Learn & Study'}</title></Head>
      <LearningBackHeader title={isArabic ? 'المواسم' : 'Seasons'} isArabic={isArabic} />
      <NowPlayingAwareScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, isArabic && styles.arabic]}>
          {isArabic
            ? 'تصفّح الألحان والدروس بحسب الموسم الكنسي.'
            : 'Follow the Church year and study the hymns that belong to each season.'}
        </Text>
        {!seasons && !error ? <ActivityIndicator color={COLORS.learning} style={styles.loader} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.list}>
          {seasons?.map((season, index) => (
            <Pressable key={season.id} style={styles.card} onPress={() => router.push({ pathname: '/learn/season/[id]', params: { id: season.id } })}>
              <View style={styles.number}><Text style={styles.numberText}>{String(index + 1).padStart(2, '0')}</Text></View>
              <View style={styles.info}>
                <Text style={[styles.title, isArabic && styles.arabic]}>{season.title}</Text>
                {season.description ? <Text numberOfLines={3} style={[styles.description, isArabic && styles.arabic]}>{season.description}</Text> : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      </NowPlayingAwareScrollView>
      <LearningMiniPlayer />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  intro: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 21, marginBottom: SPACING.lg },
  loader: { marginVertical: SPACING.xl },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center', marginVertical: SPACING.lg },
  list: { gap: SPACING.sm },
  card: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  number: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: COLORS.learningDeep,
    borderWidth: 1,
    borderColor: COLORS.learningLine,
  },
  numberText: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '700' },
  info: { flex: 1, minWidth: 0 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 18, fontWeight: '700' },
  description: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, lineHeight: 17, marginTop: SPACING.xs },
  chevron: { color: COLORS.learning, fontSize: 30 },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
