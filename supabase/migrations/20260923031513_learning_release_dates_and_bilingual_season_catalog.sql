-- Learning release timing matches the music release form.
alter table learning.albums
  add column if not exists release_timing_mode text not null default 'asap',
  add column if not exists scheduled_release_at timestamptz,
  add column if not exists original_release_date date;
alter table learning.lesson_sets
  add column if not exists release_timing_mode text not null default 'asap',
  add column if not exists scheduled_release_at timestamptz,
  add column if not exists original_release_date date;
alter table learning.albums add constraint learning_album_release_timing_valid check
  (release_timing_mode in ('asap','scheduled')
   and (release_timing_mode <> 'scheduled' or scheduled_release_at is not null));
alter table learning.lesson_sets add constraint learning_lesson_release_timing_valid check
  (release_timing_mode in ('asap','scheduled')
   and (release_timing_mode <> 'scheduled' or scheduled_release_at is not null));

CREATE OR REPLACE FUNCTION public.create_creator_submission_v3(p_creator_account_id uuid, p_mode text, p_title text, p_description text DEFAULT NULL::text, p_release_type music.release_type DEFAULT NULL::music.release_type, p_music_type text DEFAULT NULL::text, p_recording_type text DEFAULT NULL::text, p_artist_id uuid DEFAULT NULL::uuid, p_cantor_id uuid DEFAULT NULL::uuid, p_season_id uuid DEFAULT NULL::uuid, p_hymn_id uuid DEFAULT NULL::uuid, p_localized_titles jsonb DEFAULT '{}'::jsonb, p_items jsonb DEFAULT '[]'::jsonb, p_release_timing_mode text DEFAULT 'asap'::text, p_scheduled_release_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_original_release_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result_payload jsonb;
  catalog_id uuid;
  normalized_timing text := lower(trim(coalesce(p_release_timing_mode, 'asap')));
begin
  if p_mode in ('music', 'learning_album', 'learning_lesson_set') then
    if normalized_timing not in ('asap', 'scheduled') then
      raise exception 'Release timing must be asap or scheduled' using errcode = '22023';
    end if;

    if normalized_timing = 'scheduled' and p_scheduled_release_at is null then
      raise exception 'Choose a scheduled release date and time' using errcode = '22023';
    end if;
  else
    normalized_timing := 'asap';
  end if;

  if p_mode <> 'music' and normalized_timing = 'scheduled'
     and p_scheduled_release_at < public.earliest_release_at() then
    raise exception 'Choose a release date at least 48 hours from now' using errcode = '22023';
  end if;

  result_payload := public.create_creator_submission_v2(
    p_creator_account_id,
    p_mode,
    p_title,
    p_description,
    p_release_type,
    p_music_type,
    p_recording_type,
    p_artist_id,
    p_cantor_id,
    p_season_id,
    p_hymn_id,
    p_localized_titles,
    p_items,
    case when normalized_timing = 'scheduled' then p_scheduled_release_at else null end,
    p_original_release_date
  );

  catalog_id := nullif(result_payload ->> 'catalogId', '')::uuid;

  if p_mode = 'music' then
    update music.releases release
    set release_timing_mode = normalized_timing,
        scheduled_release_at = case
          when normalized_timing = 'asap' then null
          else release.scheduled_release_at
        end,
        updated_at = now()
    where release.id = catalog_id;
  elsif p_mode = 'learning_album' then
    update learning.albums album
       set release_timing_mode = normalized_timing,
           scheduled_release_at = case when normalized_timing = 'scheduled' then p_scheduled_release_at else null end,
           original_release_date = p_original_release_date, updated_at = now()
     where album.id = catalog_id;
  elsif p_mode = 'learning_lesson_set' then
    update learning.lesson_sets lesson_set
       set release_timing_mode = normalized_timing,
           scheduled_release_at = case when normalized_timing = 'scheduled' then p_scheduled_release_at else null end,
           original_release_date = p_original_release_date, updated_at = now()
     where lesson_set.id = catalog_id;
  end if;

  return result_payload;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_creator_catalog_options()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object('id', season.id, 'title', season.title, 'titleArabic', (select sl.title from learning.season_localizations sl where sl.season_id=season.id and sl.locale='ar'), 'subtitle', season.slug)
        order by season.sort_order, season.title)
      from learning.seasons season
      where season.publication_status = 'published'::media.publication_status
    ), '[]'::jsonb),
    'hymns', coalesce((
      select jsonb_agg(jsonb_build_object('id', hymn.id, 'title', hymn.title, 'subtitle', hymn.subtitle)
        order by hymn.title)
      from learning.hymns hymn
      where hymn.publication_status = 'published'::media.publication_status
    ), '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_published_learning_album(p_album_id uuid, p_locale text DEFAULT 'en'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select jsonb_build_object(
    'id', a.id,
    'title', coalesce(al.title, a.title),
    'description', coalesce(al.description, a.description),
    'releaseTimingMode', a.release_timing_mode,
    'scheduledReleaseAt', a.scheduled_release_at,
    'originalReleaseDate', a.original_release_date,
    'displayDate', coalesce(a.original_release_date::timestamptz,
      a.scheduled_release_at,
      (select sub.published_at from media.submissions sub where sub.id=a.submission_id),
      a.created_at),
    'cantor', jsonb_build_object('id', c.id, 'displayName', coalesce(cl.display_name, c.display_name)),
    'season', case when s.id is null then null else jsonb_build_object('id', s.id, 'slug', s.slug, 'title', coalesce(sl.title, s.title)) end,
    'coverAsset', case when cover.id is null then null else jsonb_build_object('id', cover.id, 'provider', cover.provider, 'bucket', cover.bucket, 'path', cover.path, 'mimeType', cover.mime_type, 'fileSizeBytes', cover.file_size_bytes, 'checksum', cover.checksum) end,
    'recordings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'title', coalesce(rl.title, r.title),
        'subtitle', coalesce(rl.subtitle, r.subtitle),
        'durationMs', coalesce(r.duration_ms, asset.duration_ms),
        'sortOrder', r.sort_order,
        'hymnId', r.hymn_id,
        'mediaAsset', jsonb_build_object('id', asset.id, 'provider', asset.provider, 'bucket', asset.bucket, 'path', asset.path, 'mimeType', asset.mime_type, 'durationMs', asset.duration_ms, 'fileSizeBytes', asset.file_size_bytes, 'checksum', asset.checksum)
      ) order by r.sort_order, r.id)
      from learning.album_recordings r
      join media.media_assets asset on asset.id = r.media_asset_id and asset.publication_status = 'published'
      left join learning.recording_localizations rl on rl.recording_id = r.id and rl.locale = p_locale
      where r.album_id = a.id and r.publication_status = 'published'
    ), '[]'::jsonb)
  )
  from learning.albums a
  join learning.cantors c on c.id = a.cantor_id and c.publication_status = 'published'
  left join learning.cantor_localizations cl on cl.cantor_id = c.id and cl.locale = p_locale
  left join learning.album_localizations al on al.album_id = a.id and al.locale = p_locale
  left join learning.seasons s on s.id = a.season_id and s.publication_status = 'published'
  left join learning.season_localizations sl on sl.season_id = s.id and sl.locale = p_locale
  left join media.media_assets cover on cover.id = a.cover_asset_id and cover.publication_status = 'published'
  where a.id = p_album_id and a.publication_status = 'published';
$function$
;

CREATE OR REPLACE FUNCTION public.get_published_learning_lesson_set(p_lesson_set_id uuid, p_locale text DEFAULT 'en'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select jsonb_build_object(
    'id', ls.id,
    'title', coalesce(lsl.title, ls.title),
    'description', coalesce(lsl.description, ls.description),
    'releaseTimingMode', ls.release_timing_mode,
    'scheduledReleaseAt', ls.scheduled_release_at,
    'originalReleaseDate', ls.original_release_date,
    'displayDate', coalesce(ls.original_release_date::timestamptz,
      ls.scheduled_release_at,
      (select sub.published_at from media.submissions sub where sub.id=ls.submission_id),
      ls.created_at),
    'cantor', jsonb_build_object('id', c.id, 'displayName', coalesce(cl.display_name, c.display_name)),
    'season', case when s.id is null then null else jsonb_build_object('id', s.id, 'slug', s.slug, 'title', coalesce(sl.title, s.title)) end,
    'hymn', jsonb_build_object('id', h.id, 'sourceHymnKey', h.source_hymn_key, 'title', coalesce(hl.title, h.title), 'subtitle', coalesce(hl.subtitle, h.subtitle)),
    'coverAsset', case when cover.id is null then null else jsonb_build_object('id', cover.id, 'provider', cover.provider, 'bucket', cover.bucket, 'path', cover.path, 'mimeType', cover.mime_type, 'fileSizeBytes', cover.file_size_bytes, 'checksum', cover.checksum) end,
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'mediaType', l.media_type,
        'title', coalesce(ll.title, l.title),
        'description', coalesce(ll.description, l.description),
        'durationMs', coalesce(l.duration_ms, asset.duration_ms),
        'sortOrder', l.sort_order,
        'mediaAsset', jsonb_build_object('id', asset.id, 'provider', asset.provider, 'bucket', asset.bucket, 'path', asset.path, 'mimeType', asset.mime_type, 'durationMs', asset.duration_ms, 'fileSizeBytes', asset.file_size_bytes, 'checksum', asset.checksum)
      ) order by l.sort_order, l.id)
      from learning.lessons l
      join media.media_assets asset on asset.id = l.media_asset_id and asset.publication_status = 'published'
      left join learning.lesson_localizations ll on ll.lesson_id = l.id and ll.locale = p_locale
      where l.lesson_set_id = ls.id and l.publication_status = 'published'
    ), '[]'::jsonb)
  )
  from learning.lesson_sets ls
  join learning.cantors c on c.id = ls.cantor_id and c.publication_status = 'published'
  join learning.hymns h on h.id = ls.hymn_id and h.publication_status = 'published'
  left join learning.cantor_localizations cl on cl.cantor_id = c.id and cl.locale = p_locale
  left join learning.lesson_set_localizations lsl on lsl.lesson_set_id = ls.id and lsl.locale = p_locale
  left join learning.hymn_localizations hl on hl.hymn_id = h.id and hl.locale = p_locale
  left join learning.seasons s on s.id = ls.season_id and s.publication_status = 'published'
  left join learning.season_localizations sl on sl.season_id = s.id and sl.locale = p_locale
  left join media.media_assets cover on cover.id = ls.cover_asset_id and cover.publication_status = 'published'
  where ls.id = p_lesson_set_id and ls.publication_status = 'published';
$function$
;
