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
    'ownerUserId', playlist.owner_user_id,
    'coverAsset', case when cover.id is null then null else jsonb_build_object(
      'id', cover.id,
      'provider', cover.provider,
      'bucket', cover.bucket,
      'path', cover.path,
      'mimeType', cover.mime_type
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
          select rt.release_id
          from music.release_tracks rt
          where rt.track_id = track.id
          order by rt.created_at
          limit 1
        ) release_track on true
        where playlist_track.playlist_id = playlist.id
      ) track_row
    ), '[]'::jsonb)
  )
  from music.playlists playlist
  left join media.media_assets cover
    on cover.id = playlist.cover_asset_id
   and cover.publication_status = 'published'::media.publication_status
  where playlist.id = p_playlist_id;
$$;

revoke all on function public.get_music_playlist(uuid, text) from public;
grant execute on function public.get_music_playlist(uuid, text) to anon, authenticated;
