import type { MusicConsumerTrack, MusicConsumerTrackArtist } from '@/types/musicConsumer';

function performerCredits(artists: MusicConsumerTrackArtist[]): MusicConsumerTrackArtist[] {
  const seen = new Set<string>();

  return [...artists]
    .filter((artist) => artist.role === 'primary' || artist.role === 'featured')
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .filter((artist) => {
      const key = artist.id || artist.displayName.trim().toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Consumer-facing performer line for a track.
 *
 * CHC Artists stores the main artist first and featured performers after it,
 * with sortOrder preserving the exact submission order. Composer, lyricist,
 * producer, arranger, and artwork credits remain available as credits but do
 * not belong in the track's "performed by" line.
 */
export function formatMusicTrackPerformers(
  track: Pick<MusicConsumerTrack, 'artists'>,
  fallback = '',
): string {
  const performers = performerCredits(track.artists)
    .map((artist) => artist.displayName.trim())
    .filter(Boolean);

  if (performers.length) return performers.join(', ');

  return [...track.artists]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((artist) => artist.displayName.trim())
    .find(Boolean) ?? fallback;
}
