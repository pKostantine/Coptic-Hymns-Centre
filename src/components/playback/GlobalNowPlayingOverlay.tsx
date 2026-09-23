import { usePathname, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MusicNowPlayingScreen from '@/components/music/MusicNowPlayingScreen';
import Icon from '@/components/chc/ui/Icon';
import LearningArtwork from '@/components/learning/LearningArtwork';
import MusicArtwork from '@/components/music/MusicArtwork';
import { COLORS } from '@/constants/theme';
import { useBottomChrome } from '@/context/BottomChromeContext';
import { useAuth } from '@/context/AuthContext';
import { useLearningPlayer } from '@/context/LearningPlayerContext';
import { useMusicPlayer } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { musicService } from '@/services/musicService';
import { formatMusicTrackPerformers } from '@/utils/musicCredits';
import MiniPlayerCard from './MiniPlayerCard';

// Same small gap whether the bar floats over a tab bar or the page edge.
const FLOATING_GAP = 10;

const EXCLUDED_PATHS = new Set([
  '/calendar',
  '/season-selector',
  '/account',
  '/settings',
  '/book-settings',
  '/downloads',
  '/music/now-playing',
  '/learn/now-playing',
]);

const BOOK_PATH_PREFIXES = [
  '/',
  '/bible',
  '/psalmody',
  '/liturgy',
  '/agpeya',
  '/lectionary',
  '/veneration',
  '/bookmarks',
  '/search',
];

export default function GlobalNowPlayingOverlay() {
  const router = useRouter();
  const { user } = useAuth();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { tabBarInset, reportNowPlayingInset } = useBottomChrome();
  const { preferences } = useReadingPreferences();
  const music = useMusicPlayer();
  const learning = useLearningPlayer();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedHeight, setExpandedHeight] = useState(60);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [miniLiked, setMiniLiked] = useState(false);
  const [miniLikeBusy, setMiniLikeBusy] = useState(false);
  const [libraryAuthenticated, setLibraryAuthenticated] = useState(false);

  const currentItem = music.currentItem ?? learning.currentItem;
  const normalizedPath = pathname.replace(/\?.*$/, '');
  const isBookRoute = BOOK_PATH_PREFIXES.some((prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`));
  const isExcludedRoute = EXCLUDED_PATHS.has(normalizedPath) || EXCLUDED_PATHS.has(pathname);
  const allowDisplay = Boolean(currentItem) && !isExcludedRoute && (!isBookRoute || preferences.displayNowPlayingBar);
  const [collapseAnimation] = useState(() => new Animated.Value(isCollapsed ? 1 : 0));

  // The bar is anchored to the bottom of the page and lifted above the tab bar
  // when the focused screen has one. Animating the lift (rather than jumping
  // `bottom`) keeps it smooth when navigating between screens with and without
  // a tab bar, and a transform can run on the native driver.
  const targetLift = tabBarInset > 0 ? Math.max(0, tabBarInset - insets.bottom) : 0;
  const [liftAnimation] = useState(() => new Animated.Value(targetLift));

  useEffect(() => {
    const animation = Animated.timing(liftAnimation, {
      toValue: targetLift,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      // Moving between two screens that both have a tab bar briefly reports no
      // tab bar at all, because the outgoing bar unregisters before the
      // incoming one has measured itself. Holding the drop back for a moment
      // keeps the bar still through that hand-off; rising is immediate.
      delay: targetLift === 0 ? 140 : 0,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [liftAnimation, targetLift]);

  useEffect(() => {
    Animated.timing(collapseAnimation, {
      toValue: isCollapsed ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [collapseAnimation, isCollapsed]);

  useEffect(() => {
    // The slideshow deliberately renders underneath the floating player. The
    // player is an overlay there, not bottom chrome that changes pagination.
    // Publishing its height while slideshow mode is active creates the exact
    // full-width dead band that the collapsed button is meant to avoid.
    if (!allowDisplay || preferences.slideshowMode) {
      reportNowPlayingInset(0);
      return;
    }

    // Top-level tab screens already stop scrolling at the tab bar's top edge,
    // so only the floating card itself + its gap needs reserving there. On a
    // nested screen with no tab bar, include the device bottom safe area too.
    const safeAreaClearance = tabBarInset > 0 ? 0 : insets.bottom;
    const visibleHeight = isCollapsed ? 42 : expandedHeight;
    reportNowPlayingInset(visibleHeight + FLOATING_GAP + safeAreaClearance);

    return () => reportNowPlayingInset(0);
  }, [
    allowDisplay,
    expandedHeight,
    insets.bottom,
    isCollapsed,
    preferences.slideshowMode,
    reportNowPlayingInset,
    tabBarInset,
  ]);

  const isMusic = Boolean(music.currentItem);
  const musicTrackId = music.currentItem?.track.id ?? null;

  useEffect(() => {
    const trackId = music.currentItem?.track.id;
    if (!trackId) {
      return;
    }

    let active = true;
    musicService.getLibrary(preferences.appLanguage === 'ar' ? 'ar' : 'en')
      .then((library) => {
        if (!active) return;
        setLibraryAuthenticated(library.authenticated);
        setMiniLiked(library.likedTracks.some((track) => track.id === trackId));
      })
      .catch(() => {
        if (!active) return;
        setLibraryAuthenticated(false);
        setMiniLiked(false);
      });

    return () => { active = false; };
  }, [isPopupOpen, music.currentItem?.track.id, preferences.appLanguage, user?.id]);

  if (!allowDisplay) {
    return null;
  }

  if (isPopupOpen && isMusic) {
    return (
      <MusicNowPlayingScreen
        embedded
        onClose={() => setIsPopupOpen(false)}
      />
    );
  }

  const onOpen = isMusic
    ? () => setIsPopupOpen(true)
    : () => router.push('/learn/now-playing');
  const onTogglePlayback = isMusic ? music.togglePlayback : learning.togglePlayback;
  const onNext = isMusic ? music.next : learning.next;
  const accentColor = isMusic ? COLORS.gold : COLORS.learning;

  let title = 'Now playing';
  let titleSuffix: string | null = null;
  let subtitle = 'Coptic Hymns Centre';
  let artwork: ReactNode = null;

  if (isMusic && music.currentItem) {
    const item = music.currentItem;
    title = item.track.title;
    titleSuffix = item.releaseType === 'album' || item.releaseType === 'ep'
      ? item.releaseTitle ?? null
      : null;
    subtitle = formatMusicTrackPerformers(item.track) || 'Coptic Hymns Centre';
    artwork = (
      <MusicArtwork
        asset={item.coverAsset ?? null}
        size={44}
        radius={8}
        label={item.releaseTitle ?? item.track.title}
      />
    );
  } else if (learning.currentItem) {
    const item = learning.currentItem;
    title = item.title;
    subtitle = `${item.cantorName} · ${item.containerTitle}`;
    artwork = (
      <LearningArtwork
        asset={item.coverAsset}
        size={44}
        radius={8}
        label={item.containerTitle}
      />
    );
  }

  const overlayBottom = insets.bottom + FLOATING_GAP;
  const lift = Animated.multiply(liftAnimation, -1);

  const collapsedScale = collapseAnimation.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });
  const collapsedOpacity = collapseAnimation.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });
  const cardTranslate = collapseAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, 20] });
  const cardOpacity = collapseAnimation.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  if (isCollapsed) {
    return (
      <Animated.View
        testID="global-now-playing-collapsed"
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          right: 18,
          bottom: overlayBottom,
          width: 42,
          height: 42,
          backgroundColor: 'transparent',
          opacity: collapsedOpacity,
          transform: [{ translateY: lift }, { scale: collapsedScale }],
          zIndex: 40,
          elevation: 40,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show now playing"
          onPress={() => setIsCollapsed(false)}
          style={styles.collapsedButton}
        >
          <Icon name="chevron-down" size={18} color={COLORS.white} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      onLayout={(event) => {
        const height = Math.max(0, Math.round(event.nativeEvent.layout.height));
        if (height > 0) setExpandedHeight(height);
      }}
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: overlayBottom,
        zIndex: 40,
        elevation: 40,
        opacity: cardOpacity,
        transform: [{ translateY: Animated.add(lift, cardTranslate) }],
      }}
    >
      <MiniPlayerCard
        artwork={artwork}
        title={title}
        titleSuffix={titleSuffix}
        subtitle={subtitle}
        liked={isMusic ? miniLiked : undefined}
        likeBusy={isMusic ? miniLikeBusy : undefined}
        onToggleLike={isMusic && musicTrackId ? async () => {
          if (miniLikeBusy) return;
          if (!libraryAuthenticated) {
            Alert.alert(
              preferences.appLanguage === 'ar' ? 'الأغاني المعجبة' : 'Liked Songs',
              preferences.appLanguage === 'ar'
                ? 'سجّل الدخول إلى حساب CHC لحفظ الأغاني المعجبة.'
                : 'Sign in to your CHC account to save Liked Songs.',
            );
            return;
          }
          setMiniLikeBusy(true);
          try {
            const nextLiked = !miniLiked;
            await musicService.setLiked(musicTrackId, nextLiked);
            setMiniLiked(nextLiked);
          } catch (cause) {
            Alert.alert(
              preferences.appLanguage === 'ar' ? 'الأغاني المعجبة' : 'Liked Songs',
              cause instanceof Error ? cause.message : 'Unable to update Liked Songs.',
            );
          } finally {
            setMiniLikeBusy(false);
          }
        } : undefined}
        playing={isMusic ? music.playing : learning.playing}
        buffering={isMusic ? music.buffering : learning.buffering}
        progress={isMusic
          ? (music.durationMs > 0 ? music.currentTimeMs / music.durationMs : 0)
          : (learning.durationMs > 0 ? learning.currentTimeMs / learning.durationMs : 0)}
        accentColor={accentColor}
        onOpen={onOpen}
        onTogglePlayback={onTogglePlayback}
        onNext={onNext}
        onHide={() => setIsCollapsed(true)}
        nextLabel={isMusic ? 'Next track' : 'Next lesson'}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 40,
    elevation: 40,
  },
  collapsedButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gold,
    zIndex: 40,
    elevation: 40,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
