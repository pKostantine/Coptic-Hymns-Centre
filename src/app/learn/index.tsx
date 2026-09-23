import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import AppHeader from '@/components/chc/ui/AppHeader';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import LearningSectionNav from '@/components/learning/LearningSectionNav';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { learningService } from '@/services/learningService';
import type { LearningHomePayload, LearningItemLibraryPayload } from '@/types/learningPlatform';

export default function LearningHomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const [home, setHome] = useState<LearningHomePayload | null>(null);
  const [library, setLibrary] = useState<LearningItemLibraryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([learningService.getHome(locale), learningService.getItemLibrary(locale)])
      .then(([homePayload, libraryPayload]) => {
        if (!active) return;
        setError(null);
        setHome(homePayload);
        setLibrary(libraryPayload);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load Learn & Study.');
      });
    return () => { active = false; };
  }, [locale, user?.id]);

  const continueLearning = library?.items.filter((item) => item.state === 'learning').slice(0, 4) ?? [];

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

      <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
                <Pressable
                  key={item.itemKind + ':' + item.itemId}
                  style={styles.continueCard}
                  onPress={() => item.itemKind === 'lesson'
                    ? router.push({ pathname: '/learn/lesson/[id]', params: { id: item.itemId, setId: item.containerId } })
                    : router.push({ pathname: '/learn/album/[id]', params: { id: item.containerId } })}
                >
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
      </NowPlayingAwareScrollView>

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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { paddingBottom: SPACING.xl },
  discoveryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, padding: SPACING.md },
  discoveryCard: {
    flexGrow: 1,
    flexBasis: 280,
    minHeight: 124,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  discoveryIcon: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.md,
    backgroundColor: COLORS.learningSoft,
    borderWidth: 1,
    borderColor: COLORS.learningLine,
  },
  discoveryGlyph: { color: COLORS.learningBright, fontSize: 29 },
  discoveryText: { flex: 1, minWidth: 0 },
  discoveryTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700' },
  discoveryBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: 5 },
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
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
