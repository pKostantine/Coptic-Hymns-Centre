import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import LearningBackHeader from '@/components/learning/LearningBackHeader';
import LearningCollectionCard from '@/components/learning/LearningCollectionCard';
import LearningMiniPlayer from '@/components/learning/LearningMiniPlayer';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { learningService } from '@/services/learningService';
import type { LearningSeasonDetail } from '@/types/learningPlatform';

export default function LearningSeasonScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const seasonId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [season, setSeason] = useState<LearningSeasonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seasonId) return;
    let active = true;
    learningService.getSeason(seasonId, locale)
      .then((payload) => {
        if (!active) return;
        setError(null);
        setSeason(payload);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load season.'); });
    return () => { active = false; };
  }, [locale, seasonId]);

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{season ? season.title + ' — Learn & Study' : 'Season — Learn & Study'}</title></Head>
      <LearningBackHeader title={isArabic ? 'الموسم' : 'Season'} isArabic={isArabic} />
      {!season && !error ? <ActivityIndicator color={COLORS.learning} style={styles.loader} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {season ? (
        <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Text style={[styles.eyebrow, isArabic && styles.arabic]}>{isArabic ? 'موسم كنسي' : 'CHURCH SEASON'}</Text>
            <Text style={[styles.title, isArabic && styles.arabic]}>{season.title}</Text>
            {season.description ? <Text style={[styles.description, isArabic && styles.arabic]}>{season.description}</Text> : null}
          </View>

          <SectionTitle title={isArabic ? 'منهج الألحان' : 'Hymn Curriculum'} isArabic={isArabic} />
          <View style={styles.hymnList}>
            {season.hymns.map((hymn, index) => (
              <Pressable key={hymn.id} style={styles.hymn} onPress={() => router.push('/learn/hymn/' + hymn.id)}>
                <View style={styles.hymnNumber}><Text style={styles.hymnNumberText}>{index + 1}</Text></View>
                <View style={styles.hymnInfo}>
                  <Text style={[styles.hymnTitle, isArabic && styles.arabic]}>{hymn.title}</Text>
                  {hymn.subtitle ? <Text style={[styles.hymnSubtitle, isArabic && styles.arabic]}>{hymn.subtitle}</Text> : null}
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
            {!season.hymns.length ? <Empty text={isArabic ? 'لم تُضف ألحان لهذا الموسم بعد.' : 'No hymns have been added to this season yet.'} /> : null}
          </View>

          <SectionTitle title={isArabic ? 'ألبومات الموسم' : 'Season Albums'} isArabic={isArabic} />
          <View style={styles.collections}>
            {season.albums.map((album) => (
              <LearningCollectionCard
                key={album.id}
                kind="album"
                title={album.title}
                meta={album.cantorName}
                artwork={album.coverAsset}
                isArabic={isArabic}
                onPress={() => router.push('/learn/album/' + album.id)}
              />
            ))}
            {!season.albums.length ? <Empty text={isArabic ? 'لا توجد ألبومات منشورة.' : 'No published albums for this season.'} /> : null}
          </View>

          <SectionTitle title={isArabic ? 'مجموعات الدروس' : 'Lesson Sets'} isArabic={isArabic} />
          <View style={styles.collections}>
            {season.lessonSets.map((lessonSet) => (
              <LearningCollectionCard
                key={lessonSet.id}
                kind="lesson_set"
                title={lessonSet.title}
                meta={lessonSet.cantorName}
                artwork={lessonSet.coverAsset}
                isArabic={isArabic}
                onPress={() => router.push('/learn/lesson-set/' + lessonSet.id)}
              />
            ))}
            {!season.lessonSets.length ? <Empty text={isArabic ? 'لا توجد مجموعات دروس منشورة.' : 'No published lesson sets for this season.'} /> : null}
          </View>
        </NowPlayingAwareScrollView>
      ) : null}
      <LearningMiniPlayer />
    </SafeAreaView>
  );
}

function SectionTitle({ title, isArabic }: { title: string; isArabic: boolean }) {
  return <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{title}</Text>;
}

function Empty({ text }: { text: string }) {
  return <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  loader: { marginTop: SPACING.xl },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center', margin: SPACING.xl },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  hero: { padding: SPACING.lg, borderRadius: 24, backgroundColor: COLORS.learningDeep, borderWidth: 1, borderColor: COLORS.learningLine },
  eyebrow: { color: COLORS.learning, fontFamily: TYPOGRAPHY.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 29, fontWeight: '700', marginTop: SPACING.sm },
  description: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 21, marginTop: SPACING.sm, maxWidth: 680 },
  sectionTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700', marginTop: SPACING.xl, marginBottom: SPACING.md },
  hymnList: { gap: SPACING.sm },
  hymn: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.sm, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  hymnNumber: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learningSoft },
  hymnNumberText: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800' },
  hymnInfo: { flex: 1, minWidth: 0 },
  hymnTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '800' },
  hymnSubtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  chevron: { color: COLORS.learning, fontSize: 28 },
  collections: { gap: SPACING.sm },
  empty: { padding: SPACING.lg, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  emptyText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
