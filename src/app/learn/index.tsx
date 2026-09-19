import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import LearningArtwork from '@/components/learning/LearningArtwork';
import LearningSectionNav from '@/components/learning/LearningSectionNav';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { learningService } from '@/services/learningService';
import type { LearningHomePayload, LearningProgressPayload } from '@/types/learningPlatform';

export default function LearningHomeScreen() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const [home, setHome] = useState<LearningHomePayload | null>(null);
  const [progress, setProgress] = useState<LearningProgressPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([learningService.getHome(locale), learningService.getProgress(locale)])
      .then(([homePayload, progressPayload]) => {
        if (!active) return;
        setError(null);
        setHome(homePayload);
        setProgress(progressPayload);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load Learn & Study.');
      });
    return () => { active = false; };
  }, [locale]);

  const continueLearning = progress?.items.filter((item) => item.state === 'learning').slice(0, 4) ?? [];

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head>
        <title>{isArabic ? 'تعلّم وادرس — كوبتك هيمنز سنتر' : 'Learn & Study — Coptic Hymns Centre'}</title>
      </Head>
      <AppHeader
        title={{ english: 'Learn & Study', arabic: 'تعلّم وادرس' }}
        visibleLanguages={{ english: !isArabic, arabic: isArabic }}
      />
      <LearningSectionNav active="home" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[COLORS.learningDeep, COLORS.navyDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={[styles.eyebrow, isArabic && styles.arabic]}>CHC LEARN & STUDY</Text>
          <Text style={[styles.heroTitle, isArabic && styles.arabic]}>
            {isArabic ? 'استمع. تعلّم. رتّل.' : 'Listen. Learn. Chant.'}
          </Text>
          <Text style={[styles.heroBody, isArabic && styles.arabic]}>
            {isArabic
              ? 'دروس مرتبة للألحان القبطية، منظّمة حسب المعلّمين والمواسم.'
              : 'Structured Coptic hymn lessons, organized around the cantors who teach them and the seasons in which they are prayed.'}
          </Text>
        </LinearGradient>

        <View style={styles.discoveryGrid}>
          <Pressable style={styles.discoveryCard} onPress={() => router.push('/learn/cantors')}>
            <View style={styles.discoveryIcon}><Text style={styles.discoveryGlyph}>♬</Text></View>
            <View style={styles.discoveryText}>
              <Text style={[styles.discoveryTitle, isArabic && styles.arabic]}>
                {isArabic ? 'المعلّمون' : 'Cantors'}
              </Text>
              <Text style={[styles.discoveryBody, isArabic && styles.arabic]}>
                {isArabic ? 'تعلّم مع معلّمك المفضّل' : 'Learn with a familiar voice'}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <Pressable style={styles.discoveryCard} onPress={() => router.push('/learn/seasons')}>
            <View style={styles.discoveryIcon}><Text style={styles.discoveryGlyph}>✦</Text></View>
            <View style={styles.discoveryText}>
              <Text style={[styles.discoveryTitle, isArabic && styles.arabic]}>
                {isArabic ? 'المواسم' : 'Seasons'}
              </Text>
              <Text style={[styles.discoveryBody, isArabic && styles.arabic]}>
                {isArabic ? 'ادرس ألحان الموسم' : 'Study the hymns for the season'}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>

        {!home && !error ? <ActivityIndicator color={COLORS.learning} style={styles.loader} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {continueLearning.length ? (
          <>
            <SectionHeading
              title={isArabic ? 'أكمل التعلّم' : 'Continue Learning'}
              action={isArabic ? 'عرض الكل' : 'View all'}
              onAction={() => router.push('/learn/library')}
              isArabic={isArabic}
            />
            <View style={styles.continueList}>
              {continueLearning.map((item, index) => (
                <Pressable key={item.hymnId} style={styles.continueCard} onPress={() => router.push('/learn/hymn/' + item.hymnId)}>
                  <View style={styles.continueNumber}><Text style={styles.continueNumberText}>{index + 1}</Text></View>
                  <View style={styles.continueInfo}>
                    <Text numberOfLines={1} style={[styles.continueTitle, isArabic && styles.arabic]}>{item.title}</Text>
                    <Text numberOfLines={1} style={[styles.continueMeta, isArabic && styles.arabic]}>
                      {item.subtitle || (isArabic ? 'قيد التعلّم' : 'Currently learning')}
                    </Text>
                  </View>
                  <View style={styles.resume}><Text style={styles.resumeText}>▶</Text></View>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {home ? (
          <>
            <SectionHeading
              title={isArabic ? 'تعلّم مع المعلّمين' : 'Learn from Cantors'}
              action={isArabic ? 'عرض الكل' : 'See all'}
              onAction={() => router.push('/learn/cantors')}
              isArabic={isArabic}
            />
            {home.cantors.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
                {home.cantors.map((cantor) => (
                  <Pressable key={cantor.id} style={styles.cantorCard} onPress={() => router.push('/learn/cantor/' + cantor.id)}>
                    <LearningArtwork asset={cantor.profileImageAsset} size={112} rounded label={cantor.displayName} />
                    <Text numberOfLines={2} style={[styles.cantorName, isArabic && styles.arabic]}>{cantor.displayName}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : <Empty text={isArabic ? 'لا يوجد معلّمون منشورون بعد.' : 'No published cantors yet.'} />}

            <SectionHeading
              title={isArabic ? 'تعلّم حسب الموسم' : 'Study by Season'}
              action={isArabic ? 'عرض الكل' : 'See all'}
              onAction={() => router.push('/learn/seasons')}
              isArabic={isArabic}
            />
            {home.seasons.length ? (
              <View style={styles.seasonList}>
                {home.seasons.slice(0, 6).map((season, index) => (
                  <Pressable key={season.id} style={styles.seasonCard} onPress={() => router.push('/learn/season/' + season.id)}>
                    <View style={styles.seasonNumber}><Text style={styles.seasonNumberText}>{String(index + 1).padStart(2, '0')}</Text></View>
                    <View style={styles.seasonInfo}>
                      <Text style={[styles.seasonTitle, isArabic && styles.arabic]}>{season.title}</Text>
                      {season.description ? <Text numberOfLines={2} style={[styles.seasonDescription, isArabic && styles.arabic]}>{season.description}</Text> : null}
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                ))}
              </View>
            ) : <Empty text={isArabic ? 'لا توجد مواسم منشورة بعد.' : 'No published seasons yet.'} />}
          </>
        ) : null}
      </ScrollView>

      <BottomTabBar active="learn" />
    </SafeAreaView>
  );
}

function SectionHeading({
  title,
  action,
  onAction,
  isArabic,
}: {
  title: string;
  action: string;
  onAction: () => void;
  isArabic: boolean;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionHeading, isArabic && styles.arabic]}>{title}</Text>
      <Pressable onPress={onAction}><Text style={[styles.sectionAction, isArabic && styles.arabic]}>{action}</Text></Pressable>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { paddingBottom: SPACING.xl },
  hero: {
    margin: SPACING.md,
    padding: SPACING.lg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.learningLine,
  },
  eyebrow: { color: COLORS.learning, fontFamily: TYPOGRAPHY.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  heroTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 29, fontWeight: '700', marginTop: SPACING.sm },
  heroBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 21, marginTop: SPACING.sm, maxWidth: 620 },
  discoveryGrid: { gap: SPACING.sm, paddingHorizontal: SPACING.md },
  discoveryCard: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  discoveryIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.md,
    backgroundColor: COLORS.learningSoft,
    borderWidth: 1,
    borderColor: COLORS.learningLine,
  },
  discoveryGlyph: { color: COLORS.learningBright, fontSize: 23 },
  discoveryText: { flex: 1, minWidth: 0 },
  discoveryTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '700' },
  discoveryBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  chevron: { color: COLORS.learning, fontSize: 28 },
  loader: { marginVertical: SPACING.xl },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, textAlign: 'center', margin: SPACING.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
  },
  sectionHeading: { flex: 1, color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700' },
  sectionAction: { color: COLORS.learning, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800' },
  horizontalList: { paddingHorizontal: SPACING.md, gap: SPACING.md },
  cantorCard: { width: 120, alignItems: 'center' },
  cantorName: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: SPACING.sm },
  seasonList: { gap: SPACING.sm, paddingHorizontal: SPACING.md },
  seasonCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  seasonNumber: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: COLORS.learningDeep,
    borderWidth: 1,
    borderColor: COLORS.learningLine,
  },
  seasonNumberText: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.title, fontSize: 16, fontWeight: '700' },
  seasonInfo: { flex: 1, minWidth: 0 },
  seasonTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 16, fontWeight: '700' },
  seasonDescription: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, lineHeight: 17, marginTop: 4 },
  continueList: { gap: SPACING.sm, paddingHorizontal: SPACING.md },
  continueCard: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.md,
    backgroundColor: COLORS.learningDeep,
    borderWidth: 1,
    borderColor: COLORS.learningLine,
  },
  continueNumber: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learningSoft },
  continueNumberText: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800' },
  continueInfo: { flex: 1, minWidth: 0 },
  continueTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  continueMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 3 },
  resume: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.learning },
  resumeText: { color: COLORS.learningDeep, fontSize: 12, fontWeight: '900' },
  empty: { marginHorizontal: SPACING.md, padding: SPACING.lg, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  emptyText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
