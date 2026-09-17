-- CHC Artists creator dashboard RPCs.
--
-- The creator, media, music, and learning schemas are not exposed through the
-- Data API, so CHC Artists cannot query their tables directly. These public
-- RPCs are the app's whole read/write surface. They are SECURITY INVOKER so the
-- existing RLS policies stay the authority on who can see or change what; the
-- workflow RPCs they call (create_media_submission and friends) keep their own
-- SECURITY DEFINER checks.
--
-- New row ids are generated up front instead of read back with RETURNING:
-- several learning select policies look the row up again through a STABLE
-- helper, which cannot see a row inserted by the same statement.

create or replace function public.get_creator_workspaces()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', account.id,
      'displayName', account.display_name,
      'status', account.status,
      'role', member.role
    ) order by member.created_at)
    from creator.creator_account_members member
    join creator.creator_accounts account on account.id = member.creator_account_id
    where member.user_id = request_user_id
  ), '[]'::jsonb);
end;
$$;

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
        'subtitle', cantor.publication_status
      ) order by lower(cantor.display_name))
      from learning.cantors cantor
      where cantor.owner_creator_account_id = p_creator_account_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_creator_catalog_options()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object('id', season.id, 'title', season.title, 'subtitle', season.slug)
        order by season.sort_order, season.title)
      from learning.seasons season
      where season.publication_status = 'published'::media.publication_status
    ), '[]'::jsonb),
    'hymns', coalesce((
      select jsonb_agg(jsonb_build_object('id', hymn.id, 'title', hymn.title, 'subtitle', hymn.subtitle)
        order by hymn.title)
      from learning.hymns hymn
      where hymn.publication_status = 'published'::media.publication_status
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_creator_artist(p_creator_account_id uuid, p_display_name text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  new_id uuid := gen_random_uuid();
  clean_name text := nullif(trim(coalesce(p_display_name, '')), '');
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if clean_name is null then
    raise exception 'Artist name is required' using errcode = '22023';
  end if;
  if not (select private.can_edit_creator_account(p_creator_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;
  if exists (
    select 1 from music.artists artist
    where artist.owner_creator_account_id = p_creator_account_id
      and lower(artist.display_name) = lower(clean_name)
  ) then
    raise exception 'An artist named "%" already exists in this workspace', clean_name using errcode = '23505';
  end if;

  insert into music.artists (id, owner_creator_account_id, display_name, created_by, updated_by)
  values (new_id, p_creator_account_id, clean_name, request_user_id, request_user_id);

  return jsonb_build_object('id', new_id, 'title', clean_name, 'subtitle', 'draft');
end;
$$;

create or replace function public.create_creator_cantor(p_creator_account_id uuid, p_display_name text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  new_id uuid := gen_random_uuid();
  clean_name text := nullif(trim(coalesce(p_display_name, '')), '');
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if clean_name is null then
    raise exception 'Cantor name is required' using errcode = '22023';
  end if;
  if not (select private.can_edit_creator_account(p_creator_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;
  if exists (
    select 1 from learning.cantors cantor
    where cantor.owner_creator_account_id = p_creator_account_id
      and lower(cantor.display_name) = lower(clean_name)
  ) then
    raise exception 'A cantor named "%" already exists in this workspace', clean_name using errcode = '23505';
  end if;

  insert into learning.cantors (id, owner_creator_account_id, display_name, created_by, updated_by)
  values (new_id, p_creator_account_id, clean_name, request_user_id, request_user_id);

  return jsonb_build_object('id', new_id, 'title', clean_name, 'subtitle', 'draft');
end;
$$;

-- Creates and submits a whole creator submission in one transaction: the
-- submission, its music release or learning album/lesson-set shell, localized
-- titles, and every uploaded file as an ordered item. If any step fails nothing
-- is left behind.
--
-- p_localized_titles: {"en": "...", "ar": "...", ...}; blank values are skipped.
-- p_items: [{"uploadIntentId": uuid, "title": text, "role": "artwork" | "media"}]
--   in display order. Artwork is recorded on the catalog shell's metadata until
--   processing produces a media asset that can become its cover.
create or replace function public.create_creator_submission(
  p_creator_account_id uuid,
  p_mode text,
  p_title text,
  p_description text default null,
  p_release_type music.release_type default null,
  p_artist_id uuid default null,
  p_cantor_id uuid default null,
  p_season_id uuid default null,
  p_hymn_id uuid default null,
  p_localized_titles jsonb default '{}'::jsonb,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  clean_title text := nullif(trim(coalesce(p_title, '')), '');
  clean_description text := nullif(trim(coalesce(p_description, '')), '');
  new_submission_id uuid;
  catalog_id uuid := gen_random_uuid();
  submission_kind media.submission_type;
  artwork_intent_id uuid;
  item jsonb;
  item_index integer := 0;
  media_count integer := 0;
  locale_entry record;
  final_status media.publication_status;
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

  if submission_kind = 'music_release' then
    if p_release_type is null then
      raise exception 'Choose a release type' using errcode = '22023';
    end if;
    if not exists (
      select 1 from music.artists artist
      where artist.id = p_artist_id and artist.owner_creator_account_id = p_creator_account_id
    ) then
      raise exception 'Choose an artist from this workspace' using errcode = '22023';
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
      id, owner_creator_account_id, primary_artist_id, release_type, title, description, metadata, created_by, updated_by
    )
    values (
      catalog_id, p_creator_account_id, p_artist_id, p_release_type, clean_title, clean_description,
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

  -- Artwork goes first so reviewers see it before the ordered media.
  for item in
    select value
    from jsonb_array_elements(p_items) with ordinality as entry(value, position)
    order by (value ->> 'role' = 'artwork') desc, position
  loop
    perform public.add_media_submission_item(
      new_submission_id,
      (item ->> 'uploadIntentId')::uuid,
      null,
      case when item ->> 'role' = 'artwork'
        then 'Artwork: ' || coalesce(nullif(trim(item ->> 'title'), ''), 'cover')
        else nullif(trim(item ->> 'title'), '')
      end,
      item_index,
      true
    );
    item_index := item_index + 1;
  end loop;

  select submitted.status
  into final_status
  from public.submit_media_submission(new_submission_id) submitted;

  return jsonb_build_object(
    'submissionId', new_submission_id,
    'catalogId', catalog_id,
    'status', final_status,
    'itemCount', item_index
  );
end;
$$;

create or replace function public.get_creator_submission_items(p_submission_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (select 1 from media.submissions submission where submission.id = p_submission_id) then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', item.id,
      'title', item.title,
      'sortOrder', item.sort_order,
      'required', item.required,
      'mediaAssetId', item.media_asset_id,
      'uploadIntentId', item.upload_intent_id,
      'mediaType', intent.media_type,
      'contentLength', intent.content_length,
      'uploadStatus', intent.status,
      'processingStatus', job.status
    ) order by item.sort_order, item.created_at)
    from media.submission_items item
    left join media.upload_intents intent on intent.id = item.upload_intent_id
    left join media.media_processing_jobs job on job.id = item.media_processing_job_id
    where item.submission_id = p_submission_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_creator_workspaces() from public, anon;
revoke all on function public.get_creator_dashboard(uuid) from public, anon;
revoke all on function public.get_creator_catalog_options() from public, anon;
revoke all on function public.create_creator_artist(uuid, text) from public, anon;
revoke all on function public.create_creator_cantor(uuid, text) from public, anon;
revoke all on function public.create_creator_submission(uuid, text, text, text, music.release_type, uuid, uuid, uuid, uuid, jsonb, jsonb) from public, anon;
revoke all on function public.get_creator_submission_items(uuid) from public, anon;

grant execute on function public.get_creator_workspaces() to authenticated;
grant execute on function public.get_creator_dashboard(uuid) to authenticated;
grant execute on function public.get_creator_catalog_options() to authenticated;
grant execute on function public.create_creator_artist(uuid, text) to authenticated;
grant execute on function public.create_creator_cantor(uuid, text) to authenticated;
grant execute on function public.create_creator_submission(uuid, text, text, text, music.release_type, uuid, uuid, uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.get_creator_submission_items(uuid) to authenticated;
