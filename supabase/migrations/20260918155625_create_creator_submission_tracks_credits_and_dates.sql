-- A music submission now builds its catalogue as it is made: a track per audio
-- item, in order, each with its credits, and the release carries both dates.
-- Publication then only has to flip statuses, which publish_music_release
-- already does.
--
-- Item shape: {uploadIntentId, title, role, mainArtistId?, featuredArtistIds?}
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
    if p_cantor_id is null or not (select private.learning_cantor_is_editable(p_cantor_id)) then
      raise exception 'Choose a cantor from this workspace' using errcode = '22023';
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

grant execute on function public.create_creator_submission(
  uuid, text, text, text, music.release_type, uuid, uuid, uuid, uuid, jsonb, jsonb, timestamptz, date
) to authenticated;
