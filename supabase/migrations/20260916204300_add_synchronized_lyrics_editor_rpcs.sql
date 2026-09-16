create or replace function public.get_lyric_editor_tracks()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  request_user_id uuid := auth.uid();
  payload jsonb;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select coalesce(jsonb_agg(track_row.payload order by track_row.updated_at desc, track_row.title), '[]'::jsonb)
  into payload
  from (
    select
      track.updated_at,
      track.title,
      jsonb_build_object(
        'id', track.id,
        'title', track.title,
        'subtitle', track.subtitle,
        'durationMs', track.duration_ms,
        'publicationStatus', track.publication_status,
        'mediaAsset', case when asset.id is null then null else jsonb_build_object(
          'id', asset.id,
          'provider', asset.provider,
          'bucket', asset.bucket,
          'path', asset.path,
          'mimeType', asset.mime_type,
          'durationMs', asset.duration_ms,
          'publicationStatus', asset.publication_status
        ) end
      ) as payload
    from music.tracks track
    left join media.media_assets asset on asset.id = track.media_asset_id
    where (select private.music_track_is_editable(track.id))
  ) track_row;

  return payload;
end;
$$;

create or replace function public.get_track_lyric_draft(
  p_track_id uuid,
  p_locale text,
  p_kind music.lyric_kind
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  request_user_id uuid := auth.uid();
  payload jsonb;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.music_track_is_editable(p_track_id)) then
    raise exception 'Track not found or not editable' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', lyric_set.id,
    'trackId', lyric_set.track_id,
    'locale', lyric_set.locale,
    'kind', lyric_set.kind,
    'syncPrecision', lyric_set.sync_precision,
    'title', lyric_set.title,
    'source', lyric_set.source,
    'publicationStatus', lyric_set.publication_status,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', lyric_line.id,
        'sequence', lyric_line.sequence,
        'startMs', lyric_line.start_ms,
        'endMs', lyric_line.end_ms,
        'text', lyric_line.text
      ) order by lyric_line.sequence)
      from music.lyric_lines lyric_line
      where lyric_line.lyric_set_id = lyric_set.id
    ), '[]'::jsonb)
  )
  into payload
  from music.lyric_sets lyric_set
  where lyric_set.track_id = p_track_id
    and lyric_set.locale = p_locale
    and lyric_set.kind = p_kind;

  return payload;
end;
$$;

create or replace function public.save_track_lyric_draft(
  p_track_id uuid,
  p_locale text,
  p_kind music.lyric_kind,
  p_sync_precision music.lyric_sync_precision,
  p_title text default null,
  p_source text default null,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  lyric_set_record music.lyric_sets%rowtype;
  payload jsonb;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.music_track_is_editable(p_track_id)) then
    raise exception 'Track not found or not editable' using errcode = '42501';
  end if;

  if not exists (select 1 from media.locales locale where locale.code = p_locale and locale.enabled) then
    raise exception 'Unsupported or disabled lyric locale' using errcode = '22023';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'p_lines must be a JSON array' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lines) line
    where length(trim(coalesce(line->>'text', ''))) = 0
  ) then
    raise exception 'Every lyric line must contain nonblank text' using errcode = '22023';
  end if;

  select *
  into lyric_set_record
  from music.lyric_sets lyric_set
  where lyric_set.track_id = p_track_id
    and lyric_set.locale = p_locale
    and lyric_set.kind = p_kind
  for update;

  if found and lyric_set_record.publication_status = 'published'::media.publication_status then
    raise exception 'Published lyric sets cannot be replaced by draft save; create a revision workflow first' using errcode = '22023';
  end if;

  if not found then
    insert into music.lyric_sets (
      track_id,
      locale,
      kind,
      sync_precision,
      title,
      source,
      publication_status,
      created_by,
      updated_by
    ) values (
      p_track_id,
      p_locale,
      p_kind,
      p_sync_precision,
      nullif(trim(p_title), ''),
      nullif(trim(p_source), ''),
      'draft'::media.publication_status,
      request_user_id,
      request_user_id
    )
    returning * into lyric_set_record;
  else
    update music.lyric_sets lyric_set
    set sync_precision = p_sync_precision,
        title = nullif(trim(p_title), ''),
        source = nullif(trim(p_source), ''),
        publication_status = 'draft'::media.publication_status,
        updated_by = request_user_id,
        updated_at = now()
    where lyric_set.id = lyric_set_record.id
    returning * into lyric_set_record;
  end if;

  delete from music.lyric_lines lyric_line
  where lyric_line.lyric_set_id = lyric_set_record.id;

  insert into music.lyric_lines (
    lyric_set_id,
    sequence,
    start_ms,
    end_ms,
    text
  )
  select
    lyric_set_record.id,
    line.ordinality::integer,
    case
      when line.value->>'startMs' is null or trim(line.value->>'startMs') = '' then null
      else (line.value->>'startMs')::bigint
    end,
    case
      when line.value->>'endMs' is null or trim(line.value->>'endMs') = '' then null
      else (line.value->>'endMs')::bigint
    end,
    trim(line.value->>'text')
  from jsonb_array_elements(p_lines) with ordinality as line(value, ordinality);

  select jsonb_build_object(
    'id', lyric_set_record.id,
    'trackId', lyric_set_record.track_id,
    'locale', lyric_set_record.locale,
    'kind', lyric_set_record.kind,
    'syncPrecision', lyric_set_record.sync_precision,
    'title', lyric_set_record.title,
    'source', lyric_set_record.source,
    'publicationStatus', lyric_set_record.publication_status,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', lyric_line.id,
        'sequence', lyric_line.sequence,
        'startMs', lyric_line.start_ms,
        'endMs', lyric_line.end_ms,
        'text', lyric_line.text
      ) order by lyric_line.sequence)
      from music.lyric_lines lyric_line
      where lyric_line.lyric_set_id = lyric_set_record.id
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

revoke all on function public.get_lyric_editor_tracks() from public;
revoke all on function public.get_track_lyric_draft(uuid, text, music.lyric_kind) from public;
revoke all on function public.save_track_lyric_draft(uuid, text, music.lyric_kind, music.lyric_sync_precision, text, text, jsonb) from public;

grant execute on function public.get_lyric_editor_tracks() to authenticated;
grant execute on function public.get_track_lyric_draft(uuid, text, music.lyric_kind) to authenticated;
grant execute on function public.save_track_lyric_draft(uuid, text, music.lyric_kind, music.lyric_sync_precision, text, text, jsonb) to authenticated;
