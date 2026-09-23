-- Recover CHC video lesson uploads: allow extracted M4A, attach correct video and audio assets,
-- and reuse already-uploaded multi-GB originals without uploading twice.
-- Complete Learn & Study creator lyrics and produce a real audio-only
-- rendition for every video lesson. The primary lesson asset remains video;
-- the smaller M4A is used only when the listener chooses Audio only.

alter table media.submission_items
  add column if not exists audio_only_asset_id uuid references media.media_assets(id) on delete set null;

alter table learning.lessons
  add column if not exists audio_asset_id uuid references media.media_assets(id) on delete set null;

create index if not exists learning_lessons_audio_asset_idx
  on learning.lessons(audio_asset_id) where audio_asset_id is not null;

create or replace function public.enqueue_media_processing_job(
  p_upload_intent_id uuid,
  p_job_type media.processing_job_type default 'audio_delivery'::media.processing_job_type,
  p_output_bucket text default null
)
returns table(
  job_id uuid,
  status media.processing_job_status,
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
  request_user_id uuid := auth.uid();
  source_intent media.upload_intents%rowtype;
  generated_output_path text;
  resolved_bucket text;
  allowed_buckets text[];
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_job_type = 'metadata_probe'::media.processing_job_type then
    raise exception 'metadata_probe jobs are not implemented by any worker' using errcode = '22023';
  end if;

  allowed_buckets := case p_job_type
    when 'audio_delivery'::media.processing_job_type then array['chc-music', 'chc-learning']
    when 'video_delivery'::media.processing_job_type then array['chc-learning']
    when 'image_delivery'::media.processing_job_type then array['chc-images']
  end;
  if allowed_buckets is null then
    raise exception 'Unsupported processing job type: %', p_job_type using errcode = '22023';
  end if;
  resolved_bucket := coalesce(p_output_bucket, allowed_buckets[1]);
  if not (resolved_bucket = any(allowed_buckets)) then
    raise exception '% jobs cannot write to %', p_job_type, resolved_bucket using errcode = '22023';
  end if;

  select * into source_intent from media.upload_intents where id = p_upload_intent_id;
  if not found then raise exception 'Upload intent not found' using errcode = 'P0002'; end if;
  if source_intent.status <> 'uploaded'::media.upload_intent_status then
    raise exception 'Upload intent is not uploaded' using errcode = '22023';
  end if;

  -- Video uploads intentionally create both video_delivery and audio_delivery.
  if not (
    (p_job_type = 'audio_delivery' and source_intent.media_type in ('audio'::media.media_type, 'video'::media.media_type))
    or (p_job_type = 'video_delivery' and source_intent.media_type = 'video'::media.media_type)
    or (p_job_type = 'image_delivery' and source_intent.media_type = 'image'::media.media_type)
  ) then
    raise exception 'A % upload cannot be enqueued for %', source_intent.media_type, p_job_type using errcode = '22023';
  end if;
  if source_intent.requested_by <> request_user_id
    and not (select private.can_edit_creator_account(source_intent.creator_account_id)) then
    raise exception 'Not authorized for upload intent' using errcode = '42501';
  end if;

  generated_output_path := private.media_processing_output_path(
    source_intent.creator_account_id, source_intent.id, p_job_type
  );
  insert into media.media_processing_jobs(
    upload_intent_id, job_type, status, input_bucket, input_path, output_bucket, output_path
  ) values (
    source_intent.id, p_job_type, 'queued'::media.processing_job_status,
    source_intent.bucket, source_intent.path, resolved_bucket, generated_output_path
  )
  on conflict (upload_intent_id, job_type) do update set
    available_at = case when media.media_processing_jobs.status in ('failed','cancelled') then now() else media.media_processing_jobs.available_at end,
    status = case when media.media_processing_jobs.status in ('failed','cancelled') then 'queued'::media.processing_job_status else media.media_processing_jobs.status end,
    attempt_count = case when media.media_processing_jobs.status in ('failed','cancelled') then 0 else media.media_processing_jobs.attempt_count end,
    finished_at = case when media.media_processing_jobs.status in ('failed','cancelled') then null else media.media_processing_jobs.finished_at end,
    output_bucket = case when media.media_processing_jobs.status in ('failed','cancelled') then excluded.output_bucket else media.media_processing_jobs.output_bucket end,
    output_path = case when media.media_processing_jobs.status in ('failed','cancelled') then excluded.output_path else media.media_processing_jobs.output_path end,
    error_message = case when media.media_processing_jobs.status in ('failed','cancelled') then null else media.media_processing_jobs.error_message end
  returning id, media.media_processing_jobs.status, media.media_processing_jobs.input_bucket,
    media.media_processing_jobs.input_path, media.media_processing_jobs.output_bucket,
    media.media_processing_jobs.output_path
  into job_id, status, input_bucket, input_path, output_bucket, output_path;

  update media.upload_intents set error_message = null where id = source_intent.id;
  return next;
end;
$function$;

create or replace function private.attach_completed_submission_jobs(p_submission_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  affected_count integer := 0;
  changed_count integer := 0;
begin
  -- Only the delivery matching the source media type becomes the item's
  -- primary asset. This prevents a video's extracted M4A replacing its MP4.
  with primary_jobs as (
    select distinct on (item.id) item.id item_id, job.id processing_job_id, job.media_asset_id
    from media.submission_items item
    join media.upload_intents intent on intent.id = item.upload_intent_id
    join media.media_processing_jobs job on job.upload_intent_id = intent.id
      and job.job_type = case intent.media_type
        when 'audio'::media.media_type then 'audio_delivery'::media.processing_job_type
        when 'video'::media.media_type then 'video_delivery'::media.processing_job_type
        when 'image'::media.media_type then 'image_delivery'::media.processing_job_type end
      and job.status = 'completed'::media.processing_job_status
      and job.media_asset_id is not null
    where item.submission_id = p_submission_id
    order by item.id, job.finished_at desc nulls last, job.created_at desc
  )
  update media.submission_items item set
    media_asset_id = coalesce(item.media_asset_id, primary_jobs.media_asset_id),
    media_processing_job_id = primary_jobs.processing_job_id
  from primary_jobs where item.id = primary_jobs.item_id
    and (item.media_asset_id is distinct from coalesce(item.media_asset_id, primary_jobs.media_asset_id)
      or item.media_processing_job_id is distinct from primary_jobs.processing_job_id);
  get diagnostics affected_count = row_count;

  with audio_jobs as (
    select distinct on (item.id) item.id item_id, job.media_asset_id
    from media.submission_items item
    join media.upload_intents intent on intent.id=item.upload_intent_id and intent.media_type='video'::media.media_type
    join media.media_processing_jobs job on job.upload_intent_id=intent.id
      and job.job_type='audio_delivery'::media.processing_job_type
      and job.status='completed'::media.processing_job_status and job.media_asset_id is not null
    where item.submission_id=p_submission_id
    order by item.id,job.finished_at desc nulls last,job.created_at desc
  )
  update media.submission_items item set audio_only_asset_id=audio_jobs.media_asset_id,updated_at=now()
  from audio_jobs where item.id=audio_jobs.item_id and item.audio_only_asset_id is distinct from audio_jobs.media_asset_id;
  get diagnostics changed_count = row_count;
  affected_count := affected_count + changed_count;

  update music.tracks track set
    media_asset_id=item.media_asset_id,
    duration_ms=coalesce(track.duration_ms,nullif(round((job.probe->'output'->'format'->>'duration')::numeric*1000),0)::bigint),
    updated_at=now()
  from media.submission_items item
  left join media.media_processing_jobs job on job.id=item.media_processing_job_id
  where item.submission_id=p_submission_id and item.music_track_id=track.id
    and item.media_asset_id is not null and track.media_asset_id is distinct from item.media_asset_id;

  -- This also fills existing published video lessons when their backfilled
  -- audio job completes.
  update learning.lessons lesson set audio_asset_id=item.audio_only_asset_id,updated_at=now()
  from media.submission_items item
  where item.submission_id=p_submission_id and item.audio_only_asset_id is not null
    and lesson.metadata->>'submissionItemId'=item.id::text
    and lesson.audio_asset_id is distinct from item.audio_only_asset_id;

  update media.media_assets asset set publication_status='published'::media.publication_status,updated_at=now()
  where asset.id in (
    select lesson.audio_asset_id from learning.lessons lesson
    where lesson.publication_status='published'::media.publication_status and lesson.audio_asset_id is not null
  ) and asset.publication_status is distinct from 'published'::media.publication_status;

  return affected_count;
end;
$function$;

create or replace function private.submission_required_items_ready(p_submission_id uuid)
returns boolean language sql stable security definer set search_path to '' as $function$
  select exists(select 1 from media.submission_items where submission_id=p_submission_id and required)
    and not exists(
      select 1 from media.submission_items item
      left join media.media_assets asset on asset.id=item.media_asset_id and asset.processing_status='completed'::media.processing_status
      left join media.upload_intents intent on intent.id=item.upload_intent_id
      left join media.media_assets audio_asset on audio_asset.id=item.audio_only_asset_id and audio_asset.processing_status='completed'::media.processing_status
      where item.submission_id=p_submission_id and item.required
        and (asset.id is null or (intent.media_type='video'::media.media_type and audio_asset.id is null))
        and intent.media_type in ('audio'::media.media_type,'image'::media.media_type,'video'::media.media_type)
    );
$function$;

create or replace function private.attach_lesson_audio_asset()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_asset_id uuid;
begin
  if new.media_type='video'::learning.lesson_media_type and new.metadata ? 'submissionItemId' then
    select audio_only_asset_id into v_asset_id from media.submission_items
      where id=(new.metadata->>'submissionItemId')::uuid;
    new.audio_asset_id := v_asset_id;
    if new.publication_status='published'::media.publication_status and v_asset_id is not null then
      update media.media_assets set publication_status='published'::media.publication_status,
        updated_by=coalesce(new.updated_by,new.created_by),updated_at=now() where id=v_asset_id;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists learning_lesson_attach_audio_asset on learning.lessons;
create trigger learning_lesson_attach_audio_asset before insert or update of publication_status on learning.lessons
for each row execute function private.attach_lesson_audio_asset();

-- Process audio-only renditions for existing lesson-set video uploads too.
insert into media.media_processing_jobs(
  upload_intent_id,job_type,status,input_bucket,input_path,output_bucket,output_path
)
select intent.id,'audio_delivery'::media.processing_job_type,'queued'::media.processing_job_status,
  intent.bucket,intent.path,'chc-learning',private.media_processing_output_path(intent.creator_account_id,intent.id,'audio_delivery'::media.processing_job_type)
from media.submission_items item
join media.submissions submission on submission.id=item.submission_id and submission.submission_type='learning_lesson_set'::media.submission_type
join media.upload_intents intent on intent.id=item.upload_intent_id and intent.media_type='video'::media.media_type
where intent.status='uploaded'::media.upload_intent_status
on conflict(upload_intent_id,job_type) do nothing;


-- Only reuse verified-complete, unsubmitted uploads owned by this same creator.
-- The client must match the exact name, original byte count and media kind.
-- This avoids making a creator spend hours re-uploading on processing failure.
create or replace function public.find_reusable_uploaded_media_intent(
  p_creator_account_id uuid,
  p_original_filename text,
  p_content_length bigint,
  p_media_type media.media_type
)
returns uuid
language sql
stable security definer
set search_path to ''
as $function$
  select intent.id
  from media.upload_intents intent
  where intent.creator_account_id = p_creator_account_id
    and intent.requested_by = (select auth.uid())
    and (select private.can_edit_creator_account(p_creator_account_id))
    and intent.original_filename = p_original_filename
    and intent.content_length = p_content_length
    and intent.uploaded_size = p_content_length
    and intent.media_type = p_media_type
    and intent.status = 'uploaded'::media.upload_intent_status
    and intent.uploaded_at > now() - interval '7 days'
    and not exists (
      select 1 from media.submission_items item
      where item.upload_intent_id = intent.id
    )
  order by intent.uploaded_at desc
  limit 1;
$function$;

revoke all on function public.find_reusable_uploaded_media_intent(uuid,text,bigint,media.media_type) from public, anon;
grant execute on function public.find_reusable_uploaded_media_intent(uuid,text,bigint,media.media_type) to authenticated;
