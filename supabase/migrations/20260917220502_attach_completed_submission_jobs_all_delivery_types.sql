create or replace function private.attach_completed_submission_jobs(p_submission_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  affected_count integer := 0;
begin
  -- Attach the newest completed delivery job of any type, so artwork
  -- (image_delivery) and lesson video (video_delivery) items get their asset
  -- linked exactly like audio tracks do.
  with completed_jobs as (
    select distinct on (item.id)
      item.id as item_id,
      job.id as processing_job_id,
      job.media_asset_id
    from media.submission_items item
    join media.media_processing_jobs job
      on job.upload_intent_id = item.upload_intent_id
     and job.job_type in (
       'audio_delivery'::media.processing_job_type,
       'video_delivery'::media.processing_job_type,
       'image_delivery'::media.processing_job_type
     )
     and job.status = 'completed'::media.processing_job_status
     and job.media_asset_id is not null
    where item.submission_id = p_submission_id
    order by item.id, job.finished_at desc nulls last, job.created_at desc
  )
  update media.submission_items item
  set media_asset_id = coalesce(item.media_asset_id, completed_jobs.media_asset_id),
      media_processing_job_id = completed_jobs.processing_job_id
  from completed_jobs
  where item.id = completed_jobs.item_id
    and (
      item.media_asset_id is distinct from coalesce(item.media_asset_id, completed_jobs.media_asset_id)
      or item.media_processing_job_id is distinct from completed_jobs.processing_job_id
    );

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$function$;
