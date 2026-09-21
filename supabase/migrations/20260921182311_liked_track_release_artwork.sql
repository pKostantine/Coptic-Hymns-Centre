-- Keep liked-track artwork tied to the same published release returned as releaseId.
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
            'releaseCoverAsset', case when release_cover.id is null then null else jsonb_build_object(
              'id', release_cover.id,
              'provider', release_cover.provider,
              'bucket', release_cover.bucket,
              'path', release_cover.path,
              'mimeType', release_cover.mime_type,
              'fileSizeBytes', release_cover.file_size_bytes,
              'version', release_cover.version
            ) end,
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
          select release_track.release_id, release.cover_asset_id
          from music.release_tracks release_track
          join music.releases release
            on release.id = release_track.release_id
           and release.publication_status = 'published'::media.publication_status
          where release_track.track_id = track.id
          order by release_track.created_at
          limit 1
        ) release_track on true
        left join media.media_assets release_cover
          on release_cover.id = release_track.cover_asset_id
         and release_cover.publication_status = 'published'::media.publication_status
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


revoke all on function public.get_my_music_library(text) from public;
grant execute on function public.get_my_music_library(text) to anon, authenticated;
