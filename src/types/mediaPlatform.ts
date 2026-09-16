export type AppRole = 'user' | 'creator' | 'admin';

export type CreatorAccountStatus = 'active' | 'suspended' | 'archived';

export type CreatorAccountRole = 'owner' | 'manager' | 'editor' | 'uploader' | 'viewer';

export type MediaProvider = 'cloudflare_r2' | 'external';

export type MediaType = 'audio' | 'video' | 'image' | 'document' | 'other';

export type MediaProcessingStatus = 'pending' | 'uploaded' | 'queued' | 'processing' | 'completed' | 'failed';

export type UploadIntentStatus = 'authorized' | 'uploaded' | 'failed' | 'expired' | 'cancelled';

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
