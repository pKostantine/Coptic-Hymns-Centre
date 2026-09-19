import { useRouter } from 'expo-router';

import MiniPlayerCard from '@/components/playback/MiniPlayerCard';
import { COLORS } from '@/constants/theme';
import { useLearningPlayer } from '@/context/LearningPlayerContext';
import LearningArtwork from './LearningArtwork';

export default function LearningMiniPlayer() {
  const router = useRouter();
  const {
    currentItem,
    playing,
    buffering,
    togglePlayback,
    next,
    currentTimeMs,
    durationMs,
  } = useLearningPlayer();

  if (!currentItem) return null;

  return (
    <MiniPlayerCard
      artwork={(
        <LearningArtwork
          asset={currentItem.coverAsset}
          size={44}
          radius={8}
          label={currentItem.containerTitle}
        />
      )}
      title={currentItem.title}
      subtitle={`${currentItem.cantorName} · ${currentItem.containerTitle}`}
      playing={playing}
      buffering={buffering}
      progress={durationMs > 0 ? currentTimeMs / durationMs : 0}
      accentColor={COLORS.learning}
      onOpen={() => router.push('/learn/now-playing')}
      onTogglePlayback={togglePlayback}
      onNext={next}
      nextLabel="Next lesson"
    />
  );
}
