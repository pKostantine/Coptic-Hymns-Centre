import MusicArtwork from '@/components/music/MusicArtwork';
import type { MusicConsumerAsset } from '@/types/musicConsumer';

/**
 * Artist artwork is always a profile portrait: circular, never album-shaped.
 * Use this component anywhere a music artist identity is shown with artwork.
 */
export default function MusicArtistArtwork({
  asset,
  size,
  label,
}: {
  asset?: MusicConsumerAsset | null;
  size: number;
  label?: string;
}) {
  return <MusicArtwork asset={asset} size={size} rounded label={label} />;
}
