create or replace function private.resolve_track_credit_artist(
  p_owner_account_id uuid,
  p_name text,
  p_default_to_identity boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  request_user_id uuid := auth.uid();
  clean_name text := nullif(trim(coalesce(p_name, '')), '');
  identity_id uuid;
  resolved_id uuid;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.can_edit_creator_account(p_owner_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;

  select account.identity_artist_id
  into identity_id
  from creator.creator_accounts account
  where account.id = p_owner_account_id;

  if clean_name is null then
    if p_default_to_identity and identity_id is not null then
      return identity_id;
    end if;
    return null;
  end if;

  select artist.id
  into resolved_id
  from music.artists artist
  where lower(trim(artist.display_name)) = lower(clean_name)
  order by
    (artist.id = identity_id) desc,
    (artist.owner_creator_account_id is not null) desc,
    artist.created_at
  limit 1;

  if resolved_id is not null then
    return resolved_id;
  end if;

  insert into music.artists (
    owner_creator_account_id,
    display_name,
    created_by,
    updated_by
  )
  values (
    null,
    clean_name,
    request_user_id,
    request_user_id
  )
  returning id into resolved_id;

  return resolved_id;
end;
$function$;

create or replace function private.set_track_credit_names(
  p_track_id uuid,
  p_owner_account_id uuid,
  p_main_artist_name text default null,
  p_contributors jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  request_user_id uuid := auth.uid();
  main_id uuid;
  contributor jsonb;
  contributor_name text;
  contributor_role text;
  contributor_id uuid;
  contributor_position integer := 1;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.can_edit_creator_account(p_owner_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from music.tracks track
    where track.id = p_track_id
      and track.owner_creator_account_id = p_owner_account_id
  ) then
    raise exception 'Track not found or not owned by this creator account' using errcode = '42501';
  end if;

  if p_contributors is null or jsonb_typeof(p_contributors) <> 'array' then
    raise exception 'Contributors must be a list' using errcode = '22023';
  end if;

  main_id := private.resolve_track_credit_artist(
    p_owner_account_id,
    p_main_artist_name,
    true
  );

  if main_id is null then
    raise exception 'Main artist is required' using errcode = '22023';
  end if;

  delete from music.track_artists
  where track_id = p_track_id;

  insert into music.track_artists (track_id, artist_id, role, sort_order)
  values (p_track_id, main_id, 'primary'::music.track_artist_role, 0);

  for contributor in
    select value
    from jsonb_array_elements(p_contributors)
  loop
    contributor_name := nullif(trim(coalesce(contributor ->> 'name', '')), '');
    contributor_role := lower(nullif(trim(coalesce(contributor ->> 'role', '')), ''));

    if contributor_name is null then
      raise exception 'Every contributor needs a name' using errcode = '22023';
    end if;

    if contributor_role is null or contributor_role not in (
      'featured', 'composer', 'lyricist', 'arranger', 'producer', 'artwork'
    ) then
      raise exception 'Unsupported contributor role: %', coalesce(contributor_role, '')
        using errcode = '22023';
    end if;

    contributor_id := private.resolve_track_credit_artist(
      p_owner_account_id,
      contributor_name,
      false
    );

    if contributor_id is not null
       and not (contributor_role = 'featured' and contributor_id = main_id) then
      insert into music.track_artists (track_id, artist_id, role, sort_order)
      values (
        p_track_id,
        contributor_id,
        contributor_role::music.track_artist_role,
        contributor_position
      )
      on conflict (track_id, artist_id, role) do update
      set sort_order = least(music.track_artists.sort_order, excluded.sort_order);

      contributor_position := contributor_position + 1;
    end if;
  end loop;
end;
$function$;

create or replace function public.create_creator_submission_v2(
  p_creator_account_id uuid,
  p_mode text,
  p_title text,
  p_description text default null::text,
  p_release_type music.release_type default null::music.release_type,
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
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
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
    p_release_type,
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
  uuid, text, text, text, music.release_type, uuid, uuid, uuid, uuid,
  jsonb, jsonb, timestamptz, date
) from public, anon;

grant execute on function public.create_creator_submission_v2(
  uuid, text, text, text, music.release_type, uuid, uuid, uuid, uuid,
  jsonb, jsonb, timestamptz, date
) to authenticated;
