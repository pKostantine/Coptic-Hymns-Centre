import type { MediaAssetReference, MusicLyricKind, MusicLyricSyncPrecision, MusicPlaylistVisibility, MusicReleaseType } from '@/types/mediaPlatform';

export interface MusicConsumerAsset extends MediaAssetReference {
  id: string;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  checksum?: string | null;
  version?: number | null;
}

export interface MusicConsumerArtistSummary {
  id: string;
  displayName: string;
  biography?: string | null;
  profileImageAsset?: MusicConsumerAsset | null;
}

export interface MusicConsumerReleaseSummary {
  id: string;
  title: string;
  subtitle: string | null;
  releaseType: MusicReleaseType;
  releaseDate: string | null;
  musicType?: string | null;
  recordingType?: string | null;
  primaryArtist?: Pick<MusicConsumerArtistSummary, 'id' | 'displayName'> | null;
  coverAsset?: MusicConsumerAsset | null;
}

export interface MusicConsumerTrackArtist {
  id: string;
  displayName: string;
  role: string;
  sortOrder: number;
}

export interface MusicConsumerTrack {
  id: string;
  title: string;
  subtitle: string | null;
  durationMs: number | null;
  discNumber?: number;
  trackNumber?: number;
  releaseId?: string | null;
  /** Cover artwork for the published release selected by `releaseId`. */
  releaseCoverAsset?: MusicConsumerAsset | null;
  mediaAsset: MusicConsumerAsset;
  artists: MusicConsumerTrackArtist[];
}

export interface MusicConsumerRelease extends MusicConsumerReleaseSummary {
  description: string | null;
  publicationStatus: string;
  tracks: MusicConsumerTrack[];
}

export interface MusicConsumerTrackDetail extends MusicConsumerTrack {
  release: MusicConsumerReleaseSummary | null;
}

export interface MusicConsumerArtist extends MusicConsumerArtistSummary {
  releases: MusicConsumerReleaseSummary[];
}

export interface MusicHomePayload {
  latestReleases: MusicConsumerReleaseSummary[];
  artists: MusicConsumerArtistSummary[];
}

export interface MusicSearchPayload {
  artists: MusicConsumerArtistSummary[];
  releases: MusicConsumerReleaseSummary[];
  tracks: MusicConsumerTrack[];
}

export interface MusicLibraryPlaylist {
  id: string;
  name: string;
  description: string | null;
  visibility: MusicPlaylistVisibility;
  trackCount: number;
  coverAsset: MusicConsumerAsset | null;
}

export interface MusicLibraryPayload {
  authenticated: boolean;
  followedArtists: MusicConsumerArtistSummary[];
  likedReleases: MusicConsumerReleaseSummary[];
  likedTracks: MusicConsumerTrack[];
  playlists: MusicLibraryPlaylist[];
  recentTracks: MusicRecentTrack[];
  recentReleases: MusicRecentRelease[];
}

export interface MusicRecentTrack {
  playedAt: string;
  track: MusicConsumerTrack;
  release: MusicConsumerReleaseSummary | null;
}

export interface MusicRecentRelease extends MusicConsumerReleaseSummary {
  playedAt: string;
}

export interface MusicPlaylistPayload {
  id: string;
  name: string;
  description: string | null;
  visibility: MusicPlaylistVisibility;
  ownerUserId: string | null;
  isOwner: boolean;
  hasCustomCover: boolean;
  coverAsset: MusicConsumerAsset | null;
  tracks: MusicConsumerTrack[];
}

export interface PublishedLyricWord {
  id: string;
  sequence: number;
  startMs: number | null;
  endMs: number | null;
  text: string;
}

export interface PublishedLyricLine {
  id: string;
  sequence: number;
  startMs: number | null;
  endMs: number | null;
  text: string;
  words: PublishedLyricWord[];
}

export interface PublishedLyricSet {
  id: string;
  trackId: string;
  locale: string;
  kind: MusicLyricKind;
  syncPrecision: MusicLyricSyncPrecision;
  title: string | null;
  source: string | null;
  publicationStatus: string;
  lines: PublishedLyricLine[];
}

export interface PublishedTrackLyricsPayload {
  trackId: string;
  lyricSets: PublishedLyricSet[];
}
