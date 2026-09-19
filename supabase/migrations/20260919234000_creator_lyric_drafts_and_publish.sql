-- Creator-owned lyric revision drafts.
-- Published lyrics remain live while CHC Artists continuously autosaves edits
-- here. Pressing Publish validates the shared timeline, replaces the live
-- canonical lyric sets, and clears the draft rows.

create table if not exists music.lyric_edit_drafts (
  track_id uuid not null references music.tracks(id) on delete cascade,
  locale text not null references media.locales(code),
  description text,
  lines jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (track_id, locale),
  constraint lyric_edit_drafts_description_not_blank
    check (description is null or length(trim(description)) > 0),
  constraint lyric_edit_drafts_lines_array
    check (jsonb_typeof(lines) = 'array')
);

drop trigger if exists lyric_edit_drafts_set_updated_at on music.lyric_edit_drafts;
create trigger lyric_edit_drafts_set_updated_at
before update on music.lyric_edit_drafts
for each row execute function private.set_updated_at();

alter table music.lyric_edit_drafts enable row level security;

revoke all on table music.lyric_edit_drafts from public, anon;
grant select, insert, update, delete on table music.lyric_edit_drafts to authenticated;
grant all on table music.lyric_edit_drafts to service_role;

drop policy if exists lyric_edit_drafts_select_owner on music.lyric_edit_drafts;
create policy lyric_edit_drafts_select_owner
on music.lyric_edit_drafts for select
to authenticated
using ((select private.music_track_is_editable(track_id)));

drop policy if exists lyric_edit_drafts_insert_owner on music.lyric_edit_drafts;
create policy lyric_edit_drafts_insert_owner
on music.lyric_edit_drafts for insert
to authenticated
with check ((select private.music_track_is_editable(track_id)));

drop policy if exists lyric_edit_drafts_update_owner on music.lyric_edit_drafts;
create policy lyric_edit_drafts_update_owner
on music.lyric_edit_drafts for update
to authenticated
using ((select private.music_track_is_editable(track_id)))
with check ((select private.music_track_is_editable(track_id)));

drop policy if exists lyric_edit_drafts_delete_owner on music.lyric_edit_drafts;
create policy lyric_edit_drafts_delete_owner
on music.lyric_edit_drafts for delete
to authenticated
using ((select private.music_track_is_editable(track_id)));

create or replace function public.get_track_lyric_language_draft(
  p_track_id uuid,
  p_locale text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $function$
declare
  request_user_id uuid := auth.uid();
  draft_record music.lyric_edit_drafts%rowtype;
  lyric_set_record music.lyric_sets%rowtype;
  payload jsonb;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.music_track_is_editable(p_track_id)) then
    raise exception 'Track not found or not editable' using errcode = '42501';
  end if;

  select *
  into draft_record
  from music.lyric_edit_drafts draft
  where draft.track_id = p_track_id
    and draft.locale = p_locale;

  select *
  into lyric_set_record
  from music.lyric_sets lyric_set
  where lyric_set.track_id = p_track_id
    and lyric_set.locale = p_locale
    and lyric_set.kind = 'original'::music.lyric_kind;

  if draft_record.track_id is not null then
    return jsonb_build_object(
      'id', lyric_set_record.id,
      'trackId', p_track_id,
      'locale', p_locale,
      'description', draft_record.description,
      'publicationStatus', coalesce(lyric_set_record.publication_status, 'draft'::media.publication_status),
      'hasDraft', true,
      'lines', draft_record.lines
    );
  end if;

  if lyric_set_record.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', lyric_set_record.id,
    'trackId', lyric_set_record.track_id,
    'locale', lyric_set_record.locale,
    'description', lyric_set_record.description,
    'publicationStatus', lyric_set_record.publication_status,
    'hasDraft', false,
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
  )
  into payload;

  return payload;
end;
$function$;

create or replace function public.save_track_lyric_language_draft(
  p_track_id uuid,
  p_locale text,
  p_description text default null,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  lyric_set_record music.lyric_sets%rowtype;
  normalized_lines jsonb;
  draft_id uuid;
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

  -- Drafts deliberately allow blank/untimed rows: the studio continuously
  -- saves while the artist is still typing/synchronizing. Publish validates.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', nullif(line.value->>'id', ''),
    'sequence', line.ordinality::integer,
    'startMs', case
      when nullif(trim(coalesce(line.value->>'startMs', '')), '') is null then null
      else (line.value->>'startMs')::bigint
    end,
    'endMs', case
      when nullif(trim(coalesce(line.value->>'endMs', '')), '') is null then null
      else (line.value->>'endMs')::bigint
    end,
    'text', coalesce(line.value->>'text', '')
  ) order by line.ordinality), '[]'::jsonb)
  into normalized_lines
  from jsonb_array_elements(p_lines) with ordinality line(value, ordinality);

  insert into music.lyric_edit_drafts (
    track_id,
    locale,
    description,
    lines,
    created_by,
    updated_by
  ) values (
    p_track_id,
    p_locale,
    nullif(trim(p_description), ''),
    normalized_lines,
    request_user_id,
    request_user_id
  )
  on conflict (track_id, locale) do update
  set description = excluded.description,
      lines = excluded.lines,
      updated_by = request_user_id,
      updated_at = now();

  select *
  into lyric_set_record
  from music.lyric_sets lyric_set
  where lyric_set.track_id = p_track_id
    and lyric_set.locale = p_locale
    and lyric_set.kind = 'original'::music.lyric_kind;

  return jsonb_build_object(
    'id', lyric_set_record.id,
    'trackId', p_track_id,
    'locale', p_locale,
    'description', nullif(trim(p_description), ''),
    'publicationStatus', coalesce(lyric_set_record.publication_status, 'draft'::media.publication_status),
    'hasDraft', true,
    'lines', normalized_lines
  );
end;
$function$;

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
  lyric_set_id uuid;
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
      select 1 from media.locales locale
      where locale.code = requested_locale and locale.enabled
    ) then
      raise exception 'Unsupported or disabled lyric locale: %', requested_locale using errcode = '22023';
    end if;

    select draft.description, draft.lines
    into source_description, source_lines
    from music.lyric_edit_drafts draft
    where draft.track_id = p_track_id
      and draft.locale = requested_locale;

    if source_lines is null then
      select lyric_set.description,
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

    select count(*)::integer
    into invalid_count
    from jsonb_array_elements(source_lines) line
    where length(trim(coalesce(line->>'text', ''))) = 0
       or nullif(trim(coalesce(line->>'startMs', '')), '') is null;

    if invalid_count > 0 then
      raise exception 'Every % lyric line must have text and a synchronized start time before publishing', requested_locale using errcode = '22023';
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
      raise exception '% lyric timestamps must be ordered by line', requested_locale using errcode = '22023';
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
      raise exception '% lyric line end times must not overlap the next line', requested_locale using errcode = '22023';
    end if;

    select lyric_set.id
    into lyric_set_id
    from music.lyric_sets lyric_set
    where lyric_set.track_id = p_track_id
      and lyric_set.locale = requested_locale
      and lyric_set.kind = 'original'::music.lyric_kind
    for update;

    if lyric_set_id is null then
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
      returning id into lyric_set_id;
    else
      update music.lyric_sets lyric_set
      set sync_precision = 'line'::music.lyric_sync_precision,
          description = nullif(trim(source_description), ''),
          publication_status = 'published'::media.publication_status,
          updated_by = request_user_id,
          updated_at = now()
      where lyric_set.id = lyric_set_id;
    end if;

    delete from music.lyric_lines lyric_line
    where lyric_line.lyric_set_id = lyric_set_id;

    insert into music.lyric_lines (
      lyric_set_id,
      sequence,
      start_ms,
      end_ms,
      text
    )
    select
      lyric_set_id,
      line.ordinality::integer,
      (line.value->>'startMs')::bigint,
      case
        when nullif(trim(coalesce(line.value->>'endMs', '')), '') is null then null
        else (line.value->>'endMs')::bigint
      end,
      trim(line.value->>'text')
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

revoke all on function public.get_track_lyric_language_draft(uuid, text) from public, anon;
revoke all on function public.save_track_lyric_language_draft(uuid, text, text, jsonb) from public, anon;
revoke all on function public.publish_track_lyric_languages(uuid, text[]) from public, anon;

grant execute on function public.get_track_lyric_language_draft(uuid, text) to authenticated;
grant execute on function public.save_track_lyric_language_draft(uuid, text, text, jsonb) to authenticated;
grant execute on function public.publish_track_lyric_languages(uuid, text[]) to authenticated;
