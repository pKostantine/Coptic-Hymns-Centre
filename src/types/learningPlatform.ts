import type { MediaAssetReference } from '@/types/mediaPlatform';

export type LearningLessonMediaType = 'audio' | 'video';
export type LearningProgressState = 'will_learn' | 'learning' | 'finished';
export type LearningPlaylistVisibility = 'private' | 'unlisted' | 'public';
export type LearningPlaylistItemKind = 'album_recording' | 'lesson';

export interface LearningMediaAsset extends MediaAssetReference {
  id: string;
  mimeType?: string | null;
  durationMs?: number | null;
  fileSizeBytes?: number | null;
  checksum?: string | null;
}

export interface LearningCantorSummary {
  id: string;
  displayName: string;
  biography: string | null;
  profileImageAsset: LearningMediaAsset | null;
}

export interface LearningSeasonSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  sortOrder?: number;
}

export interface LearningHymnSummary {
  id: string;
  sourceHymnKey: string | null;
  title: string;
  subtitle: string | null;
}

export interface LearningAlbumSummary {
  id: string;
  title: string;
  description?: string | null;
  cantorId?: string;
  seasonId?: string | null;
}

export interface LearningAlbumRecording {
  id: string;
  title: string;
  subtitle: string | null;
  durationMs: number | null;
  sortOrder: number;
  hymnId: string | null;
  mediaAsset: LearningMediaAsset;
}

export interface LearningAlbumDetail {
  id: string;
  title: string;
  description: string | null;
  cantor: Pick<LearningCantorSummary, 'id' | 'displayName'>;
  season: Pick<LearningSeasonSummary, 'id' | 'slug' | 'title'> | null;
  coverAsset: LearningMediaAsset | null;
  recordings: LearningAlbumRecording[];
}

export interface LearningLessonSetSummary {
  id: string;
  title: string;
  description?: string | null;
  cantorId?: string;
  seasonId?: string | null;
  hymnId: string;
}

export interface LearningLesson {
  id: string;
  mediaType: LearningLessonMediaType;
  title: string;
  description: string | null;
  durationMs: number | null;
  sortOrder: number;
  mediaAsset: LearningMediaAsset;
}

export interface LearningLessonSetDetail {
  id: string;
  title: string;
  description: string | null;
  cantor: Pick<LearningCantorSummary, 'id' | 'displayName'>;
  season: Pick<LearningSeasonSummary, 'id' | 'slug' | 'title'> | null;
  hymn: LearningHymnSummary;
  coverAsset: LearningMediaAsset | null;
  lessons: LearningLesson[];
}

export interface LearningCantorDetail extends LearningCantorSummary {
  albums: LearningAlbumSummary[];
  lessonSets: LearningLessonSetSummary[];
}

export interface LearningSeasonDetail extends Omit<LearningSeasonSummary, 'sortOrder'> {
  hymns: Array<LearningHymnSummary & { sortOrder: number }>;
  albums: LearningAlbumSummary[];
  lessonSets: LearningLessonSetSummary[];
}

export interface LearningRelatedHymn extends LearningHymnSummary {
  relationshipType: string;
}

export interface LearningHymnDetail extends LearningHymnSummary {
  description: string | null;
  seasons: Array<Pick<LearningSeasonSummary, 'id' | 'slug' | 'title'> & { sortOrder: number }>;
  relatedHymns: LearningRelatedHymn[];
  lessonSets: LearningLessonSetSummary[];
}

export interface LearningHomePayload {
  cantors: LearningCantorSummary[];
  seasons: LearningSeasonSummary[];
}

export interface LearningProgressItem {
  hymnId: string;
  state: LearningProgressState;
  title: string;
  subtitle: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export interface LearningProgressPayload {
  authenticated: boolean;
  items: LearningProgressItem[];
}

export interface LearningPlaylistSummary {
  id: string;
  name: string;
  description: string | null;
  visibility: LearningPlaylistVisibility;
  itemCount: number;
}

export interface LearningPlaylistRecordingItem {
  id: string;
  kind: 'album_recording';
  sortOrder: number;
  recording: LearningAlbumRecording & {
    albumId: string;
    albumTitle: string;
  };
}

export interface LearningPlaylistLessonItem {
  id: string;
  kind: 'lesson';
  sortOrder: number;
  lesson: Omit<LearningLesson, 'sortOrder'> & {
    lessonSetId: string;
    lessonSetTitle: string;
  };
}

export type LearningPlaylistItem = LearningPlaylistRecordingItem | LearningPlaylistLessonItem;

export interface LearningPlaylistDetail {
  id: string;
  name: string;
  description: string | null;
  visibility: LearningPlaylistVisibility;
  items: LearningPlaylistItem[];
}

export interface LearningPlaylistLibraryPayload {
  authenticated: boolean;
  playlists: LearningPlaylistSummary[];
}
