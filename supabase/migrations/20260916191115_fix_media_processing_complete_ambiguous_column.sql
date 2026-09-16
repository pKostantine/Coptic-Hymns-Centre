create or replace function public.complete_media_processing_job(
  p_worker_token text,
  p_job_id uuid,
  p_output_mime_type text,
  p_output_size_bytes bigint,
  p_output_checksum_sha256 text,
  p_probe jsonb default '{}'::jsonb
)
returns table (
  job_id uuid,
  status media.processing_job_status,
  media_asset_id uuid,
  media_asset_version_id uuid,
  output_bucket text,
  output_path text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  job_record media.media_processing_jobs%rowtype;
  source_intent media.upload_intents%rowtype;
  new_media_asset_id uuid;
  new_media_asset_version_id uuid;
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

  if job_record.status <> 'processing'::media.processing_job_status then
    raise exception 'Processing job is not claimed' using errcode = '22023';
  end if;

  if job_record.output_path is null then
    raise exception 'Processing job has no output path' using errcode = '22023';
  end if;

  if p_output_mime_type is null or lower(trim(p_output_mime_type)) not in ('audio/mp4', 'audio/x-m4a') then
    raise exception 'Invalid output MIME type' using errcode = '22023';
  end if;

  if p_output_size_bytes is null or p_output_size_bytes <= 0 then
    raise exception 'Invalid output size' using errcode = '22023';
  end if;

  if p_output_checksum_sha256 is null or lower(trim(p_output_checksum_sha256)) !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid output checksum' using errcode = '22023';
  end if;

  select *
  into source_intent
  from media.upload_intents intent
  where intent.id = job_record.upload_intent_id;

  if not found then
    raise exception 'Source upload intent not found' using errcode = 'P0002';
  end if;

  insert into media.media_assets (
    owner_creator_account_id,
    provider,
    bucket,
    path,
    media_type,
    mime_type,
    file_size_bytes,
    checksum,
    processing_status,
    publication_status,
    metadata,
    created_by,
    updated_by
  )
  values (
    source_intent.creator_account_id,
    'cloudflare_r2'::media.media_provider,
    job_record.output_bucket,
    job_record.output_path,
    'audio'::media.media_type,
    lower(trim(p_output_mime_type)),
    p_output_size_bytes,
    lower(trim(p_output_checksum_sha256)),
    'completed'::media.processing_status,
    'draft'::media.publication_status,
    jsonb_build_object(
      'sourceUploadIntentId', source_intent.id,
      'sourceBucket', job_record.input_bucket,
      'sourcePath', job_record.input_path,
      'probe', coalesce(p_probe, '{}'::jsonb)
    ),
    source_intent.requested_by,
    source_intent.requested_by
  )
  on conflict (provider, bucket, path) do update
  set mime_type = excluded.mime_type,
      file_size_bytes = excluded.file_size_bytes,
      checksum = excluded.checksum,
      processing_status = 'completed'::media.processing_status,
      metadata = excluded.metadata,
      updated_by = excluded.updated_by,
      updated_at = now()
  returning id into new_media_asset_id;

  insert into media.media_asset_versions (
    media_asset_id,
    version,
    provider,
    bucket,
    path,
    mime_type,
    file_size_bytes,
    checksum,
    processing_status,
    created_by
  )
  values (
    new_media_asset_id,
    1,
    'cloudflare_r2'::media.media_provider,
    job_record.output_bucket,
    job_record.output_path,
    lower(trim(p_output_mime_type)),
    p_output_size_bytes,
    lower(trim(p_output_checksum_sha256)),
    'completed'::media.processing_status,
    source_intent.requested_by
  )
  on conflict on constraint media_asset_versions_media_asset_id_version_key do update
  set mime_type = excluded.mime_type,
      file_size_bytes = excluded.file_size_bytes,
      checksum = excluded.checksum,
      processing_status = 'completed'::media.processing_status
  returning id into new_media_asset_version_id;

  update media.media_processing_jobs job
  set status = 'completed'::media.processing_job_status,
      media_asset_id = new_media_asset_id,
      media_asset_version_id = new_media_asset_version_id,
      output_mime_type = lower(trim(p_output_mime_type)),
      output_size_bytes = p_output_size_bytes,
      output_checksum_sha256 = lower(trim(p_output_checksum_sha256)),
      probe = coalesce(p_probe, '{}'::jsonb),
      finished_at = now(),
      error_message = null
  where job.id = job_record.id
  returning
    job.id,
    job.status,
    job.media_asset_id,
    job.media_asset_version_id,
    job.output_bucket,
    job.output_path
  into
    job_id,
    status,
    media_asset_id,
    media_asset_version_id,
    output_bucket,
    output_path;

  return next;
end;
$$;

revoke all on function public.complete_media_processing_job(text, uuid, text, bigint, text, jsonb) from public;
grant execute on function public.complete_media_processing_job(text, uuid, text, bigint, text, jsonb) to anon, authenticated;
