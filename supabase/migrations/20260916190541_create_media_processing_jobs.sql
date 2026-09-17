do $$
begin
  create type media.processing_job_type as enum (
    'audio_delivery',
    'video_delivery',
    'metadata_probe'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type media.processing_job_status as enum (
    'queued',
    'processing',
    'completed',
    'failed',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

create table if not exists private.media_worker_tokens (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  token_hash text not null unique,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint media_worker_tokens_name_not_blank check (length(trim(name)) > 0),
  constraint media_worker_tokens_hash_format check (token_hash ~ '^[a-f0-9]{64}$')
);

insert into private.media_worker_tokens (name, token_hash)
values (
  'phase4-local-worker',
  '88ebfb770f93d3e4618c57bb9635cc771a6156ba4a908217260ee961ecbcc12d'
)
on conflict (name) do update
set token_hash = excluded.token_hash,
    revoked_at = null;

create table if not exists media.media_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  upload_intent_id uuid references media.upload_intents(id) on delete set null,
  media_asset_id uuid references media.media_assets(id) on delete set null,
  media_asset_version_id uuid references media.media_asset_versions(id) on delete set null,
  job_type media.processing_job_type not null default 'audio_delivery',
  status media.processing_job_status not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  worker_id text,
  input_bucket text not null,
  input_path text not null,
  output_bucket text not null,
  output_path text,
  output_mime_type text,
  output_size_bytes bigint,
  output_checksum_sha256 text,
  probe jsonb not null default '{}'::jsonb,
  error_message text,
  queued_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_processing_jobs_attempt_count_nonnegative check (attempt_count >= 0),
  constraint media_processing_jobs_max_attempts_positive check (max_attempts > 0),
  constraint media_processing_jobs_input_bucket_valid check (input_bucket in ('chc-submissions', 'chc-masters')),
  constraint media_processing_jobs_output_bucket_valid check (output_bucket in ('chc-masters', 'chc-music', 'chc-learning', 'chc-images')),
  constraint media_processing_jobs_input_path_not_blank check (length(trim(input_path)) > 0),
  constraint media_processing_jobs_output_path_not_blank check (output_path is null or length(trim(output_path)) > 0),
  constraint media_processing_jobs_output_size_nonnegative check (output_size_bytes is null or output_size_bytes >= 0),
  constraint media_processing_jobs_output_checksum_sha256_format check (
    output_checksum_sha256 is null or output_checksum_sha256 ~ '^[a-f0-9]{64}$'
  ),
  unique (upload_intent_id, job_type)
);

create index if not exists media_processing_jobs_claim_idx
  on media.media_processing_jobs(status, available_at, created_at)
  where status = 'queued';

create index if not exists media_processing_jobs_upload_intent_idx
  on media.media_processing_jobs(upload_intent_id)
  where upload_intent_id is not null;

create index if not exists media_processing_jobs_media_asset_idx
  on media.media_processing_jobs(media_asset_id)
  where media_asset_id is not null;

create unique index if not exists media_processing_jobs_output_ref_idx
  on media.media_processing_jobs(output_bucket, output_path)
  where output_path is not null;

create trigger media_processing_jobs_set_updated_at
before update on media.media_processing_jobs
for each row execute function private.set_updated_at();

alter table media.media_processing_jobs enable row level security;

grant select on table media.media_processing_jobs to authenticated;
grant all on table media.media_processing_jobs to service_role;
grant usage on schema media to anon, authenticated;

create policy "media_processing_jobs_select_creator"
on media.media_processing_jobs
for select
to authenticated
using (
  exists (
    select 1
    from media.upload_intents intent
    where intent.id = upload_intent_id
      and (
        intent.requested_by = (select auth.uid())
        or (select private.can_read_media_owner(intent.creator_account_id))
      )
  )
  or exists (
    select 1
    from media.media_assets asset
    where asset.id = media_asset_id
      and (select private.can_read_media_owner(asset.owner_creator_account_id))
  )
);

create or replace function private.verify_media_worker_token(worker_token text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from private.media_worker_tokens token
    where token.revoked_at is null
      and token.token_hash = encode(extensions.digest(coalesce(worker_token, ''), 'sha256'), 'hex')
  );
$$;

create or replace function private.media_processing_output_path(
  creator_account_id uuid,
  upload_intent_id uuid,
  job_type media.processing_job_type
)
returns text
language sql
set search_path = ''
immutable
as $$
  select case
    when job_type = 'audio_delivery'::media.processing_job_type then
      'processed/' || creator_account_id::text || '/' || upload_intent_id::text || '/v1/audio.m4a'
    when job_type = 'video_delivery'::media.processing_job_type then
      'processed/' || creator_account_id::text || '/' || upload_intent_id::text || '/v1/video.mp4'
    else
      'processed/' || creator_account_id::text || '/' || upload_intent_id::text || '/v1/metadata.json'
  end;
$$;

create or replace function public.enqueue_media_processing_job(
  p_upload_intent_id uuid,
  p_job_type media.processing_job_type default 'audio_delivery'::media.processing_job_type,
  p_output_bucket text default 'chc-music'
)
returns table (
  job_id uuid,
  status media.processing_job_status,
  input_bucket text,
  input_path text,
  output_bucket text,
  output_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  source_intent media.upload_intents%rowtype;
  generated_output_path text;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_job_type <> 'audio_delivery'::media.processing_job_type then
    raise exception 'Only audio delivery jobs are supported in Phase 4' using errcode = '22023';
  end if;

  if p_output_bucket <> 'chc-music' then
    raise exception 'Audio delivery output bucket must be chc-music' using errcode = '22023';
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

  if source_intent.content_type !~ '^audio/' then
    raise exception 'Only audio uploads can be enqueued for audio delivery' using errcode = '22023';
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
    p_output_bucket,
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
$$;

create or replace function public.claim_media_processing_job(
  p_worker_token text,
  p_worker_id text default null
)
returns table (
  job_id uuid,
  upload_intent_id uuid,
  job_type media.processing_job_type,
  attempt_count integer,
  input_bucket text,
  input_path text,
  output_bucket text,
  output_path text
)
language plpgsql
security definer
set search_path = ''
as $$
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
    job.input_bucket,
    job.input_path,
    job.output_bucket,
    job.output_path
  into
    job_id,
    upload_intent_id,
    job_type,
    attempt_count,
    input_bucket,
    input_path,
    output_bucket,
    output_path;

  return next;
end;
$$;

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
  on conflict (media_asset_id, version) do update
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

create or replace function public.fail_media_processing_job(
  p_worker_token text,
  p_job_id uuid,
  p_error_message text
)
returns table (
  job_id uuid,
  status media.processing_job_status,
  attempt_count integer,
  error_message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_record media.media_processing_jobs%rowtype;
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

  update media.media_processing_jobs job
  set status = case
        when job.attempt_count < job.max_attempts then 'queued'::media.processing_job_status
        else 'failed'::media.processing_job_status
      end,
      available_at = case
        when job.attempt_count < job.max_attempts then now() + interval '5 minutes'
        else job.available_at
      end,
      finished_at = case
        when job.attempt_count < job.max_attempts then null
        else now()
      end,
      error_message = left(coalesce(nullif(trim(p_error_message), ''), 'Unknown processing error'), 4000)
  where job.id = job_record.id
  returning job.id, job.status, job.attempt_count, job.error_message
  into job_id, status, attempt_count, error_message;

  return next;
end;
$$;

revoke all on table private.media_worker_tokens from public;
revoke all on function private.verify_media_worker_token(text) from public;
revoke all on function private.media_processing_output_path(uuid, uuid, media.processing_job_type) from public;
revoke all on function public.enqueue_media_processing_job(uuid, media.processing_job_type, text) from public;
revoke all on function public.claim_media_processing_job(text, text) from public;
revoke all on function public.complete_media_processing_job(text, uuid, text, bigint, text, jsonb) from public;
revoke all on function public.fail_media_processing_job(text, uuid, text) from public;

grant execute on function public.enqueue_media_processing_job(uuid, media.processing_job_type, text) to authenticated;
grant execute on function public.claim_media_processing_job(text, text) to anon, authenticated;
grant execute on function public.complete_media_processing_job(text, uuid, text, bigint, text, jsonb) to anon, authenticated;
grant execute on function public.fail_media_processing_job(text, uuid, text) to anon, authenticated;
