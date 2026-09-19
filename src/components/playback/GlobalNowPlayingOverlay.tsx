import { usePathname, useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
  '/app-settings',
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
  const hasBottomTabBar = ['/', '/music', '/learn', '/search', '/app-settings'].includes(normalizedPath)
    || normalizedPath.startsWith('/music/')
    || normalizedPath.startsWith('/learn/');
  const isBookRoute = BOOK_PATH_PREFIXES.some((prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`));
  const isExcludedRoute = EXCLUDED_PATHS.has(normalizedPath) || EXCLUDED_PATHS.has(pathname);
  const allowDisplay = Boolean(currentItem) && !isExcludedRoute && (!isBookRoute || preferences.displayNowPlayingBar);

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

  const overlayBottom = hasBottomTabBar ? 88 + insets.bottom : 18 + insets.bottom;

  if (isCollapsed) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show now playing"
        onPress={() => setIsCollapsed(false)}
        style={[styles.collapsedButton, { bottom: overlayBottom }]}
      >
        <Icon name="chevron-down" size={18} color={COLORS.white} style={{ transform: [{ rotate: '180deg' }] }} />
      </Pressable>
    );
  }

  return (
    <View pointerEvents="box-none" style={[styles.container, { bottom: overlayBottom }]}>
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
    </View>
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
