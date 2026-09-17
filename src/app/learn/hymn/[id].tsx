import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import LearningBackHeader from '@/components/learning/LearningBackHeader';
import LearningCollectionCard from '@/components/learning/LearningCollectionCard';
import LearningMiniPlayer from '@/components/learning/LearningMiniPlayer';
import LearningProgressControl from '@/components/learning/LearningProgressControl';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { learningService } from '@/services/learningService';
import type { LearningHymnDetail } from '@/types/learningPlatform';

export default function LearningHymnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const hymnId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [hymn, setHymn] = useState<LearningHymnDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hymnId) return;
    let active = true;
    learningService.getHymn(hymnId, locale)
      .then((payload) => {
        if (!active) return;
        setError(null);
        setHymn(payload);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load hymn.'); });
    return () => { active = false; };
  }, [hymnId, locale]);

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{hymn ? hymn.title + ' — Learn & Study' : 'Hymn — Learn & Study'}</title></Head>
      <LearningBackHeader title={isArabic ? 'تعلّم اللحن' : 'Learn a Hymn'} isArabic={isArabic} />
      {!hymn && !error ? <ActivityIndicator color={COLORS.learning} style={styles.loader} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {hymn ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Text style={[styles.eyebrow, isArabic && styles.arabic]}>{isArabic ? 'لحن' : 'HYMN'}</Text>
            <Text style={[styles.title, isArabic && styles.arabic]}>{hymn.title}</Text>
            {hymn.subtitle ? <Text style={[styles.subtitle, isArabic && styles.arabic]}>{hymn.subtitle}</Text> : null}
            {hymn.description ? <Text style={[styles.description, isArabic && styles.arabic]}>{hymn.description}</Text> : null}
          </View>

          <View style={styles.progressCard}>
            <LearningProgressControl hymnId={hymn.id} locale={locale} isArabic={isArabic} />
          </View>

          <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>
            {isArabic ? 'مجموعات الدروس' : 'Lesson Sets'}
          </Text>
          <View style={styles.list}>
            {hymn.lessonSets.map((lessonSet) => (
              <LearningCollectionCard
                key={lessonSet.id}
                kind="lesson_set"
                title={lessonSet.title}
                description={lessonSet.description}
                meta={isArabic ? 'دروس مرتبة' : 'Structured lessons'}
                isArabic={isArabic}
                onPress={() => router.push('/learn/lesson-set/' + lessonSet.id)}
              />
            ))}
            {!hymn.lessonSets.length ? <Empty text={isArabic ? 'لا توجد دروس منشورة لهذا اللحن بعد.' : 'No published lessons for this hymn yet.'} /> : null}
          </View>

          {hymn.seasons.length ? (
            <>
              <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'يُرتّل في' : 'Belongs to'}</Text>
              <View style={styles.chips}>
                {hymn.seasons.map((season) => (
                  <Pressable key={season.id} style={styles.chip} onPress={() => router.push('/learn/season/' + season.id)}>
                    <Text style={[styles.chipText, isArabic && styles.arabic]}>{season.title}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {hymn.relatedHymns.length ? (
            <>
              <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'ألحان مرتبطة' : 'Related Hymns'}</Text>
              <View style={styles.relatedList}>
                {hymn.relatedHymns.map((related) => (
                  <Pressable key={related.id} style={styles.related} onPress={() => router.push('/learn/hymn/' + related.id)}>
                    <View style={styles.relatedInfo}>
                      <Text style={[styles.relatedTitle, isArabic && styles.arabic]}>{related.title}</Text>
                      <Text style={[styles.relatedType, isArabic && styles.arabic]}>{related.relationshipType.replace(/_/g, ' ')}</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      ) : null}
      <LearningMiniPlayer />
    </SafeAreaView>
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
  hero: { padding: SPACING.lg, borderRadius: 24, backgroundColor: COLORS.learningDeep, borderWidth: 1, borderColor: COLORS.learningLine },
  eyebrow: { color: COLORS.learning, fontFamily: TYPOGRAPHY.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 29, fontWeight: '700', marginTop: SPACING.sm },
  subtitle: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 14, marginTop: SPACING.xs },
  description: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 21, marginTop: SPACING.md, maxWidth: 680 },
  progressCard: { marginTop: SPACING.md, padding: SPACING.md, borderRadius: RADII.lg, backgroundColor: COLORS.surfaceSoft, borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700', marginTop: SPACING.xl, marginBottom: SPACING.md },
  list: { gap: SPACING.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { minHeight: 38, justifyContent: 'center', paddingHorizontal: SPACING.md, borderRadius: RADII.pill, backgroundColor: COLORS.learningSoft, borderWidth: 1, borderColor: COLORS.learningLine },
  chipText: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800' },
  relatedList: { gap: SPACING.sm },
  related: { minHeight: 62, flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  relatedInfo: { flex: 1, minWidth: 0 },
  relatedTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  relatedType: { color: COLORS.learning, fontFamily: TYPOGRAPHY.body, fontSize: 10, fontWeight: '800', marginTop: 4, textTransform: 'uppercase' },
  chevron: { color: COLORS.learning, fontSize: 28 },
  empty: { padding: SPACING.lg, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  emptyText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
