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
      'followedArtists', '[]'::jsonb,
      'likedReleases', '[]'::jsonb,
      'likedTracks', '[]'::jsonb,
      'playlists', '[]'::jsonb
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
              'mimeType', profile_image.mime_type
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
              'mimeType', cover.mime_type
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
            'path', cover.path,
            'mimeType', cover.mime_type
          ) end
        ) order by playlist.updated_at desc
      )
      from music.playlists playlist
      left join media.media_assets cover
        on cover.id = playlist.cover_asset_id
       and cover.publication_status = 'published'::media.publication_status
      where playlist.owner_user_id = request_user_id
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

revoke all on function public.get_my_music_library(text) from public;
grant execute on function public.get_my_music_library(text) to anon, authenticated;
