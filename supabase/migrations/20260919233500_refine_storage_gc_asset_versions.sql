-- Treat only the current version of a referenced asset as "used".
-- Older processed versions (for example artwork replaced by a newer image)
-- are eligible for the same three-day storage grace period.

create or replace function private.storage_asset_version_is_referenced(p_version_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select exists (
    select 1
    from media.media_asset_versions version
    join media.media_assets asset on asset.id = version.media_asset_id
    where version.id = p_version_id
      and (
        (
          version.version = asset.version
          and private.storage_asset_is_referenced(asset.id)
        )
        or exists (
          select 1
          from media.media_processing_jobs job
          where job.media_asset_version_id = version.id
            and job.status in (
              'queued'::media.processing_job_status,
              'processing'::media.processing_job_status,
              'failed'::media.processing_job_status
            )
        )
      )
  );
$function$;

create or replace function private.storage_object_is_referenced(p_bucket text, p_path text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select
    exists (
      select 1
      from media.media_processing_jobs job
      where job.status in (
        'queued'::media.processing_job_status,
        'processing'::media.processing_job_status,
        'failed'::media.processing_job_status
      )
        and (
          (job.input_bucket = p_bucket and job.input_path = p_path)
          or (job.output_bucket = p_bucket and job.output_path = p_path)
        )
    )
    or exists (
      select 1
      from media.upload_intents upload
      where upload.bucket = p_bucket
        and upload.path = p_path
        and private.storage_upload_intent_is_referenced(upload.id)
    )
    or exists (
      select 1
      from media.media_assets asset
      where asset.bucket = p_bucket
        and asset.path = p_path
        and private.storage_asset_is_referenced(asset.id)
    )
    or exists (
      select 1
      from media.media_asset_versions version
      where version.bucket = p_bucket
        and version.path = p_path
        and private.storage_asset_version_is_referenced(version.id)
    );
$function$;

revoke all on function private.storage_asset_version_is_referenced(uuid) from public;
revoke all on function private.storage_object_is_referenced(text, text) from public;

create or replace function public.prepare_storage_gc_candidate(
  p_worker_token text,
  p_bucket text,
  p_path text
)
returns table (
  authorized boolean,
  database_rows_removed integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  removed integer := 0;
  affected integer := 0;
  asset_ids uuid[];
  version_ids uuid[];
  upload_ids uuid[];
begin
  if not private.verify_media_worker_token(p_worker_token) then
    raise exception 'Invalid media worker token' using errcode = '28000';
  end if;

  if private.storage_object_is_referenced(p_bucket, p_path) then
    delete from media.storage_gc_candidates candidate
    where candidate.bucket = p_bucket and candidate.path = p_path;
    return query select false, 0;
    return;
  end if;

  select coalesce(array_agg(distinct asset.id), '{}'::uuid[])
  into asset_ids
  from media.media_assets asset
  where asset.bucket = p_bucket
    and asset.path = p_path
    and not private.storage_asset_is_referenced(asset.id);

  select coalesce(array_agg(distinct version.id), '{}'::uuid[])
  into version_ids
  from media.media_asset_versions version
  where version.bucket = p_bucket
    and version.path = p_path
    and not private.storage_asset_version_is_referenced(version.id);

  select coalesce(array_agg(distinct upload.id), '{}'::uuid[])
  into upload_ids
  from media.upload_intents upload
  where upload.bucket = p_bucket
    and upload.path = p_path
    and not private.storage_upload_intent_is_referenced(upload.id);

  delete from media.media_processing_jobs job
  where job.status in (
      'completed'::media.processing_job_status,
      'cancelled'::media.processing_job_status
    )
    and (
      job.media_asset_id = any(asset_ids)
      or job.upload_intent_id = any(upload_ids)
      or job.media_asset_version_id = any(version_ids)
      or (job.input_bucket = p_bucket and job.input_path = p_path)
      or (job.output_bucket = p_bucket and job.output_path = p_path)
    );
  get diagnostics affected = row_count;
  removed := removed + affected;

  update music.play_history history
  set media_asset_id = null
  where history.media_asset_id = any(asset_ids);
  get diagnostics affected = row_count;
  removed := removed + affected;

  delete from media.media_asset_versions version
  where version.id = any(version_ids)
     or version.media_asset_id = any(asset_ids);
  get diagnostics affected = row_count;
  removed := removed + affected;

  delete from media.media_assets asset
  where asset.id = any(asset_ids);
  get diagnostics affected = row_count;
  removed := removed + affected;

  delete from media.upload_intents upload
  where upload.id = any(upload_ids);
  get diagnostics affected = row_count;
  removed := removed + affected;

  return query select true, removed;
end;
$function$;

revoke all on function public.prepare_storage_gc_candidate(text, text, text) from public, anon, authenticated;
grant execute on function public.prepare_storage_gc_candidate(text, text, text) to anon, authenticated;
