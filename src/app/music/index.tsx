import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import AppHeader from '@/components/chc/ui/AppHeader';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import MusicArtwork from '@/components/music/MusicArtwork';
import MusicSectionNav from '@/components/music/MusicSectionNav';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import type { MusicHomePayload } from '@/types/musicConsumer';

export default function MusicHomeScreen() {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const isArabic = locale === 'ar';
  const [data, setData] = useState<MusicHomePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    musicService.getHome(locale)
      .then((payload) => { if (active) setData(payload); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load music.'); });
    return () => { active = false; };
  }, [locale]);

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>{isArabic ? 'الترانيم — كوبتك هيمنز سنتر' : 'Music — Coptic Hymns Centre'}</title></Head>
      <AppHeader
        title={{ english: 'Hymns & Songs', arabic: 'الألحان والترانيم' }}
        visibleLanguages={{ english: !isArabic, arabic: isArabic }}
      />
      <MusicSectionNav active="home" />

      <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={[styles.heroEyebrow, isArabic && styles.arabic]}>COPTIC HYMNS CENTRE</Text>
          <Text style={[styles.heroTitle, isArabic && styles.arabic]}>{isArabic ? 'استمع. صلِّ. احفظ.' : 'Listen. Pray. Remember.'}</Text>
          <Text style={[styles.heroBody, isArabic && styles.arabic]}>
            {isArabic ? 'موسيقى وترانيم قبطية أرثوذكسية في مكان واحد.' : 'Coptic Orthodox hymns and spiritual music, gathered into one listening experience.'}
          </Text>
        </View>

        {!data && !error ? <ActivityIndicator color={COLORS.gold} style={styles.loader} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {data ? (
          <>
            <SectionHeading title={isArabic ? 'أحدث الإصدارات' : 'Latest Releases'} />
            {data.latestReleases.length ? (
              <NowPlayingAwareScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
                {data.latestReleases.map((release) => (
                  <Pressable key={release.id} style={styles.releaseCard} onPress={() => router.push(`/music/release/${release.id}`)}>
                    <MusicArtwork asset={release.coverAsset} size={154} label={release.title} />
                    <Text numberOfLines={1} style={[styles.cardTitle, isArabic && styles.arabic]}>{release.title}</Text>
                    <Text numberOfLines={1} style={[styles.cardSubtitle, isArabic && styles.arabic]}>
                      {release.primaryArtist?.displayName
  ?? (release.releaseType === 'album' ? 'Album' : release.releaseType === 'ep' ? 'EP' : 'Single')}
                    </Text>
                  </Pressable>
                ))}
              </NowPlayingAwareScrollView>
            ) : <EmptyState text={isArabic ? 'لا توجد إصدارات منشورة بعد.' : 'No published releases yet.'} />}

            <SectionHeading title={isArabic ? 'الفنانون' : 'Artists'} />
            {data.artists.length ? (
              <NowPlayingAwareScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
                {data.artists.map((artist) => (
                  <Pressable key={artist.id} style={styles.artistCard} onPress={() => router.push(`/music/artist/${artist.id}`)}>
                    <MusicArtwork asset={artist.profileImageAsset} size={116} rounded label={artist.displayName} />
                    <Text numberOfLines={1} style={[styles.artistName, isArabic && styles.arabic]}>{artist.displayName}</Text>
                  </Pressable>
                ))}
              </NowPlayingAwareScrollView>
            ) : <EmptyState text={isArabic ? 'لا يوجد فنانون منشورون بعد.' : 'No published artists yet.'} />}
          </>
        ) : null}
      </NowPlayingAwareScrollView>

      <BottomTabBar active="music" />
    </SafeAreaView>
  );
}

function SectionHeading({ title }: { title: string }) {
  return <Text style={styles.sectionHeading}>{title}</Text>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { paddingBottom: SPACING.xl },
  hero: {
    margin: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.goldLine,
    backgroundColor: COLORS.navyDark,
  },
  heroEyebrow: { color: COLORS.gold, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  heroTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 28, fontWeight: '700', marginTop: SPACING.sm },
  heroBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 20, marginTop: SPACING.sm, maxWidth: 560 },
  loader: { marginVertical: SPACING.xl },
  error: { color: COLORS.priest, fontFamily: TYPOGRAPHY.body, margin: SPACING.md, textAlign: 'center' },
  sectionHeading: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '700', marginHorizontal: SPACING.md, marginTop: SPACING.lg, marginBottom: SPACING.md },
  horizontalList: { paddingHorizontal: SPACING.md, gap: SPACING.md },
  releaseCard: { width: 154 },
  cardTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '700', marginTop: SPACING.sm },
  cardSubtitle: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  artistCard: { width: 116, alignItems: 'center' },
  artistName: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '700', marginTop: SPACING.sm, textAlign: 'center' },
  empty: { marginHorizontal: SPACING.md, padding: SPACING.lg, borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  emptyText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, textAlign: 'center' },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
