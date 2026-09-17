-- Artwork gets an output path of its own rather than falling through to the
-- metadata.json branch.
create or replace function private.media_processing_output_path(
  creator_account_id uuid,
  upload_intent_id uuid,
  job_type media.processing_job_type
)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case
    when job_type = 'audio_delivery'::media.processing_job_type then
      'processed/' || creator_account_id::text || '/' || upload_intent_id::text || '/v1/audio.m4a'
    when job_type = 'video_delivery'::media.processing_job_type then
      'processed/' || creator_account_id::text || '/' || upload_intent_id::text || '/v1/video.mp4'
    when job_type = 'image_delivery'::media.processing_job_type then
      'processed/' || creator_account_id::text || '/' || upload_intent_id::text || '/v1/cover.jpg'
    else
      'processed/' || creator_account_id::text || '/' || upload_intent_id::text || '/v1/metadata.json'
  end;
$function$;

-- Each delivery job type now accepts the media it is actually for, and lands
-- in the bucket that serves it, instead of every job being audio into
-- chc-music. metadata_probe stays refused: the enum advertises it, but no
-- worker implements it, and silently queueing a job nothing will ever claim is
-- worse than saying so.
create or replace function public.enqueue_media_processing_job(
  p_upload_intent_id uuid,
  p_job_type media.processing_job_type default 'audio_delivery'::media.processing_job_type,
  p_output_bucket text default null::text
)
returns table(job_id uuid, status media.processing_job_status, input_bucket text, input_path text, output_bucket text, output_path text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  request_user_id uuid := auth.uid();
  source_intent media.upload_intents%rowtype;
  generated_output_path text;
  expected_media media.media_type;
  resolved_bucket text;
  allowed_buckets text[];
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_job_type = 'metadata_probe'::media.processing_job_type then
    raise exception 'metadata_probe jobs are not implemented by any worker' using errcode = '22023';
  end if;

  expected_media := case p_job_type
    when 'audio_delivery'::media.processing_job_type then 'audio'::media.media_type
    when 'video_delivery'::media.processing_job_type then 'video'::media.media_type
    when 'image_delivery'::media.processing_job_type then 'image'::media.media_type
  end;

  if expected_media is null then
    raise exception 'Unsupported processing job type: %', p_job_type using errcode = '22023';
  end if;

  allowed_buckets := case p_job_type
    when 'audio_delivery'::media.processing_job_type then array['chc-music', 'chc-learning']
    when 'video_delivery'::media.processing_job_type then array['chc-learning']
    when 'image_delivery'::media.processing_job_type then array['chc-images']
  end;

  resolved_bucket := coalesce(p_output_bucket, allowed_buckets[1]);

  if not (resolved_bucket = any(allowed_buckets)) then
    raise exception '% jobs cannot write to %', p_job_type, resolved_bucket using errcode = '22023';
  end if;

  select *
  into source_intent
  from media.upload_intents intent
  where intent.id = p_upload_intent_id;

  if not found then
    raise exception 'Upload intent not found' using errcode = 'P0002';
  end if;

  if source_intent.status <> 'uploaded'::media.upload_intent_status then
    raise exception 'Upload intent is not uploaded' using errcode = '22023';
  end if;

  if source_intent.media_type <> expected_media then
    raise exception 'A % upload cannot be enqueued for %', source_intent.media_type, p_job_type using errcode = '22023';
  end if;

  if source_intent.requested_by <> request_user_id
    and not (select private.can_edit_creator_account(source_intent.creator_account_id)) then
    raise exception 'Not authorized for upload intent' using errcode = '42501';
  end if;

  generated_output_path := private.media_processing_output_path(
    source_intent.creator_account_id,
    source_intent.id,
    p_job_type
  );

  insert into media.media_processing_jobs (
    upload_intent_id,
    job_type,
    status,
    input_bucket,
    input_path,
    output_bucket,
    output_path
  )
  values (
    source_intent.id,
    p_job_type,
    'queued'::media.processing_job_status,
    source_intent.bucket,
    source_intent.path,
    resolved_bucket,
    generated_output_path
  )
  on conflict (upload_intent_id, job_type) do update
  set available_at = case
        when media.media_processing_jobs.status in ('failed', 'cancelled') then now()
        else media.media_processing_jobs.available_at
      end,
      status = case
        when media.media_processing_jobs.status in ('failed', 'cancelled') then 'queued'::media.processing_job_status
        else media.media_processing_jobs.status
      end,
      error_message = case
        when media.media_processing_jobs.status in ('failed', 'cancelled') then null
        else media.media_processing_jobs.error_message
      end
  returning
    media.media_processing_jobs.id,
    media.media_processing_jobs.status,
    media.media_processing_jobs.input_bucket,
    media.media_processing_jobs.input_path,
    media.media_processing_jobs.output_bucket,
    media.media_processing_jobs.output_path
  into job_id, status, input_bucket, input_path, output_bucket, output_path;

  update media.upload_intents
  set error_message = null
  where id = source_intent.id;

  return next;
end;
$function$;

grant execute on function public.enqueue_media_processing_job(uuid, media.processing_job_type, text) to authenticated;
