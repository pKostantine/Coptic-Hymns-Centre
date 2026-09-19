import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import LearningArtwork from '@/components/learning/LearningArtwork';
import LearningBackHeader from '@/components/learning/LearningBackHeader';
import LearningMiniPlayer from '@/components/learning/LearningMiniPlayer';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { learningService } from '@/services/learningService';
import type { LearningCantorSummary } from '@/types/learningPlatform';

export default function LearningCantorsScreen() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const [cantors, setCantors] = useState<LearningCantorSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    learningService.getHome(locale)
      .then((payload) => {
        if (!active) return;
        setError(null);
        setCantors(payload.cantors);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load cantors.'); });
    return () => { active = false; };
  }, [locale]);

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{isArabic ? 'المعلّمون — تعلّم وادرس' : 'Cantors — Learn & Study'}</title></Head>
      <LearningBackHeader title={isArabic ? 'المعلّمون' : 'Cantors'} isArabic={isArabic} />
      <NowPlayingAwareScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, isArabic && styles.arabic]}>
          {isArabic
            ? 'اختر معلّمًا لتصفح ألبوماته ودروسه المرتبة.'
            : 'Choose a cantor to explore their learning albums and structured lesson sets.'}
        </Text>
        {!cantors && !error ? <ActivityIndicator color={COLORS.learning} style={styles.loader} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.grid}>
          {cantors?.map((cantor) => (
            <Pressable key={cantor.id} style={styles.card} onPress={() => router.push('/learn/cantor/' + cantor.id)}>
              <LearningArtwork asset={cantor.profileImageAsset} size={82} rounded label={cantor.displayName} />
              <View style={styles.info}>
                <Text style={[styles.name, isArabic && styles.arabic]}>{cantor.displayName}</Text>
                {cantor.biography ? <Text numberOfLines={2} style={[styles.bio, isArabic && styles.arabic]}>{cantor.biography}</Text> : null}
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
  grid: { gap: SPACING.sm },
  card: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.sm,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  info: { flex: 1, minWidth: 0 },
  name: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 18, fontWeight: '700' },
  bio: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, lineHeight: 17, marginTop: SPACING.xs },
  chevron: { color: COLORS.learning, fontSize: 30, paddingRight: SPACING.xs },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
