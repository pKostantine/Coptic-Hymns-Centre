export type AppRole = 'user' | 'creator' | 'admin';

export type CreatorAccountStatus = 'active' | 'suspended' | 'archived';

export type CreatorAccountRole = 'owner' | 'manager' | 'editor' | 'uploader' | 'viewer';

export type MediaProvider = 'cloudflare_r2' | 'external';

export type MediaType = 'audio' | 'video' | 'image' | 'document' | 'other';

export type MediaProcessingStatus = 'pending' | 'uploaded' | 'queued' | 'processing' | 'completed' | 'failed';

export type UploadIntentStatus = 'authorized' | 'uploaded' | 'failed' | 'expired' | 'cancelled';

export type MediaProcessingJobType = 'audio_delivery' | 'video_delivery' | 'metadata_probe';

export type MediaProcessingJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type MediaSubmissionType =
  | 'music_release'
  | 'learning_album'
  | 'learning_lesson_set'
  | 'artist_update'
  | 'cantor_update';

export type PublicationStatus =
  | 'draft'
  | 'uploading'
  | 'ready_to_submit'
  | 'pending_review'
  | 'changes_requested'
  | 'approved'
  | 'processing'
  | 'published'
  | 'rejected'
  | 'archived';

export type MediaSubmissionStatus = Exclude<PublicationStatus, 'archived'>;

export type MusicReleaseType = 'single' | 'ep' | 'album';

export type MusicTrackArtistRole = 'primary' | 'featured' | 'composer' | 'lyricist' | 'arranger' | 'producer';

export type MusicPlaylistVisibility = 'private' | 'unlisted' | 'public';

export type MusicLyricKind = 'original' | 'translation' | 'transliteration';

export type MusicLyricSyncPrecision = 'unsynced' | 'line' | 'word';

export type KnownLocaleCode = 'en' | 'ar' | 'cop' | 'fr';

export type LocaleCode = KnownLocaleCode | (string & {});

export type TextDirection = 'ltr' | 'rtl';

export interface TimestampFields {
  created_at: string;
  updated_at: string;
}

export interface UserAuditFields {
  created_by: string | null;
  updated_by: string | null;
}

export interface CreatorProfile extends TimestampFields {
  id: string;
  display_name: string | null;
  preferred_locale: LocaleCode;
}

export interface UserRole {
  user_id: string;
  role: AppRole;
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
  notes: string | null;
}

export interface CreatorAccount extends TimestampFields, UserAuditFields {
  id: string;
  display_name: string;
  status: CreatorAccountStatus;
}

export interface CreatorAccountMember extends TimestampFields {
  creator_account_id: string;
  user_id: string;
  role: CreatorAccountRole;
  invited_by: string | null;
}

export interface MediaLocale extends TimestampFields {
  code: LocaleCode;
  english_name: string;
  native_name: string;
  text_direction: TextDirection;
  enabled: boolean;
  sort_order: number;
}

export interface MediaAssetReference {
  provider: MediaProvider;
  bucket: string;
  path: string;
}

export interface MediaAsset extends TimestampFields, UserAuditFields, MediaAssetReference {
  id: string;
  owner_creator_account_id: string | null;
  media_type: MediaType;
  mime_type: string | null;
  codec: string | null;
  duration_ms: number | null;
  file_size_bytes: number | null;
  bitrate: number | null;
  sample_rate: number | null;
  width: number | null;
  height: number | null;
  version: number;
  checksum: string | null;
  processing_status: MediaProcessingStatus;
  publication_status: PublicationStatus;
  metadata: Record<string, unknown>;
}

export interface MediaAssetVersion extends MediaAssetReference {
  id: string;
  media_asset_id: string;
  version: number;
  mime_type: string | null;
  codec: string | null;
  duration_ms: number | null;
  file_size_bytes: number | null;
  bitrate: number | null;
  sample_rate: number | null;
  width: number | null;
  height: number | null;
  checksum: string | null;
  processing_status: MediaProcessingStatus;
  created_by: string | null;
  created_at: string;
}

export interface MediaUploadIntent extends TimestampFields {
  id: string;
  creator_account_id: string;
  requested_by: string;
  bucket: 'chc-submissions';
  path: string;
  media_type: MediaType;
  original_filename: string;
  content_type: string;
  content_length: number;
  checksum_sha256: string | null;
  status: UploadIntentStatus;
  upload_expires_at: string;
  uploaded_size: number | null;
  r2_http_etag: string | null;
  uploaded_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  error_message: string | null;
}

export interface CreateMediaUploadIntentInput {
  creatorAccountId: string;
  originalFilename: string;
  contentType: string;
  contentLength: number;
  mediaType?: Extract<MediaType, 'audio' | 'video' | 'image'>;
  checksumSha256?: string | null;
}

export interface AuthorizedMediaUpload {
  uploadIntentId: string;
  bucket: 'chc-submissions';
  objectPath: string;
  uploadUrl: string;
  expiresAt: string;
  contentType: string;
  contentLength: number;
  mediaType: MediaType;
}

export interface CompletedMediaUpload {
  uploadIntentId: string;
  status: Extract<UploadIntentStatus, 'uploaded'>;
  bucket: 'chc-submissions';
  objectPath: string;
  uploadedAt: string;
}

export interface MediaProcessingJob extends TimestampFields {
  id: string;
  upload_intent_id: string | null;
  media_asset_id: string | null;
  media_asset_version_id: string | null;
  job_type: MediaProcessingJobType;
  status: MediaProcessingJobStatus;
  attempt_count: number;
  max_attempts: number;
  worker_id: string | null;
  input_bucket: 'chc-submissions' | 'chc-masters';
  input_path: string;
  output_bucket: 'chc-masters' | 'chc-music' | 'chc-learning' | 'chc-images';
  output_path: string | null;
  output_mime_type: string | null;
  output_size_bytes: number | null;
  output_checksum_sha256: string | null;
  probe: Record<string, unknown>;
  error_message: string | null;
  queued_at: string;
  available_at: string;
  claimed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface MediaSubmission extends TimestampFields, UserAuditFields {
  id: string;
  creator_account_id: string;
  submission_type: MediaSubmissionType;
  title: string;
  description: string | null;
  status: MediaSubmissionStatus;
  submitted_at: string | null;
  review_due_at: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  approved_at: string | null;
  published_at: string | null;
  rejected_at: string | null;
}

export interface MediaSubmissionItem extends TimestampFields {
  id: string;
  submission_id: string;
  upload_intent_id: string | null;
  media_asset_id: string | null;
  media_processing_job_id: string | null;
  title: string | null;
  sort_order: number;
  required: boolean;
}

export interface MediaSubmissionEvent {
  id: string;
  submission_id: string;
  actor_id: string | null;
  action: string;
  from_status: MediaSubmissionStatus | null;
  to_status: MediaSubmissionStatus | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MusicArtist extends TimestampFields, UserAuditFields {
  id: string;
  owner_creator_account_id: string | null;
  profile_image_asset_id: string | null;
  display_name: string;
  sort_name: string | null;
  biography: string | null;
  publication_status: PublicationStatus;
  metadata: Record<string, unknown>;
}

export interface MusicArtistLocalization extends TimestampFields, UserAuditFields {
  id: string;
  artist_id: string;
  locale: LocaleCode;
  display_name: string;
  sort_name: string | null;
  biography: string | null;
  is_primary: boolean;
  publication_status: PublicationStatus;
}

export interface MusicArtistMembership extends TimestampFields {
  id: string;
  artist_id: string;
  creator_account_id: string;
  role: string;
}

export interface MusicRelease extends TimestampFields, UserAuditFields {
  id: string;
  owner_creator_account_id: string | null;
  primary_artist_id: string | null;
  cover_asset_id: string | null;
  release_type: MusicReleaseType;
  title: string;
  subtitle: string | null;
  description: string | null;
  release_date: string | null;
  publication_status: PublicationStatus;
  metadata: Record<string, unknown>;
}

export interface MusicReleaseLocalization extends TimestampFields, UserAuditFields {
  id: string;
  release_id: string;
  locale: LocaleCode;
  title: string;
  subtitle: string | null;
  description: string | null;
  is_primary: boolean;
  publication_status: PublicationStatus;
}

export interface MusicTrack extends TimestampFields, UserAuditFields {
  id: string;
  owner_creator_account_id: string | null;
  media_asset_id: string | null;
  title: string;
  subtitle: string | null;
  duration_ms: number | null;
  publication_status: PublicationStatus;
  metadata: Record<string, unknown>;
}

export interface MusicTrackLocalization extends TimestampFields, UserAuditFields {
  id: string;
  track_id: string;
  locale: LocaleCode;
  title: string;
  subtitle: string | null;
  is_primary: boolean;
  publication_status: PublicationStatus;
}

export interface MusicReleaseTrack {
  id: string;
  release_id: string;
  track_id: string;
  disc_number: number;
  track_number: number;
  created_at: string;
}

export interface MusicTrackArtist {
  track_id: string;
  artist_id: string;
  role: MusicTrackArtistRole;
  sort_order: number;
  created_at: string;
}

export interface MusicTrackLike {
  user_id: string;
  track_id: string;
  created_at: string;
}

export interface MusicArtistFollow {
  user_id: string;
  artist_id: string;
  created_at: string;
}

export interface MusicPlaylist extends TimestampFields {
  id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  visibility: MusicPlaylistVisibility;
  cover_asset_id: string | null;
}

export interface MusicPlaylistTrack {
  playlist_id: string;
  track_id: string;
  sort_order: number;
  added_by: string | null;
  created_at: string;
}

export interface MusicPlayHistory {
  id: string;
  user_id: string;
  track_id: string;
  media_asset_id: string | null;
  played_at: string;
  progress_ms: number | null;
  completed: boolean;
}

export interface MusicLyricSet extends TimestampFields, UserAuditFields {
  id: string;
  track_id: string;
  locale: LocaleCode;
  kind: MusicLyricKind;
  sync_precision: MusicLyricSyncPrecision;
  title: string | null;
  source: string | null;
  publication_status: PublicationStatus;
  metadata: Record<string, unknown>;
}

export interface MusicLyricLine extends TimestampFields {
  id: string;
  lyric_set_id: string;
  sequence: number;
  start_ms: number | null;
  end_ms: number | null;
  text: string;
}

export interface MusicLyricWord extends TimestampFields {
  id: string;
  lyric_line_id: string;
  sequence: number;
  start_ms: number | null;
  end_ms: number | null;
  text: string;
}

export interface PublishedMusicReleaseTrack {
  id: string;
  title: string;
  subtitle: string | null;
  discNumber: number;
  trackNumber: number;
  durationMs: number | null;
  mediaAsset: MediaAssetReference & {
    id: string;
    mimeType: string | null;
    fileSizeBytes: number | null;
    checksum: string | null;
  };
  artists: Array<{
    id: string;
    displayName: string;
    role: MusicTrackArtistRole;
    sortOrder: number;
  }>;
}

export interface PublishedMusicRelease {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  releaseType: MusicReleaseType;
  releaseDate: string | null;
  publicationStatus: Extract<PublicationStatus, 'published'>;
  primaryArtist: {
    id: string;
    displayName: string;
    profileImageAssetId: string | null;
  } | null;
  tracks: PublishedMusicReleaseTrack[];
}

export interface PublishedMusicLyricWord {
  id: string;
  sequence: number;
  startMs: number | null;
  endMs: number | null;
  text: string;
}

export interface PublishedMusicLyricLine {
  id: string;
  sequence: number;
  startMs: number | null;
  endMs: number | null;
  text: string;
  words: PublishedMusicLyricWord[];
}

export interface PublishedMusicLyricSet {
  id: string;
  trackId: string;
  locale: LocaleCode;
  kind: MusicLyricKind;
  syncPrecision: MusicLyricSyncPrecision;
  title: string | null;
  source: string | null;
  publicationStatus: Extract<PublicationStatus, 'published'>;
  lines: PublishedMusicLyricLine[];
}

export interface PublishedTrackLyrics {
  trackId: string;
  lyricSets: PublishedMusicLyricSet[];
}

export interface LocalizedText extends TimestampFields, UserAuditFields {
  id: string;
  owner_creator_account_id: string | null;
  entity_type: string;
  entity_id: string;
  field_name: string;
  locale: LocaleCode;
  text_value: string;
  is_primary: boolean;
  publication_status: PublicationStatus;
}

export interface SearchDocument extends TimestampFields {
  id: string;
  owner_creator_account_id: string | null;
  entity_type: string;
  entity_id: string;
  locale: LocaleCode | null;
  kind: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  alias_text: string | null;
  normalized_text: string | null;
  search_vector: unknown | null;
  publication_status: PublicationStatus;
}

export interface SearchAlias extends TimestampFields, UserAuditFields {
  id: string;
  owner_creator_account_id: string | null;
  entity_type: string;
  entity_id: string;
  locale: LocaleCode | null;
  alias: string;
  normalized_alias: string | null;
  publication_status: PublicationStatus;
}

export type LocalizedFieldMap<T extends string = string> = Partial<Record<LocaleCode, Partial<Record<T, string>>>>;

export const MEDIA_SCHEMA_BOUNDARIES = {
  creator: 'profiles, app roles, creator accounts, and creator account membership',
  media: 'canonical media asset references, localization scaffolding, and shared search records',
  private: 'RLS helper functions and trigger utilities; not part of the public API surface',
} as const;
