-- Music release metadata and automatic release classification.
--
-- Release type is a derived value:
--   1 track  = single
--   2-6      = EP
--   7+       = album
-- Keeping this in the database prevents Artists, Admin, or a future client from
-- accidentally disagreeing about the same release.

create or replace function private.sync_music_release_type(p_release_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  track_count integer;
  inferred music.release_type;
begin
  if p_release_id is null then
    return;
  end if;

  select count(*)
  into track_count
  from music.release_tracks release_track
  where release_track.release_id = p_release_id;

  -- A release should never finish with zero tracks. Do not rewrite the type
  -- during temporary delete/reinsert phases used by editors.
  if track_count = 0 then
    return;
  end if;

  inferred := case
    when track_count = 1 then 'single'::music.release_type
    when track_count between 2 and 6 then 'ep'::music.release_type
    else 'album'::music.release_type
  end;

  update music.releases
  set release_type = inferred,
      updated_at = case when release_type is distinct from inferred then now() else updated_at end
  where id = p_release_id
    and release_type is distinct from inferred;
end;
$function$;

create or replace function private.sync_music_release_type_trigger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    perform private.sync_music_release_type(old.release_id);
    return old;
  end if;

  perform private.sync_music_release_type(new.release_id);

  if tg_op = 'UPDATE' and old.release_id is distinct from new.release_id then
    perform private.sync_music_release_type(old.release_id);
  end if;

  return new;
end;
$function$;

drop trigger if exists release_tracks_sync_release_type on music.release_tracks;
create trigger release_tracks_sync_release_type
after insert or delete or update of release_id
on music.release_tracks
for each row
execute function private.sync_music_release_type_trigger();

-- Normalize existing catalog rows once; the trigger keeps them correct after this.
update music.releases release
set release_type = case
  when counts.track_count = 1 then 'single'::music.release_type
  when counts.track_count between 2 and 6 then 'ep'::music.release_type
  else 'album'::music.release_type
end,
updated_at = now()
from (
  select release_id, count(*)::integer as track_count
  from music.release_tracks
  group by release_id
) counts
where release.id = counts.release_id
  and release.release_type is distinct from case
    when counts.track_count = 1 then 'single'::music.release_type
    when counts.track_count between 2 and 6 then 'ep'::music.release_type
    else 'album'::music.release_type
  end;

-- Replace the previous overload so PostgREST has one unambiguous RPC signature.
drop function if exists public.create_creator_submission_v2(
  uuid, text, text, text, music.release_type, uuid, uuid, uuid, uuid,
  jsonb, jsonb, timestamptz, date
);

create or replace function public.create_creator_submission_v2(
  p_creator_account_id uuid,
  p_mode text,
  p_title text,
  p_description text default null::text,
  p_release_type music.release_type default null::music.release_type,
  p_music_type text default null::text,
  p_recording_type text default null::text,
  p_artist_id uuid default null::uuid,
  p_cantor_id uuid default null::uuid,
  p_season_id uuid default null::uuid,
  p_hymn_id uuid default null::uuid,
  p_localized_titles jsonb default '{}'::jsonb,
  p_items jsonb default '[]'::jsonb,
  p_scheduled_release_at timestamptz default null,
  p_original_release_date date default null
)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  result_payload jsonb;
  catalog_id uuid;
  item jsonb;
  track_position integer := 0;
  track_id uuid;
  locale_entry record;
  music_track_count integer := 0;
  inferred_release_type music.release_type;
  clean_music_type text := nullif(trim(coalesce(p_music_type, '')), '');
  clean_recording_type text := nullif(trim(coalesce(p_recording_type, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_mode = 'music' then
    select count(*)
    into music_track_count
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) entry(value)
    where coalesce(entry.value ->> 'role', 'media') <> 'artwork';

    if music_track_count = 0 then
      raise exception 'A music release needs at least one track' using errcode = '22023';
    end if;

    inferred_release_type := case
      when music_track_count = 1 then 'single'::music.release_type
      when music_track_count between 2 and 6 then 'ep'::music.release_type
      else 'album'::music.release_type
    end;

    if clean_music_type is null then
      raise exception 'Music type is required' using errcode = '22023';
    end if;

    if clean_recording_type is null then
      raise exception 'Recording type is required' using errcode = '22023';
    end if;
  else
    inferred_release_type := p_release_type;
  end if;

  if p_mode = 'music' and exists (
    select 1
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) entry(value)
    where coalesce(entry.value ->> 'role', 'media') <> 'artwork'
      and nullif(trim(coalesce(entry.value ->> 'title', '')), '') is null
  ) then
    raise exception 'Every track needs a title' using errcode = '22023';
  end if;

  result_payload := public.create_creator_submission(
    p_creator_account_id,
    p_mode,
    p_title,
    p_description,
    inferred_release_type,
    p_artist_id,
    p_cantor_id,
    p_season_id,
    p_hymn_id,
    p_localized_titles,
    p_items,
    p_scheduled_release_at,
    p_original_release_date
  );

  if p_mode <> 'music' then
    return result_payload;
  end if;

  catalog_id := (result_payload ->> 'catalogId')::uuid;

  update music.releases
  set metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'musicType', clean_music_type,
      'recordingType', clean_recording_type
    ),
      updated_at = now()
  where id = catalog_id;

  for item in
    select entry.value
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
      with ordinality as entry(value, position)
    where coalesce(entry.value ->> 'role', 'media') <> 'artwork'
    order by entry.position
  loop
    track_position := track_position + 1;

    select release_track.track_id
    into track_id
    from music.release_tracks release_track
    where release_track.release_id = catalog_id
      and release_track.disc_number = 1
      and release_track.track_number = track_position;

    if track_id is null then
      raise exception 'Could not resolve track % for the new release', track_position;
    end if;

    perform private.set_track_credit_names(
      track_id,
      p_creator_account_id,
      item ->> 'mainArtistName',
      coalesce(item -> 'contributors', '[]'::jsonb)
    );

    for locale_entry in
      select key as locale, trim(value) as title
      from jsonb_each_text(coalesce(item -> 'localizedTitles', '{}'::jsonb))
      where nullif(trim(value), '') is not null
    loop
      insert into music.track_localizations (
        track_id,
        locale,
        title,
        is_primary,
        publication_status,
        created_by,
        updated_by
      )
      values (
        track_id,
        locale_entry.locale,
        locale_entry.title,
        locale_entry.locale = 'en',
        'draft'::media.publication_status,
        auth.uid(),
        auth.uid()
      )
      on conflict (track_id, locale) do update
      set title = excluded.title,
          is_primary = excluded.is_primary,
          updated_by = excluded.updated_by,
          updated_at = now();
    end loop;
  end loop;

  return result_payload;
end;
$function$;

revoke all on function public.create_creator_submission_v2(
  uuid, text, text, text, music.release_type, text, text, uuid, uuid, uuid, uuid,
  jsonb, jsonb, timestamptz, date
) from public, anon;

grant execute on function public.create_creator_submission_v2(
  uuid, text, text, text, music.release_type, text, text, uuid, uuid, uuid, uuid,
  jsonb, jsonb, timestamptz, date
) to authenticated;
