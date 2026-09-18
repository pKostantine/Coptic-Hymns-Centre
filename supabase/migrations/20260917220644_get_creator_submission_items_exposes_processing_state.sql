create or replace function public.get_creator_submission_items(p_submission_id uuid)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
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
      'role', item.role,
      'sortOrder', item.sort_order,
      'required', item.required,
      'mediaAssetId', item.media_asset_id,
      'uploadIntentId', item.upload_intent_id,
      'mediaType', intent.media_type,
      'contentLength', intent.content_length,
      'uploadStatus', intent.status,
      'processingStatus', job.status,
      'processingJobType', job.job_type,
      'processingAttemptCount', job.attempt_count,
      'processingMaxAttempts', job.max_attempts,
      'processingError', job.error_message,
      'processingAvailableAt', job.available_at
    ) order by item.sort_order, item.created_at)
    from media.submission_items item
    left join media.upload_intents intent on intent.id = item.upload_intent_id
    -- Read the live job for this upload rather than the one stamped on the
    -- item, so a queued/processing/failed job is visible before it completes.
    left join lateral (
      select
        pending_job.status,
        pending_job.job_type,
        pending_job.attempt_count,
        pending_job.max_attempts,
        pending_job.error_message,
        pending_job.available_at
      from media.media_processing_jobs pending_job
      where pending_job.upload_intent_id = item.upload_intent_id
      order by
        case pending_job.status
          when 'completed'::media.processing_job_status then 0
          when 'processing'::media.processing_job_status then 1
          when 'queued'::media.processing_job_status then 2
          else 3
        end,
        pending_job.created_at desc
      limit 1
    ) job on true
    where item.submission_id = p_submission_id
  ), '[]'::jsonb);
end;
$function$;
