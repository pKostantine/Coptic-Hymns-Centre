-- Keep the simplified lyric save RPC compatible with the existing lyric RLS
-- model: write first, then select the row through the normal owner-visible
-- SELECT policy instead of relying on INSERT/UPDATE ... RETURNING.

create or replace function public.save_track_lyric_language_draft(
  p_track_id uuid,
  p_locale text,
  p_description text default null,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
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

  if not exists (
    select 1 from media.locales locale
    where locale.code = p_locale and locale.enabled
  ) then
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
    and lyric_set.kind = 'original'::music.lyric_kind
  for update;

  if found and lyric_set_record.publication_status = 'published'::media.publication_status then
    raise exception 'Published lyric sets cannot be edited here' using errcode = '22023';
  end if;

  if not found then
    insert into music.lyric_sets (
      track_id,
      locale,
      kind,
      sync_precision,
      title,
      source,
      description,
      publication_status,
      created_by,
      updated_by
    ) values (
      p_track_id,
      p_locale,
      'original'::music.lyric_kind,
      'line'::music.lyric_sync_precision,
      null,
      null,
      nullif(trim(p_description), ''),
      'draft'::media.publication_status,
      request_user_id,
      request_user_id
    );
  else
    update music.lyric_sets lyric_set
    set sync_precision = 'line'::music.lyric_sync_precision,
        title = null,
        source = null,
        description = nullif(trim(p_description), ''),
        publication_status = 'draft'::media.publication_status,
        updated_by = request_user_id,
        updated_at = now()
    where lyric_set.id = lyric_set_record.id;
  end if;

  select *
  into strict lyric_set_record
  from music.lyric_sets lyric_set
  where lyric_set.track_id = p_track_id
    and lyric_set.locale = p_locale
    and lyric_set.kind = 'original'::music.lyric_kind;

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
    'description', lyric_set_record.description,
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
$function$;

revoke all on function public.save_track_lyric_language_draft(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_track_lyric_language_draft(uuid, text, text, jsonb) to authenticated;
