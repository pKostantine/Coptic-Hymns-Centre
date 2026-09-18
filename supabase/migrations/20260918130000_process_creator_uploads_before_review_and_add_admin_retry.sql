create or replace function public.add_media_submission_item(
  p_submission_id uuid,
  p_upload_intent_id uuid default null::uuid,
  p_media_asset_id uuid default null::uuid,
  p_title text default null::text,
  p_sort_order integer default 0,
  p_required boolean default true,
  p_role media.submission_item_role default null::media.submission_item_role
)
returns table(
  item_id uuid,
  submission_id uuid,
  upload_intent_id uuid,
  media_asset_id uuid,
  media_processing_job_id uuid
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  request_user_id uuid := auth.uid();
  current_submission media.submissions%rowtype;
  source_intent media.upload_intents%rowtype;
  source_asset media.media_assets%rowtype;
  inserted_item media.submission_items%rowtype;
  previous_status media.publication_status;
  next_status media.publication_status;
  normalized_title text := nullif(trim(coalesce(p_title, '')), '');
  resolved_role media.submission_item_role;
  target_job_type media.processing_job_type;
  target_bucket text;
  queued_job_id uuid;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if (p_upload_intent_id is null and p_media_asset_id is null)
    or (p_upload_intent_id is not null and p_media_asset_id is not null) then
    raise exception 'Provide exactly one upload intent or media asset' using errcode = '22023';
  end if;

  select *
  into current_submission
  from media.submissions submission
  where submission.id = p_submission_id
  for update;

  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;

  if not (select private.can_edit_creator_account(current_submission.creator_account_id)) then
    raise exception 'Not authorized for submission' using errcode = '42501';
  end if;

  if current_submission.status not in (
    'draft'::media.publication_status,
    'uploading'::media.publication_status,
    'ready_to_submit'::media.publication_status,
    'changes_requested'::media.publication_status
  ) then
    raise exception 'Submission is not editable' using errcode = '22023';
  end if;

  if p_upload_intent_id is not null then
    select * into source_intent
    from media.upload_intents intent
    where intent.id = p_upload_intent_id;

    if not found then
      raise exception 'Upload intent not found' using errcode = 'P0002';
    end if;

    if source_intent.creator_account_id <> current_submission.creator_account_id then
      raise exception 'Upload intent belongs to a different creator account' using errcode = '42501';
    end if;

    if source_intent.status <> 'uploaded'::media.upload_intent_status then
      raise exception 'Upload intent must be uploaded before submission' using errcode = '22023';
    end if;

    normalized_title := coalesce(normalized_title, source_intent.original_filename);
  end if;

  if p_media_asset_id is not null then
    select * into source_asset
    from media.media_assets asset
    where asset.id = p_media_asset_id;

    if not found then
      raise exception 'Media asset not found' using errcode = 'P0002';
    end if;

    if source_asset.owner_creator_account_id <> current_submission.creator_account_id then
      raise exception 'Media asset belongs to a different creator account' using errcode = '42501';
    end if;

    if source_asset.processing_status <> 'completed'::media.processing_status then
      raise exception 'Media asset is not processing-complete' using errcode = '22023';
    end if;

    normalized_title := coalesce(normalized_title, source_asset.path);
  end if;

  resolved_role := coalesce(
    p_role,
    (case
      when source_intent.id is not null and source_intent.media_type = 'image'::media.media_type then 'artwork'
      when source_asset.id is not null and source_asset.media_type = 'image'::media.media_type then 'artwork'
      when current_submission.submission_type = 'music_release'::media.submission_type then 'track'
      when current_submission.submission_type in ('learning_album'::media.submission_type, 'learning_lesson_set'::media.submission_type) then 'lesson'
      else 'other'
    end)::media.submission_item_role
  );

  insert into media.submission_items (
    submission_id, upload_intent_id, media_asset_id, title, sort_order, required, role
  )
  values (
    current_submission.id, p_upload_intent_id, p_media_asset_id, normalized_title,
    coalesce(p_sort_order, 0), coalesce(p_required, true), resolved_role
  )
  returning * into inserted_item;

  if source_intent.id is not null
     and source_intent.media_type in ('audio'::media.media_type, 'image'::media.media_type, 'video'::media.media_type) then
    target_job_type := case source_intent.media_type
      when 'audio'::media.media_type then 'audio_delivery'::media.processing_job_type
      when 'image'::media.media_type then 'image_delivery'::media.processing_job_type
      when 'video'::media.media_type then 'video_delivery'::media.processing_job_type
      else null
    end;

    target_bucket := case
      when target_job_type = 'image_delivery'::media.processing_job_type then 'chc-images'
      when target_job_type = 'video_delivery'::media.processing_job_type then 'chc-learning'
      when current_submission.submission_type = 'music_release'::media.submission_type then 'chc-music'
      else 'chc-learning'
    end;

    select result.job_id into queued_job_id
    from public.enqueue_media_processing_job(source_intent.id, target_job_type, target_bucket) result;

    update media.submission_items item
    set media_processing_job_id = queued_job_id
    where item.id = inserted_item.id;

    perform private.attach_completed_submission_jobs(current_submission.id);

    select * into inserted_item
    from media.submission_items item
    where item.id = inserted_item.id;
  end if;

  previous_status := current_submission.status;
  next_status := case
    when current_submission.status = 'ready_to_submit'::media.publication_status then current_submission.status
    else 'ready_to_submit'::media.publication_status
  end;

  update media.submissions submission
  set status = next_status, updated_by = request_user_id
  where submission.id = current_submission.id;

  perform private.add_media_submission_event(
    current_submission.id,
    request_user_id,
    'item_added',
    previous_status,
    next_status,
    null,
    jsonb_build_object(
      'submissionItemId', inserted_item.id,
      'uploadIntentId', inserted_item.upload_intent_id,
      'mediaAssetId', inserted_item.media_asset_id,
      'processingJobId', inserted_item.media_processing_job_id,
      'role', inserted_item.role
    )
  );

  return query
  select inserted_item.id, inserted_item.submission_id, inserted_item.upload_intent_id,
         inserted_item.media_asset_id, inserted_item.media_processing_job_id;
end;
$function$;

create or replace function public.review_media_submission(
  p_submission_id uuid,
  p_action text,
  p_notes text default null::text
)
returns table(
  submission_id uuid,
  status media.publication_status,
  review_due_at timestamp with time zone,
  processing_jobs_queued integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  request_user_id uuid := auth.uid();
  current_submission media.submissions%rowtype;
  previous_status media.publication_status;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  normalized_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  processing_jobs_queued := 0;

  if request_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not (select private.is_admin()) then raise exception 'Admin role required' using errcode = '42501'; end if;
  if normalized_action not in ('approve', 'request_changes', 'reject') then raise exception 'Unsupported review action' using errcode = '22023'; end if;
  if normalized_action = 'request_changes' and normalized_notes is null then raise exception 'Review notes are required when requesting changes' using errcode = '22023'; end if;

  select * into current_submission
  from media.submissions submission
  where submission.id = p_submission_id
  for update;

  if not found then raise exception 'Submission not found' using errcode = 'P0002'; end if;
  if current_submission.status <> 'pending_review'::media.publication_status then raise exception 'Submission is not pending review' using errcode = '22023'; end if;

  previous_status := current_submission.status;

  if normalized_action = 'request_changes' then
    update media.submissions submission
    set status = 'changes_requested'::media.publication_status,
        reviewer_id = request_user_id, reviewed_at = now(), review_notes = normalized_notes,
        approved_at = null, rejected_at = null, updated_by = request_user_id
    where submission.id = current_submission.id
    returning * into current_submission;

    perform private.add_media_submission_event(current_submission.id, request_user_id, 'changes_requested', previous_status, current_submission.status, normalized_notes, '{}'::jsonb);

  elsif normalized_action = 'reject' then
    update media.submissions submission
    set status = 'rejected'::media.publication_status,
        reviewer_id = request_user_id, reviewed_at = now(), review_notes = normalized_notes,
        rejected_at = now(), approved_at = null, updated_by = request_user_id
    where submission.id = current_submission.id
    returning * into current_submission;

    perform private.add_media_submission_event(current_submission.id, request_user_id, 'rejected', previous_status, current_submission.status, normalized_notes, '{}'::jsonb);

  else
    if not exists (select 1 from media.submission_items item where item.submission_id = current_submission.id) then
      raise exception 'Submission must have at least one item' using errcode = '22023';
    end if;

    perform private.attach_completed_submission_jobs(current_submission.id);

    if not (select private.submission_required_items_ready(current_submission.id)) then
      raise exception 'Submission media is still processing. Approve once processing completes.' using errcode = '22023';
    end if;

    update media.submissions submission
    set status = 'approved'::media.publication_status,
        reviewer_id = request_user_id, reviewed_at = now(), review_notes = normalized_notes,
        approved_at = now(), rejected_at = null, updated_by = request_user_id
    where submission.id = current_submission.id
    returning * into current_submission;

    perform private.add_media_submission_event(
      current_submission.id, request_user_id, 'approved', previous_status,
      current_submission.status, normalized_notes, jsonb_build_object('processingJobsQueued', 0)
    );
  end if;

  return query
  select current_submission.id, current_submission.status, current_submission.review_due_at, processing_jobs_queued;
end;
$function$;

create or replace function public.retry_media_processing_job(p_job_id uuid)
returns table(
  job_id uuid,
  status media.processing_job_status,
  available_at timestamp with time zone,
  attempt_count integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  request_user_id uuid := auth.uid();
  job_record media.media_processing_jobs%rowtype;
  requeued_id uuid;
begin
  if request_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not (select private.is_admin()) then raise exception 'Admin role required' using errcode = '42501'; end if;

  select * into job_record
  from media.media_processing_jobs job
  where job.id = p_job_id
  for update;

  if not found then raise exception 'Processing job not found' using errcode = 'P0002'; end if;

  if job_record.status not in ('failed'::media.processing_job_status, 'cancelled'::media.processing_job_status) then
    raise exception 'Only failed or cancelled processing jobs can be retried manually' using errcode = '22023';
  end if;

  select result.job_id into requeued_id
  from public.enqueue_media_processing_job(job_record.upload_intent_id, job_record.job_type, job_record.output_bucket) result;

  update media.submission_items item
  set media_processing_job_id = requeued_id
  where item.upload_intent_id = job_record.upload_intent_id;

  return query
  select job.id, job.status, job.available_at, job.attempt_count, job.max_attempts
  from media.media_processing_jobs job
  where job.id = requeued_id;
end;
$function$;

revoke all on function public.retry_media_processing_job(uuid) from public, anon;
grant execute on function public.retry_media_processing_job(uuid) to authenticated;
