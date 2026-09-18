-- Adding a track or new artwork means adding a submission item, and
-- add_media_submission_item only accepts an editable submission. Editing a
-- release therefore reopens its submission first and re-submits it at the end,
-- going through submit_media_submission rather than writing statuses by hand.
--
-- A published release stays published while its edit is reviewed: listeners
-- keep the version that was approved until the new one is.
create or replace function public.update_creator_release(
  p_release_id uuid,
  p_title text default null,
  p_description text default null,
  p_scheduled_release_at timestamptz default null,
  p_original_release_date date default null,
  p_clear_original_release_date boolean default false,
  p_localized_titles jsonb default null,
  p_tracks jsonb default null,
  p_cover_upload_intent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  request_user_id uuid := auth.uid();
  release_record music.releases%rowtype;
  account_id uuid;
  submission_id uuid;
  original_status media.publication_status;
  adds_items boolean;
  entry jsonb;
  v_track_id uuid;
  v_item_id uuid;
  position integer := 0;
  keep_ids uuid[] := array[]::uuid[];
  locale_entry record;
  earliest timestamptz;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into release_record
  from music.releases release
  where release.id = p_release_id
  for update;

  if not found then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  account_id := release_record.owner_creator_account_id;

  if not (select private.can_edit_creator_account(account_id)) then
    raise exception 'Not authorized for this release' using errcode = '42501';
  end if;

  submission_id := (release_record.metadata ->> 'submissionId')::uuid;

  if p_scheduled_release_at is not null then
    earliest := public.earliest_release_at();
    if p_scheduled_release_at < earliest then
      raise exception 'Choose a release date at least 48 hours from now (earliest % UTC)',
        to_char(earliest, 'YYYY-MM-DD HH24:MI') using errcode = '22023';
    end if;
  end if;

  adds_items := p_cover_upload_intent_id is not null
    or exists (
      select 1
      from jsonb_array_elements(coalesce(p_tracks, '[]'::jsonb)) as t(value)
      where nullif(t.value ->> 'id', '') is null
    );

  if submission_id is not null then
    select submission.status into original_status
    from media.submissions submission
    where submission.id = submission_id
    for update;

    -- Reopen so items can be attached. The status is restored by re-submitting
    -- at the end, which is also what refreshes the review deadline.
    if adds_items and original_status is not null and original_status not in (
      'draft'::media.publication_status,
      'uploading'::media.publication_status,
      'ready_to_submit'::media.publication_status,
      'changes_requested'::media.publication_status
    ) then
      update media.submissions submission
      set status = 'ready_to_submit'::media.publication_status,
          updated_by = request_user_id
      where submission.id = submission_id;
    end if;
  end if;

  update music.releases release
  set title = coalesce(nullif(trim(coalesce(p_title, '')), ''), release.title),
      description = case when p_description is null then release.description else nullif(trim(p_description), '') end,
      scheduled_release_at = coalesce(p_scheduled_release_at, release.scheduled_release_at),
      original_release_date = case
        when p_clear_original_release_date then null
        else coalesce(p_original_release_date, release.original_release_date)
      end,
      updated_by = request_user_id,
      updated_at = now()
  where release.id = p_release_id
  returning * into release_record;

  if p_localized_titles is not null then
    for locale_entry in
      select key as locale, trim(value) as title
      from jsonb_each_text(p_localized_titles)
      where nullif(trim(value), '') is not null
    loop
      insert into music.release_localizations (release_id, locale, title, is_primary, created_by, updated_by)
      values (p_release_id, locale_entry.locale, locale_entry.title, locale_entry.locale = 'en', request_user_id, request_user_id)
      on conflict (release_id, locale) do update
      set title = excluded.title, updated_by = excluded.updated_by, updated_at = now();
    end loop;
  end if;

  if p_cover_upload_intent_id is not null then
    if submission_id is null then
      raise exception 'This release has no submission to attach artwork to' using errcode = '22023';
    end if;

    perform public.add_media_submission_item(
      submission_id, p_cover_upload_intent_id, null, 'Artwork', -1, true,
      'artwork'::media.submission_item_role
    );
  end if;

  if p_tracks is not null then
    if jsonb_typeof(p_tracks) <> 'array' then
      raise exception 'Tracks must be a list' using errcode = '22023';
    end if;

    for entry in select value from jsonb_array_elements(p_tracks)
    loop
      position := position + 1;
      v_track_id := nullif(entry ->> 'id', '')::uuid;

      if v_track_id is null then
        if nullif(entry ->> 'uploadIntentId', '') is null then
          raise exception 'A new track needs an uploaded file' using errcode = '22023';
        end if;
        if submission_id is null then
          raise exception 'This release has no submission to add tracks to' using errcode = '22023';
        end if;

        insert into music.tracks (owner_creator_account_id, title, publication_status, created_by, updated_by)
        values (
          account_id,
          coalesce(nullif(trim(entry ->> 'title'), ''), release_record.title),
          'draft'::media.publication_status,
          request_user_id, request_user_id
        )
        returning id into v_track_id;

        select result.item_id into v_item_id
        from public.add_media_submission_item(
          submission_id,
          (entry ->> 'uploadIntentId')::uuid,
          null,
          nullif(trim(entry ->> 'title'), ''),
          position,
          true,
          'track'::media.submission_item_role
        ) result;

        update media.submission_items set music_track_id = v_track_id where id = v_item_id;
      else
        if not exists (
          select 1 from music.release_tracks rt
          where rt.release_id = p_release_id and rt.track_id = v_track_id
        ) then
          raise exception 'Track does not belong to this release' using errcode = '42501';
        end if;

        update music.tracks track
        set title = coalesce(nullif(trim(entry ->> 'title'), ''), track.title),
            updated_by = request_user_id,
            updated_at = now()
        where track.id = v_track_id;
      end if;

      -- Renumber into a range no existing row occupies, so the
      -- (release, disc, track number) unique index cannot collide midway.
      update music.release_tracks rt
      set track_number = position + 1000
      where rt.release_id = p_release_id and rt.track_id = v_track_id;

      if not found then
        insert into music.release_tracks (release_id, track_id, disc_number, track_number)
        values (p_release_id, v_track_id, 1, position + 1000);
      end if;

      if entry ? 'mainArtistId' or entry ? 'featuredArtistIds' then
        perform private.set_track_credits(
          v_track_id,
          account_id,
          nullif(entry ->> 'mainArtistId', '')::uuid,
          (
            select array_agg(value::uuid)
            from jsonb_array_elements_text(coalesce(entry -> 'featuredArtistIds', '[]'::jsonb))
            where nullif(value, '') is not null
          )
        );
      end if;

      keep_ids := keep_ids || v_track_id;
    end loop;

    delete from music.release_tracks rt
    where rt.release_id = p_release_id
      and not (rt.track_id = any (keep_ids));

    update music.release_tracks rt
    set track_number = rt.track_number - 1000
    where rt.release_id = p_release_id and rt.track_number > 1000;
  end if;

  -- Send the edit back for review through the normal path, which sets the
  -- submitted time and the 48-hour deadline.
  if submission_id is not null and original_status is not null and original_status <> 'rejected'::media.publication_status then
    perform public.submit_media_submission(submission_id);

    perform private.add_media_submission_event(
      submission_id, request_user_id, 'edited_by_creator', original_status,
      'pending_review'::media.publication_status,
      'The artist edited this release, so it is back in the review queue.',
      jsonb_build_object('releaseId', p_release_id)
    );
  end if;

  return public.get_creator_release(p_release_id);
end;
$function$;

grant execute on function public.update_creator_release(
  uuid, text, text, timestamptz, date, boolean, jsonb, jsonb, uuid
) to authenticated;
