-- Playlist artwork is user-managed, while the effective artwork shown to
-- listeners remains derived from the first track whenever no custom cover is
-- attached. Recent listening data powers the compact Library landing page.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'playlist-covers',
  'playlist-covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Playlist covers are publicly readable" on storage.objects;
create policy "Playlist covers are publicly readable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'playlist-covers');

drop policy if exists "Users upload own playlist covers" on storage.objects;
create policy "Users upload own playlist covers"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'playlist-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users update own playlist covers" on storage.objects;
create policy "Users update own playlist covers"
on storage.objects for update
to authenticated
using (
  bucket_id = 'playlist-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'playlist-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users delete own playlist covers" on storage.objects;
create policy "Users delete own playlist covers"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'playlist-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

alter table music.play_history
  add column if not exists release_id uuid references music.releases(id) on delete set null;

create index if not exists play_history_release_idx
  on music.play_history(release_id)
  where release_id is not null;

-- These narrow policies let an authenticated listener maintain only the
-- published image asset belonging to one of their own playlists. The object
-- URL and metadata must match the signed JWT and playlist owner exactly.
drop policy if exists "media_assets_select_own_playlist_covers" on media.media_assets;
create policy "media_assets_select_own_playlist_covers"
on media.media_assets for select
to authenticated
using (
  provider = 'external'::media.media_provider
  and bucket = 'playlist-covers'
  and owner_creator_account_id is null
  and created_by = (select auth.uid())
  and exists (
    select 1
    from music.playlists playlist
    where playlist.id::text = media_assets.metadata ->> 'playlistId'
      and playlist.owner_user_id = (select auth.uid())
  )
);

drop policy if exists "media_assets_insert_own_playlist_covers" on media.media_assets;
create policy "media_assets_insert_own_playlist_covers"
on media.media_assets for insert
to authenticated
with check (
  provider = 'external'::media.media_provider
  and bucket = 'playlist-covers'
  and media_type = 'image'::media.media_type
  and owner_creator_account_id is null
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and exists (
    select 1
    from music.playlists playlist
    where playlist.id::text = media_assets.metadata ->> 'playlistId'
      and playlist.owner_user_id = (select auth.uid())
  )
  and path = regexp_replace((select auth.jwt() ->> 'iss'), '/auth/v1/?$', '')
    || '/storage/v1/object/public/playlist-covers/'
    || (select auth.uid())::text || '/'
    || (metadata ->> 'playlistId') || '/cover'
);

drop policy if exists "media_assets_update_own_playlist_covers" on media.media_assets;
create policy "media_assets_update_own_playlist_covers"
on media.media_assets for update
to authenticated
using (
  provider = 'external'::media.media_provider
  and bucket = 'playlist-covers'
  and owner_creator_account_id is null
  and created_by = (select auth.uid())
  and exists (
    select 1
    from music.playlists playlist
    where playlist.id::text = media_assets.metadata ->> 'playlistId'
      and playlist.owner_user_id = (select auth.uid())
  )
)
with check (
  provider = 'external'::media.media_provider
  and bucket = 'playlist-covers'
  and media_type = 'image'::media.media_type
  and owner_creator_account_id is null
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and exists (
    select 1
    from music.playlists playlist
    where playlist.id::text = media_assets.metadata ->> 'playlistId'
      and playlist.owner_user_id = (select auth.uid())
  )
  and path = regexp_replace((select auth.jwt() ->> 'iss'), '/auth/v1/?$', '')
    || '/storage/v1/object/public/playlist-covers/'
    || (select auth.uid())::text || '/'
    || (metadata ->> 'playlistId') || '/cover'
);

create or replace function public.record_music_play(
  p_track_id uuid,
  p_release_id uuid default null
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  track_asset_id uuid;
begin
  if request_user_id is null then
    return false;
  end if;

  select track.media_asset_id
  into track_asset_id
  from music.tracks track
  where track.id = p_track_id
    and track.publication_status = 'published'::media.publication_status;

  if track_asset_id is null then
    raise exception 'Track not found or unavailable' using errcode = '22023';
  end if;

  if p_release_id is not null and not exists (
    select 1
    from music.release_tracks release_track
    join music.releases release
      on release.id = release_track.release_id
     and release.publication_status = 'published'::media.publication_status
    where release_track.track_id = p_track_id
      and release_track.release_id = p_release_id
  ) then
    raise exception 'Release does not contain this track' using errcode = '22023';
  end if;

  insert into music.play_history (
    user_id,
    track_id,
    release_id,
    media_asset_id,
    progress_ms,
    completed
  ) values (
    request_user_id,
    p_track_id,
    p_release_id,
    track_asset_id,
    0,
    false
  );

  -- Keep this interaction log bounded per listener. Recent Library results
  -- need only the newest entries, and analytics should not grow forever here.
  delete from music.play_history history
  where history.id in (
    select old_history.id
    from music.play_history old_history
    where old_history.user_id = request_user_id
    order by old_history.played_at desc, old_history.id desc
    offset 500
  );

  return true;
end;
$$;

create or replace function public.set_music_playlist_cover(p_playlist_id uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  object_path text;
  issuer text;
  public_asset_url text;
  object_mime_type text;
  object_size bigint;
  new_cover_asset_id uuid;
  cover_version integer;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from music.playlists playlist
    where playlist.id = p_playlist_id
      and playlist.owner_user_id = request_user_id
  ) then
    raise exception 'Playlist not found or not editable' using errcode = '42501';
  end if;

  object_path := request_user_id::text || '/' || p_playlist_id::text || '/cover';

  select
    lower(storage_object.metadata ->> 'mimetype'),
    (storage_object.metadata ->> 'size')::bigint
  into object_mime_type, object_size
  from storage.objects storage_object
  where storage_object.bucket_id = 'playlist-covers'
    and storage_object.name = object_path
    and (
      storage_object.owner = request_user_id
      or storage_object.owner_id = request_user_id::text
    );

  if object_mime_type is null or object_size is null then
    raise exception 'Upload the playlist cover before attaching it' using errcode = '22023';
  end if;
  if object_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Playlist covers must be JPEG, PNG, or WebP' using errcode = '22023';
  end if;
  if object_size <= 0 or object_size > 5242880 then
    raise exception 'Playlist covers must be 5 MB or smaller' using errcode = '22023';
  end if;

  issuer := auth.jwt() ->> 'iss';
  if issuer is null or issuer !~ '^https?://' then
    raise exception 'Unable to resolve the playlist cover URL' using errcode = '22023';
  end if;

  public_asset_url := regexp_replace(issuer, '/auth/v1/?$', '')
    || '/storage/v1/object/public/playlist-covers/' || object_path;

  insert into media.media_assets (
    owner_creator_account_id,
    provider,
    bucket,
    path,
    media_type,
    mime_type,
    file_size_bytes,
    version,
    processing_status,
    publication_status,
    metadata,
    created_by,
    updated_by
  ) values (
    null,
    'external'::media.media_provider,
    'playlist-covers',
    public_asset_url,
    'image'::media.media_type,
    object_mime_type,
    object_size,
    1,
    'completed'::media.processing_status,
    'published'::media.publication_status,
    jsonb_build_object('playlistId', p_playlist_id::text, 'storagePath', object_path),
    request_user_id,
    request_user_id
  )
  on conflict (provider, bucket, path) do update
  set mime_type = excluded.mime_type,
      file_size_bytes = excluded.file_size_bytes,
      version = media_assets.version + 1,
      processing_status = 'completed'::media.processing_status,
      publication_status = 'published'::media.publication_status,
      metadata = excluded.metadata,
      updated_by = request_user_id,
      updated_at = now()
  returning id, version into new_cover_asset_id, cover_version;

  update music.playlists
  set cover_asset_id = new_cover_asset_id,
      updated_at = now()
  where id = p_playlist_id
    and owner_user_id = request_user_id;

  return jsonb_build_object(
    'id', new_cover_asset_id,
    'provider', 'external',
    'bucket', 'playlist-covers',
    'path', public_asset_url || '?v=' || cover_version::text,
    'mimeType', object_mime_type,
    'fileSizeBytes', object_size,
    'version', cover_version
  );
end;
$$;

create or replace function public.clear_music_playlist_cover(p_playlist_id uuid)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  previous_cover_asset_id uuid;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select playlist.cover_asset_id
  into previous_cover_asset_id
  from music.playlists playlist
  where playlist.id = p_playlist_id
    and playlist.owner_user_id = request_user_id;

  if not found then
    raise exception 'Playlist not found or not editable' using errcode = '42501';
  end if;

  update music.playlists
  set cover_asset_id = null,
      updated_at = now()
  where id = p_playlist_id
    and owner_user_id = request_user_id;

  if previous_cover_asset_id is not null then
    update media.media_assets
    set publication_status = 'archived'::media.publication_status,
        updated_by = request_user_id,
        updated_at = now()
    where id = previous_cover_asset_id
      and provider = 'external'::media.media_provider
      and bucket = 'playlist-covers'
      and created_by = request_user_id;
  end if;

  return true;
end;
$$;

create or replace function public.get_music_playlist(
  p_playlist_id uuid,
  p_locale text default 'en'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', playlist.id,
    'name', playlist.name,
    'description', playlist.description,
    'visibility', playlist.visibility,
    'isOwner', playlist.owner_user_id = auth.uid(),
    'ownerUserId', case when playlist.owner_user_id = auth.uid() then playlist.owner_user_id else null end,
    'hasCustomCover', playlist.cover_asset_id is not null,
    'coverAsset', case when cover.id is null then null else jsonb_build_object(
      'id', cover.id,
      'provider', cover.provider,
      'bucket', cover.bucket,
      'path', case
        when cover.provider = 'external'::media.media_provider and cover.bucket = 'playlist-covers'
          then cover.path || case when position('?' in cover.path) > 0 then '&v=' else '?v=' end || cover.version::text
        else cover.path
      end,
      'mimeType', cover.mime_type,
      'fileSizeBytes', cover.file_size_bytes,
      'version', cover.version
    ) end,
    'tracks', coalesce((
      select jsonb_agg(track_row.payload order by track_row.sort_order, track_row.created_at)
      from (
        select
          playlist_track.sort_order,
          playlist_track.created_at,
          jsonb_build_object(
            'id', track.id,
            'title', coalesce(track_localization.title, track.title),
            'subtitle', coalesce(track_localization.subtitle, track.subtitle),
            'durationMs', track.duration_ms,
            'releaseId', release_track.release_id,
            'mediaAsset', jsonb_build_object(
              'id', asset.id,
              'provider', asset.provider,
              'bucket', asset.bucket,
              'path', asset.path,
              'mimeType', asset.mime_type,
              'fileSizeBytes', asset.file_size_bytes,
              'version', asset.version
            ),
            'artists', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', artist.id,
                'displayName', coalesce(artist_localization.display_name, artist.display_name),
                'role', track_artist.role,
                'sortOrder', track_artist.sort_order
              ) order by track_artist.sort_order, artist.display_name)
              from music.track_artists track_artist
              join music.artists artist
                on artist.id = track_artist.artist_id
               and artist.publication_status = 'published'::media.publication_status
              left join music.artist_localizations artist_localization
                on artist_localization.artist_id = artist.id
               and artist_localization.locale = p_locale
               and artist_localization.publication_status = 'published'::media.publication_status
              where track_artist.track_id = track.id
            ), '[]'::jsonb)
          ) as payload
        from music.playlist_tracks playlist_track
        join music.tracks track
          on track.id = playlist_track.track_id
         and track.publication_status = 'published'::media.publication_status
        join media.media_assets asset
          on asset.id = track.media_asset_id
         and asset.publication_status = 'published'::media.publication_status
        left join music.track_localizations track_localization
          on track_localization.track_id = track.id
         and track_localization.locale = p_locale
         and track_localization.publication_status = 'published'::media.publication_status
        left join lateral (
          select release_track.release_id
          from music.release_tracks release_track
          join music.releases release
            on release.id = release_track.release_id
           and release.publication_status = 'published'::media.publication_status
          where release_track.track_id = track.id
          order by release_track.created_at
          limit 1
        ) release_track on true
        where playlist_track.playlist_id = playlist.id
      ) track_row
    ), '[]'::jsonb)
  )
  from music.playlists playlist
  left join lateral (
    select asset.*
    from (
      select
        playlist.cover_asset_id as asset_id,
        0 as priority,
        0 as sort_order,
        playlist.created_at as ordered_at
      union all
      select
        release.cover_asset_id as asset_id,
        1 as priority,
        playlist_track.sort_order,
        playlist_track.created_at as ordered_at
      from music.playlist_tracks playlist_track
      join music.release_tracks release_track
        on release_track.track_id = playlist_track.track_id
      join music.releases release
        on release.id = release_track.release_id
       and release.publication_status = 'published'::media.publication_status
      where playlist_track.playlist_id = playlist.id
    ) candidate
    join media.media_assets asset
      on asset.id = candidate.asset_id
     and asset.publication_status = 'published'::media.publication_status
    order by candidate.priority, candidate.sort_order, candidate.ordered_at
    limit 1
  ) cover on true
  where playlist.id = p_playlist_id;
$$;

create or replace function public.get_my_music_library(p_locale text default 'en')
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  payload jsonb;
  recent_tracks jsonb := '[]'::jsonb;
  recent_releases jsonb := '[]'::jsonb;
begin
  if request_user_id is null then
    return jsonb_build_object(
      'authenticated', false,
      'followedArtists', '[]'::jsonb,
      'likedReleases', '[]'::jsonb,
      'likedTracks', '[]'::jsonb,
      'playlists', '[]'::jsonb,
      'recentTracks', '[]'::jsonb,
      'recentReleases', '[]'::jsonb
    );
  end if;

  select jsonb_build_object(
    'authenticated', true,
    'followedArtists', coalesce((
      select jsonb_agg(followed.payload order by followed.created_at desc)
      from (
        select
          artist_follow.created_at,
          jsonb_build_object(
            'id', artist.id,
            'displayName', coalesce(artist_localization.display_name, artist.display_name),
            'biography', coalesce(artist_localization.biography, artist.biography),
            'profileImageAsset', case when profile_image.id is null then null else jsonb_build_object(
              'id', profile_image.id,
              'provider', profile_image.provider,
              'bucket', profile_image.bucket,
              'path', profile_image.path,
              'mimeType', profile_image.mime_type,
              'version', profile_image.version
            ) end
          ) as payload
        from music.artist_follows artist_follow
        join music.artists artist
          on artist.id = artist_follow.artist_id
         and artist.publication_status = 'published'::media.publication_status
        left join music.artist_localizations artist_localization
          on artist_localization.artist_id = artist.id
         and artist_localization.locale = p_locale
         and artist_localization.publication_status = 'published'::media.publication_status
        left join media.media_assets profile_image
          on profile_image.id = artist.profile_image_asset_id
         and profile_image.publication_status = 'published'::media.publication_status
        where artist_follow.user_id = request_user_id
      ) followed
    ), '[]'::jsonb),
    'likedReleases', coalesce((
      select jsonb_agg(liked.payload order by liked.created_at desc)
      from (
        select
          release_like.created_at,
          jsonb_build_object(
            'id', release.id,
            'title', coalesce(release_localization.title, release.title),
            'subtitle', coalesce(release_localization.subtitle, release.subtitle),
            'releaseType', release.release_type,
            'releaseDate', music.release_display_date(
              release.original_release_date,
              release.scheduled_release_at,
              release.release_date
            ),
            'musicType', release.metadata ->> 'musicType',
            'recordingType', release.metadata ->> 'recordingType',
            'primaryArtist', case when primary_artist.id is null then null else jsonb_build_object(
              'id', primary_artist.id,
              'displayName', coalesce(primary_artist_localization.display_name, primary_artist.display_name)
            ) end,
            'coverAsset', case when cover.id is null then null else jsonb_build_object(
              'id', cover.id,
              'provider', cover.provider,
              'bucket', cover.bucket,
              'path', cover.path,
              'mimeType', cover.mime_type,
              'version', cover.version
            ) end
          ) as payload
        from music.release_likes release_like
        join music.releases release
          on release.id = release_like.release_id
         and release.publication_status = 'published'::media.publication_status
        left join music.release_localizations release_localization
          on release_localization.release_id = release.id
         and release_localization.locale = p_locale
         and release_localization.publication_status = 'published'::media.publication_status
        left join music.artists primary_artist
          on primary_artist.id = release.primary_artist_id
         and primary_artist.publication_status = 'published'::media.publication_status
        left join music.artist_localizations primary_artist_localization
          on primary_artist_localization.artist_id = primary_artist.id
         and primary_artist_localization.locale = p_locale
         and primary_artist_localization.publication_status = 'published'::media.publication_status
        left join media.media_assets cover
          on cover.id = release.cover_asset_id
         and cover.publication_status = 'published'::media.publication_status
        where release_like.user_id = request_user_id
      ) liked
    ), '[]'::jsonb),
    'likedTracks', coalesce((
      select jsonb_agg(liked.payload order by liked.created_at desc)
      from (
        select
          track_like.created_at,
          jsonb_build_object(
            'id', track.id,
            'title', coalesce(track_localization.title, track.title),
            'subtitle', coalesce(track_localization.subtitle, track.subtitle),
            'durationMs', track.duration_ms,
            'releaseId', release_track.release_id,
            'mediaAsset', jsonb_build_object(
              'id', asset.id,
              'provider', asset.provider,
              'bucket', asset.bucket,
              'path', asset.path,
              'mimeType', asset.mime_type,
              'fileSizeBytes', asset.file_size_bytes,
              'version', asset.version
            ),
            'artists', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', artist.id,
                'displayName', coalesce(artist_localization.display_name, artist.display_name),
                'role', track_artist.role,
                'sortOrder', track_artist.sort_order
              ) order by track_artist.sort_order, artist.display_name)
              from music.track_artists track_artist
              join music.artists artist
                on artist.id = track_artist.artist_id
               and artist.publication_status = 'published'::media.publication_status
              left join music.artist_localizations artist_localization
                on artist_localization.artist_id = artist.id
               and artist_localization.locale = p_locale
               and artist_localization.publication_status = 'published'::media.publication_status
              where track_artist.track_id = track.id
            ), '[]'::jsonb)
          ) as payload
        from music.track_likes track_like
        join music.tracks track
          on track.id = track_like.track_id
         and track.publication_status = 'published'::media.publication_status
        join media.media_assets asset
          on asset.id = track.media_asset_id
         and asset.publication_status = 'published'::media.publication_status
        left join music.track_localizations track_localization
          on track_localization.track_id = track.id
         and track_localization.locale = p_locale
         and track_localization.publication_status = 'published'::media.publication_status
        left join lateral (
          select release_track.release_id
          from music.release_tracks release_track
          join music.releases release
            on release.id = release_track.release_id
           and release.publication_status = 'published'::media.publication_status
          where release_track.track_id = track.id
          order by release_track.created_at
          limit 1
        ) release_track on true
        where track_like.user_id = request_user_id
      ) liked
    ), '[]'::jsonb),
    'playlists', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', playlist.id,
          'name', playlist.name,
          'description', playlist.description,
          'visibility', playlist.visibility,
          'trackCount', (
            select count(*)
            from music.playlist_tracks playlist_track
            where playlist_track.playlist_id = playlist.id
          ),
          'coverAsset', case when cover.id is null then null else jsonb_build_object(
            'id', cover.id,
            'provider', cover.provider,
            'bucket', cover.bucket,
            'path', case
              when cover.provider = 'external'::media.media_provider and cover.bucket = 'playlist-covers'
                then cover.path || case when position('?' in cover.path) > 0 then '&v=' else '?v=' end || cover.version::text
              else cover.path
            end,
            'mimeType', cover.mime_type,
            'fileSizeBytes', cover.file_size_bytes,
            'version', cover.version
          ) end
        ) order by playlist.updated_at desc
      )
      from music.playlists playlist
      left join lateral (
        select asset.*
        from (
          select
            playlist.cover_asset_id as asset_id,
            0 as priority,
            0 as sort_order,
            playlist.created_at as ordered_at
          union all
          select
            release.cover_asset_id as asset_id,
            1 as priority,
            playlist_track.sort_order,
            playlist_track.created_at as ordered_at
          from music.playlist_tracks playlist_track
          join music.release_tracks release_track
            on release_track.track_id = playlist_track.track_id
          join music.releases release
            on release.id = release_track.release_id
           and release.publication_status = 'published'::media.publication_status
          where playlist_track.playlist_id = playlist.id
        ) candidate
        join media.media_assets asset
          on asset.id = candidate.asset_id
         and asset.publication_status = 'published'::media.publication_status
        order by candidate.priority, candidate.sort_order, candidate.ordered_at
        limit 1
      ) cover on true
      where playlist.owner_user_id = request_user_id
    ), '[]'::jsonb)
  ) into payload;

  select coalesce(jsonb_agg(recent.payload order by recent.played_at desc), '[]'::jsonb)
  into recent_tracks
  from (
    select
      latest.played_at,
      jsonb_build_object(
        'playedAt', latest.played_at,
        'track', jsonb_build_object(
          'id', track.id,
          'title', coalesce(track_localization.title, track.title),
          'subtitle', coalesce(track_localization.subtitle, track.subtitle),
          'durationMs', track.duration_ms,
          'releaseId', release.id,
          'mediaAsset', jsonb_build_object(
            'id', asset.id,
            'provider', asset.provider,
            'bucket', asset.bucket,
            'path', asset.path,
            'mimeType', asset.mime_type,
            'fileSizeBytes', asset.file_size_bytes,
            'version', asset.version
          ),
          'artists', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', artist.id,
              'displayName', coalesce(artist_localization.display_name, artist.display_name),
              'role', track_artist.role,
              'sortOrder', track_artist.sort_order
            ) order by track_artist.sort_order, artist.display_name)
            from music.track_artists track_artist
            join music.artists artist
              on artist.id = track_artist.artist_id
             and artist.publication_status = 'published'::media.publication_status
            left join music.artist_localizations artist_localization
              on artist_localization.artist_id = artist.id
             and artist_localization.locale = p_locale
             and artist_localization.publication_status = 'published'::media.publication_status
            where track_artist.track_id = track.id
          ), '[]'::jsonb)
        ),
        'release', case when release.id is null then null else jsonb_build_object(
          'id', release.id,
          'title', coalesce(release_localization.title, release.title),
          'subtitle', coalesce(release_localization.subtitle, release.subtitle),
          'releaseType', release.release_type,
          'releaseDate', music.release_display_date(
            release.original_release_date,
            release.scheduled_release_at,
            release.release_date
          ),
          'musicType', release.metadata ->> 'musicType',
          'recordingType', release.metadata ->> 'recordingType',
          'primaryArtist', case when primary_artist.id is null then null else jsonb_build_object(
            'id', primary_artist.id,
            'displayName', coalesce(primary_artist_localization.display_name, primary_artist.display_name)
          ) end,
          'coverAsset', case when release_cover.id is null then null else jsonb_build_object(
            'id', release_cover.id,
            'provider', release_cover.provider,
            'bucket', release_cover.bucket,
            'path', release_cover.path,
            'mimeType', release_cover.mime_type,
            'version', release_cover.version
          ) end
        ) end
      ) as payload
    from (
      select distinct on (history.track_id)
        history.track_id,
        history.release_id,
        history.played_at
      from music.play_history history
      where history.user_id = request_user_id
      order by history.track_id, history.played_at desc, history.id desc
    ) latest
    join music.tracks track
      on track.id = latest.track_id
     and track.publication_status = 'published'::media.publication_status
    join media.media_assets asset
      on asset.id = track.media_asset_id
     and asset.publication_status = 'published'::media.publication_status
    left join music.track_localizations track_localization
      on track_localization.track_id = track.id
     and track_localization.locale = p_locale
     and track_localization.publication_status = 'published'::media.publication_status
    left join lateral (
      select published_release.*
      from music.release_tracks release_track
      join music.releases published_release
        on published_release.id = release_track.release_id
       and published_release.publication_status = 'published'::media.publication_status
      where release_track.track_id = track.id
      order by
        case when published_release.id = latest.release_id then 0 else 1 end,
        release_track.created_at
      limit 1
    ) release on true
    left join music.release_localizations release_localization
      on release_localization.release_id = release.id
     and release_localization.locale = p_locale
     and release_localization.publication_status = 'published'::media.publication_status
    left join music.artists primary_artist
      on primary_artist.id = release.primary_artist_id
     and primary_artist.publication_status = 'published'::media.publication_status
    left join music.artist_localizations primary_artist_localization
      on primary_artist_localization.artist_id = primary_artist.id
     and primary_artist_localization.locale = p_locale
     and primary_artist_localization.publication_status = 'published'::media.publication_status
    left join media.media_assets release_cover
      on release_cover.id = release.cover_asset_id
     and release_cover.publication_status = 'published'::media.publication_status
    order by latest.played_at desc
    limit 20
  ) recent;

  select coalesce(
    jsonb_agg(
      (recent_release.entry -> 'release')
        || jsonb_build_object('playedAt', recent_release.entry -> 'playedAt')
      order by (recent_release.entry ->> 'playedAt')::timestamptz desc
    ),
    '[]'::jsonb
  )
  into recent_releases
  from (
    select distinct on (entry -> 'release' ->> 'id') entry
    from jsonb_array_elements(recent_tracks) entry
    where entry -> 'release' <> 'null'::jsonb
    order by
      entry -> 'release' ->> 'id',
      (entry ->> 'playedAt')::timestamptz desc
  ) recent_release;

  return payload || jsonb_build_object(
    'recentTracks', recent_tracks,
    'recentReleases', recent_releases
  );
end;
$$;

create or replace function public.get_music_playlist_share_preview(p_playlist_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'title', playlist.name,
    'description', coalesce(
      nullif(trim(playlist.description), ''),
      'Listen to ' || playlist.name || ' on Coptic Hymns Centre.'
    ),
    'imageAsset', case when cover.id is null then null else jsonb_build_object(
      'id', cover.id,
      'provider', cover.provider,
      'bucket', cover.bucket,
      'path', case
        when cover.provider = 'external'::media.media_provider and cover.bucket = 'playlist-covers'
          then cover.path || case when position('?' in cover.path) > 0 then '&v=' else '?v=' end || cover.version::text
        else cover.path
      end,
      'mimeType', cover.mime_type,
      'version', cover.version
    ) end
  )
  from music.playlists playlist
  left join lateral (
    select asset.*
    from (
      select
        playlist.cover_asset_id as asset_id,
        0 as priority,
        0 as sort_order,
        playlist.created_at as ordered_at
      union all
      select
        release.cover_asset_id as asset_id,
        1 as priority,
        playlist_track.sort_order,
        playlist_track.created_at as ordered_at
      from music.playlist_tracks playlist_track
      join music.release_tracks release_track
        on release_track.track_id = playlist_track.track_id
      join music.releases release
        on release.id = release_track.release_id
       and release.publication_status = 'published'::media.publication_status
      where playlist_track.playlist_id = playlist.id
    ) candidate
    join media.media_assets asset
      on asset.id = candidate.asset_id
     and asset.publication_status = 'published'::media.publication_status
    order by candidate.priority, candidate.sort_order, candidate.ordered_at
    limit 1
  ) cover on true
  where playlist.id = p_playlist_id
    and playlist.visibility = 'public'::music.playlist_visibility;
$$;

revoke all on function public.record_music_play(uuid, uuid) from public;
revoke all on function public.set_music_playlist_cover(uuid) from public;
revoke all on function public.clear_music_playlist_cover(uuid) from public;
revoke all on function public.get_music_playlist(uuid, text) from public;
revoke all on function public.get_my_music_library(text) from public;
revoke all on function public.get_music_playlist_share_preview(uuid) from public;

grant execute on function public.record_music_play(uuid, uuid) to authenticated;
grant execute on function public.set_music_playlist_cover(uuid) to authenticated;
grant execute on function public.clear_music_playlist_cover(uuid) to authenticated;
grant execute on function public.get_music_playlist(uuid, text) to anon, authenticated;
grant execute on function public.get_my_music_library(text) to anon, authenticated;
grant execute on function public.get_music_playlist_share_preview(uuid) to anon, authenticated;
