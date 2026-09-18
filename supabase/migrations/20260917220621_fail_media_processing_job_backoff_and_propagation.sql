drop function if exists public.fail_media_processing_job(text, uuid, text);

create function public.fail_media_processing_job(
  p_worker_token text,
  p_job_id uuid,
  p_error_message text
)
returns table(
  job_id uuid,
  status media.processing_job_status,
  attempt_count integer,
  max_attempts integer,
  available_at timestamptz,
  error_message text
)
language plpgsql
security definer
set search_path to ''
as $function$
#variable_conflict use_column
declare
  job_record media.media_processing_jobs%rowtype;
  normalized_error text;
  will_retry boolean;
  retry_delay interval;
  affected_submission_id uuid;
begin
  if not private.verify_media_worker_token(p_worker_token) then
    raise exception 'Invalid media worker token' using errcode = '28000';
  end if;

  select *
  into job_record
  from media.media_processing_jobs job
  where job.id = p_job_id
  for update;

  if not found then
    raise exception 'Processing job not found' using errcode = 'P0002';
  end if;

  normalized_error := left(coalesce(nullif(trim(p_error_message), ''), 'Unknown processing error'), 4000);
  will_retry := job_record.attempt_count < job_record.max_attempts;

  -- Exponential backoff, capped at an hour: a transient R2 or ffmpeg failure
  -- retries soon, a persistently broken input stops hammering the queue.
  retry_delay := least(
    interval '1 minute' * power(4, greatest(job_record.attempt_count, 1)),
    interval '1 hour'
  );

  update media.media_processing_jobs job
  set status = case
        when will_retry then 'queued'::media.processing_job_status
        else 'failed'::media.processing_job_status
      end,
      available_at = case
        when will_retry then now() + retry_delay
        else job.available_at
      end,
      finished_at = case
        when will_retry then null
        else now()
      end,
      error_message = normalized_error
  where job.id = job_record.id
  returning
    job.id,
    job.status,
    job.attempt_count,
    job.max_attempts,
    job.available_at,
    job.error_message
  into
    job_id,
    status,
    attempt_count,
    max_attempts,
    available_at,
    error_message;

  -- A job that has run out of attempts is a dead end for whatever submission
  -- was waiting on it. Record that on the submission instead of leaving it
  -- sitting in `processing` with no visible reason.
  if not will_retry then
    for affected_submission_id in
      select distinct item.submission_id
      from media.submission_items item
      where item.upload_intent_id = job_record.upload_intent_id
    loop
      perform private.add_media_submission_event(
        affected_submission_id,
        null,
        'processing_failed',
        null,
        null,
        normalized_error,
        jsonb_build_object(
          'processingJobId', job_record.id,
          'jobType', job_record.job_type,
          'uploadIntentId', job_record.upload_intent_id,
          'attemptCount', job_record.attempt_count,
          'maxAttempts', job_record.max_attempts
        )
      );
    end loop;
  end if;

  return next;
end;
$function$;

grant execute on function public.fail_media_processing_job(text, uuid, text) to anon, authenticated;
