create schema if not exists music;

grant usage on schema music to anon, authenticated, service_role;

do $$
begin
  create type music.release_type as enum ('single', 'ep', 'album');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type music.track_artist_role as enum (
    'primary',
    'featured',
    'composer',
    'lyricist',
    'arranger',
    'producer'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type music.playlist_visibility as enum ('private', 'unlisted', 'public');
exception when duplicate_object then null;
end $$;

grant usage on type music.release_type to anon, authenticated;
grant usage on type music.track_artist_role to anon, authenticated;
grant usage on type music.playlist_visibility to anon, authenticated;

create table if not exists music.artists (
  id uuid primary key default gen_random_uuid(),
  owner_creator_account_id uuid references creator.creator_accounts(id) on delete set null,
  profile_image_asset_id uuid references media.media_assets(id) on delete set null,
  display_name text not null,
  sort_name text,
  biography text,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artists_display_name_not_blank check (length(trim(display_name)) > 0)
);

create table if not exists music.artist_localizations (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references music.artists(id) on delete cascade,
  locale text not null references media.locales(code),
  display_name text not null,
  sort_name text,
  biography text,
  is_primary boolean not null default false,
  publication_status media.publication_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artist_localizations_display_name_not_blank check (length(trim(display_name)) > 0),
  unique (artist_id, locale)
);

create table if not exists music.artist_memberships (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references music.artists(id) on delete cascade,
  creator_account_id uuid not null references creator.creator_accounts(id) on delete cascade,
  role text not null default 'manager',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artist_memberships_role_not_blank check (length(trim(role)) > 0),
  unique (artist_id, creator_account_id)
);

create table if not exists music.releases (
  id uuid primary key default gen_random_uuid(),
  owner_creator_account_id uuid references creator.creator_accounts(id) on delete set null,
  primary_artist_id uuid references music.artists(id) on delete restrict,
  cover_asset_id uuid references media.media_assets(id) on delete set null,
  release_type music.release_type not null,
  title text not null,
  subtitle text,
  description text,
  release_date date,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint releases_title_not_blank check (length(trim(title)) > 0)
);

create table if not exists music.release_localizations (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references music.releases(id) on delete cascade,
  locale text not null references media.locales(code),
  title text not null,
  subtitle text,
  description text,
  is_primary boolean not null default false,
  publication_status media.publication_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint release_localizations_title_not_blank check (length(trim(title)) > 0),
  unique (release_id, locale)
);

create table if not exists music.tracks (
  id uuid primary key default gen_random_uuid(),
  owner_creator_account_id uuid references creator.creator_accounts(id) on delete set null,
  media_asset_id uuid references media.media_assets(id) on delete restrict,
  title text not null,
  subtitle text,
  duration_ms bigint,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracks_title_not_blank check (length(trim(title)) > 0),
  constraint tracks_duration_nonnegative check (duration_ms is null or duration_ms >= 0),
  constraint tracks_published_requires_media check (
    publication_status <> 'published'::media.publication_status or media_asset_id is not null
  )
);

create table if not exists music.track_localizations (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references music.tracks(id) on delete cascade,
  locale text not null references media.locales(code),
  title text not null,
  subtitle text,
  is_primary boolean not null default false,
  publication_status media.publication_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint track_localizations_title_not_blank check (length(trim(title)) > 0),
  unique (track_id, locale)
);

create table if not exists music.release_tracks (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references music.releases(id) on delete cascade,
  track_id uuid not null references music.tracks(id) on delete restrict,
  disc_number integer not null default 1,
  track_number integer not null,
  created_at timestamptz not null default now(),
  constraint release_tracks_disc_positive check (disc_number > 0),
  constraint release_tracks_track_number_positive check (track_number > 0),
  unique (release_id, track_id),
  unique (release_id, disc_number, track_number)
);

create table if not exists music.track_artists (
  track_id uuid not null references music.tracks(id) on delete cascade,
  artist_id uuid not null references music.artists(id) on delete restrict,
  role music.track_artist_role not null default 'primary',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (track_id, artist_id, role)
);

create table if not exists music.track_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references music.tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

create table if not exists music.artist_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  artist_id uuid not null references music.artists(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, artist_id)
);

create table if not exists music.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  visibility music.playlist_visibility not null default 'private',
  cover_asset_id uuid references media.media_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint playlists_name_not_blank check (length(trim(name)) > 0)
);

create table if not exists music.playlist_tracks (
  playlist_id uuid not null references music.playlists(id) on delete cascade,
  track_id uuid not null references music.tracks(id) on delete cascade,
  sort_order integer not null default 0,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (playlist_id, track_id)
);

create table if not exists music.play_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references music.tracks(id) on delete cascade,
  media_asset_id uuid references media.media_assets(id) on delete set null,
  played_at timestamptz not null default now(),
  progress_ms bigint,
  completed boolean not null default false,
  constraint play_history_progress_nonnegative check (progress_ms is null or progress_ms >= 0)
);

create index if not exists artists_owner_idx on music.artists(owner_creator_account_id);
create index if not exists artists_profile_image_idx on music.artists(profile_image_asset_id) where profile_image_asset_id is not null;
create index if not exists artists_publication_status_idx on music.artists(publication_status);
create index if not exists artist_localizations_locale_idx on music.artist_localizations(locale);
create index if not exists artist_memberships_creator_account_idx on music.artist_memberships(creator_account_id);
create index if not exists releases_owner_idx on music.releases(owner_creator_account_id);
create index if not exists releases_primary_artist_idx on music.releases(primary_artist_id) where primary_artist_id is not null;
create index if not exists releases_cover_asset_idx on music.releases(cover_asset_id) where cover_asset_id is not null;
create index if not exists releases_publication_status_idx on music.releases(publication_status, release_date desc);
create index if not exists release_localizations_locale_idx on music.release_localizations(locale);
create index if not exists tracks_owner_idx on music.tracks(owner_creator_account_id);
create index if not exists tracks_media_asset_idx on music.tracks(media_asset_id) where media_asset_id is not null;
create index if not exists tracks_publication_status_idx on music.tracks(publication_status);
create index if not exists track_localizations_locale_idx on music.track_localizations(locale);
create index if not exists release_tracks_track_idx on music.release_tracks(track_id);
create index if not exists track_artists_artist_idx on music.track_artists(artist_id);
create index if not exists track_likes_track_idx on music.track_likes(track_id);
create index if not exists artist_follows_artist_idx on music.artist_follows(artist_id);
create index if not exists playlists_owner_idx on music.playlists(owner_user_id, updated_at desc);
create index if not exists playlists_cover_asset_idx on music.playlists(cover_asset_id) where cover_asset_id is not null;
create index if not exists playlist_tracks_track_idx on music.playlist_tracks(track_id);
create index if not exists playlist_tracks_order_idx on music.playlist_tracks(playlist_id, sort_order, created_at);
create index if not exists playlist_tracks_added_by_idx on music.playlist_tracks(added_by) where added_by is not null;
create index if not exists play_history_user_played_idx on music.play_history(user_id, played_at desc);
create index if not exists play_history_track_idx on music.play_history(track_id);
create index if not exists play_history_media_asset_idx on music.play_history(media_asset_id) where media_asset_id is not null;

create trigger artists_set_updated_at
before update on music.artists
for each row execute function private.set_updated_at();

create trigger artist_localizations_set_updated_at
before update on music.artist_localizations
for each row execute function private.set_updated_at();

create trigger artist_memberships_set_updated_at
before update on music.artist_memberships
for each row execute function private.set_updated_at();

create trigger releases_set_updated_at
before update on music.releases
for each row execute function private.set_updated_at();

create trigger release_localizations_set_updated_at
before update on music.release_localizations
for each row execute function private.set_updated_at();

create trigger tracks_set_updated_at
before update on music.tracks
for each row execute function private.set_updated_at();

create trigger track_localizations_set_updated_at
before update on music.track_localizations
for each row execute function private.set_updated_at();

create trigger playlists_set_updated_at
before update on music.playlists
for each row execute function private.set_updated_at();

alter table music.artists enable row level security;
alter table music.artist_localizations enable row level security;
alter table music.artist_memberships enable row level security;
alter table music.releases enable row level security;
alter table music.release_localizations enable row level security;
alter table music.tracks enable row level security;
alter table music.track_localizations enable row level security;
alter table music.release_tracks enable row level security;
alter table music.track_artists enable row level security;
alter table music.track_likes enable row level security;
alter table music.artist_follows enable row level security;
alter table music.playlists enable row level security;
alter table music.playlist_tracks enable row level security;
alter table music.play_history enable row level security;

grant select on table
  music.artists,
  music.artist_localizations,
  music.artist_memberships,
  music.releases,
  music.release_localizations,
  music.tracks,
  music.track_localizations,
  music.release_tracks,
  music.track_artists,
  music.playlists,
  music.playlist_tracks
to anon, authenticated;

grant select, insert, update, delete on table
  music.track_likes,
  music.artist_follows,
  music.playlists,
  music.playlist_tracks,
  music.play_history
to authenticated;

grant select, insert, update on table
  music.artists,
  music.artist_localizations,
  music.artist_memberships,
  music.releases,
  music.release_localizations,
  music.tracks,
  music.track_localizations,
  music.release_tracks,
  music.track_artists
to authenticated;

grant all on all tables in schema music to service_role;

create or replace function private.music_publication_is_creator_mutable(status media.publication_status)
returns boolean
language sql
set search_path = ''
stable
as $$
  select status <> 'published'::media.publication_status or (select private.is_admin());
$$;

create or replace function private.music_artist_is_visible(p_artist_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from music.artists artist
    where artist.id = p_artist_id
      and (
        artist.publication_status = 'published'::media.publication_status
        or (select private.can_read_media_owner(artist.owner_creator_account_id))
      )
  );
$$;

create or replace function private.music_artist_is_editable(p_artist_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from music.artists artist
    where artist.id = p_artist_id
      and (select private.can_edit_creator_account(artist.owner_creator_account_id))
  );
$$;

create or replace function private.music_release_is_visible(p_release_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from music.releases release
    where release.id = p_release_id
      and (
        release.publication_status = 'published'::media.publication_status
        or (select private.can_read_media_owner(release.owner_creator_account_id))
      )
  );
$$;

create or replace function private.music_release_is_editable(p_release_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from music.releases release
    where release.id = p_release_id
      and (select private.can_edit_creator_account(release.owner_creator_account_id))
  );
$$;

create or replace function private.music_track_is_visible(p_track_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from music.tracks track
    where track.id = p_track_id
      and (
        track.publication_status = 'published'::media.publication_status
        or (select private.can_read_media_owner(track.owner_creator_account_id))
      )
  );
$$;

create or replace function private.music_track_is_editable(p_track_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from music.tracks track
    where track.id = p_track_id
      and (select private.can_edit_creator_account(track.owner_creator_account_id))
  );
$$;

create or replace function private.music_playlist_is_visible(p_playlist_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from music.playlists playlist
    where playlist.id = p_playlist_id
      and (
        playlist.visibility = 'public'::music.playlist_visibility
        or playlist.owner_user_id = (select auth.uid())
      )
  );
$$;

create or replace function private.music_playlist_is_editable(p_playlist_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from music.playlists playlist
    where playlist.id = p_playlist_id
      and playlist.owner_user_id = (select auth.uid())
  );
$$;

create policy "artists_select_published_or_owner"
on music.artists for select
to anon, authenticated
using (
  publication_status = 'published'::media.publication_status
  or (select private.can_read_media_owner(owner_creator_account_id))
);

create policy "artists_insert_creator"
on music.artists for insert
to authenticated
with check (
  (select private.can_edit_creator_account(owner_creator_account_id))
  and (select private.music_publication_is_creator_mutable(publication_status))
);

create policy "artists_update_creator"
on music.artists for update
to authenticated
using ((select private.can_edit_creator_account(owner_creator_account_id)))
with check (
  (select private.can_edit_creator_account(owner_creator_account_id))
  and (select private.music_publication_is_creator_mutable(publication_status))
);

create policy "artist_localizations_select_visible_artist"
on music.artist_localizations for select
to anon, authenticated
using ((select private.music_artist_is_visible(artist_id)));

create policy "artist_localizations_insert_editable_artist"
on music.artist_localizations for insert
to authenticated
with check (
  (select private.music_artist_is_editable(artist_id))
  and (select private.music_publication_is_creator_mutable(publication_status))
);

create policy "artist_localizations_update_editable_artist"
on music.artist_localizations for update
to authenticated
using ((select private.music_artist_is_editable(artist_id)))
with check (
  (select private.music_artist_is_editable(artist_id))
  and (select private.music_publication_is_creator_mutable(publication_status))
);

create policy "artist_memberships_select_visible_artist"
on music.artist_memberships for select
to authenticated
using ((select private.music_artist_is_visible(artist_id)));

create policy "artist_memberships_insert_editable_artist"
on music.artist_memberships for insert
to authenticated
with check ((select private.music_artist_is_editable(artist_id)));

create policy "artist_memberships_update_editable_artist"
on music.artist_memberships for update
to authenticated
using ((select private.music_artist_is_editable(artist_id)))
with check ((select private.music_artist_is_editable(artist_id)));

create policy "releases_select_published_or_owner"
on music.releases for select
to anon, authenticated
using (
  publication_status = 'published'::media.publication_status
  or (select private.can_read_media_owner(owner_creator_account_id))
);

create policy "releases_insert_creator"
on music.releases for insert
to authenticated
with check (
  (select private.can_edit_creator_account(owner_creator_account_id))
  and (select private.music_publication_is_creator_mutable(publication_status))
);

create policy "releases_update_creator"
on music.releases for update
to authenticated
using ((select private.can_edit_creator_account(owner_creator_account_id)))
with check (
  (select private.can_edit_creator_account(owner_creator_account_id))
  and (select private.music_publication_is_creator_mutable(publication_status))
);

create policy "release_localizations_select_visible_release"
on music.release_localizations for select
to anon, authenticated
using ((select private.music_release_is_visible(release_id)));

create policy "release_localizations_insert_editable_release"
on music.release_localizations for insert
to authenticated
with check (
  (select private.music_release_is_editable(release_id))
  and (select private.music_publication_is_creator_mutable(publication_status))
);

create policy "release_localizations_update_editable_release"
on music.release_localizations for update
to authenticated
using ((select private.music_release_is_editable(release_id)))
with check (
  (select private.music_release_is_editable(release_id))
  and (select private.music_publication_is_creator_mutable(publication_status))
);

create policy "tracks_select_published_or_owner"
on music.tracks for select
to anon, authenticated
using (
  publication_status = 'published'::media.publication_status
  or (select private.can_read_media_owner(owner_creator_account_id))
);

create policy "tracks_insert_creator"
on music.tracks for insert
to authenticated
with check (
  (select private.can_edit_creator_account(owner_creator_account_id))
  and (select private.music_publication_is_creator_mutable(publication_status))
);

create policy "tracks_update_creator"
on music.tracks for update
to authenticated
using ((select private.can_edit_creator_account(owner_creator_account_id)))
with check (
  (select private.can_edit_creator_account(owner_creator_account_id))
  and (select private.music_publication_is_creator_mutable(publication_status))
);

create policy "track_localizations_select_visible_track"
on music.track_localizations for select
to anon, authenticated
using ((select private.music_track_is_visible(track_id)));

create policy "track_localizations_insert_editable_track"
on music.track_localizations for insert
to authenticated
with check (
  (select private.music_track_is_editable(track_id))
  and (select private.music_publication_is_creator_mutable(publication_status))
);

create policy "track_localizations_update_editable_track"
on music.track_localizations for update
to authenticated
using ((select private.music_track_is_editable(track_id)))
with check (
  (select private.music_track_is_editable(track_id))
  and (select private.music_publication_is_creator_mutable(publication_status))
);

create policy "release_tracks_select_visible_release_and_track"
on music.release_tracks for select
to anon, authenticated
using (
  (select private.music_release_is_visible(release_id))
  and (select private.music_track_is_visible(track_id))
);

create policy "release_tracks_insert_editable_release_and_track"
on music.release_tracks for insert
to authenticated
with check (
  (select private.music_release_is_editable(release_id))
  and (select private.music_track_is_editable(track_id))
);

create policy "release_tracks_update_editable_release_and_track"
on music.release_tracks for update
to authenticated
using ((select private.music_release_is_editable(release_id)))
with check (
  (select private.music_release_is_editable(release_id))
  and (select private.music_track_is_editable(track_id))
);

create policy "track_artists_select_visible_track_and_artist"
on music.track_artists for select
to anon, authenticated
using (
  (select private.music_track_is_visible(track_id))
  and (select private.music_artist_is_visible(artist_id))
);

create policy "track_artists_insert_editable_track"
on music.track_artists for insert
to authenticated
with check (
  (select private.music_track_is_editable(track_id))
  and (select private.music_artist_is_visible(artist_id))
);

create policy "track_artists_update_editable_track"
on music.track_artists for update
to authenticated
using ((select private.music_track_is_editable(track_id)))
with check (
  (select private.music_track_is_editable(track_id))
  and (select private.music_artist_is_visible(artist_id))
);

create policy "track_likes_select_own"
on music.track_likes for select
to authenticated
using (user_id = (select auth.uid()));

create policy "track_likes_insert_own_published_track"
on music.track_likes for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.music_track_is_visible(track_id))
);

create policy "track_likes_delete_own"
on music.track_likes for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "artist_follows_select_own"
on music.artist_follows for select
to authenticated
using (user_id = (select auth.uid()));

create policy "artist_follows_insert_own_published_artist"
on music.artist_follows for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.music_artist_is_visible(artist_id))
);

create policy "artist_follows_delete_own"
on music.artist_follows for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "playlists_select_public_or_owner"
on music.playlists for select
to anon, authenticated
using ((select private.music_playlist_is_visible(id)));

create policy "playlists_insert_own"
on music.playlists for insert
to authenticated
with check (owner_user_id = (select auth.uid()));

create policy "playlists_update_own"
on music.playlists for update
to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

create policy "playlists_delete_own"
on music.playlists for delete
to authenticated
using (owner_user_id = (select auth.uid()));

create policy "playlist_tracks_select_visible_playlist"
on music.playlist_tracks for select
to anon, authenticated
using ((select private.music_playlist_is_visible(playlist_id)));

create policy "playlist_tracks_insert_editable_playlist"
on music.playlist_tracks for insert
to authenticated
with check (
  (select private.music_playlist_is_editable(playlist_id))
  and added_by = (select auth.uid())
  and (select private.music_track_is_visible(track_id))
);

create policy "playlist_tracks_update_editable_playlist"
on music.playlist_tracks for update
to authenticated
using ((select private.music_playlist_is_editable(playlist_id)))
with check (
  (select private.music_playlist_is_editable(playlist_id))
  and (select private.music_track_is_visible(track_id))
);

create policy "playlist_tracks_delete_editable_playlist"
on music.playlist_tracks for delete
to authenticated
using ((select private.music_playlist_is_editable(playlist_id)));

create policy "play_history_select_own"
on music.play_history for select
to authenticated
using (user_id = (select auth.uid()));

create policy "play_history_insert_own"
on music.play_history for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.music_track_is_visible(track_id))
);

create policy "play_history_update_own"
on music.play_history for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "play_history_delete_own"
on music.play_history for delete
to authenticated
using (user_id = (select auth.uid()));

create or replace function public.publish_music_release(p_release_id uuid)
returns table (
  release_id uuid,
  status media.publication_status,
  published_track_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  release_record music.releases%rowtype;
  invalid_required_count integer := 0;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select *
  into release_record
  from music.releases release
  where release.id = p_release_id
  for update;

  if not found then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  select count(*)::integer
  into published_track_count
  from music.release_tracks release_track
  where release_track.release_id = release_record.id;

  if published_track_count = 0 then
    raise exception 'Release must have at least one track' using errcode = '22023';
  end if;

  select count(*)::integer
  into invalid_required_count
  from music.release_tracks release_track
  join music.tracks track on track.id = release_track.track_id
  left join media.media_assets asset on asset.id = track.media_asset_id
  where release_track.release_id = release_record.id
    and (
      track.media_asset_id is null
      or asset.id is null
      or asset.processing_status <> 'completed'::media.processing_status
      or asset.publication_status <> 'published'::media.publication_status
    );

  if invalid_required_count > 0 then
    raise exception 'Release has tracks without completed published media assets' using errcode = '22023';
  end if;

  update music.artists artist
  set publication_status = 'published'::media.publication_status,
      updated_by = request_user_id,
      updated_at = now()
  where artist.id = release_record.primary_artist_id
     or artist.id in (
       select track_artist.artist_id
       from music.release_tracks release_track
       join music.track_artists track_artist on track_artist.track_id = release_track.track_id
       where release_track.release_id = release_record.id
     );

  update music.artist_localizations localization
  set publication_status = 'published'::media.publication_status,
      updated_by = request_user_id,
      updated_at = now()
  where localization.artist_id = release_record.primary_artist_id
     or localization.artist_id in (
       select track_artist.artist_id
       from music.release_tracks release_track
       join music.track_artists track_artist on track_artist.track_id = release_track.track_id
       where release_track.release_id = release_record.id
     );

  update music.tracks track
  set publication_status = 'published'::media.publication_status,
      updated_by = request_user_id,
      updated_at = now()
  where track.id in (
    select release_track.track_id
    from music.release_tracks release_track
    where release_track.release_id = release_record.id
  );

  update music.track_localizations localization
  set publication_status = 'published'::media.publication_status,
      updated_by = request_user_id,
      updated_at = now()
  where localization.track_id in (
    select release_track.track_id
    from music.release_tracks release_track
    where release_track.release_id = release_record.id
  );

  update music.release_localizations localization
  set publication_status = 'published'::media.publication_status,
      updated_by = request_user_id,
      updated_at = now()
  where localization.release_id = release_record.id;

  update music.releases release
  set publication_status = 'published'::media.publication_status,
      updated_by = request_user_id,
      updated_at = now()
  where release.id = release_record.id
  returning * into release_record;

  return query
  select release_record.id, release_record.publication_status, published_track_count;
end;
$$;

create or replace function public.get_published_music_release(p_release_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', release.id,
    'title', release.title,
    'subtitle', release.subtitle,
    'description', release.description,
    'releaseType', release.release_type,
    'releaseDate', release.release_date,
    'publicationStatus', release.publication_status,
    'primaryArtist', case
      when primary_artist.id is null then null
      else jsonb_build_object(
        'id', primary_artist.id,
        'displayName', primary_artist.display_name,
        'profileImageAssetId', primary_artist.profile_image_asset_id
      )
    end,
    'tracks', coalesce((
      select jsonb_agg(track_row.payload order by track_row.disc_number, track_row.track_number, track_row.track_id)
      from (
        select
          release_track.disc_number,
          release_track.track_number,
          track.id as track_id,
          jsonb_build_object(
            'id', track.id,
            'title', track.title,
            'subtitle', track.subtitle,
            'discNumber', release_track.disc_number,
            'trackNumber', release_track.track_number,
            'durationMs', track.duration_ms,
            'mediaAsset', jsonb_build_object(
              'id', asset.id,
              'provider', asset.provider,
              'bucket', asset.bucket,
              'path', asset.path,
              'mimeType', asset.mime_type,
              'fileSizeBytes', asset.file_size_bytes,
              'checksum', asset.checksum
            ),
            'artists', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', artist.id,
                  'displayName', artist.display_name,
                  'role', track_artist.role,
                  'sortOrder', track_artist.sort_order
                )
                order by track_artist.sort_order, artist.display_name
              )
              from music.track_artists track_artist
              join music.artists artist on artist.id = track_artist.artist_id
              where track_artist.track_id = track.id
                and artist.publication_status = 'published'::media.publication_status
            ), '[]'::jsonb)
          ) as payload
        from music.release_tracks release_track
        join music.tracks track on track.id = release_track.track_id
        join media.media_assets asset on asset.id = track.media_asset_id
        where release_track.release_id = release.id
          and track.publication_status = 'published'::media.publication_status
          and asset.publication_status = 'published'::media.publication_status
      ) track_row
    ), '[]'::jsonb)
  )
  from music.releases release
  left join music.artists primary_artist on primary_artist.id = release.primary_artist_id
  where release.id = p_release_id
    and release.publication_status = 'published'::media.publication_status;
$$;

revoke all on function public.publish_music_release(uuid) from public;
revoke all on function public.get_published_music_release(uuid) from public;

grant execute on function public.publish_music_release(uuid) to authenticated;
grant execute on function public.get_published_music_release(uuid) to anon, authenticated;
