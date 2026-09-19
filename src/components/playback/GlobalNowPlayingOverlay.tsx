import { usePathname, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '@/components/chc/ui/Icon';
import LearningArtwork from '@/components/learning/LearningArtwork';
import MusicArtwork from '@/components/music/MusicArtwork';
import { COLORS } from '@/constants/theme';
import { useLearningPlayer } from '@/context/LearningPlayerContext';
import { useMusicPlayer } from '@/context/MusicPlayerContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { formatMusicTrackPerformers } from '@/utils/musicCredits';
import MiniPlayerCard from './MiniPlayerCard';

const EXCLUDED_PATHS = new Set([
  '/calendar',
  '/season-selector',
  '/settings',
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
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { preferences } = useReadingPreferences();
  const music = useMusicPlayer();
  const learning = useLearningPlayer();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const currentItem = music.currentItem ?? learning.currentItem;
  const normalizedPath = pathname.replace(/\?.*$/, '');
  const isBookRoute = BOOK_PATH_PREFIXES.some((prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`));
  const isExcludedRoute = EXCLUDED_PATHS.has(normalizedPath) || EXCLUDED_PATHS.has(pathname);
  const allowDisplay = Boolean(currentItem) && !isExcludedRoute && (!isBookRoute || preferences.displayNowPlayingBar);
  const collapseAnimation = useRef(new Animated.Value(isCollapsed ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(collapseAnimation, {
      toValue: isCollapsed ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [collapseAnimation, isCollapsed]);

  if (!allowDisplay) {
    return null;
  }

  const isMusic = Boolean(music.currentItem);
  const onOpen = isMusic ? () => router.push('/music/now-playing') : () => router.push('/learn/now-playing');
  const onTogglePlayback = isMusic ? music.togglePlayback : learning.togglePlayback;
  const onNext = isMusic ? music.next : learning.next;
  const accentColor = isMusic ? COLORS.gold : COLORS.learning;

  let title = 'Now playing';
  let subtitle = 'Coptic Hymns Centre';
  let artwork: ReactNode = null;

  if (isMusic && music.currentItem) {
    const item = music.currentItem;
    title = item.track.title;
    subtitle = formatMusicTrackPerformers(item.track) || item.releaseTitle || 'Coptic Hymns Centre';
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

  const overlayBottom = 18 + insets.bottom;

  const collapsedScale = collapseAnimation.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });
  const collapsedOpacity = collapseAnimation.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });
  const cardTranslate = collapseAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, 20] });
  const cardOpacity = collapseAnimation.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  if (isCollapsed) {
    return (
      <Animated.View
        style={{
          position: 'absolute',
          right: 18,
          bottom: overlayBottom,
          opacity: collapsedOpacity,
          transform: [{ scale: collapsedScale }],
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
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: overlayBottom,
        zIndex: 40,
        elevation: 40,
        opacity: cardOpacity,
        transform: [{ translateY: cardTranslate }],
      }}
    >
      <MiniPlayerCard
        artwork={artwork}
        title={title}
        subtitle={subtitle}
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
    position: 'absolute',
    right: 18,
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
