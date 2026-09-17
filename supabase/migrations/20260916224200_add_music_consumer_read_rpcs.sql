create or replace function public.get_music_home(p_locale text default 'en')
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'latestReleases', coalesce((
      select jsonb_agg(release_row.payload order by release_row.release_date desc nulls last, release_row.title)
      from (
        select
          release.release_date,
          coalesce(release_localization.title, release.title) as title,
          jsonb_build_object(
            'id', release.id,
            'title', coalesce(release_localization.title, release.title),
            'subtitle', coalesce(release_localization.subtitle, release.subtitle),
            'releaseType', release.release_type,
            'releaseDate', release.release_date,
            'primaryArtist', case
              when artist.id is null then null
              else jsonb_build_object(
                'id', artist.id,
                'displayName', coalesce(artist_localization.display_name, artist.display_name)
              )
            end,
            'coverAsset', case
              when cover.id is null then null
              else jsonb_build_object(
                'id', cover.id,
                'provider', cover.provider,
                'bucket', cover.bucket,
                'path', cover.path,
                'mimeType', cover.mime_type
              )
            end
          ) as payload
        from music.releases release
        left join music.release_localizations release_localization
          on release_localization.release_id = release.id
         and release_localization.locale = p_locale
         and release_localization.publication_status = 'published'::media.publication_status
        left join music.artists artist
          on artist.id = release.primary_artist_id
         and artist.publication_status = 'published'::media.publication_status
        left join music.artist_localizations artist_localization
          on artist_localization.artist_id = artist.id
         and artist_localization.locale = p_locale
         and artist_localization.publication_status = 'published'::media.publication_status
        left join media.media_assets cover
          on cover.id = release.cover_asset_id
         and cover.publication_status = 'published'::media.publication_status
        where release.publication_status = 'published'::media.publication_status
        order by release.release_date desc nulls last, release.created_at desc
        limit 24
      ) release_row
    ), '[]'::jsonb),
    'artists', coalesce((
      select jsonb_agg(artist_row.payload order by artist_row.display_name)
      from (
        select
          coalesce(artist_localization.display_name, artist.display_name) as display_name,
          jsonb_build_object(
            'id', artist.id,
            'displayName', coalesce(artist_localization.display_name, artist.display_name),
            'biography', coalesce(artist_localization.biography, artist.biography),
            'profileImageAsset', case
              when image.id is null then null
              else jsonb_build_object(
                'id', image.id,
                'provider', image.provider,
                'bucket', image.bucket,
                'path', image.path,
                'mimeType', image.mime_type
              )
            end
          ) as payload
        from music.artists artist
        left join music.artist_localizations artist_localization
          on artist_localization.artist_id = artist.id
         and artist_localization.locale = p_locale
         and artist_localization.publication_status = 'published'::media.publication_status
        left join media.media_assets image
          on image.id = artist.profile_image_asset_id
         and image.publication_status = 'published'::media.publication_status
        where artist.publication_status = 'published'::media.publication_status
        order by coalesce(artist_localization.display_name, artist.display_name)
        limit 24
      ) artist_row
    ), '[]'::jsonb)
  );
$$;

create or replace function public.get_published_music_artist(
  p_artist_id uuid,
  p_locale text default 'en'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', artist.id,
    'displayName', coalesce(artist_localization.display_name, artist.display_name),
    'biography', coalesce(artist_localization.biography, artist.biography),
    'profileImageAsset', case
      when image.id is null then null
      else jsonb_build_object(
        'id', image.id,
        'provider', image.provider,
        'bucket', image.bucket,
        'path', image.path,
        'mimeType', image.mime_type
      )
    end,
    'releases', coalesce((
      select jsonb_agg(release_row.payload order by release_row.release_date desc nulls last, release_row.title)
      from (
        select
          release.release_date,
          coalesce(release_localization.title, release.title) as title,
          jsonb_build_object(
            'id', release.id,
            'title', coalesce(release_localization.title, release.title),
            'subtitle', coalesce(release_localization.subtitle, release.subtitle),
            'releaseType', release.release_type,
            'releaseDate', release.release_date,
            'coverAsset', case
              when cover.id is null then null
              else jsonb_build_object(
                'id', cover.id,
                'provider', cover.provider,
                'bucket', cover.bucket,
                'path', cover.path,
                'mimeType', cover.mime_type
              )
            end
          ) as payload
        from music.releases release
        left join music.release_localizations release_localization
          on release_localization.release_id = release.id
         and release_localization.locale = p_locale
         and release_localization.publication_status = 'published'::media.publication_status
        left join media.media_assets cover
          on cover.id = release.cover_asset_id
         and cover.publication_status = 'published'::media.publication_status
        where release.primary_artist_id = artist.id
          and release.publication_status = 'published'::media.publication_status
      ) release_row
    ), '[]'::jsonb)
  )
  from music.artists artist
  left join music.artist_localizations artist_localization
    on artist_localization.artist_id = artist.id
   and artist_localization.locale = p_locale
   and artist_localization.publication_status = 'published'::media.publication_status
  left join media.media_assets image
    on image.id = artist.profile_image_asset_id
   and image.publication_status = 'published'::media.publication_status
  where artist.id = p_artist_id
    and artist.publication_status = 'published'::media.publication_status;
$$;

create or replace function public.search_published_music(
  p_query text,
  p_locale text default 'en'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with search_term as (
    select '%' || lower(trim(coalesce(p_query, ''))) || '%' as pattern
  )
  select jsonb_build_object(
    'artists', coalesce((
      select jsonb_agg(result.payload order by result.display_name)
      from (
        select distinct on (artist.id)
          artist.id,
          coalesce(localization.display_name, artist.display_name) as display_name,
          jsonb_build_object(
            'id', artist.id,
            'displayName', coalesce(localization.display_name, artist.display_name),
            'biography', coalesce(localization.biography, artist.biography),
            'profileImageAsset', case when image.id is null then null else jsonb_build_object(
              'id', image.id,
              'provider', image.provider,
              'bucket', image.bucket,
              'path', image.path,
              'mimeType', image.mime_type
            ) end
          ) as payload
        from music.artists artist
        cross join search_term
        left join music.artist_localizations localization
          on localization.artist_id = artist.id
         and localization.locale = p_locale
         and localization.publication_status = 'published'::media.publication_status
        left join media.media_assets image
          on image.id = artist.profile_image_asset_id
         and image.publication_status = 'published'::media.publication_status
        where artist.publication_status = 'published'::media.publication_status
          and search_term.pattern <> '%%'
          and (
            lower(artist.display_name) like search_term.pattern
            or lower(coalesce(localization.display_name, '')) like search_term.pattern
          )
        limit 20
      ) result
    ), '[]'::jsonb),
    'releases', coalesce((
      select jsonb_agg(result.payload order by result.title)
      from (
        select distinct on (release.id)
          release.id,
          coalesce(localization.title, release.title) as title,
          jsonb_build_object(
            'id', release.id,
            'title', coalesce(localization.title, release.title),
            'subtitle', coalesce(localization.subtitle, release.subtitle),
            'releaseType', release.release_type,
            'releaseDate', release.release_date,
            'primaryArtist', case when artist.id is null then null else jsonb_build_object(
              'id', artist.id,
              'displayName', artist.display_name
            ) end,
            'coverAsset', case when cover.id is null then null else jsonb_build_object(
              'id', cover.id,
              'provider', cover.provider,
              'bucket', cover.bucket,
              'path', cover.path,
              'mimeType', cover.mime_type
            ) end
          ) as payload
        from music.releases release
        cross join search_term
        left join music.release_localizations localization
          on localization.release_id = release.id
         and localization.locale = p_locale
         and localization.publication_status = 'published'::media.publication_status
        left join music.artists artist
          on artist.id = release.primary_artist_id
         and artist.publication_status = 'published'::media.publication_status
        left join media.media_assets cover
          on cover.id = release.cover_asset_id
         and cover.publication_status = 'published'::media.publication_status
        where release.publication_status = 'published'::media.publication_status
          and search_term.pattern <> '%%'
          and (
            lower(release.title) like search_term.pattern
            or lower(coalesce(localization.title, '')) like search_term.pattern
          )
        limit 20
      ) result
    ), '[]'::jsonb),
    'tracks', coalesce((
      select jsonb_agg(result.payload order by result.title)
      from (
        select distinct on (track.id)
          track.id,
          coalesce(localization.title, track.title) as title,
          jsonb_build_object(
            'id', track.id,
            'title', coalesce(localization.title, track.title),
            'subtitle', coalesce(localization.subtitle, track.subtitle),
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
                'displayName', artist.display_name,
                'role', track_artist.role,
                'sortOrder', track_artist.sort_order
              ) order by track_artist.sort_order, artist.display_name)
              from music.track_artists track_artist
              join music.artists artist on artist.id = track_artist.artist_id
              where track_artist.track_id = track.id
                and artist.publication_status = 'published'::media.publication_status
            ), '[]'::jsonb)
          ) as payload
        from music.tracks track
        cross join search_term
        join media.media_assets asset
          on asset.id = track.media_asset_id
         and asset.publication_status = 'published'::media.publication_status
        left join music.track_localizations localization
          on localization.track_id = track.id
         and localization.locale = p_locale
         and localization.publication_status = 'published'::media.publication_status
        left join music.release_tracks release_track on release_track.track_id = track.id
        where track.publication_status = 'published'::media.publication_status
          and search_term.pattern <> '%%'
          and (
            lower(track.title) like search_term.pattern
            or lower(coalesce(localization.title, '')) like search_term.pattern
          )
        limit 30
      ) result
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_music_home(text) from public;
revoke all on function public.get_published_music_artist(uuid, text) from public;
revoke all on function public.search_published_music(text, text) from public;

grant execute on function public.get_music_home(text) to anon, authenticated;
grant execute on function public.get_published_music_artist(uuid, text) to anon, authenticated;
grant execute on function public.search_published_music(text, text) to anon, authenticated;
