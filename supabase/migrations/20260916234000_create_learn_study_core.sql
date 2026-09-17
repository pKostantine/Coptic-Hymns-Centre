create schema if not exists learning;

grant usage on schema learning to anon, authenticated;

create type learning.lesson_media_type as enum ('audio', 'video');
create type learning.progress_state as enum ('will_learn', 'learning', 'finished');
create type learning.playlist_visibility as enum ('private', 'unlisted', 'public');
create type learning.playlist_item_kind as enum ('album_recording', 'lesson');

create table learning.cantors (
  id uuid primary key default gen_random_uuid(),
  owner_creator_account_id uuid references creator.creator_accounts(id) on delete set null,
  profile_image_asset_id uuid references media.media_assets(id) on delete set null,
  display_name text not null check (length(trim(display_name)) > 0),
  sort_name text,
  biography text,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table learning.cantor_localizations (
  cantor_id uuid not null references learning.cantors(id) on delete cascade,
  locale text not null references media.locales(code) on update cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  biography text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (cantor_id, locale)
);

create table learning.cantor_permissions (
  id uuid primary key default gen_random_uuid(),
  cantor_id uuid not null references learning.cantors(id) on delete cascade,
  creator_account_id uuid not null references creator.creator_accounts(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'uploader')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cantor_id, creator_account_id)
);

create table learning.seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  title text not null check (length(trim(title)) > 0),
  description text,
  sort_order integer not null default 0,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table learning.season_localizations (
  season_id uuid not null references learning.seasons(id) on delete cascade,
  locale text not null references media.locales(code) on update cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_id, locale)
);

create table learning.hymns (
  id uuid primary key default gen_random_uuid(),
  source_hymn_key text references public.hymn_titles(hymn_key) on update cascade on delete set null,
  title text not null check (length(trim(title)) > 0),
  subtitle text,
  description text,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_hymn_key)
);

create table learning.hymn_localizations (
  hymn_id uuid not null references learning.hymns(id) on delete cascade,
  locale text not null references media.locales(code) on update cascade,
  title text not null check (length(trim(title)) > 0),
  subtitle text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (hymn_id, locale)
);

create table learning.hymn_seasons (
  hymn_id uuid not null references learning.hymns(id) on delete cascade,
  season_id uuid not null references learning.seasons(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (hymn_id, season_id)
);

create table learning.hymn_relationships (
  id uuid primary key default gen_random_uuid(),
  hymn_id uuid not null references learning.hymns(id) on delete cascade,
  related_hymn_id uuid not null references learning.hymns(id) on delete cascade,
  relationship_type text not null check (length(trim(relationship_type)) > 0),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hymn_id <> related_hymn_id),
  unique (hymn_id, related_hymn_id, relationship_type)
);

create table learning.albums (
  id uuid primary key default gen_random_uuid(),
  owner_creator_account_id uuid references creator.creator_accounts(id) on delete set null,
  cantor_id uuid not null references learning.cantors(id) on delete restrict,
  season_id uuid references learning.seasons(id) on delete set null,
  cover_asset_id uuid references media.media_assets(id) on delete set null,
  submission_id uuid references media.submissions(id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  description text,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table learning.album_localizations (
  album_id uuid not null references learning.albums(id) on delete cascade,
  locale text not null references media.locales(code) on update cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (album_id, locale)
);

create table learning.album_recordings (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references learning.albums(id) on delete cascade,
  hymn_id uuid references learning.hymns(id) on delete set null,
  media_asset_id uuid not null references media.media_assets(id) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  subtitle text,
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  sort_order integer not null default 0,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (album_id, sort_order)
);

create table learning.recording_localizations (
  recording_id uuid not null references learning.album_recordings(id) on delete cascade,
  locale text not null references media.locales(code) on update cascade,
  title text not null check (length(trim(title)) > 0),
  subtitle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (recording_id, locale)
);

create table learning.lesson_sets (
  id uuid primary key default gen_random_uuid(),
  owner_creator_account_id uuid references creator.creator_accounts(id) on delete set null,
  cantor_id uuid not null references learning.cantors(id) on delete restrict,
  season_id uuid references learning.seasons(id) on delete set null,
  hymn_id uuid not null references learning.hymns(id) on delete restrict,
  cover_asset_id uuid references media.media_assets(id) on delete set null,
  submission_id uuid references media.submissions(id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  description text,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table learning.lesson_set_localizations (
  lesson_set_id uuid not null references learning.lesson_sets(id) on delete cascade,
  locale text not null references media.locales(code) on update cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lesson_set_id, locale)
);

create table learning.lessons (
  id uuid primary key default gen_random_uuid(),
  lesson_set_id uuid not null references learning.lesson_sets(id) on delete cascade,
  media_asset_id uuid not null references media.media_assets(id) on delete restrict,
  media_type learning.lesson_media_type not null,
  title text not null check (length(trim(title)) > 0),
  description text,
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  sort_order integer not null default 0,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_set_id, sort_order)
);

create table learning.lesson_localizations (
  lesson_id uuid not null references learning.lessons(id) on delete cascade,
  locale text not null references media.locales(code) on update cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lesson_id, locale)
);

create table learning.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  visibility learning.playlist_visibility not null default 'private',
  cover_asset_id uuid references media.media_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table learning.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references learning.playlists(id) on delete cascade,
  item_kind learning.playlist_item_kind not null,
  album_recording_id uuid references learning.album_recordings(id) on delete cascade,
  lesson_id uuid references learning.lessons(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (
    (item_kind = 'album_recording' and album_recording_id is not null and lesson_id is null)
    or (item_kind = 'lesson' and lesson_id is not null and album_recording_id is null)
  ),
  unique (playlist_id, sort_order)
);

create table learning.hymn_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  hymn_id uuid not null references learning.hymns(id) on delete cascade,
  state learning.progress_state not null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, hymn_id)
);

create index learning_cantors_publication_idx on learning.cantors (publication_status, display_name);
create index learning_seasons_publication_sort_idx on learning.seasons (publication_status, sort_order, title);
create index learning_hymns_publication_title_idx on learning.hymns (publication_status, title);
create index learning_hymn_seasons_season_idx on learning.hymn_seasons (season_id, sort_order, hymn_id);
create index learning_albums_discovery_idx on learning.albums (publication_status, cantor_id, season_id, created_at desc);
create index learning_recordings_album_idx on learning.album_recordings (album_id, sort_order);
create index learning_lesson_sets_discovery_idx on learning.lesson_sets (publication_status, cantor_id, season_id, hymn_id, created_at desc);
create index learning_lessons_set_idx on learning.lessons (lesson_set_id, sort_order);
create index learning_playlists_owner_idx on learning.playlists (owner_user_id, updated_at desc);
create index learning_progress_user_state_idx on learning.hymn_progress (user_id, state, updated_at desc);

create trigger learning_cantors_set_updated_at before update on learning.cantors for each row execute function private.set_updated_at();
create trigger learning_cantor_localizations_set_updated_at before update on learning.cantor_localizations for each row execute function private.set_updated_at();
create trigger learning_cantor_permissions_set_updated_at before update on learning.cantor_permissions for each row execute function private.set_updated_at();
create trigger learning_seasons_set_updated_at before update on learning.seasons for each row execute function private.set_updated_at();
create trigger learning_season_localizations_set_updated_at before update on learning.season_localizations for each row execute function private.set_updated_at();
create trigger learning_hymns_set_updated_at before update on learning.hymns for each row execute function private.set_updated_at();
create trigger learning_hymn_localizations_set_updated_at before update on learning.hymn_localizations for each row execute function private.set_updated_at();
create trigger learning_hymn_relationships_set_updated_at before update on learning.hymn_relationships for each row execute function private.set_updated_at();
create trigger learning_albums_set_updated_at before update on learning.albums for each row execute function private.set_updated_at();
create trigger learning_album_localizations_set_updated_at before update on learning.album_localizations for each row execute function private.set_updated_at();
create trigger learning_recordings_set_updated_at before update on learning.album_recordings for each row execute function private.set_updated_at();
create trigger learning_recording_localizations_set_updated_at before update on learning.recording_localizations for each row execute function private.set_updated_at();
create trigger learning_lesson_sets_set_updated_at before update on learning.lesson_sets for each row execute function private.set_updated_at();
create trigger learning_lesson_set_localizations_set_updated_at before update on learning.lesson_set_localizations for each row execute function private.set_updated_at();
create trigger learning_lessons_set_updated_at before update on learning.lessons for each row execute function private.set_updated_at();
create trigger learning_lesson_localizations_set_updated_at before update on learning.lesson_localizations for each row execute function private.set_updated_at();
create trigger learning_playlists_set_updated_at before update on learning.playlists for each row execute function private.set_updated_at();
create trigger learning_hymn_progress_set_updated_at before update on learning.hymn_progress for each row execute function private.set_updated_at();
