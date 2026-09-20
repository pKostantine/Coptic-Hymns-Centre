import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import Icon from '@/components/chc/ui/Icon';
import ShareMetadata from '@/components/chc/ui/ShareMetadata';
import MusicArtwork from '@/components/music/MusicArtwork';
import MusicMiniPlayer from '@/components/music/MusicMiniPlayer';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import type { MusicConsumerArtist, MusicConsumerAsset } from '@/types/musicConsumer';
import { goBack } from '@/utils/navigation';
import { shareLink } from '@/utils/shareLink';

export default function MusicArtistScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const artistId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { preferences } = useReadingPreferences();
  const locale = preferences.appLanguage === 'ar' ? 'ar' : 'en';
  const [artist, setArtist] = useState<MusicConsumerArtist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followed, setFollowed] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [libraryAuthenticated, setLibraryAuthenticated] = useState(false);
  const [shareArtwork, setShareArtwork] = useState<MusicConsumerAsset | null>(null);

  useEffect(() => {
    if (!artistId) return;
    let active = true;
    setError(null);
    Promise.all([
      musicService.getArtist(artistId, locale),
      musicService.getArtistFollowed(artistId),
      musicService.getLibrary(locale),
    ])
      .then(([payload, isFollowed, library]) => {
        if (!active) return;
        setArtist(payload);
        setFollowed(isFollowed);
        setLibraryAuthenticated(library.authenticated);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load artist.');
      });
    return () => { active = false; };
  }, [artistId, locale]);

  useEffect(() => {
    if (!artist || artist.profileImageAsset || shareArtwork) return;
    let active = true;
    musicService.getArtistSearchArt(artist.id)
      .then((asset) => { if (active) setShareArtwork(asset); })
      .catch(() => { if (active) setShareArtwork(null); });
    return () => { active = false; };
  }, [artist, shareArtwork]);

  const toggleFollow = async () => {
    if (!artist || followBusy) return;
    if (!libraryAuthenticated) {
      Alert.alert(
        locale === 'ar' ? 'متابعة الفنان' : 'Follow artist',
        locale === 'ar'
          ? 'سجّل الدخول إلى حساب CHC لمتابعة الفنانين.'
          : 'Sign in to your CHC account to follow artists.',
      );
      return;
    }

    setFollowBusy(true);
    try {
      const next = !followed;
      await musicService.setArtistFollowed(artist.id, next);
      setFollowed(next);
    } catch (cause) {
      Alert.alert(
        locale === 'ar' ? 'متابعة الفنان' : 'Follow artist',
        cause instanceof Error ? cause.message : 'Unable to update this artist.',
      );
    } finally {
      setFollowBusy(false);
    }
  };

  const shareArtist = async () => {
    if (!artist) return;
    await shareLink({
      title: artist.displayName,
      text: artist.biography || artist.displayName,
      url: `https://coptichymnscentre.com/music/artist/${artist.id}`,
    });
  };

  const shareImageUrl = musicService.resolveAsset(artist?.profileImageAsset ?? shareArtwork);

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => goBack(router, '/music')} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Artist</Text>
        <View style={styles.headerSpacer} />
      </View>

      {artist ? (
        <ShareMetadata
          title={artist.displayName}
          description={artist.biography || 'Listen on Coptic Hymns Centre'}
          canonicalUrl={`https://coptichymnscentre.com/music/artist/${artist.id}`}
          imageUrl={shareImageUrl}
          type="profile"
        />
      ) : null}

      {!artist ? (
        error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={COLORS.gold} style={styles.loader} />
      ) : (
        <NowPlayingAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <MusicArtwork asset={artist.profileImageAsset} size={168} rounded label={artist.displayName} />
            <Text style={styles.name}>{artist.displayName}</Text>
            {artist.biography ? <Text style={styles.bio}>{artist.biography}</Text> : null}
            <View style={styles.artistActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={followed ? 'Unfollow artist' : 'Follow artist'}
                disabled={followBusy}
                onPress={() => void toggleFollow()}
                style={({ pressed }) => [
                  styles.followButton,
                  followed && styles.followButtonActive,
                  followBusy && styles.disabledButton,
                  pressed && styles.pressed,
                ]}
              >
                {followed ? <Icon name="checkmark" size={17} color={COLORS.black} /> : null}
                <Text style={[styles.followButtonText, followed && styles.followButtonTextActive]}>
                  {followed ? (locale === 'ar' ? 'متابَع' : 'Following') : (locale === 'ar' ? 'متابعة' : 'Follow')}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share artist"
                onPress={() => void shareArtist()}
                style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
              >
                <Icon name="share-outline" size={20} color={COLORS.white} />
              </Pressable>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Releases</Text>
          <View style={styles.grid}>
            {artist.releases.map((release) => (
              <Pressable key={release.id} style={styles.releaseCard} onPress={() => router.push(`/music/release/${release.id}`)}>
                <MusicArtwork asset={release.coverAsset} size={148} label={release.title} />
                <Text numberOfLines={1} style={styles.releaseTitle}>{release.title}</Text>
                <Text numberOfLines={1} style={styles.releaseMeta}>
                  {[
                    release.releaseDate?.slice(0, 4),
                    release.releaseType === 'album' ? 'Album' : release.releaseType === 'ep' ? 'EP' : 'Single',
                  ].filter(Boolean).join(' • ')}
                </Text>
              </Pressable>
            ))}
          </View>
          {!artist.releases.length ? <Text style={styles.empty}>No published releases yet.</Text> : null}
        </NowPlayingAwareScrollView>
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
  artistActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg },
  followButton: { minHeight: 44, paddingHorizontal: SPACING.lg, borderRadius: RADII.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: COLORS.gold, borderWidth: 1, borderColor: COLORS.gold },
  followButtonActive: { backgroundColor: COLORS.goldBright },
  followButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  followButtonTextActive: { color: COLORS.black },
  shareButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  disabledButton: { opacity: 0.45 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  sectionTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700', marginHorizontal: SPACING.md, marginBottom: SPACING.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, paddingHorizontal: SPACING.md },
  releaseCard: { width: 148, paddingBottom: SPACING.sm },
  releaseTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '700', marginTop: SPACING.sm },
  releaseMeta: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 3 },
  empty: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, marginHorizontal: SPACING.md, padding: SPACING.lg, borderRadius: RADII.md, backgroundColor: COLORS.surface, textAlign: 'center' },
  loader: { marginTop: SPACING.xl },
  error: { color: COLORS.priest, textAlign: 'center', margin: SPACING.xl, fontFamily: TYPOGRAPHY.body },
});
