/**
 * Everything an artist needs to edit one of their releases.
 */
create or replace function public.get_creator_release(p_release_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  release_record music.releases%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into release_record
  from music.releases release
  where release.id = p_release_id;

  if not found then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  if not (select private.can_edit_creator_account(release_record.owner_creator_account_id)) then
    raise exception 'Not authorized for this release' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', release_record.id,
    'title', release_record.title,
    'subtitle', release_record.subtitle,
    'description', release_record.description,
    'releaseType', release_record.release_type,
    'publicationStatus', release_record.publication_status,
    'scheduledReleaseAt', release_record.scheduled_release_at,
    'originalReleaseDate', release_record.original_release_date,
    'displayDate', music.release_display_date(
      release_record.original_release_date, release_record.scheduled_release_at, release_record.release_date
    ),
    'earliestReleaseAt', public.earliest_release_at(),
    'primaryArtist', (
      select jsonb_build_object('id', artist.id, 'displayName', artist.display_name)
      from music.artists artist where artist.id = release_record.primary_artist_id
    ),
    'cover', (
      select jsonb_build_object('assetId', asset.id, 'bucket', asset.bucket, 'path', asset.path)
      from media.media_assets asset where asset.id = release_record.cover_asset_id
    ),
    'localizations', coalesce((
      select jsonb_agg(jsonb_build_object('locale', l.locale, 'title', l.title) order by l.is_primary desc, l.locale)
      from music.release_localizations l where l.release_id = release_record.id
    ), '[]'::jsonb),
    'tracks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', track.id,
        'trackNumber', rt.track_number,
        'discNumber', rt.disc_number,
        'title', track.title,
        'durationMs', track.duration_ms,
        'publicationStatus', track.publication_status,
        'hasMedia', track.media_asset_id is not null,
        'mainArtist', (
          select jsonb_build_object('id', a.id, 'displayName', a.display_name)
          from music.track_artists ta join music.artists a on a.id = ta.artist_id
          where ta.track_id = track.id and ta.role = 'primary'::music.track_artist_role
          limit 1
        ),
        'featuredArtists', coalesce((
          select jsonb_agg(jsonb_build_object('id', a.id, 'displayName', a.display_name) order by ta.sort_order)
          from music.track_artists ta join music.artists a on a.id = ta.artist_id
          where ta.track_id = track.id and ta.role = 'featured'::music.track_artist_role
        ), '[]'::jsonb)
      ) order by rt.disc_number, rt.track_number)
      from music.release_tracks rt
      join music.tracks track on track.id = rt.track_id
      where rt.release_id = release_record.id
    ), '[]'::jsonb)
  );
end;
$function$;

grant execute on function public.get_creator_release(uuid) to authenticated;

/**
 * Edits a release the account owns: its titles, dates, artwork, and its tracks
 * -- including adding new ones to an album that already exists, which is the
 * normal way a cantor's collection grows.
 *
 * Tracks are given as a list; each entry either names an existing track id to
 * keep (and may rename or re-credit it) or carries an uploadIntentId for a new
 * one. A track left out of the list is removed from the release. Order in the
 * list is the track order.
 *
 * A release that has already been published goes back to pending review, since
 * what listeners can see is changing.
 */
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
        -- A new song. It needs an upload, and it joins the submission so it
        -- goes through processing and review like any other.
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

      -- Renumber in the order given, using a range no existing row occupies so
      -- the (release, disc, track number) unique index cannot collide midway.
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

  -- Changing a published release changes what listeners see, so it is reviewed
  -- again rather than going straight out.
  if submission_id is not null then
    update media.submissions submission
    set status = 'pending_review'::media.publication_status,
        submitted_at = now(),
        review_due_at = now() + interval '48 hours',
        reviewer_id = null,
        reviewed_at = null,
        approved_at = null,
        updated_by = request_user_id
    where submission.id = submission_id
      and submission.status in (
        'published'::media.publication_status,
        'approved'::media.publication_status,
        'changes_requested'::media.publication_status
      );

    if found then
      perform private.add_media_submission_event(
        submission_id, request_user_id, 'edited_by_creator', null,
        'pending_review'::media.publication_status,
        'The artist edited this release, so it is back in the review queue.',
        jsonb_build_object('releaseId', p_release_id)
      );
    end if;
  end if;

  return public.get_creator_release(p_release_id);
end;
$function$;

grant execute on function public.update_creator_release(
  uuid, text, text, timestamptz, date, boolean, jsonb, jsonb, uuid
) to authenticated;
