import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import LearningArtwork from '@/components/learning/LearningArtwork';
import LearningBackHeader from '@/components/learning/LearningBackHeader';
import LearningCollectionCard from '@/components/learning/LearningCollectionCard';
import LearningMiniPlayer from '@/components/learning/LearningMiniPlayer';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { learningService } from '@/services/learningService';
import type { LearningCantorDetail } from '@/types/learningPlatform';

export default function LearningCantorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const cantorId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [cantor, setCantor] = useState<LearningCantorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cantorId) return;
    let active = true;
    learningService.getCantor(cantorId, locale)
      .then((payload) => {
        if (!active) return;
        setError(null);
        setCantor(payload);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load cantor.'); });
    return () => { active = false; };
  }, [cantorId, locale]);

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{cantor ? cantor.displayName + ' — Learn & Study' : 'Cantor — Learn & Study'}</title></Head>
      <LearningBackHeader title={isArabic ? 'المعلّم' : 'Cantor'} isArabic={isArabic} />
      {!cantor && !error ? <ActivityIndicator color={COLORS.learning} style={styles.loader} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {cantor ? (
        <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <LearningArtwork asset={cantor.profileImageAsset} size={138} rounded label={cantor.displayName} />
            <Text style={[styles.name, isArabic && styles.arabic]}>{cantor.displayName}</Text>
            {cantor.biography ? <Text style={[styles.bio, isArabic && styles.arabic]}>{cantor.biography}</Text> : null}
          </View>

          <SectionTitle
            title={isArabic ? 'ألبومات التعلّم' : 'Learning Albums'}
            subtitle={isArabic ? 'تسجيلات مرتبة للاستماع والمراجعة' : 'Ordered recordings for listening and review'}
            isArabic={isArabic}
          />
          <View style={styles.list}>
            {cantor.albums.map((album) => (
              <LearningCollectionCard
                key={album.id}
                kind="album"
                title={album.title}
                description={album.description}
                meta={isArabic ? 'ألبوم تعلّم' : 'Learning album'}
                isArabic={isArabic}
                onPress={() => router.push('/learn/album/' + album.id)}
              />
            ))}
            {!cantor.albums.length ? <Empty text={isArabic ? 'لا توجد ألبومات منشورة بعد.' : 'No published learning albums yet.'} /> : null}
          </View>

          <SectionTitle
            title={isArabic ? 'مجموعات الدروس' : 'Lesson Sets'}
            subtitle={isArabic ? 'دروس خطوة بخطوة لكل لحن' : 'Step-by-step study for individual hymns'}
            isArabic={isArabic}
          />
          <View style={styles.list}>
            {cantor.lessonSets.map((lessonSet) => (
              <LearningCollectionCard
                key={lessonSet.id}
                kind="lesson_set"
                title={lessonSet.title}
                description={lessonSet.description}
                meta={isArabic ? 'منهج لحن' : 'Hymn course'}
                isArabic={isArabic}
                onPress={() => router.push('/learn/lesson-set/' + lessonSet.id)}
              />
            ))}
            {!cantor.lessonSets.length ? <Empty text={isArabic ? 'لا توجد مجموعات دروس منشورة بعد.' : 'No published lesson sets yet.'} /> : null}
          </View>
        </NowPlayingAwareScrollView>
      ) : null}
      <LearningMiniPlayer />
    </SafeAreaView>
  );
}

function SectionTitle({ title, subtitle, isArabic }: { title: string; subtitle: string; isArabic: boolean }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{title}</Text>
      <Text style={[styles.sectionSubtitle, isArabic && styles.arabic]}>{subtitle}</Text>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  loader: { marginTop: SPACING.xl },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center', margin: SPACING.xl },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  hero: {
    alignItems: 'center',
    padding: SPACING.lg,
    borderRadius: 24,
    backgroundColor: COLORS.learningDeep,
    borderWidth: 1,
    borderColor: COLORS.learningLine,
  },
  name: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 27, fontWeight: '700', textAlign: 'center', marginTop: SPACING.md },
  bio: { maxWidth: 650, color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: SPACING.sm },
  sectionHeader: { marginTop: SPACING.xl, marginBottom: SPACING.md },
  sectionTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
  sectionSubtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  list: { gap: SPACING.sm },
  empty: { padding: SPACING.lg, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  emptyText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
