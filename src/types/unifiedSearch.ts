import type { MediaAssetReference, MusicReleaseType } from '@/types/mediaPlatform';

export type UnifiedSearchScope = 'all' | 'music' | 'learning';

export type UnifiedSearchKind =
  | 'music_artist'
  | 'music_release'
  | 'music_track'
  | 'learning_cantor'
  | 'learning_season'
  | 'learning_hymn'
  | 'learning_album'
  | 'learning_lesson';

export type UnifiedSearchMatch =
  | 'title_exact'
  | 'alias_exact'
  | 'title_prefix'
  | 'alias'
  | 'full_text'
  | 'substring'
  | 'similarity';

export interface UnifiedSearchAsset extends MediaAssetReference {
  id: string;
  mimeType?: string | null;
}

interface UnifiedSearchResultBase<
  Kind extends UnifiedSearchKind,
  Domain extends 'music' | 'learning',
  Metadata,
> {
  domain: Domain;
  kind: Kind;
  entityId: string;
  title: string;
  subtitle: string | null;
  body: string | null;
  metadata: Metadata;
  matchedBy: UnifiedSearchMatch;
  matchedLocale: string;
  displayLocale: string;
  rank: number;
}

export interface UnifiedSearchImageMetadata {
  profileImageAsset: UnifiedSearchAsset | null;
}

export interface UnifiedSearchReleaseMetadata {
  releaseType: MusicReleaseType;
  releaseDate: string | null;
  primaryArtist: { id: string; displayName: string } | null;
  coverAsset: UnifiedSearchAsset | null;
}

export interface UnifiedSearchTrackMetadata {
  durationMs: number | null;
  releaseId: string | null;
  releaseTitle: string | null;
  coverAsset: UnifiedSearchAsset | null;
  mediaAsset: UnifiedSearchAsset;
  artists: { id: string; displayName: string; role: string; sortOrder: number }[];
}

export interface UnifiedSearchSeasonMetadata {
  slug: string;
  sortOrder: number;
}

export interface UnifiedSearchHymnMetadata {
  sourceHymnKey: string | null;
}

export interface UnifiedSearchAlbumMetadata {
  cantorId: string;
  cantorName: string;
  seasonId: string | null;
  coverAsset: UnifiedSearchAsset | null;
}

export interface UnifiedSearchLessonMetadata {
  mediaType: 'audio' | 'video';
  durationMs: number | null;
  mediaAsset: UnifiedSearchAsset;
  lessonSetId: string;
  lessonSetTitle: string;
  cantorId: string;
  cantorName: string;
  hymnId: string;
  coverAsset: UnifiedSearchAsset | null;
}

export type UnifiedSearchResult =
  | UnifiedSearchResultBase<'music_artist', 'music', UnifiedSearchImageMetadata>
  | UnifiedSearchResultBase<'music_release', 'music', UnifiedSearchReleaseMetadata>
  | UnifiedSearchResultBase<'music_track', 'music', UnifiedSearchTrackMetadata>
  | UnifiedSearchResultBase<'learning_cantor', 'learning', UnifiedSearchImageMetadata>
  | UnifiedSearchResultBase<'learning_season', 'learning', UnifiedSearchSeasonMetadata>
  | UnifiedSearchResultBase<'learning_hymn', 'learning', UnifiedSearchHymnMetadata>
  | UnifiedSearchResultBase<'learning_album', 'learning', UnifiedSearchAlbumMetadata>
  | UnifiedSearchResultBase<'learning_lesson', 'learning', UnifiedSearchLessonMetadata>;

export interface UnifiedSearchPayload {
  query: string;
  normalizedQuery: string;
  scope: UnifiedSearchScope;
  results: UnifiedSearchResult[];
}
