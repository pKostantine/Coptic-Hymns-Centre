-- Force all actionable media jobs for one submission to the front of the queue.
create or replace function public.force_submission_media_processing(p_submission_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  affected integer := 0;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from media.submissions submission where submission.id = p_submission_id
  ) then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;

  update media.media_processing_jobs job
  set status = 'queued'::media.processing_job_status,
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
  where job.id in (
    select item.media_processing_job_id
    from media.submission_items item
    where item.submission_id = p_submission_id
      and item.media_processing_job_id is not null
  )
    and (
      job.status in (
        'queued'::media.processing_job_status,
        'failed'::media.processing_job_status,
        'cancelled'::media.processing_job_status
      )
      or (
        job.status = 'processing'::media.processing_job_status
        and job.claimed_at is not null
        and job.claimed_at < now() - interval '15 minutes'
      )
    );

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

revoke all on function public.force_submission_media_processing(uuid) from public, anon;
grant execute on function public.force_submission_media_processing(uuid) to authenticated;
