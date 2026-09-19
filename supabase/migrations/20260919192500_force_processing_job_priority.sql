-- Make the per-job "Force now" control jump ahead of normally queued work.
create or replace function public.force_media_processing_job(p_job_id uuid)
returns table(
  job_id uuid,
  status media.processing_job_status,
  available_at timestamptz,
  attempt_count integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  job_record media.media_processing_jobs%rowtype;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select *
  into job_record
  from media.media_processing_jobs job
  where job.id = p_job_id
  for update;

  if not found then
    raise exception 'Processing job not found' using errcode = 'P0002';
  end if;

  if job_record.status = 'completed'::media.processing_job_status then
    raise exception 'Completed jobs do not need to be forced' using errcode = '22023';
  end if;

  if job_record.status = 'processing'::media.processing_job_status
     and job_record.claimed_at is not null
     and job_record.claimed_at > now() - interval '15 minutes' then
    raise exception 'This job is already actively processing' using errcode = '22023';
  end if;

  update media.media_processing_jobs job
  set status = 'queued'::media.processing_job_status,
      -- claim_media_processing_job sorts by available_at first. Epoch places
      -- an explicitly forced job ahead of ordinary queued work.
      available_at = '1970-01-01 00:00:00+00'::timestamptz,
      attempt_count = case
        when job.attempt_count >= job.max_attempts then 0
        else job.attempt_count
      end,
      worker_id = null,
      claimed_at = null,
      started_at = null,
      finished_at = null,
      error_message = null,
      updated_at = now()
  where job.id = p_job_id;

  return query
  select job.id, job.status, job.available_at, job.attempt_count, job.max_attempts
  from media.media_processing_jobs job
  where job.id = p_job_id;
end;
$function$;

revoke all on function public.force_media_processing_job(uuid) from public, anon;
grant execute on function public.force_media_processing_job(uuid) to authenticated;
