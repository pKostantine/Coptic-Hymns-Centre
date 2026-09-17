create or replace function public.get_learning_home(p_locale text default 'en')
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'cantors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'displayName', coalesce(cl.display_name, c.display_name),
        'biography', coalesce(cl.biography, c.biography),
        'profileImageAsset', case when ma.id is null then null else jsonb_build_object(
          'id', ma.id, 'provider', ma.provider, 'bucket', ma.bucket, 'path', ma.path,
          'mimeType', ma.mime_type, 'fileSizeBytes', ma.file_size_bytes, 'checksum', ma.checksum
        ) end
      ) order by coalesce(c.sort_name, cl.display_name, c.display_name))
      from learning.cantors c
      left join learning.cantor_localizations cl on cl.cantor_id = c.id and cl.locale = p_locale
      left join media.media_assets ma on ma.id = c.profile_image_asset_id and ma.publication_status = 'published'
      where c.publication_status = 'published'
    ), '[]'::jsonb),
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'slug', s.slug, 'title', coalesce(sl.title, s.title),
        'description', coalesce(sl.description, s.description), 'sortOrder', s.sort_order
      ) order by s.sort_order, coalesce(sl.title, s.title))
      from learning.seasons s
      left join learning.season_localizations sl on sl.season_id = s.id and sl.locale = p_locale
      where s.publication_status = 'published'
    ), '[]'::jsonb)
  );
$$;

create or replace function public.get_published_learning_album(p_album_id uuid, p_locale text default 'en')
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', a.id,
    'title', coalesce(al.title, a.title),
    'description', coalesce(al.description, a.description),
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
$$;

create or replace function public.get_published_learning_lesson_set(p_lesson_set_id uuid, p_locale text default 'en')
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', ls.id,
    'title', coalesce(lsl.title, ls.title),
    'description', coalesce(lsl.description, ls.description),
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
$$;

create or replace function public.get_published_learning_cantor(p_cantor_id uuid, p_locale text default 'en')
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', c.id,
    'displayName', coalesce(cl.display_name, c.display_name),
    'biography', coalesce(cl.biography, c.biography),
    'profileImageAsset', case when image.id is null then null else jsonb_build_object('id', image.id, 'provider', image.provider, 'bucket', image.bucket, 'path', image.path, 'mimeType', image.mime_type, 'fileSizeBytes', image.file_size_bytes, 'checksum', image.checksum) end,
    'albums', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'title', coalesce(al.title, a.title), 'description', coalesce(al.description, a.description), 'seasonId', a.season_id) order by a.created_at desc)
      from learning.albums a
      left join learning.album_localizations al on al.album_id = a.id and al.locale = p_locale
      where a.cantor_id = c.id and a.publication_status = 'published'
    ), '[]'::jsonb),
    'lessonSets', coalesce((
      select jsonb_agg(jsonb_build_object('id', ls.id, 'title', coalesce(lsl.title, ls.title), 'description', coalesce(lsl.description, ls.description), 'seasonId', ls.season_id, 'hymnId', ls.hymn_id) order by ls.created_at desc)
      from learning.lesson_sets ls
      left join learning.lesson_set_localizations lsl on lsl.lesson_set_id = ls.id and lsl.locale = p_locale
      where ls.cantor_id = c.id and ls.publication_status = 'published'
    ), '[]'::jsonb)
  )
  from learning.cantors c
  left join learning.cantor_localizations cl on cl.cantor_id = c.id and cl.locale = p_locale
  left join media.media_assets image on image.id = c.profile_image_asset_id and image.publication_status = 'published'
  where c.id = p_cantor_id and c.publication_status = 'published';
$$;

create or replace function public.get_published_learning_season(p_season_id uuid, p_locale text default 'en')
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', s.id,
    'slug', s.slug,
    'title', coalesce(sl.title, s.title),
    'description', coalesce(sl.description, s.description),
    'hymns', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'sourceHymnKey', h.source_hymn_key, 'title', coalesce(hl.title, h.title), 'subtitle', coalesce(hl.subtitle, h.subtitle), 'sortOrder', hs.sort_order) order by hs.sort_order, coalesce(hl.title, h.title))
      from learning.hymn_seasons hs
      join learning.hymns h on h.id = hs.hymn_id and h.publication_status = 'published'
      left join learning.hymn_localizations hl on hl.hymn_id = h.id and hl.locale = p_locale
      where hs.season_id = s.id
    ), '[]'::jsonb),
    'albums', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'title', coalesce(al.title, a.title), 'cantorId', a.cantor_id) order by a.created_at desc)
      from learning.albums a
      left join learning.album_localizations al on al.album_id = a.id and al.locale = p_locale
      where a.season_id = s.id and a.publication_status = 'published'
    ), '[]'::jsonb),
    'lessonSets', coalesce((
      select jsonb_agg(jsonb_build_object('id', ls.id, 'title', coalesce(lsl.title, ls.title), 'cantorId', ls.cantor_id, 'hymnId', ls.hymn_id) order by ls.created_at desc)
      from learning.lesson_sets ls
      left join learning.lesson_set_localizations lsl on lsl.lesson_set_id = ls.id and lsl.locale = p_locale
      where ls.season_id = s.id and ls.publication_status = 'published'
    ), '[]'::jsonb)
  )
  from learning.seasons s
  left join learning.season_localizations sl on sl.season_id = s.id and sl.locale = p_locale
  where s.id = p_season_id and s.publication_status = 'published';
$$;

create or replace function public.get_published_learning_hymn(p_hymn_id uuid, p_locale text default 'en')
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', h.id,
    'sourceHymnKey', h.source_hymn_key,
    'title', coalesce(hl.title, h.title),
    'subtitle', coalesce(hl.subtitle, h.subtitle),
    'description', coalesce(hl.description, h.description),
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'title', coalesce(sl.title, s.title), 'sortOrder', hs.sort_order) order by hs.sort_order)
      from learning.hymn_seasons hs
      join learning.seasons s on s.id = hs.season_id and s.publication_status = 'published'
      left join learning.season_localizations sl on sl.season_id = s.id and sl.locale = p_locale
      where hs.hymn_id = h.id
    ), '[]'::jsonb),
    'relatedHymns', coalesce((
      select jsonb_agg(jsonb_build_object('id', rh.id, 'sourceHymnKey', rh.source_hymn_key, 'title', coalesce(rhl.title, rh.title), 'relationshipType', rel.relationship_type) order by rel.sort_order)
      from learning.hymn_relationships rel
      join learning.hymns rh on rh.id = rel.related_hymn_id and rh.publication_status = 'published'
      left join learning.hymn_localizations rhl on rhl.hymn_id = rh.id and rhl.locale = p_locale
      where rel.hymn_id = h.id
    ), '[]'::jsonb),
    'lessonSets', coalesce((
      select jsonb_agg(jsonb_build_object('id', ls.id, 'title', coalesce(lsl.title, ls.title), 'cantorId', ls.cantor_id, 'seasonId', ls.season_id) order by ls.created_at desc)
      from learning.lesson_sets ls
      left join learning.lesson_set_localizations lsl on lsl.lesson_set_id = ls.id and lsl.locale = p_locale
      where ls.hymn_id = h.id and ls.publication_status = 'published'
    ), '[]'::jsonb)
  )
  from learning.hymns h
  left join learning.hymn_localizations hl on hl.hymn_id = h.id and hl.locale = p_locale
  where h.id = p_hymn_id and h.publication_status = 'published';
$$;

create or replace function public.set_learning_progress(p_hymn_id uuid, p_state learning.progress_state)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not exists (select 1 from learning.hymns h where h.id = p_hymn_id and h.publication_status = 'published') then
    raise exception 'Published hymn not found';
  end if;

  insert into learning.hymn_progress (user_id, hymn_id, state, started_at, finished_at)
  values (
    auth.uid(), p_hymn_id, p_state,
    case when p_state in ('learning', 'finished') then now() else null end,
    case when p_state = 'finished' then now() else null end
  )
  on conflict (user_id, hymn_id) do update
  set state = excluded.state,
      started_at = case
        when excluded.state = 'will_learn' then null
        when learning.hymn_progress.started_at is null then now()
        else learning.hymn_progress.started_at
      end,
      finished_at = case when excluded.state = 'finished' then now() else null end;

  return (
    select jsonb_build_object('hymnId', hp.hymn_id, 'state', hp.state, 'startedAt', hp.started_at, 'finishedAt', hp.finished_at, 'updatedAt', hp.updated_at)
    from learning.hymn_progress hp
    where hp.user_id = auth.uid() and hp.hymn_id = p_hymn_id
  );
end;
$$;

create or replace function public.get_my_learning_progress(p_locale text default 'en')
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'authenticated', auth.uid() is not null,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'hymnId', hp.hymn_id,
        'state', hp.state,
        'title', coalesce(hl.title, h.title),
        'subtitle', coalesce(hl.subtitle, h.subtitle),
        'startedAt', hp.started_at,
        'finishedAt', hp.finished_at,
        'updatedAt', hp.updated_at
      ) order by hp.updated_at desc)
      from learning.hymn_progress hp
      join learning.hymns h on h.id = hp.hymn_id and h.publication_status = 'published'
      left join learning.hymn_localizations hl on hl.hymn_id = h.id and hl.locale = p_locale
      where hp.user_id = auth.uid()
    ), '[]'::jsonb)
  );
$$;

create or replace function public.create_learning_playlist(p_name text, p_description text default null, p_visibility learning.playlist_visibility default 'private')
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Playlist name is required'; end if;
  insert into learning.playlists (id, owner_user_id, name, description, visibility)
  values (v_id, auth.uid(), trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_visibility);
  return (select jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'visibility', p.visibility) from learning.playlists p where p.id = v_id);
end;
$$;

create or replace function public.add_learning_playlist_item(
  p_playlist_id uuid,
  p_item_kind learning.playlist_item_kind,
  p_album_recording_id uuid default null,
  p_lesson_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_sort integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from learning.playlists p where p.id = p_playlist_id and p.owner_user_id = auth.uid()) then raise exception 'Playlist not found'; end if;

  if p_item_kind = 'album_recording' then
    if p_album_recording_id is null or p_lesson_id is not null then raise exception 'album_recording_id is required for album recordings'; end if;
    if not exists (select 1 from learning.album_recordings r join learning.albums a on a.id = r.album_id where r.id = p_album_recording_id and r.publication_status = 'published' and a.publication_status = 'published') then raise exception 'Published recording not found'; end if;
  else
    if p_lesson_id is null or p_album_recording_id is not null then raise exception 'lesson_id is required for lessons'; end if;
    if not exists (select 1 from learning.lessons l join learning.lesson_sets ls on ls.id = l.lesson_set_id where l.id = p_lesson_id and l.publication_status = 'published' and ls.publication_status = 'published') then raise exception 'Published lesson not found'; end if;
  end if;

  select coalesce(max(pi.sort_order), -1) + 1 into v_sort from learning.playlist_items pi where pi.playlist_id = p_playlist_id;
  insert into learning.playlist_items (playlist_id, item_kind, album_recording_id, lesson_id, sort_order)
  values (p_playlist_id, p_item_kind, p_album_recording_id, p_lesson_id, v_sort);

  return public.get_learning_playlist(p_playlist_id, 'en');
end;
$$;

create or replace function public.remove_learning_playlist_item(p_playlist_id uuid, p_item_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from learning.playlist_items pi
  where pi.id = p_item_id and pi.playlist_id = p_playlist_id
    and exists (select 1 from learning.playlists p where p.id = p_playlist_id and p.owner_user_id = auth.uid());
  return public.get_learning_playlist(p_playlist_id, 'en');
end;
$$;

create or replace function public.get_learning_playlist(p_playlist_id uuid, p_locale text default 'en')
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'description', p.description, 'visibility', p.visibility,
    'items', coalesce((
      select jsonb_agg(
        case pi.item_kind
          when 'album_recording' then jsonb_build_object(
            'id', pi.id, 'kind', pi.item_kind, 'sortOrder', pi.sort_order,
            'recording', jsonb_build_object(
              'id', r.id, 'title', coalesce(rl.title, r.title), 'subtitle', coalesce(rl.subtitle, r.subtitle),
              'durationMs', coalesce(r.duration_ms, rma.duration_ms),
              'albumId', a.id, 'albumTitle', coalesce(al.title, a.title),
              'mediaAsset', jsonb_build_object('id', rma.id, 'provider', rma.provider, 'bucket', rma.bucket, 'path', rma.path, 'mimeType', rma.mime_type, 'durationMs', rma.duration_ms)
            )
          )
          else jsonb_build_object(
            'id', pi.id, 'kind', pi.item_kind, 'sortOrder', pi.sort_order,
            'lesson', jsonb_build_object(
              'id', l.id, 'mediaType', l.media_type, 'title', coalesce(ll.title, l.title), 'description', coalesce(ll.description, l.description),
              'durationMs', coalesce(l.duration_ms, lma.duration_ms),
              'lessonSetId', ls.id, 'lessonSetTitle', coalesce(lsl.title, ls.title),
              'mediaAsset', jsonb_build_object('id', lma.id, 'provider', lma.provider, 'bucket', lma.bucket, 'path', lma.path, 'mimeType', lma.mime_type, 'durationMs', lma.duration_ms)
            )
          )
        end order by pi.sort_order, pi.id
      )
      from learning.playlist_items pi
      left join learning.album_recordings r on r.id = pi.album_recording_id and r.publication_status = 'published'
      left join learning.recording_localizations rl on rl.recording_id = r.id and rl.locale = p_locale
      left join learning.albums a on a.id = r.album_id and a.publication_status = 'published'
      left join learning.album_localizations al on al.album_id = a.id and al.locale = p_locale
      left join media.media_assets rma on rma.id = r.media_asset_id and rma.publication_status = 'published'
      left join learning.lessons l on l.id = pi.lesson_id and l.publication_status = 'published'
      left join learning.lesson_localizations ll on ll.lesson_id = l.id and ll.locale = p_locale
      left join learning.lesson_sets ls on ls.id = l.lesson_set_id and ls.publication_status = 'published'
      left join learning.lesson_set_localizations lsl on lsl.lesson_set_id = ls.id and lsl.locale = p_locale
      left join media.media_assets lma on lma.id = l.media_asset_id and lma.publication_status = 'published'
      where pi.playlist_id = p.id
        and ((pi.item_kind = 'album_recording' and r.id is not null and a.id is not null and rma.id is not null)
          or (pi.item_kind = 'lesson' and l.id is not null and ls.id is not null and lma.id is not null))
    ), '[]'::jsonb)
  )
  from learning.playlists p
  where p.id = p_playlist_id;
$$;

create or replace function public.get_my_learning_playlists(p_locale text default 'en')
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'authenticated', auth.uid() is not null,
    'playlists', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'description', p.description, 'visibility', p.visibility,
        'itemCount', (select count(*) from learning.playlist_items pi where pi.playlist_id = p.id)
      ) order by p.updated_at desc)
      from learning.playlists p
      where p.owner_user_id = auth.uid()
    ), '[]'::jsonb)
  );
$$;

create or replace function public.publish_learning_cantor(p_cantor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'Admin access required'; end if;
  if not exists (select 1 from learning.cantors where id = p_cantor_id) then raise exception 'Cantor not found'; end if;
  if exists (
    select 1 from learning.cantors c
    left join media.media_assets ma on ma.id = c.profile_image_asset_id
    where c.id = p_cantor_id and c.profile_image_asset_id is not null
      and (ma.id is null or ma.publication_status <> 'published' or ma.processing_status <> 'completed')
  ) then raise exception 'Cantor profile image must be a published processed asset'; end if;
  update learning.cantors set publication_status = 'published', updated_by = auth.uid() where id = p_cantor_id;
  return jsonb_build_object('id', p_cantor_id, 'publicationStatus', 'published');
end;
$$;

create or replace function public.publish_learning_album(p_album_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_album learning.albums%rowtype;
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'Admin access required'; end if;
  select * into v_album from learning.albums where id = p_album_id;
  if not found then raise exception 'Learning album not found'; end if;
  if not exists (select 1 from learning.cantors c where c.id = v_album.cantor_id and c.publication_status = 'published') then raise exception 'Cantor must be published first'; end if;
  if v_album.season_id is not null and not exists (select 1 from learning.seasons s where s.id = v_album.season_id and s.publication_status = 'published') then raise exception 'Season must be published first'; end if;
  if v_album.submission_id is not null and not exists (select 1 from media.submissions s where s.id = v_album.submission_id and s.submission_type = 'learning_album' and s.creator_account_id = v_album.owner_creator_account_id and s.status in ('approved', 'published')) then raise exception 'Learning album submission must be approved'; end if;
  if not exists (select 1 from learning.album_recordings r where r.album_id = p_album_id) then raise exception 'Learning album must contain at least one recording'; end if;
  if exists (
    select 1 from learning.album_recordings r
    left join media.media_assets ma on ma.id = r.media_asset_id
    where r.album_id = p_album_id and (ma.id is null or ma.media_type <> 'audio' or ma.processing_status <> 'completed' or ma.publication_status <> 'published')
  ) then raise exception 'Every album recording must reference a published processed audio asset'; end if;
  if v_album.cover_asset_id is not null and not exists (select 1 from media.media_assets ma where ma.id = v_album.cover_asset_id and ma.media_type = 'image' and ma.processing_status = 'completed' and ma.publication_status = 'published') then raise exception 'Album cover must be a published processed image asset'; end if;
  update learning.album_recordings set publication_status = 'published', updated_by = auth.uid() where album_id = p_album_id;
  update learning.albums set publication_status = 'published', updated_by = auth.uid() where id = p_album_id;
  return jsonb_build_object('id', p_album_id, 'publicationStatus', 'published');
end;
$$;

create or replace function public.publish_learning_lesson_set(p_lesson_set_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_set learning.lesson_sets%rowtype;
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'Admin access required'; end if;
  select * into v_set from learning.lesson_sets where id = p_lesson_set_id;
  if not found then raise exception 'Learning lesson set not found'; end if;
  if not exists (select 1 from learning.cantors c where c.id = v_set.cantor_id and c.publication_status = 'published') then raise exception 'Cantor must be published first'; end if;
  if not exists (select 1 from learning.hymns h where h.id = v_set.hymn_id and h.publication_status = 'published') then raise exception 'Hymn must be published first'; end if;
  if v_set.season_id is not null and not exists (select 1 from learning.seasons s where s.id = v_set.season_id and s.publication_status = 'published') then raise exception 'Season must be published first'; end if;
  if v_set.submission_id is not null and not exists (select 1 from media.submissions s where s.id = v_set.submission_id and s.submission_type = 'learning_lesson_set' and s.creator_account_id = v_set.owner_creator_account_id and s.status in ('approved', 'published')) then raise exception 'Learning lesson-set submission must be approved'; end if;
  if not exists (select 1 from learning.lessons l where l.lesson_set_id = p_lesson_set_id) then raise exception 'Lesson set must contain at least one lesson'; end if;
  if exists (
    select 1 from learning.lessons l
    left join media.media_assets ma on ma.id = l.media_asset_id
    where l.lesson_set_id = p_lesson_set_id
      and (ma.id is null or ma.media_type::text <> l.media_type::text or ma.processing_status <> 'completed' or ma.publication_status <> 'published')
  ) then raise exception 'Every lesson must reference a published processed asset of the matching media type'; end if;
  if v_set.cover_asset_id is not null and not exists (select 1 from media.media_assets ma where ma.id = v_set.cover_asset_id and ma.media_type = 'image' and ma.processing_status = 'completed' and ma.publication_status = 'published') then raise exception 'Lesson-set cover must be a published processed image asset'; end if;
  update learning.lessons set publication_status = 'published', updated_by = auth.uid() where lesson_set_id = p_lesson_set_id;
  update learning.lesson_sets set publication_status = 'published', updated_by = auth.uid() where id = p_lesson_set_id;
  return jsonb_build_object('id', p_lesson_set_id, 'publicationStatus', 'published');
end;
$$;

revoke all on function public.publish_learning_cantor(uuid) from public;
revoke all on function public.publish_learning_album(uuid) from public;
revoke all on function public.publish_learning_lesson_set(uuid) from public;
grant execute on function public.publish_learning_cantor(uuid) to authenticated;
grant execute on function public.publish_learning_album(uuid) to authenticated;
grant execute on function public.publish_learning_lesson_set(uuid) to authenticated;

grant execute on function public.get_learning_home(text) to anon, authenticated;
grant execute on function public.get_published_learning_album(uuid, text) to anon, authenticated;
grant execute on function public.get_published_learning_lesson_set(uuid, text) to anon, authenticated;
grant execute on function public.get_published_learning_cantor(uuid, text) to anon, authenticated;
grant execute on function public.get_published_learning_season(uuid, text) to anon, authenticated;
grant execute on function public.get_published_learning_hymn(uuid, text) to anon, authenticated;
grant execute on function public.set_learning_progress(uuid, learning.progress_state) to authenticated;
grant execute on function public.get_my_learning_progress(text) to authenticated;
grant execute on function public.create_learning_playlist(text, text, learning.playlist_visibility) to authenticated;
grant execute on function public.add_learning_playlist_item(uuid, learning.playlist_item_kind, uuid, uuid) to authenticated;
grant execute on function public.remove_learning_playlist_item(uuid, uuid) to authenticated;
grant execute on function public.get_learning_playlist(uuid, text) to anon, authenticated;
grant execute on function public.get_my_learning_playlists(text) to authenticated;
