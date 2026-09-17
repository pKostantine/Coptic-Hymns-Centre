create or replace function public.get_published_music_release_for_locale(
  p_release_id uuid,
  p_locale text default 'en'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', release.id,
    'title', coalesce(release_localization.title, release.title),
    'subtitle', coalesce(release_localization.subtitle, release.subtitle),
    'description', coalesce(release_localization.description, release.description),
    'releaseType', release.release_type,
    'releaseDate', release.release_date,
    'publicationStatus', release.publication_status,
    'coverAsset', case
      when cover.id is null then null
      else jsonb_build_object(
        'id', cover.id,
        'provider', cover.provider,
        'bucket', cover.bucket,
        'path', cover.path,
        'mimeType', cover.mime_type,
        'fileSizeBytes', cover.file_size_bytes,
        'checksum', cover.checksum
      )
    end,
    'primaryArtist', case
      when primary_artist.id is null then null
      else jsonb_build_object(
        'id', primary_artist.id,
        'displayName', coalesce(primary_artist_localization.display_name, primary_artist.display_name),
        'profileImageAsset', case
          when artist_image.id is null then null
          else jsonb_build_object(
            'id', artist_image.id,
            'provider', artist_image.provider,
            'bucket', artist_image.bucket,
            'path', artist_image.path,
            'mimeType', artist_image.mime_type
          )
        end
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
            'title', coalesce(track_localization.title, track.title),
            'subtitle', coalesce(track_localization.subtitle, track.subtitle),
            'discNumber', release_track.disc_number,
            'trackNumber', release_track.track_number,
            'durationMs', track.duration_ms,
            'releaseId', release.id,
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
                  'displayName', coalesce(artist_localization.display_name, artist.display_name),
                  'role', track_artist.role,
                  'sortOrder', track_artist.sort_order
                )
                order by track_artist.sort_order, coalesce(artist_localization.display_name, artist.display_name)
              )
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
        from music.release_tracks release_track
        join music.tracks track
          on track.id = release_track.track_id
         and track.publication_status = 'published'::media.publication_status
        join media.media_assets asset
          on asset.id = track.media_asset_id
         and asset.publication_status = 'published'::media.publication_status
        left join music.track_localizations track_localization
          on track_localization.track_id = track.id
         and track_localization.locale = p_locale
         and track_localization.publication_status = 'published'::media.publication_status
        where release_track.release_id = release.id
      ) track_row
    ), '[]'::jsonb)
  )
  from music.releases release
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
  left join media.media_assets artist_image
    on artist_image.id = primary_artist.profile_image_asset_id
   and artist_image.publication_status = 'published'::media.publication_status
  where release.id = p_release_id
    and release.publication_status = 'published'::media.publication_status;
$$;

revoke all on function public.get_published_music_release_for_locale(uuid, text) from public;
grant execute on function public.get_published_music_release_for_locale(uuid, text) to anon, authenticated;
