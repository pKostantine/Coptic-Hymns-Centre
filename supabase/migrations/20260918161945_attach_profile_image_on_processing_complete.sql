-- A profile picture is queued when the artist saves and finished minutes later
-- by the worker. This is what closes that loop: when the delivery asset for the
-- intent an artist is waiting on appears, it becomes their picture.
create or replace function private.attach_pending_artist_profile_image(p_upload_intent_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  attached_count integer := 0;
  delivery_asset_id uuid;
begin
  if p_upload_intent_id is null then
    return 0;
  end if;

  select job.media_asset_id
  into delivery_asset_id
  from media.media_processing_jobs job
  where job.upload_intent_id = p_upload_intent_id
    and job.job_type = 'image_delivery'::media.processing_job_type
    and job.status = 'completed'::media.processing_job_status
    and job.media_asset_id is not null
  order by job.finished_at desc nulls last
  limit 1;

  if delivery_asset_id is null then
    return 0;
  end if;

  update music.artists artist
  set profile_image_asset_id = delivery_asset_id,
      metadata = artist.metadata - 'pendingProfileImageUploadIntentId',
      updated_at = now()
  where artist.metadata ->> 'pendingProfileImageUploadIntentId' = p_upload_intent_id::text;

  get diagnostics attached_count = row_count;
  return attached_count;
end;
$function$;

-- Hook it into the same point that settles a submission, so one completed job
-- reaches everything waiting on it.
create or replace function private.settle_submission_processing(p_upload_intent_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  settled_count integer := 0;
  submission_record media.submissions%rowtype;
  target_submission_id uuid;
begin
  if p_upload_intent_id is null then
    return 0;
  end if;

  perform private.attach_pending_artist_profile_image(p_upload_intent_id);

  for target_submission_id in
    select distinct item.submission_id
    from media.submission_items item
    where item.upload_intent_id = p_upload_intent_id
  loop
    perform private.attach_completed_submission_jobs(target_submission_id);

    select *
    into submission_record
    from media.submissions submission
    where submission.id = target_submission_id
      and submission.status = 'processing'::media.publication_status
    for update;

    if not found then
      continue;
    end if;

    if not (select private.submission_required_items_ready(target_submission_id)) then
      continue;
    end if;

    update media.submissions submission
    set status = 'approved'::media.publication_status,
        updated_at = now()
    where submission.id = target_submission_id;

    perform private.add_media_submission_event(
      target_submission_id,
      submission_record.reviewer_id,
      'processing_completed',
      'processing'::media.publication_status,
      'approved'::media.publication_status,
      null,
      jsonb_build_object('uploadIntentId', p_upload_intent_id)
    );

    settled_count := settled_count + 1;
  end loop;

  return settled_count;
end;
$function$;
