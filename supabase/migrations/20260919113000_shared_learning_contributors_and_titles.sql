-- Shared learning contributors and multilingual creator titles.
--
-- Published cantors are reusable across creator workspaces. Learning albums may
-- also use chorus entries, stored in learning.cantors with metadata
-- contributorType='chorus' to preserve the existing foreign-key model.
-- Lesson sets remain cantor-only because they represent teaching content.

create or replace function public.get_creator_dashboard(p_creator_account_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.can_read_media_owner(p_creator_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'submissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', submission.id,
        'submissionType', submission.submission_type,
        'title', submission.title,
        'description', submission.description,
        'status', submission.status,
        'submittedAt', submission.submitted_at,
        'reviewDueAt', submission.review_due_at,
        'reviewNotes', submission.review_notes,
        'publishedAt', submission.published_at,
        'createdAt', submission.created_at,
        'updatedAt', submission.updated_at,
        'itemCount', (
          select count(*) from media.submission_items item where item.submission_id = submission.id
        )
      ) order by submission.updated_at desc)
      from media.submissions submission
      where submission.creator_account_id = p_creator_account_id
    ), '[]'::jsonb),
    'artists', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', artist.id,
        'title', artist.display_name,
        'subtitle', artist.publication_status
      ) order by lower(artist.display_name))
      from music.artists artist
      where artist.owner_creator_account_id = p_creator_account_id
    ), '[]'::jsonb),
    'cantors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cantor.id,
        'title', cantor.display_name,
        'subtitle', cantor.publication_status,
        'kind', case
          when lower(coalesce(cantor.metadata ->> 'contributorType', 'cantor')) = 'chorus' then 'chorus'
          else 'cantor'
        end
      ) order by lower(cantor.display_name))
      from learning.cantors cantor
      where cantor.publication_status = 'published'::media.publication_status
         or private.learning_cantor_is_editable(cantor.id)
    ), '[]'::jsonb)
  );
end;
$$;

drop function if exists public.create_creator_cantor(uuid, text);

create or replace function public.create_creator_cantor(
  p_creator_account_id uuid,
  p_display_name text,
  p_contributor_type text default 'cantor'
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  new_id uuid := gen_random_uuid();
  clean_name text := nullif(trim(coalesce(p_display_name, '')), '');
  clean_type text := lower(trim(coalesce(p_contributor_type, 'cantor')));
  existing_id uuid;
  existing_status media.publication_status;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if clean_name is null then
    raise exception 'Contributor name is required' using errcode = '22023';
  end if;
  if clean_type not in ('cantor', 'chorus') then
    raise exception 'Contributor type must be cantor or chorus' using errcode = '22023';
  end if;
  if not (select private.can_edit_creator_account(p_creator_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;

  select cantor.id, cantor.publication_status
  into existing_id, existing_status
  from learning.cantors cantor
  where lower(trim(cantor.display_name)) = lower(clean_name)
    and (
      case
        when lower(coalesce(cantor.metadata ->> 'contributorType', 'cantor')) = 'chorus' then 'chorus'
        else 'cantor'
      end
    ) = clean_type
    and (
      cantor.publication_status = 'published'::media.publication_status
      or private.learning_cantor_is_editable(cantor.id)
    )
  order by
    (cantor.publication_status = 'published'::media.publication_status) desc,
    cantor.created_at
  limit 1;

  if existing_id is not null then
    return jsonb_build_object(
      'id', existing_id,
      'title', clean_name,
      'subtitle', existing_status,
      'kind', clean_type
    );
  end if;

  insert into learning.cantors (
    id,
    owner_creator_account_id,
    display_name,
    metadata,
    created_by,
    updated_by
  )
  values (
    new_id,
    p_creator_account_id,
    clean_name,
    jsonb_build_object('contributorType', clean_type),
    request_user_id,
    request_user_id
  );

  return jsonb_build_object(
    'id', new_id,
    'title', clean_name,
    'subtitle', 'draft',
    'kind', clean_type
  );
end;
$function$;

revoke all on function public.create_creator_cantor(uuid, text, text) from public, anon;
grant execute on function public.create_creator_cantor(uuid, text, text) to authenticated;


create or replace function public.create_creator_submission(
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
set search_path to ''
as $function$
declare
  request_user_id uuid := auth.uid();
  clean_title text := nullif(trim(coalesce(p_title, '')), '');
  clean_description text := nullif(trim(coalesce(p_description, '')), '');
  new_submission_id uuid;
  catalog_id uuid := gen_random_uuid();
  submission_kind media.submission_type;
  identity_artist_id uuid;
  artwork_intent_id uuid;
  item jsonb;
  item_index integer := 0;
  track_number integer := 0;
  media_count integer := 0;
  locale_entry record;
  final_status media.publication_status;
  new_item_id uuid;
  new_track_id uuid;
  resolved_schedule timestamptz;
  earliest timestamptz;
  learning_contributor_kind text;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not (select private.can_edit_creator_account(p_creator_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;
  if clean_title is null then
    raise exception 'Add a title' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Items must be a list' using errcode = '22023';
  end if;

  submission_kind := case p_mode
    when 'music' then 'music_release'::media.submission_type
    when 'learning_album' then 'learning_album'::media.submission_type
    when 'learning_lesson_set' then 'learning_lesson_set'::media.submission_type
    else null
  end;
  if submission_kind is null then
    raise exception 'Unknown submission mode: %', p_mode using errcode = '22023';
  end if;

  select count(*) filter (where coalesce(value ->> 'role', 'media') = 'media')
  into media_count
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb));
  if media_count = 0 then
    raise exception 'Add at least one media file' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_items) where value ->> 'role' = 'artwork') > 1 then
    raise exception 'Only one artwork file can be attached' using errcode = '22023';
  end if;

  select account.identity_artist_id
  into identity_artist_id
  from creator.creator_accounts account
  where account.id = p_creator_account_id;

  if submission_kind = 'music_release' then
    if p_release_type is null then
      raise exception 'Choose a release type' using errcode = '22023';
    end if;

    if identity_artist_id is null then
      raise exception 'This account has no artist identity yet' using errcode = '22023';
    end if;

    -- A release goes out under the account's own identity. An explicit artist
    -- is accepted only when it names that same identity.
    if p_artist_id is not null and p_artist_id <> identity_artist_id then
      raise exception 'A release can only be published under its own account''s artist identity'
        using errcode = '42501';
    end if;

    earliest := public.earliest_release_at();
    resolved_schedule := coalesce(p_scheduled_release_at, earliest);

    if resolved_schedule < earliest then
      raise exception 'Choose a release date at least 48 hours from now (earliest % UTC)',
        to_char(earliest, 'YYYY-MM-DD HH24:MI')
        using errcode = '22023';
    end if;
  else
    select case
      when lower(coalesce(cantor.metadata ->> 'contributorType', 'cantor')) = 'chorus' then 'chorus'
      else 'cantor'
    end
    into learning_contributor_kind
    from learning.cantors cantor
    where cantor.id = p_cantor_id
      and (
        cantor.publication_status = 'published'::media.publication_status
        or private.learning_cantor_is_editable(cantor.id)
      );

    if p_cantor_id is null or learning_contributor_kind is null then
      if submission_kind = 'learning_album' then
        raise exception 'Choose a cantor or chorus from CHC' using errcode = '22023';
      else
        raise exception 'Choose a cantor from CHC' using errcode = '22023';
      end if;
    end if;

    if submission_kind = 'learning_lesson_set' and learning_contributor_kind = 'chorus' then
      raise exception 'Lesson sets must be taught by a cantor, not a chorus' using errcode = '22023';
    end if;

    if p_season_id is not null and not exists (
      select 1 from learning.seasons season where season.id = p_season_id
    ) then
      raise exception 'Season not found' using errcode = '22023';
    end if;
    if submission_kind = 'learning_lesson_set' and (p_hymn_id is null or not exists (
      select 1 from learning.hymns hymn where hymn.id = p_hymn_id
    )) then
      raise exception 'Choose a hymn' using errcode = '22023';
    end if;
  end if;

  select (value ->> 'uploadIntentId')::uuid
  into artwork_intent_id
  from jsonb_array_elements(p_items)
  where value ->> 'role' = 'artwork';

  select created.submission_id
  into new_submission_id
  from public.create_media_submission(p_creator_account_id, submission_kind, clean_title, clean_description) created;

  if submission_kind = 'music_release' then
    insert into music.releases (
      id, owner_creator_account_id, primary_artist_id, release_type, title, description,
      scheduled_release_at, original_release_date, metadata, created_by, updated_by
    )
    values (
      catalog_id, p_creator_account_id, identity_artist_id, p_release_type, clean_title, clean_description,
      resolved_schedule, p_original_release_date,
      jsonb_strip_nulls(jsonb_build_object('submissionId', new_submission_id, 'artworkUploadIntentId', artwork_intent_id)),
      request_user_id, request_user_id
    );

    for locale_entry in
      select key as locale, trim(value) as title
      from jsonb_each_text(coalesce(p_localized_titles, '{}'::jsonb))
      where nullif(trim(value), '') is not null
    loop
      insert into music.release_localizations (release_id, locale, title, is_primary, created_by, updated_by)
      values (catalog_id, locale_entry.locale, locale_entry.title, locale_entry.locale = 'en', request_user_id, request_user_id);
    end loop;
  elsif submission_kind = 'learning_album' then
    insert into learning.albums (
      id, owner_creator_account_id, cantor_id, season_id, submission_id, title, description, metadata, updated_by
    )
    values (
      catalog_id, p_creator_account_id, p_cantor_id, p_season_id, new_submission_id, clean_title, clean_description,
      jsonb_strip_nulls(jsonb_build_object('artworkUploadIntentId', artwork_intent_id)),
      request_user_id
    );

    for locale_entry in
      select key as locale, trim(value) as title
      from jsonb_each_text(coalesce(p_localized_titles, '{}'::jsonb))
      where nullif(trim(value), '') is not null
    loop
      insert into learning.album_localizations (album_id, locale, title)
      values (catalog_id, locale_entry.locale, locale_entry.title);
    end loop;
  else
    insert into learning.lesson_sets (
      id, owner_creator_account_id, cantor_id, season_id, hymn_id, submission_id, title, description, metadata, updated_by
    )
    values (
      catalog_id, p_creator_account_id, p_cantor_id, p_season_id, p_hymn_id, new_submission_id, clean_title, clean_description,
      jsonb_strip_nulls(jsonb_build_object('artworkUploadIntentId', artwork_intent_id)),
      request_user_id
    );

    for locale_entry in
      select key as locale, trim(value) as title
      from jsonb_each_text(coalesce(p_localized_titles, '{}'::jsonb))
      where nullif(trim(value), '') is not null
    loop
      insert into learning.lesson_set_localizations (lesson_set_id, locale, title)
      values (catalog_id, locale_entry.locale, locale_entry.title);
    end loop;
  end if;

  for item in
    select value
    from jsonb_array_elements(p_items) with ordinality as entry(value, position)
    order by (value ->> 'role' = 'artwork') desc, position
  loop
    select result.item_id
    into new_item_id
    from public.add_media_submission_item(
      new_submission_id,
      (item ->> 'uploadIntentId')::uuid,
      null,
      nullif(trim(item ->> 'title'), ''),
      item_index,
      true,
      case when item ->> 'role' = 'artwork'
        then 'artwork'::media.submission_item_role
        else null
      end
    ) result;

    -- Every audio item in a music release becomes a track, in submitted order,
    -- carrying its own credits.
    if submission_kind = 'music_release' and coalesce(item ->> 'role', 'media') <> 'artwork' then
      track_number := track_number + 1;

      insert into music.tracks (
        owner_creator_account_id, title, publication_status, created_by, updated_by
      )
      values (
        p_creator_account_id,
        coalesce(nullif(trim(item ->> 'title'), ''), clean_title),
        'draft'::media.publication_status,
        request_user_id,
        request_user_id
      )
      returning id into new_track_id;

      insert into music.release_tracks (release_id, track_id, disc_number, track_number)
      values (catalog_id, new_track_id, 1, track_number);

      perform private.set_track_credits(
        new_track_id,
        p_creator_account_id,
        nullif(item ->> 'mainArtistId', '')::uuid,
        (
          select array_agg(value::uuid)
          from jsonb_array_elements_text(coalesce(item -> 'featuredArtistIds', '[]'::jsonb))
          where nullif(value, '') is not null
        )
      );

      update media.submission_items
      set music_track_id = new_track_id
      where id = new_item_id;
    end if;

    item_index := item_index + 1;
  end loop;

  select submitted.status
  into final_status
  from public.submit_media_submission(new_submission_id) submitted;

  return jsonb_build_object(
    'submissionId', new_submission_id,
    'catalogId', catalog_id,
    'status', final_status,
    'itemCount', item_index,
    'trackCount', track_number,
    'scheduledReleaseAt', resolved_schedule,
    'originalReleaseDate', p_original_release_date
  );
end;
$function$;

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

  if not exists (
    select 1
    from jsonb_each_text(coalesce(p_localized_titles, '{}'::jsonb)) localized(locale, title)
    where localized.locale in ('en', 'ar', 'fr')
      and nullif(trim(localized.title), '') is not null
  ) then
    raise exception 'Add a title in English, Arabic, or French' using errcode = '22023';
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

revoke all on function public.get_creator_dashboard(uuid) from public, anon;
grant execute on function public.get_creator_dashboard(uuid) to authenticated;

grant execute on function public.create_creator_submission(
  uuid, text, text, text, music.release_type, uuid, uuid, uuid, uuid,
  jsonb, jsonb, timestamptz, date
) to authenticated;

revoke all on function public.create_creator_submission_v2(
  uuid, text, text, text, music.release_type, text, text, uuid, uuid, uuid, uuid,
  jsonb, jsonb, timestamptz, date
) from public, anon;

grant execute on function public.create_creator_submission_v2(
  uuid, text, text, text, music.release_type, text, text, uuid, uuid, uuid, uuid,
  jsonb, jsonb, timestamptz, date
) to authenticated;

