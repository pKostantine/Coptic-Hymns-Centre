import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MusicArtwork from '@/components/music/MusicArtwork';
import MusicMiniPlayer from '@/components/music/MusicMiniPlayer';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import type { MusicConsumerArtist } from '@/types/musicConsumer';

export default function MusicArtistScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const artistId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const [artist, setArtist] = useState<MusicConsumerArtist | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artistId) return;
    let active = true;
    musicService.getArtist(artistId, locale)
      .then((payload) => { if (active) setArtist(payload); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load artist.'); });
    return () => { active = false; };
  }, [artistId, locale]);

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Artist</Text>
        <View style={styles.headerSpacer} />
      </View>

      {!artist ? (
        error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={COLORS.gold} style={styles.loader} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <MusicArtwork asset={artist.profileImageAsset} size={168} rounded label={artist.displayName} />
            <Text style={styles.name}>{artist.displayName}</Text>
            {artist.biography ? <Text style={styles.bio}>{artist.biography}</Text> : null}
          </View>

          <Text style={styles.sectionTitle}>Releases</Text>
          <View style={styles.grid}>
            {artist.releases.map((release) => (
              <Pressable key={release.id} style={styles.releaseCard} onPress={() => router.push(`/music/release/${release.id}`)}>
                <MusicArtwork asset={release.coverAsset} size={148} label={release.title} />
                <Text numberOfLines={1} style={styles.releaseTitle}>{release.title}</Text>
                <Text numberOfLines={1} style={styles.releaseMeta}>
                  {[release.releaseDate?.slice(0, 4), release.releaseType.toUpperCase()].filter(Boolean).join(' • ')}
                </Text>
              </Pressable>
            ))}
          </View>
          {!artist.releases.length ? <Text style={styles.empty}>No published releases yet.</Text> : null}
        </ScrollView>
      )}

      <MusicMiniPlayer />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { color: COLORS.gold, fontSize: 38, lineHeight: 40 },
  headerTitle: { flex: 1, textAlign: 'center', color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 44 },
  content: { paddingBottom: SPACING.xl },
  hero: { alignItems: 'center', padding: SPACING.lg },
  name: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 30, fontWeight: '700', textAlign: 'center', marginTop: SPACING.md },
  bio: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 680, marginTop: SPACING.md },
  sectionTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700', marginHorizontal: SPACING.md, marginBottom: SPACING.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, paddingHorizontal: SPACING.md },
  releaseCard: { width: 148, paddingBottom: SPACING.sm },
  releaseTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '700', marginTop: SPACING.sm },
  releaseMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 3 },
  empty: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, marginHorizontal: SPACING.md, padding: SPACING.lg, borderRadius: RADII.md, backgroundColor: COLORS.surface, textAlign: 'center' },
  loader: { marginTop: SPACING.xl },
  error: { color: COLORS.priest, textAlign: 'center', margin: SPACING.xl, fontFamily: TYPOGRAPHY.body },
});
