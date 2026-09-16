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
begin
  if request_user_id is null then
    return jsonb_build_object(
      'authenticated', false,
      'likedTracks', '[]'::jsonb,
      'playlists', '[]'::jsonb
    );
  end if;

  select jsonb_build_object(
    'authenticated', true,
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
              'mimeType', asset.mime_type
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
          select rt.release_id
          from music.release_tracks rt
          where rt.track_id = track.id
          order by rt.created_at
          limit 1
        ) release_track on true
        where track_like.user_id = request_user_id
      ) liked
    ), '[]'::jsonb),
    'playlists', coalesce((
      select jsonb_agg(jsonb_build_object(
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
          'path', cover.path,
          'mimeType', cover.mime_type
        ) end
      ) order by playlist.updated_at desc), '[]'::jsonb)
    from music.playlists playlist
    left join media.media_assets cover
      on cover.id = playlist.cover_asset_id
     and cover.publication_status = 'published'::media.publication_status
    where playlist.owner_user_id = request_user_id)
  ) into payload;

  return payload;
end;
$$;

create or replace function public.set_track_liked(p_track_id uuid, p_liked boolean)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_liked then
    insert into music.track_likes (user_id, track_id)
    values (request_user_id, p_track_id)
    on conflict (user_id, track_id) do nothing;
  else
    delete from music.track_likes
    where user_id = request_user_id and track_id = p_track_id;
  end if;

  return p_liked;
end;
$$;

create or replace function public.create_music_playlist(
  p_name text,
  p_description text default null,
  p_visibility music.playlist_visibility default 'private'::music.playlist_visibility
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  playlist_id uuid;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Playlist name is required' using errcode = '22023';
  end if;

  insert into music.playlists (owner_user_id, name, description, visibility)
  values (request_user_id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_visibility)
  returning id into playlist_id;

  return playlist_id;
end;
$$;

create or replace function public.add_track_to_music_playlist(p_playlist_id uuid, p_track_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  next_sort_order integer;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select coalesce(max(sort_order), -1) + 1
  into next_sort_order
  from music.playlist_tracks
  where playlist_id = p_playlist_id;

  insert into music.playlist_tracks (playlist_id, track_id, sort_order, added_by)
  values (p_playlist_id, p_track_id, next_sort_order, request_user_id)
  on conflict (playlist_id, track_id) do nothing;

  return true;
end;
$$;

create or replace function public.remove_track_from_music_playlist(p_playlist_id uuid, p_track_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  delete from music.playlist_tracks
  where playlist_id = p_playlist_id and track_id = p_track_id;

  return true;
end;
$$;

revoke all on function public.get_my_music_library(text) from public;
revoke all on function public.set_track_liked(uuid, boolean) from public;
revoke all on function public.create_music_playlist(text, text, music.playlist_visibility) from public;
revoke all on function public.add_track_to_music_playlist(uuid, uuid) from public;
revoke all on function public.remove_track_from_music_playlist(uuid, uuid) from public;

grant execute on function public.get_my_music_library(text) to anon, authenticated;
grant execute on function public.set_track_liked(uuid, boolean) to authenticated;
grant execute on function public.create_music_playlist(text, text, music.playlist_visibility) to authenticated;
grant execute on function public.add_track_to_music_playlist(uuid, uuid) to authenticated;
grant execute on function public.remove_track_from_music_playlist(uuid, uuid) to authenticated;
