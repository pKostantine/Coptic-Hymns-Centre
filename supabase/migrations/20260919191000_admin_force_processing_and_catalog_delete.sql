-- Admin force controls for media processing and catalog deletion from CHC Admin.

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
      available_at = now(),
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

create or replace function public.force_pending_media_processing_jobs()
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

  update media.media_processing_jobs job
  set status = 'queued'::media.processing_job_status,
      available_at = now(),
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
  where job.status in (
      'queued'::media.processing_job_status,
      'failed'::media.processing_job_status,
      'cancelled'::media.processing_job_status
    )
    or (
      job.status = 'processing'::media.processing_job_status
      and job.claimed_at is not null
      and job.claimed_at < now() - interval '15 minutes'
    );

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

create or replace function public.admin_delete_catalog_item(
  p_kind text,
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  normalized_kind text := lower(trim(coalesce(p_kind, '')));
  submission_id uuid;
  title text;
  result jsonb;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  if normalized_kind = 'music_release' then
    select nullif(release.metadata ->> 'submissionId', '')::uuid, release.title
    into submission_id, title
    from music.releases release
    where release.id = p_id;

    if not found then raise exception 'Music release not found' using errcode = 'P0002'; end if;
    result := private.delete_music_release_core(p_id);

  elsif normalized_kind = 'learning_album' then
    select album.submission_id, album.title
    into submission_id, title
    from learning.albums album
    where album.id = p_id;

    if not found then raise exception 'Learning album not found' using errcode = 'P0002'; end if;

    delete from learning.albums album where album.id = p_id;
    result := jsonb_build_object('id', p_id, 'kind', normalized_kind, 'deleted', true);

  elsif normalized_kind = 'learning_lesson_set' then
    select lesson_set.submission_id, lesson_set.title
    into submission_id, title
    from learning.lesson_sets lesson_set
    where lesson_set.id = p_id;

    if not found then raise exception 'Lesson set not found' using errcode = 'P0002'; end if;

    delete from learning.lesson_sets lesson_set where lesson_set.id = p_id;
    result := jsonb_build_object('id', p_id, 'kind', normalized_kind, 'deleted', true);

  else
    raise exception 'Unsupported catalog item type' using errcode = '22023';
  end if;

  if submission_id is not null and exists (
    select 1 from media.submissions submission where submission.id = submission_id
  ) then
    perform private.add_media_submission_event(
      submission_id,
      request_user_id,
      'catalog_item_deleted_by_admin',
      (select submission.status from media.submissions submission where submission.id = submission_id),
      (select submission.status from media.submissions submission where submission.id = submission_id),
      'An admin permanently deleted the linked catalog item.',
      jsonb_build_object('kind', normalized_kind, 'catalogId', p_id, 'title', title)
    );
  end if;

  return result;
end;
$function$;

-- Deleted published catalog items should disappear from the Admin Published page
-- while the underlying submission/audit record remains preserved.
do $patch_overview$
declare
  definition text;
  patched text;
  needle text := $needle$        where submission.status = 'published'::media.publication_status$needle$;
  replacement text := $replacement$        where submission.status = 'published'::media.publication_status
          and (
            (
              submission.submission_type = 'music_release'::media.submission_type
              and exists (
                select 1 from music.releases release
                where release.metadata ->> 'submissionId' = submission.id::text
              )
            )
            or (
              submission.submission_type = 'learning_album'::media.submission_type
              and exists (
                select 1 from learning.albums album
                where album.submission_id = submission.id
              )
            )
            or (
              submission.submission_type = 'learning_lesson_set'::media.submission_type
              and exists (
                select 1 from learning.lesson_sets lesson_set
                where lesson_set.submission_id = submission.id
              )
            )
          )$replacement$;
begin
  select pg_get_functiondef(p.oid)
  into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_admin_publication_overview';

  if definition is null then
    raise exception 'get_admin_publication_overview not found';
  end if;

  if position('where release.metadata ->> ''submissionId'' = submission.id::text' in definition) > 0
     and position('where album.submission_id = submission.id' in definition) > 0
     and position('where lesson_set.submission_id = submission.id' in definition) > 0 then
    return;
  end if;

  patched := replace(definition, needle, replacement);
  if patched = definition then
    raise exception 'Could not patch published overview filtering';
  end if;

  execute patched;
end;
$patch_overview$;

revoke all on function public.force_media_processing_job(uuid) from public, anon;
revoke all on function public.force_pending_media_processing_jobs() from public, anon;
revoke all on function public.admin_delete_catalog_item(text, uuid) from public, anon;

grant execute on function public.force_media_processing_job(uuid) to authenticated;
grant execute on function public.force_pending_media_processing_jobs() to authenticated;
grant execute on function public.admin_delete_catalog_item(text, uuid) to authenticated;
