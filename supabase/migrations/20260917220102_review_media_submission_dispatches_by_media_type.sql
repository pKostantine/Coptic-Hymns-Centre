-- Approval used to enqueue audio_delivery/chc-music for every required item
-- that had no completed asset, so a PNG cover was handed to the audio
-- processor and the whole approval transaction died on
-- "Only audio uploads can be enqueued for audio delivery".
--
-- Each item now gets the job type its upload actually calls for, in the bucket
-- that serves it, and a single item that cannot be dispatched no longer undoes
-- the moderation decision: the failure is recorded on the approval event for
-- an administrator to look at, and the rest of the submission proceeds.
create or replace function public.review_media_submission(
  p_submission_id uuid,
  p_action text,
  p_notes text default null::text
)
returns table(submission_id uuid, status media.publication_status, review_due_at timestamp with time zone, processing_jobs_queued integer)
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
  item_record record;
  queued_job_id uuid;
  target_job_type media.processing_job_type;
  target_bucket text;
  dispatch_failures jsonb := '[]'::jsonb;
  skipped_items integer := 0;
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
      '{}'::jsonb
    );

    for item_record in
      select
        item.id,
        item.upload_intent_id,
        item.role,
        item.title,
        intent.media_type
      from media.submission_items item
      left join media.media_assets asset
        on asset.id = item.media_asset_id
       and asset.processing_status = 'completed'::media.processing_status
      left join media.upload_intents intent
        on intent.id = item.upload_intent_id
      where item.submission_id = current_submission.id
        and item.required
        and asset.id is null
    loop
      if item_record.upload_intent_id is null then
        raise exception 'Required submission item has no processable upload' using errcode = '22023';
      end if;

      target_job_type := case item_record.media_type
        when 'audio'::media.media_type then 'audio_delivery'::media.processing_job_type
        when 'image'::media.media_type then 'image_delivery'::media.processing_job_type
        when 'video'::media.media_type then 'video_delivery'::media.processing_job_type
        else null
      end;

      -- Nothing processes documents or unknown types. Leave them alone rather
      -- than refusing to approve the submission they happen to be attached to.
      if target_job_type is null then
        skipped_items := skipped_items + 1;
        continue;
      end if;

      -- Artwork serves from chc-images and lesson video from chc-learning
      -- whatever the submission is; audio follows the submission it belongs to.
      target_bucket := case
        when target_job_type = 'image_delivery'::media.processing_job_type then 'chc-images'
        when target_job_type = 'video_delivery'::media.processing_job_type then 'chc-learning'
        when current_submission.submission_type = 'music_release'::media.submission_type then 'chc-music'
        else 'chc-learning'
      end;

      begin
        select result.job_id
        into queued_job_id
        from public.enqueue_media_processing_job(
          item_record.upload_intent_id,
          target_job_type,
          target_bucket
        ) as result;

        processing_jobs_queued := processing_jobs_queued + 1;

        update media.submission_items item
        set media_processing_job_id = queued_job_id
        where item.id = item_record.id;
      exception when others then
        dispatch_failures := dispatch_failures || jsonb_build_object(
          'submissionItemId', item_record.id,
          'title', item_record.title,
          'role', item_record.role,
          'jobType', target_job_type,
          'error', sqlerrm
        );
      end;
    end loop;

    if jsonb_array_length(dispatch_failures) > 0 or skipped_items > 0 then
      perform private.add_media_submission_event(
        current_submission.id,
        request_user_id,
        'processing_dispatch_incomplete',
        current_submission.status,
        current_submission.status,
        null,
        jsonb_build_object(
          'failures', dispatch_failures,
          'skippedItems', skipped_items
        )
      );
    end if;

    perform private.attach_completed_submission_jobs(current_submission.id);

    if not (select private.submission_required_items_ready(current_submission.id)) then
      previous_status := current_submission.status;

      update media.submissions submission
      set status = 'processing'::media.publication_status,
          updated_by = request_user_id
      where submission.id = current_submission.id
      returning * into current_submission;

      perform private.add_media_submission_event(
        current_submission.id,
        request_user_id,
        'processing_started',
        previous_status,
        current_submission.status,
        null,
        jsonb_build_object('processingJobsQueued', processing_jobs_queued)
      );
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

grant execute on function public.review_media_submission(uuid, text, text) to authenticated;
