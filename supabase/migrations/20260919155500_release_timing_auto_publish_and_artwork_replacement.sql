-- Release timing + automatic publication + true artwork replacement.
--
-- Music releases can now be "asap" or "scheduled". ASAP publishes in the same
-- transaction as admin approval. Scheduled releases publish automatically from
-- pg_cron once their selected time arrives. Admin Publish Now continues to work
-- as an explicit testing/override path.
--
-- Artwork replacement is also made authoritative: creator views preview the
-- newest processed artwork, while the public catalog keeps the old cover until
-- approval/publication. At publication the newest artwork becomes the release
-- cover and the superseded cover is retired from public serving.

alter table music.releases
  add column if not exists release_timing_mode text;

update music.releases release
set release_timing_mode = case
  when release.scheduled_release_at is null then 'asap'
  else 'scheduled'
end
where release.release_timing_mode is null;

alter table music.releases
  alter column release_timing_mode set default 'asap',
  alter column release_timing_mode set not null;

alter table music.releases
  drop constraint if exists releases_release_timing_mode_known;

alter table music.releases
  add constraint releases_release_timing_mode_known
  check (release_timing_mode in ('asap', 'scheduled'));

create or replace function private.creator_release_preview_cover(p_release_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  payload jsonb;
begin
  select jsonb_build_object(
    'assetId', asset.id,
    'bucket', asset.bucket,
    'path', asset.path,
    'version', extract(epoch from asset.updated_at)::bigint
  )
  into payload
  from music.releases release
  join media.submission_items item
    on item.submission_id = nullif(release.metadata ->> 'submissionId', '')::uuid
   and item.role = 'artwork'::media.submission_item_role
  join media.media_assets asset
    on asset.id = item.media_asset_id
   and asset.processing_status = 'completed'::media.processing_status
  where release.id = p_release_id
  order by item.created_at desc, item.id desc
  limit 1;

  if payload is not null then
    return payload;
  end if;

  select jsonb_build_object(
    'assetId', asset.id,
    'bucket', asset.bucket,
    'path', asset.path,
    'version', extract(epoch from asset.updated_at)::bigint
  )
  into payload
  from music.releases release
  join media.media_assets asset on asset.id = release.cover_asset_id
  where release.id = p_release_id;

  return payload;
end;
$function$;

revoke all on function private.creator_release_preview_cover(uuid) from public;

-- Creator release list: include timing mode and the newest processed artwork,
-- even while an artwork edit is waiting for admin approval.
create or replace function public.get_creator_releases(p_creator_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.can_edit_creator_account(p_creator_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', release.id,
        'title', release.title,
        'releaseType', release.release_type,
        'publicationStatus', release.publication_status,
        'musicType', release.metadata ->> 'musicType',
        'recordingType', release.metadata ->> 'recordingType',
        'releaseTimingMode', release.release_timing_mode,
        'scheduledReleaseAt', release.scheduled_release_at,
        'originalReleaseDate', release.original_release_date,
        'displayDate', music.release_display_date(
          release.original_release_date,
          release.scheduled_release_at,
          release.release_date
        ),
        'submissionId', submission.id,
        'submissionStatus', submission.status,
        'mediaReady', case
          when submission.id is null then release.publication_status = 'published'::media.publication_status
          else private.submission_required_items_ready(submission.id)
        end,
        'trackCount', (
          select count(*)::integer
          from music.release_tracks release_track
          where release_track.release_id = release.id
        ),
        'cover', private.creator_release_preview_cover(release.id),
        'releaseState', case
          when release.publication_status = 'published'::media.publication_status then 'released'
          else 'ready'
        end
      )
      order by
        case when release.publication_status = 'published'::media.publication_status then 1 else 0 end,
        coalesce(release.scheduled_release_at, release.created_at) asc,
        release.created_at desc
    )
    from music.releases release
    left join media.submissions submission
      on submission.id = nullif(release.metadata ->> 'submissionId', '')::uuid
    where release.owner_creator_account_id = p_creator_account_id
      and (
        release.publication_status = 'published'::media.publication_status
        or (
          submission.status = 'approved'::media.publication_status
          and private.submission_required_items_ready(submission.id)
        )
      )
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.get_creator_releases(uuid) from public, anon;
grant execute on function public.get_creator_releases(uuid) to authenticated;

-- Rebuild the detailed creator release reader with timing mode and pending
-- artwork preview while retaining the named-credit/localized-title editor data.
create or replace function public.get_creator_release(p_release_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  release_record music.releases%rowtype;
  identity_artist_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into release_record
  from music.releases release
  where release.id = p_release_id;

  if not found then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  if not (select private.can_edit_creator_account(release_record.owner_creator_account_id)) then
    raise exception 'Not authorized for this release' using errcode = '42501';
  end if;

  select account.identity_artist_id
  into identity_artist_id
  from creator.creator_accounts account
  where account.id = release_record.owner_creator_account_id;

  return jsonb_build_object(
    'id', release_record.id,
    'title', release_record.title,
    'subtitle', release_record.subtitle,
    'description', release_record.description,
    'releaseType', release_record.release_type,
    'publicationStatus', release_record.publication_status,
    'musicType', release_record.metadata ->> 'musicType',
    'recordingType', release_record.metadata ->> 'recordingType',
    'releaseTimingMode', release_record.release_timing_mode,
    'scheduledReleaseAt', release_record.scheduled_release_at,
    'originalReleaseDate', release_record.original_release_date,
    'displayDate', music.release_display_date(
      release_record.original_release_date,
      release_record.scheduled_release_at,
      release_record.release_date
    ),
    'earliestReleaseAt', public.earliest_release_at(),
    'primaryArtist', (
      select jsonb_build_object('id', artist.id, 'displayName', artist.display_name)
      from music.artists artist
      where artist.id = release_record.primary_artist_id
    ),
    'cover', private.creator_release_preview_cover(release_record.id),
    'localizations', coalesce((
      select jsonb_agg(
        jsonb_build_object('locale', localization.locale, 'title', localization.title)
        order by localization.is_primary desc, localization.locale
      )
      from music.release_localizations localization
      where localization.release_id = release_record.id
    ), '[]'::jsonb),
    'tracks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', track.id,
          'trackNumber', release_track.track_number,
          'discNumber', release_track.disc_number,
          'title', track.title,
          'durationMs', track.duration_ms,
          'publicationStatus', track.publication_status,
          'hasMedia', track.media_asset_id is not null,
          'localizedTitle', jsonb_build_object(
            'en', coalesce((select localization.title from music.track_localizations localization where localization.track_id = track.id and localization.locale = 'en' limit 1), ''),
            'ar', coalesce((select localization.title from music.track_localizations localization where localization.track_id = track.id and localization.locale = 'ar' limit 1), ''),
            'cop', coalesce((select localization.title from music.track_localizations localization where localization.track_id = track.id and localization.locale = 'cop' limit 1), ''),
            'fr', coalesce((select localization.title from music.track_localizations localization where localization.track_id = track.id and localization.locale = 'fr' limit 1), '')
          ),
          'mainArtistName', coalesce((
            select case when artist.id = identity_artist_id then '' else artist.display_name end
            from music.track_artists track_artist
            join music.artists artist on artist.id = track_artist.artist_id
            where track_artist.track_id = track.id
              and track_artist.role = 'primary'::music.track_artist_role
            order by track_artist.sort_order
            limit 1
          ), ''),
          'contributors', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', track_artist.artist_id::text || ':' || track_artist.role::text,
                'name', artist.display_name,
                'role', track_artist.role::text
              )
              order by track_artist.sort_order, artist.display_name
            )
            from music.track_artists track_artist
            join music.artists artist on artist.id = track_artist.artist_id
            where track_artist.track_id = track.id
              and track_artist.role <> 'primary'::music.track_artist_role
          ), '[]'::jsonb),
          'mainArtist', (
            select jsonb_build_object('id', artist.id, 'displayName', artist.display_name)
            from music.track_artists track_artist
            join music.artists artist on artist.id = track_artist.artist_id
            where track_artist.track_id = track.id
              and track_artist.role = 'primary'::music.track_artist_role
            order by track_artist.sort_order
            limit 1
          ),
          'featuredArtists', coalesce((
            select jsonb_agg(
              jsonb_build_object('id', artist.id, 'displayName', artist.display_name)
              order by track_artist.sort_order
            )
            from music.track_artists track_artist
            join music.artists artist on artist.id = track_artist.artist_id
            where track_artist.track_id = track.id
              and track_artist.role = 'featured'::music.track_artist_role
          ), '[]'::jsonb)
        )
        order by release_track.disc_number, release_track.track_number
      )
      from music.release_tracks release_track
      join music.tracks track on track.id = release_track.track_id
      where release_track.release_id = release_record.id
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_creator_release(uuid) from public, anon;
grant execute on function public.get_creator_release(uuid) to authenticated;

-- New creator submission wrapper with explicit release timing semantics.
create or replace function public.create_creator_submission_v3(
  p_creator_account_id uuid,
  p_mode text,
  p_title text,
  p_description text default null,
  p_release_type music.release_type default null,
  p_music_type text default null,
  p_recording_type text default null,
  p_artist_id uuid default null,
  p_cantor_id uuid default null,
  p_season_id uuid default null,
  p_hymn_id uuid default null,
  p_localized_titles jsonb default '{}'::jsonb,
  p_items jsonb default '[]'::jsonb,
  p_release_timing_mode text default 'asap',
  p_scheduled_release_at timestamptz default null,
  p_original_release_date date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  result_payload jsonb;
  catalog_id uuid;
  normalized_timing text := lower(trim(coalesce(p_release_timing_mode, 'asap')));
begin
  if p_mode = 'music' then
    if normalized_timing not in ('asap', 'scheduled') then
      raise exception 'Release timing must be asap or scheduled' using errcode = '22023';
    end if;

    if normalized_timing = 'scheduled' and p_scheduled_release_at is null then
      raise exception 'Choose a scheduled release date and time' using errcode = '22023';
    end if;
  else
    normalized_timing := 'asap';
  end if;

  result_payload := public.create_creator_submission_v2(
    p_creator_account_id,
    p_mode,
    p_title,
    p_description,
    p_release_type,
    p_music_type,
    p_recording_type,
    p_artist_id,
    p_cantor_id,
    p_season_id,
    p_hymn_id,
    p_localized_titles,
    p_items,
    case when normalized_timing = 'scheduled' then p_scheduled_release_at else null end,
    p_original_release_date
  );

  if p_mode = 'music' then
    catalog_id := nullif(result_payload ->> 'catalogId', '')::uuid;

    update music.releases release
    set release_timing_mode = normalized_timing,
        scheduled_release_at = case
          when normalized_timing = 'asap' then null
          else release.scheduled_release_at
        end,
        updated_at = now()
    where release.id = catalog_id;
  end if;

  return result_payload;
end;
$function$;

revoke all on function public.create_creator_submission_v3(
  uuid, text, text, text, music.release_type, text, text, uuid, uuid, uuid, uuid,
  jsonb, jsonb, text, timestamptz, date
) from public, anon;

grant execute on function public.create_creator_submission_v3(
  uuid, text, text, text, music.release_type, text, text, uuid, uuid, uuid, uuid,
  jsonb, jsonb, text, timestamptz, date
) to authenticated;

-- Release-edit wrapper with the same timing semantics. ASAP explicitly clears
-- any old scheduled time; scheduled keeps an unchanged time without reapplying
-- the 48-hour rule and validates a newly selected time through update_v2.
create or replace function public.update_creator_release_v3(
  p_release_id uuid,
  p_title text default null,
  p_description text default null,
  p_release_timing_mode text default null,
  p_scheduled_release_at timestamptz default null,
  p_original_release_date date default null,
  p_clear_original_release_date boolean default false,
  p_localized_titles jsonb default null,
  p_music_type text default null,
  p_recording_type text default null,
  p_tracks jsonb default null,
  p_cover_upload_intent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  release_record music.releases%rowtype;
  normalized_timing text;
  result_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into release_record
  from music.releases release
  where release.id = p_release_id
  for update;

  if not found then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  if not (select private.can_edit_creator_account(release_record.owner_creator_account_id)) then
    raise exception 'Not authorized for this release' using errcode = '42501';
  end if;

  normalized_timing := lower(trim(coalesce(p_release_timing_mode, release_record.release_timing_mode, 'asap')));

  if normalized_timing not in ('asap', 'scheduled') then
    raise exception 'Release timing must be asap or scheduled' using errcode = '22023';
  end if;

  if normalized_timing = 'scheduled'
     and p_scheduled_release_at is null
     and release_record.scheduled_release_at is null then
    raise exception 'Choose a scheduled release date and time' using errcode = '22023';
  end if;

  if normalized_timing = 'asap' then
    update music.releases release
    set release_timing_mode = 'asap',
        scheduled_release_at = null,
        updated_at = now()
    where release.id = p_release_id;
  else
    update music.releases release
    set release_timing_mode = 'scheduled',
        updated_at = now()
    where release.id = p_release_id;
  end if;

  result_payload := public.update_creator_release_v2(
    p_release_id,
    p_title,
    p_description,
    case when normalized_timing = 'scheduled' then p_scheduled_release_at else null end,
    p_original_release_date,
    p_clear_original_release_date,
    p_localized_titles,
    p_music_type,
    p_recording_type,
    p_tracks,
    p_cover_upload_intent_id
  );

  update music.releases release
  set release_timing_mode = normalized_timing,
      scheduled_release_at = case
        when normalized_timing = 'asap' then null
        else release.scheduled_release_at
      end,
      updated_at = now()
  where release.id = p_release_id;

  return public.get_creator_release(p_release_id);
end;
$function$;

revoke all on function public.update_creator_release_v3(
  uuid, text, text, text, timestamptz, date, boolean, jsonb, text, text, jsonb, uuid
) from public, anon;

grant execute on function public.update_creator_release_v3(
  uuid, text, text, text, timestamptz, date, boolean, jsonb, text, text, jsonb, uuid
) to authenticated;

-- Always promote the newest processed submission artwork when a release is
-- published, even when the release already had an older cover.
create or replace function private.prepare_music_release_artwork_for_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  submission_id uuid;
  newest_artwork_id uuid;
  old_artwork_id uuid;
begin
  if new.publication_status <> 'published'::media.publication_status then
    return new;
  end if;

  submission_id := nullif(new.metadata ->> 'submissionId', '')::uuid;
  old_artwork_id := new.cover_asset_id;

  if submission_id is not null then
    select item.media_asset_id
    into newest_artwork_id
    from media.submission_items item
    join media.media_assets asset
      on asset.id = item.media_asset_id
     and asset.processing_status = 'completed'::media.processing_status
    where item.submission_id = submission_id
      and item.role = 'artwork'::media.submission_item_role
      and item.media_asset_id is not null
    order by item.created_at desc, item.id desc
    limit 1;

    if newest_artwork_id is not null then
      new.cover_asset_id := newest_artwork_id;
    end if;
  end if;

  if new.cover_asset_id is not null then
    update media.media_assets asset
    set publication_status = 'published'::media.publication_status,
        updated_at = now()
    where asset.id = new.cover_asset_id
      and asset.processing_status = 'completed'::media.processing_status;
  end if;

  if old_artwork_id is not null
     and new.cover_asset_id is distinct from old_artwork_id
     and not exists (
       select 1
       from music.releases other_release
       where other_release.id <> new.id
         and other_release.cover_asset_id = old_artwork_id
     )
     and not exists (
       select 1 from music.artists artist where artist.profile_image_asset_id = old_artwork_id
     )
     and not exists (
       select 1 from learning.cantors cantor where cantor.profile_image_asset_id = old_artwork_id
     ) then
    update media.media_assets asset
    set publication_status = 'archived'::media.publication_status,
        updated_at = now()
    where asset.id = old_artwork_id;
  end if;

  update media.media_assets asset
  set publication_status = 'published'::media.publication_status,
      updated_at = now()
  where asset.id in (
    select artist.profile_image_asset_id
    from music.artists artist
    where artist.profile_image_asset_id is not null
      and (
        artist.id = new.primary_artist_id
        or artist.id in (
          select track_artist.artist_id
          from music.release_tracks release_track
          join music.track_artists track_artist on track_artist.track_id = release_track.track_id
          where release_track.release_id = new.id
        )
      )
  )
    and asset.processing_status = 'completed'::media.processing_status;

  return new;
end;
$function$;

drop trigger if exists music_release_prepare_artwork_for_publication on music.releases;
create trigger music_release_prepare_artwork_for_publication
before insert or update of publication_status on music.releases
for each row
execute function private.prepare_music_release_artwork_for_publication();

-- Internal all-in-one publisher used by approval and the scheduled publisher.
create or replace function private.publish_music_submission_internal(
  p_submission_id uuid,
  p_actor_id uuid default null,
  p_reason text default 'automatic'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  submission_record media.submissions%rowtype;
  release_record music.releases%rowtype;
  previous_status media.publication_status;
  actor_id uuid;
  published_asset_count integer := 0;
  invalid_track_count integer := 0;
begin
  select *
  into submission_record
  from media.submissions submission
  where submission.id = p_submission_id
  for update;

  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;

  if submission_record.submission_type <> 'music_release'::media.submission_type then
    raise exception 'Automatic release publishing only supports music releases' using errcode = '22023';
  end if;

  if submission_record.status not in (
    'approved'::media.publication_status,
    'processing'::media.publication_status,
    'published'::media.publication_status
  ) then
    raise exception 'Submission is not approved for publication' using errcode = '22023';
  end if;

  perform private.attach_completed_submission_jobs(submission_record.id);

  if not (select private.submission_required_items_ready(submission_record.id)) then
    raise exception 'Submission still has required items waiting for processing' using errcode = '22023';
  end if;

  select *
  into release_record
  from music.releases release
  where nullif(release.metadata ->> 'submissionId', '')::uuid = submission_record.id
  for update;

  if not found then
    raise exception 'Music release not found for submission' using errcode = 'P0002';
  end if;

  actor_id := coalesce(p_actor_id, submission_record.reviewer_id, submission_record.created_by);

  with published_assets as (
    update media.media_assets asset
    set publication_status = 'published'::media.publication_status,
        updated_by = actor_id,
        updated_at = now()
    from (
      select distinct item.media_asset_id
      from media.submission_items item
      where item.submission_id = submission_record.id
        and item.media_asset_id is not null
    ) asset_to_publish
    where asset.id = asset_to_publish.media_asset_id
    returning asset.id
  )
  select count(*)::integer
  into published_asset_count
  from published_assets;

  select count(*)::integer
  into invalid_track_count
  from music.release_tracks release_track
  join music.tracks track on track.id = release_track.track_id
  left join media.media_assets asset on asset.id = track.media_asset_id
  where release_track.release_id = release_record.id
    and (
      track.media_asset_id is null
      or asset.id is null
      or asset.processing_status <> 'completed'::media.processing_status
      or asset.publication_status <> 'published'::media.publication_status
    );

  if invalid_track_count > 0 then
    raise exception 'Release has tracks without completed published media assets' using errcode = '22023';
  end if;

  update music.artists artist
  set publication_status = 'published'::media.publication_status,
      updated_by = actor_id,
      updated_at = now()
  where artist.id = release_record.primary_artist_id
     or artist.id in (
       select track_artist.artist_id
       from music.release_tracks release_track
       join music.track_artists track_artist on track_artist.track_id = release_track.track_id
       where release_track.release_id = release_record.id
     );

  update music.artist_localizations localization
  set publication_status = 'published'::media.publication_status,
      updated_by = actor_id,
      updated_at = now()
  where localization.artist_id = release_record.primary_artist_id
     or localization.artist_id in (
       select track_artist.artist_id
       from music.release_tracks release_track
       join music.track_artists track_artist on track_artist.track_id = release_track.track_id
       where release_track.release_id = release_record.id
     );

  update music.tracks track
  set publication_status = 'published'::media.publication_status,
      updated_by = actor_id,
      updated_at = now()
  where track.id in (
    select release_track.track_id
    from music.release_tracks release_track
    where release_track.release_id = release_record.id
  );

  update music.track_localizations localization
  set publication_status = 'published'::media.publication_status,
      updated_by = actor_id,
      updated_at = now()
  where localization.track_id in (
    select release_track.track_id
    from music.release_tracks release_track
    where release_track.release_id = release_record.id
  );

  update music.release_localizations localization
  set publication_status = 'published'::media.publication_status,
      updated_by = actor_id,
      updated_at = now()
  where localization.release_id = release_record.id;

  update music.releases release
  set publication_status = 'published'::media.publication_status,
      release_date = coalesce(
        release.release_date,
        release.scheduled_release_at::date,
        current_date
      ),
      updated_by = actor_id,
      updated_at = now()
  where release.id = release_record.id
  returning * into release_record;

  previous_status := submission_record.status;

  update media.submissions submission
  set status = 'published'::media.publication_status,
      published_at = now(),
      updated_by = actor_id,
      updated_at = now()
  where submission.id = submission_record.id
  returning * into submission_record;

  if previous_status <> 'published'::media.publication_status then
    perform private.add_media_submission_event(
      submission_record.id,
      actor_id,
      case when p_reason = 'scheduled' then 'published_automatically_on_schedule' else 'published_automatically' end,
      previous_status,
      submission_record.status,
      null,
      jsonb_build_object(
        'reason', p_reason,
        'releaseId', release_record.id,
        'publishedAssetCount', published_asset_count
      )
    );
  end if;

  return jsonb_build_object(
    'submissionId', submission_record.id,
    'submissionStatus', submission_record.status,
    'releaseId', release_record.id,
    'releaseStatus', release_record.publication_status,
    'publishedAt', submission_record.published_at,
    'publishedAssetCount', published_asset_count
  );
end;
$function$;

revoke all on function private.publish_music_submission_internal(uuid, uuid, text) from public;

-- Approval now means "approved for its requested release timing". ASAP goes
-- live immediately; scheduled releases wait for the chosen timestamp.
create or replace function public.review_media_submission(
  p_submission_id uuid,
  p_action text,
  p_notes text default null::text
)
returns table(
  submission_id uuid,
  status media.publication_status,
  review_due_at timestamptz,
  processing_jobs_queued integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  current_submission media.submissions%rowtype;
  previous_status media.publication_status;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  normalized_notes text := nullif(trim(coalesce(p_notes, '')), '');
  release_record music.releases%rowtype;
begin
  processing_jobs_queued := 0;

  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  if normalized_action not in ('approve', 'request_changes', 'reject') then
    raise exception 'Unsupported review action' using errcode = '22023';
  end if;

  if normalized_action = 'request_changes' and normalized_notes is null then
    raise exception 'Review notes are required when requesting changes' using errcode = '22023';
  end if;

  select *
  into current_submission
  from media.submissions submission
  where submission.id = p_submission_id
  for update;

  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;

  if current_submission.status <> 'pending_review'::media.publication_status then
    raise exception 'Submission is not pending review' using errcode = '22023';
  end if;

  previous_status := current_submission.status;

  if normalized_action = 'request_changes' then
    update media.submissions submission
    set status = 'changes_requested'::media.publication_status,
        reviewer_id = request_user_id,
        reviewed_at = now(),
        review_notes = normalized_notes,
        approved_at = null,
        rejected_at = null,
        updated_by = request_user_id
    where submission.id = current_submission.id
    returning * into current_submission;

    perform private.add_media_submission_event(
      current_submission.id,
      request_user_id,
      'changes_requested',
      previous_status,
      current_submission.status,
      normalized_notes,
      '{}'::jsonb
    );

  elsif normalized_action = 'reject' then
    update media.submissions submission
    set status = 'rejected'::media.publication_status,
        reviewer_id = request_user_id,
        reviewed_at = now(),
        review_notes = normalized_notes,
        rejected_at = now(),
        approved_at = null,
        updated_by = request_user_id
    where submission.id = current_submission.id
    returning * into current_submission;

    perform private.add_media_submission_event(
      current_submission.id,
      request_user_id,
      'rejected',
      previous_status,
      current_submission.status,
      normalized_notes,
      '{}'::jsonb
    );

  else
    if not exists (
      select 1
      from media.submission_items item
      where item.submission_id = current_submission.id
    ) then
      raise exception 'Submission must have at least one item' using errcode = '22023';
    end if;

    perform private.attach_completed_submission_jobs(current_submission.id);

    if not (select private.submission_required_items_ready(current_submission.id)) then
      raise exception 'Submission media is still processing. Approve once processing completes.' using errcode = '22023';
    end if;

    update media.submissions submission
    set status = 'approved'::media.publication_status,
        reviewer_id = request_user_id,
        reviewed_at = now(),
        review_notes = normalized_notes,
        approved_at = now(),
        rejected_at = null,
        updated_by = request_user_id
    where submission.id = current_submission.id
    returning * into current_submission;

    perform private.add_media_submission_event(
      current_submission.id,
      request_user_id,
      'approved',
      previous_status,
      current_submission.status,
      normalized_notes,
      jsonb_build_object('processingJobsQueued', 0)
    );

    if current_submission.submission_type = 'music_release'::media.submission_type then
      select *
      into release_record
      from music.releases release
      where nullif(release.metadata ->> 'submissionId', '')::uuid = current_submission.id
      for update;

      if found then
        if release_record.release_timing_mode = 'asap'
           or (
             release_record.release_timing_mode = 'scheduled'
             and release_record.scheduled_release_at is not null
             and release_record.scheduled_release_at <= now()
           ) then
          perform private.publish_music_submission_internal(
            current_submission.id,
            request_user_id,
            case when release_record.release_timing_mode = 'asap' then 'approval_asap' else 'scheduled_due_at_approval' end
          );

          select *
          into current_submission
          from media.submissions submission
          where submission.id = p_submission_id;
        end if;
      end if;
    end if;
  end if;

  return query
  select
    current_submission.id,
    current_submission.status,
    current_submission.review_due_at,
    processing_jobs_queued;
end;
$function$;

revoke all on function public.review_media_submission(uuid, text, text) from public, anon;
grant execute on function public.review_media_submission(uuid, text, text) to authenticated;

create or replace function private.publish_due_music_releases()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target record;
  published_count integer := 0;
begin
  for target in
    select
      submission.id as submission_id,
      submission.reviewer_id
    from media.submissions submission
    join music.releases release
      on nullif(release.metadata ->> 'submissionId', '')::uuid = submission.id
    where submission.submission_type = 'music_release'::media.submission_type
      and submission.status in (
        'approved'::media.publication_status,
        'processing'::media.publication_status
      )
      and release.release_timing_mode = 'scheduled'
      and release.scheduled_release_at is not null
      and release.scheduled_release_at <= now()
      and private.submission_required_items_ready(submission.id)
    order by release.scheduled_release_at
  loop
    begin
      perform private.publish_music_submission_internal(
        target.submission_id,
        target.reviewer_id,
        'scheduled'
      );
      published_count := published_count + 1;
    exception when others then
      perform private.add_media_submission_event(
        target.submission_id,
        target.reviewer_id,
        'scheduled_publish_failed',
        null,
        null,
        sqlerrm,
        '{}'::jsonb
      );
    end;
  end loop;

  return published_count;
end;
$function$;

revoke all on function private.publish_due_music_releases() from public;

-- Admin date edits participate in the same timing model.
create or replace function public.admin_update_music_release_dates(
  p_release_id uuid,
  p_scheduled_release_at timestamptz default null,
  p_original_release_date date default null,
  p_clear_scheduled_release_at boolean default false,
  p_clear_original_release_date boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  release_record music.releases%rowtype;
  submission_id uuid;
  submission_status media.publication_status;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select *
  into release_record
  from music.releases release
  where release.id = p_release_id
  for update;

  if not found then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  update music.releases release
  set scheduled_release_at = case
        when p_clear_scheduled_release_at then null
        else coalesce(p_scheduled_release_at, release.scheduled_release_at)
      end,
      release_timing_mode = case
        when p_clear_scheduled_release_at then 'asap'
        when p_scheduled_release_at is not null then 'scheduled'
        else release.release_timing_mode
      end,
      original_release_date = case
        when p_clear_original_release_date then null
        else coalesce(p_original_release_date, release.original_release_date)
      end,
      updated_by = request_user_id,
      updated_at = now()
  where release.id = p_release_id
  returning * into release_record;

  submission_id := nullif(release_record.metadata ->> 'submissionId', '')::uuid;

  if submission_id is not null then
    select submission.status
    into submission_status
    from media.submissions submission
    where submission.id = submission_id;

    if submission_status is not null then
      perform private.add_media_submission_event(
        submission_id,
        request_user_id,
        'release_dates_updated_by_admin',
        submission_status,
        submission_status,
        'An admin changed the release date settings.',
        jsonb_build_object(
          'releaseId', p_release_id,
          'releaseTimingMode', release_record.release_timing_mode,
          'scheduledReleaseAt', release_record.scheduled_release_at,
          'originalReleaseDate', release_record.original_release_date
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'releaseId', release_record.id,
    'releaseTimingMode', release_record.release_timing_mode,
    'scheduledReleaseAt', release_record.scheduled_release_at,
    'originalReleaseDate', release_record.original_release_date,
    'displayDate', music.release_display_date(
      release_record.original_release_date,
      release_record.scheduled_release_at,
      release_record.release_date
    )
  );
end;
$function$;

-- Fix already-replaced artwork: latest processed artwork is now authoritative
-- for published releases, and superseded public covers are retired.
do $backfill_artwork$
declare
  target record;
  old_cover uuid;
begin
  for target in
    select
      release.id as release_id,
      release.cover_asset_id,
      (
        select item.media_asset_id
        from media.submission_items item
        join media.media_assets asset
          on asset.id = item.media_asset_id
         and asset.processing_status = 'completed'::media.processing_status
        where item.submission_id = nullif(release.metadata ->> 'submissionId', '')::uuid
          and item.role = 'artwork'::media.submission_item_role
          and item.media_asset_id is not null
        order by item.created_at desc, item.id desc
        limit 1
      ) as newest_cover
    from music.releases release
    where release.publication_status = 'published'::media.publication_status
  loop
    if target.newest_cover is null or target.newest_cover is not distinct from target.cover_asset_id then
      continue;
    end if;

    old_cover := target.cover_asset_id;

    update music.releases release
    set cover_asset_id = target.newest_cover,
        updated_at = now()
    where release.id = target.release_id;

    update media.media_assets asset
    set publication_status = 'published'::media.publication_status,
        updated_at = now()
    where asset.id = target.newest_cover;

    if old_cover is not null
       and not exists (
         select 1 from music.releases release
         where release.id <> target.release_id
           and release.cover_asset_id = old_cover
       )
       and not exists (
         select 1 from music.artists artist where artist.profile_image_asset_id = old_cover
       )
       and not exists (
         select 1 from learning.cantors cantor where cantor.profile_image_asset_id = old_cover
       ) then
      update media.media_assets asset
      set publication_status = 'archived'::media.publication_status,
          updated_at = now()
      where asset.id = old_cover;
    end if;
  end loop;
end;
$backfill_artwork$;

-- Automatic scheduler. Runs every minute; releases normally become visible
-- within seconds of their selected time, with a worst-case delay under a minute.
create extension if not exists pg_cron;

do $cron$
begin
  if exists (
    select 1 from cron.job where jobname = 'chc-publish-due-music-releases'
  ) then
    perform cron.unschedule('chc-publish-due-music-releases');
  end if;

  perform cron.schedule(
    'chc-publish-due-music-releases',
    '* * * * *',
    'select private.publish_due_music_releases();'
  );
end;
$cron$;
