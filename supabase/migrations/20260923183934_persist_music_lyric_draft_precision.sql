alter table music.lyric_edit_drafts
  add column if not exists sync_precision music.lyric_sync_precision not null default 'line';

create or replace function public.save_track_lyric_studio_draft_v2(
  p_track_id uuid,
  p_sync_precision music.lyric_sync_precision,
  p_languages jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  request_user_id uuid := auth.uid();
  language_row record;
  normalized_lines jsonb;
  saved_languages jsonb := '[]'::jsonb;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not private.music_track_is_editable(p_track_id) then
    raise exception 'Track not found or not editable' using errcode = '42501';
  end if;

  if p_sync_precision not in ('unsynced', 'line') then
    raise exception 'Unsupported lyric sync precision' using errcode = '22023';
  end if;

  if p_languages is null or jsonb_typeof(p_languages) <> 'array' then
    raise exception 'p_languages must be a JSON array' using errcode = '22023';
  end if;

  for language_row in
    select language.value
    from jsonb_array_elements(p_languages) with ordinality language(value, ordinality)
    order by language.ordinality
  loop
    if not exists (
      select 1
      from media.locales locale
      where locale.code = language_row.value->>'locale'
        and locale.enabled
    ) then
      raise exception 'Unsupported or disabled lyric locale' using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', nullif(line.value->>'id', ''),
      'sequence', line.ordinality::integer,
      'startMs', case
        when p_sync_precision = 'unsynced'
          or nullif(trim(coalesce(line.value->>'startMs', '')), '') is null then null
        else (line.value->>'startMs')::bigint
      end,
      'endMs', case
        when p_sync_precision = 'unsynced'
          or nullif(trim(coalesce(line.value->>'endMs', '')), '') is null then null
        else (line.value->>'endMs')::bigint
      end,
      'text', coalesce(line.value->>'text', '')
    ) order by line.ordinality), '[]'::jsonb)
    into normalized_lines
    from jsonb_array_elements(coalesce(language_row.value->'lines', '[]'::jsonb))
      with ordinality line(value, ordinality);

    insert into music.lyric_edit_drafts (
      track_id,
      locale,
      sync_precision,
      description,
      lines,
      created_by,
      updated_by
    ) values (
      p_track_id,
      language_row.value->>'locale',
      p_sync_precision,
      nullif(trim(language_row.value->>'description'), ''),
      normalized_lines,
      request_user_id,
      request_user_id
    )
    on conflict (track_id, locale) do update
    set sync_precision = excluded.sync_precision,
        description = excluded.description,
        lines = excluded.lines,
        updated_by = request_user_id,
        updated_at = now();

    saved_languages := saved_languages || jsonb_build_array(jsonb_build_object(
      'trackId', p_track_id,
      'locale', language_row.value->>'locale',
      'description', nullif(trim(language_row.value->>'description'), ''),
      'publicationStatus', 'draft',
      'hasDraft', true,
      'syncPrecision', p_sync_precision,
      'lines', normalized_lines
    ));
  end loop;

  return jsonb_build_object(
    'trackId', p_track_id,
    'languages', saved_languages,
    'savedAt', now()
  );
end;
$function$;

create or replace function public.get_track_lyric_language_draft(
  p_track_id uuid,
  p_locale text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  draft music.lyric_edit_drafts%rowtype;
  lyric_set music.lyric_sets%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not private.music_track_is_editable(p_track_id) then
    raise exception 'Track not found or not editable' using errcode = '42501';
  end if;

  select * into draft
  from music.lyric_edit_drafts
  where track_id = p_track_id and locale = p_locale;

  select * into lyric_set
  from music.lyric_sets
  where track_id = p_track_id
    and locale = p_locale
    and kind = 'original'::music.lyric_kind;

  if draft.track_id is not null then
    return jsonb_build_object(
      'id', lyric_set.id,
      'trackId', p_track_id,
      'locale', p_locale,
      'description', draft.description,
      'publicationStatus', coalesce(lyric_set.publication_status, 'draft'::media.publication_status),
      'hasDraft', true,
      'syncPrecision', draft.sync_precision,
      'lines', draft.lines
    );
  end if;

  if lyric_set.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', lyric_set.id,
    'trackId', p_track_id,
    'locale', p_locale,
    'description', lyric_set.description,
    'publicationStatus', lyric_set.publication_status,
    'hasDraft', false,
    'syncPrecision', lyric_set.sync_precision,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', line.id,
        'sequence', line.sequence,
        'startMs', line.start_ms,
        'endMs', line.end_ms,
        'text', line.text
      ) order by line.sequence)
      from music.lyric_lines line
      where line.lyric_set_id = lyric_set.id
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.save_track_lyric_studio_draft_v2(uuid,music.lyric_sync_precision,jsonb) from public,anon;
revoke all on function public.get_track_lyric_language_draft(uuid,text) from public,anon;
grant execute on function public.save_track_lyric_studio_draft_v2(uuid,music.lyric_sync_precision,jsonb) to authenticated;
grant execute on function public.get_track_lyric_language_draft(uuid,text) to authenticated;
