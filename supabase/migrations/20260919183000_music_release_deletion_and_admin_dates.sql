-- Music catalog deletion/editing controls for CHC Artists and CHC Admin.
--
-- Creators can permanently delete tracks from their own releases and delete
-- entire releases. Admins can do the same for any music release, and can
-- override release scheduling (including dates inside the normal 48-hour
-- creator window). Submission rows/files remain as moderation/audit history;
-- deleting a catalog track clears submission_items.music_track_id through the
-- existing ON DELETE SET NULL foreign key.

create or replace function private.cleanup_orphan_music_track(p_track_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1 from music.release_tracks release_track
    where release_track.track_id = p_track_id
  ) then
    return false;
  end if;

  delete from music.tracks track
  where track.id = p_track_id;

  return found;
end;
$function$;

create or replace function private.renumber_music_release_tracks(p_release_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Move the current numbers out of the way so the unique
  -- (release_id, disc_number, track_number) constraint cannot collide while
  -- compacting the list.
  update music.release_tracks release_track
  set track_number = release_track.track_number + 100000
  where release_track.release_id = p_release_id;

  with ordered as (
    select
      release_track.id,
      row_number() over (
        order by release_track.disc_number, release_track.track_number, release_track.created_at, release_track.id
      )::integer as next_number
    from music.release_tracks release_track
    where release_track.release_id = p_release_id
  )
  update music.release_tracks release_track
  set disc_number = 1,
      track_number = ordered.next_number
  from ordered
  where release_track.id = ordered.id;
end;
$function$;

create or replace function private.delete_music_release_track_core(
  p_release_id uuid,
  p_track_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  release_record music.releases%rowtype;
  total_tracks integer;
  remaining_tracks integer;
  track_deleted boolean := false;
begin
  select *
  into release_record
  from music.releases release
  where release.id = p_release_id
  for update;

  if not found then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from music.release_tracks release_track
    where release_track.release_id = p_release_id
      and release_track.track_id = p_track_id
  ) then
    raise exception 'Track does not belong to this release' using errcode = 'P0002';
  end if;

  select count(*)::integer
  into total_tracks
  from music.release_tracks release_track
  where release_track.release_id = p_release_id;

  if total_tracks <= 1 then
    raise exception 'A release needs at least one track. Delete the release instead.'
      using errcode = '22023';
  end if;

  delete from music.release_tracks release_track
  where release_track.release_id = p_release_id
    and release_track.track_id = p_track_id;

  track_deleted := private.cleanup_orphan_music_track(p_track_id);
  perform private.renumber_music_release_tracks(p_release_id);

  select count(*)::integer
  into remaining_tracks
  from music.release_tracks release_track
  where release_track.release_id = p_release_id;

  return jsonb_build_object(
    'releaseId', p_release_id,
    'trackId', p_track_id,
    'trackDeleted', track_deleted,
    'remainingTrackCount', remaining_tracks,
    'releaseType', (
      select release.release_type
      from music.releases release
      where release.id = p_release_id
    )
  );
end;
$function$;

create or replace function public.delete_creator_music_release_track(
  p_release_id uuid,
  p_track_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  account_id uuid;
  submission_id uuid;
  submission_status media.publication_status;
  result jsonb;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select release.owner_creator_account_id,
         nullif(release.metadata ->> 'submissionId', '')::uuid
  into account_id, submission_id
  from music.releases release
  where release.id = p_release_id;

  if account_id is null then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  if not (select private.can_edit_creator_account(account_id)) then
    raise exception 'Not authorized for this release' using errcode = '42501';
  end if;

  result := private.delete_music_release_track_core(p_release_id, p_track_id);

  if submission_id is not null then
    select submission.status
    into submission_status
    from media.submissions submission
    where submission.id = submission_id;

    if submission_status is not null then
      perform private.add_media_submission_event(
        submission_id,
        request_user_id,
        'track_deleted_by_creator',
        submission_status,
        submission_status,
        'The creator permanently deleted a track from the release.',
        jsonb_build_object('releaseId', p_release_id, 'trackId', p_track_id)
      );
    end if;
  end if;

  return result;
end;
$function$;

create or replace function public.delete_admin_music_release_track(
  p_release_id uuid,
  p_track_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  submission_id uuid;
  submission_status media.publication_status;
  result jsonb;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select nullif(release.metadata ->> 'submissionId', '')::uuid
  into submission_id
  from music.releases release
  where release.id = p_release_id;

  if not found then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  result := private.delete_music_release_track_core(p_release_id, p_track_id);

  if submission_id is not null then
    select submission.status
    into submission_status
    from media.submissions submission
    where submission.id = submission_id;

    if submission_status is not null then
      perform private.add_media_submission_event(
        submission_id,
        request_user_id,
        'track_deleted_by_admin',
        submission_status,
        submission_status,
        'An admin permanently deleted a track from the release.',
        jsonb_build_object('releaseId', p_release_id, 'trackId', p_track_id)
      );
    end if;
  end if;

  return result;
end;
$function$;

create or replace function private.delete_music_release_core(p_release_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  track_ids uuid[] := array[]::uuid[];
  current_track_id uuid;
  deleted_tracks integer := 0;
begin
  if not exists (
    select 1 from music.releases release where release.id = p_release_id
  ) then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(release_track.track_id), array[]::uuid[])
  into track_ids
  from music.release_tracks release_track
  where release_track.release_id = p_release_id;

  delete from music.releases release
  where release.id = p_release_id;

  foreach current_track_id in array track_ids
  loop
    if private.cleanup_orphan_music_track(current_track_id) then
      deleted_tracks := deleted_tracks + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'releaseId', p_release_id,
    'deleted', true,
    'deletedTrackCount', deleted_tracks
  );
end;
$function$;

create or replace function public.delete_creator_music_release(p_release_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  account_id uuid;
  submission_id uuid;
  submission_status media.publication_status;
  result jsonb;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select release.owner_creator_account_id,
         nullif(release.metadata ->> 'submissionId', '')::uuid
  into account_id, submission_id
  from music.releases release
  where release.id = p_release_id;

  if account_id is null then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  if not (select private.can_edit_creator_account(account_id)) then
    raise exception 'Not authorized for this release' using errcode = '42501';
  end if;

  if submission_id is not null then
    select submission.status
    into submission_status
    from media.submissions submission
    where submission.id = submission_id;

    if submission_status is not null then
      perform private.add_media_submission_event(
        submission_id,
        request_user_id,
        'release_deleted_by_creator',
        submission_status,
        submission_status,
        'The creator permanently deleted the release from the CHC music catalog.',
        jsonb_build_object('releaseId', p_release_id)
      );
    end if;
  end if;

  result := private.delete_music_release_core(p_release_id);
  return result;
end;
$function$;

create or replace function public.delete_admin_music_release(p_release_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  submission_id uuid;
  submission_status media.publication_status;
  result jsonb;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select nullif(release.metadata ->> 'submissionId', '')::uuid
  into submission_id
  from music.releases release
  where release.id = p_release_id;

  if not found then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  if submission_id is not null then
    select submission.status
    into submission_status
    from media.submissions submission
    where submission.id = submission_id;

    if submission_status is not null then
      perform private.add_media_submission_event(
        submission_id,
        request_user_id,
        'release_deleted_by_admin',
        submission_status,
        submission_status,
        'An admin permanently deleted the release from the CHC music catalog.',
        jsonb_build_object('releaseId', p_release_id)
      );
    end if;
  end if;

  result := private.delete_music_release_core(p_release_id);
  return result;
end;
$function$;

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
          'scheduledReleaseAt', release_record.scheduled_release_at,
          'originalReleaseDate', release_record.original_release_date
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'releaseId', release_record.id,
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

revoke all on function private.cleanup_orphan_music_track(uuid) from public;
revoke all on function private.renumber_music_release_tracks(uuid) from public;
revoke all on function private.delete_music_release_track_core(uuid, uuid) from public;
revoke all on function private.delete_music_release_core(uuid) from public;

revoke all on function public.delete_creator_music_release_track(uuid, uuid) from public, anon;
revoke all on function public.delete_admin_music_release_track(uuid, uuid) from public, anon;
revoke all on function public.delete_creator_music_release(uuid) from public, anon;
revoke all on function public.delete_admin_music_release(uuid) from public, anon;
revoke all on function public.admin_update_music_release_dates(uuid, timestamptz, date, boolean, boolean) from public, anon;

grant execute on function public.delete_creator_music_release_track(uuid, uuid) to authenticated;
grant execute on function public.delete_admin_music_release_track(uuid, uuid) to authenticated;
grant execute on function public.delete_creator_music_release(uuid) to authenticated;
grant execute on function public.delete_admin_music_release(uuid) to authenticated;
grant execute on function public.admin_update_music_release_dates(uuid, timestamptz, date, boolean, boolean) to authenticated;
