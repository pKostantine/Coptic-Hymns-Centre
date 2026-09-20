-- Lyrics Studio follow-up:
-- 1. Empty text is valid for an individual language on a shared lyric row.
-- 2. Fix the ambiguous lyric_set_id PL/pgSQL variable in creator publishing.
-- 3. Add one atomic RPC that saves the complete multilingual studio snapshot.

alter table music.lyric_lines
  drop constraint if exists lyric_lines_text_not_blank;

create or replace function public.publish_track_lyric_languages(
  p_track_id uuid,
  p_locales text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  requested_locale text;
  source_description text;
  source_lines jsonb;
  v_lyric_set_id uuid;
  invalid_count integer;
  published_locales text[] := '{}'::text[];
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.music_track_is_editable(p_track_id)) then
    raise exception 'Track not found or not editable' using errcode = '42501';
  end if;

  if p_locales is null or cardinality(p_locales) = 0 then
    raise exception 'Choose at least one lyric language to publish' using errcode = '22023';
  end if;

  foreach requested_locale in array p_locales loop
    if not exists (
      select 1
      from media.locales locale
      where locale.code = requested_locale
        and locale.enabled
    ) then
      raise exception 'Unsupported or disabled lyric locale: %', requested_locale using errcode = '22023';
    end if;

    select draft.description, draft.lines
    into source_description, source_lines
    from music.lyric_edit_drafts draft
    where draft.track_id = p_track_id
      and draft.locale = requested_locale;

    if source_lines is null then
      select
        lyric_set.description,
        coalesce((
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
      into source_description, source_lines
      from music.lyric_sets lyric_set
      where lyric_set.track_id = p_track_id
        and lyric_set.locale = requested_locale
        and lyric_set.kind = 'original'::music.lyric_kind;
    end if;

    if source_lines is null or jsonb_array_length(source_lines) = 0 then
      raise exception 'Add at least one % lyric line before publishing', requested_locale using errcode = '22023';
    end if;

    -- Text may intentionally be blank in one language for a shared row.
    -- Timing belongs to the shared row and is still required for publication.
    select count(*)::integer
    into invalid_count
    from jsonb_array_elements(source_lines) line
    where nullif(trim(coalesce(line->>'startMs', '')), '') is null;

    if invalid_count > 0 then
      raise exception 'Every lyric row needs a synchronized start time before publishing' using errcode = '22023';
    end if;

    select count(*)::integer
    into invalid_count
    from (
      select
        (line.value->>'startMs')::bigint as start_ms,
        lag((line.value->>'startMs')::bigint) over (order by line.ordinality) as previous_start_ms
      from jsonb_array_elements(source_lines) with ordinality line(value, ordinality)
    ) ordered_line
    where ordered_line.previous_start_ms is not null
      and ordered_line.start_ms < ordered_line.previous_start_ms;

    if invalid_count > 0 then
      raise exception 'Lyric timestamps must be ordered by line' using errcode = '22023';
    end if;

    select count(*)::integer
    into invalid_count
    from (
      select
        case
          when nullif(trim(coalesce(line.value->>'endMs', '')), '') is null then null
          else (line.value->>'endMs')::bigint
        end as end_ms,
        lead((line.value->>'startMs')::bigint) over (order by line.ordinality) as next_start_ms
      from jsonb_array_elements(source_lines) with ordinality line(value, ordinality)
    ) ordered_line
    where ordered_line.end_ms is not null
      and ordered_line.next_start_ms is not null
      and ordered_line.end_ms > ordered_line.next_start_ms;

    if invalid_count > 0 then
      raise exception 'Lyric line end times must not overlap the next line' using errcode = '22023';
    end if;

    select lyric_set.id
    into v_lyric_set_id
    from music.lyric_sets lyric_set
    where lyric_set.track_id = p_track_id
      and lyric_set.locale = requested_locale
      and lyric_set.kind = 'original'::music.lyric_kind
    for update;

    if v_lyric_set_id is null then
      insert into music.lyric_sets (
        track_id,
        locale,
        kind,
        sync_precision,
        description,
        publication_status,
        created_by,
        updated_by
      ) values (
        p_track_id,
        requested_locale,
        'original'::music.lyric_kind,
        'line'::music.lyric_sync_precision,
        nullif(trim(source_description), ''),
        'published'::media.publication_status,
        request_user_id,
        request_user_id
      )
      returning id into v_lyric_set_id;
    else
      update music.lyric_sets lyric_set
      set sync_precision = 'line'::music.lyric_sync_precision,
          description = nullif(trim(source_description), ''),
          publication_status = 'published'::media.publication_status,
          updated_by = request_user_id,
          updated_at = now()
      where lyric_set.id = v_lyric_set_id;
    end if;

    delete from music.lyric_lines lyric_line
    where lyric_line.lyric_set_id = v_lyric_set_id;

    insert into music.lyric_lines (
      lyric_set_id,
      sequence,
      start_ms,
      end_ms,
      text
    )
    select
      v_lyric_set_id,
      line.ordinality::integer,
      (line.value->>'startMs')::bigint,
      case
        when nullif(trim(coalesce(line.value->>'endMs', '')), '') is null then null
        else (line.value->>'endMs')::bigint
      end,
      coalesce(line.value->>'text', '')
    from jsonb_array_elements(source_lines) with ordinality line(value, ordinality);

    delete from music.lyric_edit_drafts draft
    where draft.track_id = p_track_id
      and draft.locale = requested_locale;

    published_locales := array_append(published_locales, requested_locale);
  end loop;

  return jsonb_build_object(
    'trackId', p_track_id,
    'locales', to_jsonb(published_locales),
    'publishedAt', now()
  );
end;
$function$;

create or replace function public.save_track_lyric_studio_draft(
  p_track_id uuid,
  p_languages jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  language_row record;
  saved_language jsonb;
  saved_languages jsonb := '[]'::jsonb;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.music_track_is_editable(p_track_id)) then
    raise exception 'Track not found or not editable' using errcode = '42501';
  end if;

  if p_languages is null or jsonb_typeof(p_languages) <> 'array' then
    raise exception 'p_languages must be a JSON array' using errcode = '22023';
  end if;

  for language_row in
    select
      language.value->>'locale' as locale,
      language.value->>'description' as description,
      coalesce(language.value->'lines', '[]'::jsonb) as lines
    from jsonb_array_elements(p_languages) with ordinality language(value, ordinality)
    order by language.ordinality
  loop
    if nullif(trim(coalesce(language_row.locale, '')), '') is null then
      raise exception 'Every studio draft language needs a locale' using errcode = '22023';
    end if;

    saved_language := public.save_track_lyric_language_draft(
      p_track_id,
      language_row.locale,
      language_row.description,
      language_row.lines
    );

    saved_languages := saved_languages || jsonb_build_array(saved_language);
  end loop;

  return jsonb_build_object(
    'trackId', p_track_id,
    'languages', saved_languages,
    'savedAt', now()
  );
end;
$function$;

revoke all on function public.publish_track_lyric_languages(uuid, text[]) from public, anon;
revoke all on function public.save_track_lyric_studio_draft(uuid, jsonb) from public, anon;

grant execute on function public.publish_track_lyric_languages(uuid, text[]) to authenticated;
grant execute on function public.save_track_lyric_studio_draft(uuid, jsonb) to authenticated;
