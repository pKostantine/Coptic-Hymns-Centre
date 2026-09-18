drop function if exists public.claim_media_processing_job(text, text);

create function public.claim_media_processing_job(
  p_worker_token text,
  p_worker_id text default null
)
returns table(
  job_id uuid,
  upload_intent_id uuid,
  job_type media.processing_job_type,
  media_type media.media_type,
  source_content_type text,
  attempt_count integer,
  max_attempts integer,
  input_bucket text,
  input_path text,
  output_bucket text,
  output_path text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  selected_job_id uuid;
begin
  if not private.verify_media_worker_token(p_worker_token) then
    raise exception 'Invalid media worker token' using errcode = '28000';
  end if;

  select job.id
  into selected_job_id
  from media.media_processing_jobs job
  where job.status = 'queued'::media.processing_job_status
    and job.available_at <= now()
    and job.attempt_count < job.max_attempts
  order by job.available_at, job.created_at
  for update skip locked
  limit 1;

  if selected_job_id is null then
    return;
  end if;

  update media.media_processing_jobs job
  set status = 'processing'::media.processing_job_status,
      attempt_count = job.attempt_count + 1,
      worker_id = nullif(trim(coalesce(p_worker_id, '')), ''),
      claimed_at = now(),
      started_at = coalesce(job.started_at, now()),
      error_message = null
  where job.id = selected_job_id
  returning
    job.id,
    job.upload_intent_id,
    job.job_type,
    job.attempt_count,
    job.max_attempts,
    job.input_bucket,
    job.input_path,
    job.output_bucket,
    job.output_path
  into
    job_id,
    upload_intent_id,
    job_type,
    attempt_count,
    max_attempts,
    input_bucket,
    input_path,
    output_bucket,
    output_path;

  select intent.media_type, intent.content_type
  into media_type, source_content_type
  from media.upload_intents intent
  where intent.id = upload_intent_id;

  return next;
end;
$function$;

grant execute on function public.claim_media_processing_job(text, text) to anon, authenticated;
