import { useRouter } from 'expo-router';

import MiniPlayerCard from '@/components/playback/MiniPlayerCard';
import { COLORS } from '@/constants/theme';
import { useMusicPlayer } from '@/context/MusicPlayerContext';
import { formatMusicTrackPerformers } from '@/utils/musicCredits';
import MusicArtwork from './MusicArtwork';

export default function MusicMiniPlayer() {
  const router = useRouter();
  const { currentItem, playing, buffering, togglePlayback, next, currentTimeMs, durationMs } = useMusicPlayer();

  if (!currentItem) return null;

  const artist = formatMusicTrackPerformers(currentItem.track);

  return (
    <MiniPlayerCard
      artwork={(
        <MusicArtwork
          asset={currentItem.coverAsset}
          size={44}
          radius={8}
          label={currentItem.releaseTitle ?? currentItem.track.title}
        />
      )}
      title={currentItem.track.title}
      subtitle={artist || currentItem.releaseTitle || 'Coptic Hymns Centre'}
      playing={playing}
      buffering={buffering}
      progress={durationMs > 0 ? currentTimeMs / durationMs : 0}
      accentColor={COLORS.gold}
      onOpen={() => router.push('/music/now-playing')}
      onTogglePlayback={togglePlayback}
      onNext={next}
      nextLabel="Next track"
    />
  );
}
