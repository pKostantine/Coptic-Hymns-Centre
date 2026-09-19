-- Recover worker-crash jobs and make pending-review processing blockers visible.
--
-- Audio/image jobs should never remain in "processing" forever after the
-- Railway worker is SIGKILLed. Reclaim stale jobs before taking the next queue
-- item, with a much longer lease for video jobs.
--
-- CHC Admin's approval button also needs the same readiness rule as
-- review_media_submission, so pending-review submissions expose
-- processing_incomplete as a blocking check instead of failing only after the
-- reviewer clicks Approve.

do $patch_claim$
declare
  definition text;
  patched text;
  needle text := E'  if not private.verify_media_worker_token(p_worker_token) then\n    raise exception ''Invalid media worker token'' using errcode = ''28000'';\n  end if;\n\n  select job.id';
  replacement text := E'  if not private.verify_media_worker_token(p_worker_token) then\n    raise exception ''Invalid media worker token'' using errcode = ''28000'';\n  end if;\n\n  update media.media_processing_jobs job\n  set status = ''queued''::media.processing_job_status,\n      worker_id = null,\n      claimed_at = null,\n      available_at = now(),\n      error_message = ''Recovered after media worker stopped before completing the job'',\n      updated_at = now()\n  where job.status = ''processing''::media.processing_job_status\n    and job.claimed_at is not null\n    and job.attempt_count < job.max_attempts\n    and (\n      (job.job_type in (''audio_delivery''::media.processing_job_type, ''image_delivery''::media.processing_job_type)\n        and job.claimed_at < now() - interval ''15 minutes'')\n      or\n      (job.job_type = ''video_delivery''::media.processing_job_type\n        and job.claimed_at < now() - interval ''2 hours'')\n    );\n\n  select job.id';
begin
  select pg_get_functiondef(p.oid)
  into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'claim_media_processing_job';

  if definition is null then
    raise exception 'claim_media_processing_job not found';
  end if;

  if position('Recovered after media worker stopped before completing the job' in definition) > 0 then
    return;
  end if;

  patched := replace(definition, needle, replacement);

  if patched = definition then
    raise exception 'Could not patch claim_media_processing_job';
  end if;

  execute patched;
end;
$patch_claim$;

do $patch_admin_checks$
declare
  definition text;
  patched text;
  needle text := E'      and submission.status in (\n        ''approved''::media.publication_status,\n        ''processing''::media.publication_status\n      )';
  replacement text := E'      and submission.status in (\n        ''pending_review''::media.publication_status,\n        ''approved''::media.publication_status,\n        ''processing''::media.publication_status\n      )';
begin
  select pg_get_functiondef(p.oid)
  into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_admin_submission_detail'
    and pg_get_function_identity_arguments(p.oid) = 'p_submission_id uuid';

  if definition is null then
    raise exception 'get_admin_submission_detail not found';
  end if;

  if position(E'''pending_review''::media.publication_status,\n        ''approved''::media.publication_status' in definition) > 0 then
    return;
  end if;

  patched := replace(definition, needle, replacement);

  if patched = definition then
    raise exception 'Could not patch get_admin_submission_detail processing check';
  end if;

  execute patched;
end;
$patch_admin_checks$;
