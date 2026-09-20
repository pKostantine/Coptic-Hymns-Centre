-- Artist following + route-specific share preview metadata.
-- The preview RPC is intentionally public-read only and only returns published
-- catalog data suitable for Open Graph / native link previews.

create or replace function public.get_artist_followed(p_artist_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    else exists (
      select 1
      from music.artist_follows follow
      where follow.user_id = auth.uid()
        and follow.artist_id = p_artist_id
    )
  end;
$$;

create or replace function public.set_artist_followed(p_artist_id uuid, p_followed boolean)
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

  if p_followed then
    insert into music.artist_follows (user_id, artist_id)
    values (request_user_id, p_artist_id)
    on conflict (user_id, artist_id) do nothing;
  else
    delete from music.artist_follows
    where user_id = request_user_id
      and artist_id = p_artist_id;
  end if;

  return p_followed;
end;
$$;

create or replace function public.get_share_preview(p_path text, p_locale text default 'en')
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  clean_path text := split_part(coalesce(p_path, '/'), '?', 1);
  match_parts text[];
  entity_id uuid;
  preview jsonb;
begin
  -- Music artist.
  match_parts := regexp_match(clean_path, '^/music/artist/([0-9a-fA-F-]{36})/?$');
  if match_parts is not null then
    entity_id := match_parts[1]::uuid;
    select jsonb_build_object(
      'title', coalesce(localization.display_name, artist.display_name),
      'description', coalesce(localization.biography, artist.biography, 'Listen on Coptic Hymns Centre'),
      'imageAsset', coalesce(
        case when profile.id is null then null else jsonb_build_object(
          'id', profile.id, 'provider', profile.provider, 'bucket', profile.bucket,
          'path', profile.path, 'mimeType', profile.mime_type
        ) end,
        (
          select jsonb_build_object(
            'id', cover.id, 'provider', cover.provider, 'bucket', cover.bucket,
            'path', cover.path, 'mimeType', cover.mime_type
          )
          from music.track_artists ta
          join music.release_tracks rt on rt.track_id = ta.track_id
          join music.releases r
            on r.id = rt.release_id
           and r.publication_status = 'published'::media.publication_status
          join media.media_assets cover
            on cover.id = r.cover_asset_id
           and cover.publication_status = 'published'::media.publication_status
          where ta.artist_id = artist.id
          order by r.scheduled_release_at desc nulls last,
                   r.release_date desc nulls last,
                   rt.disc_number,
                   rt.track_number
          limit 1
        )
      )
    )
    into preview
    from music.artists artist
    left join music.artist_localizations localization
      on localization.artist_id = artist.id
     and localization.locale = p_locale
     and localization.publication_status = 'published'::media.publication_status
    left join media.media_assets profile
      on profile.id = artist.profile_image_asset_id
     and profile.publication_status = 'published'::media.publication_status
    where artist.id = entity_id
      and artist.publication_status = 'published'::media.publication_status;

    if preview is not null then return preview; end if;
  end if;

  -- Music release / album / EP / single.
  match_parts := regexp_match(clean_path, '^/music/release/([0-9a-fA-F-]{36})/?$');
  if match_parts is not null then
    entity_id := match_parts[1]::uuid;
    select jsonb_build_object(
      'title', coalesce(localization.title, release.title),
      'description', concat_ws(' — ',
        coalesce(localization.description, release.description),
        coalesce(artist_localization.display_name, artist.display_name)
      ),
      'imageAsset', case when cover.id is null then null else jsonb_build_object(
        'id', cover.id, 'provider', cover.provider, 'bucket', cover.bucket,
        'path', cover.path, 'mimeType', cover.mime_type
      ) end
    )
    into preview
    from music.releases release
    left join music.release_localizations localization
      on localization.release_id = release.id
     and localization.locale = p_locale
     and localization.publication_status = 'published'::media.publication_status
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
    where release.id = entity_id
      and release.publication_status = 'published'::media.publication_status;

    if preview is not null then return preview; end if;
  end if;

  -- Music track: use its release artwork.
  match_parts := regexp_match(clean_path, '^/music/track/([0-9a-fA-F-]{36})/?$');
  if match_parts is not null then
    entity_id := match_parts[1]::uuid;
    select jsonb_build_object(
      'title', coalesce(track_localization.title, track.title),
      'description', case
        when release_context.title is not null
          then coalesce(track_localization.title, track.title) || ' — ' || release_context.title
        else coalesce(track_localization.title, track.title)
      end,
      'imageAsset', release_context.cover_asset
    )
    into preview
    from music.tracks track
    left join music.track_localizations track_localization
      on track_localization.track_id = track.id
     and track_localization.locale = p_locale
     and track_localization.publication_status = 'published'::media.publication_status
    left join lateral (
      select
        coalesce(release_localization.title, release.title) as title,
        case when cover.id is null then null else jsonb_build_object(
          'id', cover.id, 'provider', cover.provider, 'bucket', cover.bucket,
          'path', cover.path, 'mimeType', cover.mime_type
        ) end as cover_asset
      from music.release_tracks rt
      join music.releases release
        on release.id = rt.release_id
       and release.publication_status = 'published'::media.publication_status
      left join music.release_localizations release_localization
        on release_localization.release_id = release.id
       and release_localization.locale = p_locale
       and release_localization.publication_status = 'published'::media.publication_status
      left join media.media_assets cover
        on cover.id = release.cover_asset_id
       and cover.publication_status = 'published'::media.publication_status
      where rt.track_id = track.id
      order by release.scheduled_release_at desc nulls last,
               release.release_date desc nulls last,
               rt.disc_number,
               rt.track_number
      limit 1
    ) release_context on true
    where track.id = entity_id
      and track.publication_status = 'published'::media.publication_status;

    if preview is not null then return preview; end if;
  end if;

  -- Learn cantor.
  match_parts := regexp_match(clean_path, '^/learn/cantor/([0-9a-fA-F-]{36})/?$');
  if match_parts is not null then
    entity_id := match_parts[1]::uuid;
    select jsonb_build_object(
      'title', coalesce(localization.display_name, cantor.display_name),
      'description', coalesce(localization.biography, cantor.biography, 'Learn on Coptic Hymns Centre'),
      'imageAsset', case when profile.id is null then null else jsonb_build_object(
        'id', profile.id, 'provider', profile.provider, 'bucket', profile.bucket,
        'path', profile.path, 'mimeType', profile.mime_type
      ) end
    )
    into preview
    from learning.cantors cantor
    left join learning.cantor_localizations localization
      on localization.cantor_id = cantor.id
     and localization.locale = p_locale
    left join media.media_assets profile
      on profile.id = cantor.profile_image_asset_id
     and profile.publication_status = 'published'::media.publication_status
    where cantor.id = entity_id
      and cantor.publication_status = 'published'::media.publication_status;

    if preview is not null then return preview; end if;
  end if;

  -- Learn album.
  match_parts := regexp_match(clean_path, '^/learn/album/([0-9a-fA-F-]{36})/?$');
  if match_parts is not null then
    entity_id := match_parts[1]::uuid;
    select jsonb_build_object(
      'title', coalesce(localization.title, album.title),
      'description', concat_ws(' — ',
        coalesce(localization.description, album.description),
        coalesce(cantor_localization.display_name, cantor.display_name)
      ),
      'imageAsset', case when cover.id is null then null else jsonb_build_object(
        'id', cover.id, 'provider', cover.provider, 'bucket', cover.bucket,
        'path', cover.path, 'mimeType', cover.mime_type
      ) end
    )
    into preview
    from learning.albums album
    join learning.cantors cantor
      on cantor.id = album.cantor_id
     and cantor.publication_status = 'published'::media.publication_status
    left join learning.album_localizations localization
      on localization.album_id = album.id
     and localization.locale = p_locale
    left join learning.cantor_localizations cantor_localization
      on cantor_localization.cantor_id = cantor.id
     and cantor_localization.locale = p_locale
    left join media.media_assets cover
      on cover.id = album.cover_asset_id
     and cover.publication_status = 'published'::media.publication_status
    where album.id = entity_id
      and album.publication_status = 'published'::media.publication_status;

    if preview is not null then return preview; end if;
  end if;

  -- Learn lesson: use the lesson-set artwork.
  match_parts := regexp_match(clean_path, '^/learn/lesson/([0-9a-fA-F-]{36})/?$');
  if match_parts is not null then
    entity_id := match_parts[1]::uuid;
    select jsonb_build_object(
      'title', coalesce(lesson_localization.title, lesson.title),
      'description', concat_ws(' — ',
        coalesce(lesson_set_localization.title, lesson_set.title),
        coalesce(cantor_localization.display_name, cantor.display_name)
      ),
      'imageAsset', case when cover.id is null then null else jsonb_build_object(
        'id', cover.id, 'provider', cover.provider, 'bucket', cover.bucket,
        'path', cover.path, 'mimeType', cover.mime_type
      ) end
    )
    into preview
    from learning.lessons lesson
    join learning.lesson_sets lesson_set
      on lesson_set.id = lesson.lesson_set_id
     and lesson_set.publication_status = 'published'::media.publication_status
    join learning.cantors cantor
      on cantor.id = lesson_set.cantor_id
     and cantor.publication_status = 'published'::media.publication_status
    left join learning.lesson_localizations lesson_localization
      on lesson_localization.lesson_id = lesson.id
     and lesson_localization.locale = p_locale
    left join learning.lesson_set_localizations lesson_set_localization
      on lesson_set_localization.lesson_set_id = lesson_set.id
     and lesson_set_localization.locale = p_locale
    left join learning.cantor_localizations cantor_localization
      on cantor_localization.cantor_id = cantor.id
     and cantor_localization.locale = p_locale
    left join media.media_assets cover
      on cover.id = lesson_set.cover_asset_id
     and cover.publication_status = 'published'::media.publication_status
    where lesson.id = entity_id
      and lesson.publication_status = 'published'::media.publication_status;

    if preview is not null then return preview; end if;
  end if;

  return jsonb_build_object(
    'title', 'Coptic Hymns Centre',
    'description', 'Coptic hymns, liturgical books, music, and structured learning.',
    'imageAsset', null
  );
end;
$$;

revoke all on function public.get_artist_followed(uuid) from public;
revoke all on function public.set_artist_followed(uuid, boolean) from public;
revoke all on function public.get_share_preview(text, text) from public;

grant execute on function public.get_artist_followed(uuid) to anon, authenticated;
grant execute on function public.set_artist_followed(uuid, boolean) to authenticated;
grant execute on function public.get_share_preview(text, text) to anon, authenticated;
