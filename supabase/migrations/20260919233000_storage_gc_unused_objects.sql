-- Track physical R2 objects that are no longer referenced by CHC and
-- automatically remove each object after it has remained unused for three days.

create table if not exists media.storage_gc_candidates (
  bucket text not null,
  path text not null,
  first_unused_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  file_size_bytes bigint,
  last_modified_at timestamptz,
  reason text not null default 'unreferenced',
  primary key (bucket, path),
  constraint storage_gc_candidate_bucket_not_blank check (length(trim(bucket)) > 0),
  constraint storage_gc_candidate_path_not_blank check (length(trim(path)) > 0),
  constraint storage_gc_candidate_size_nonnegative check (file_size_bytes is null or file_size_bytes >= 0)
);

create index if not exists storage_gc_candidates_due_idx
  on media.storage_gc_candidates(first_unused_at);

revoke all on table media.storage_gc_candidates from public, anon, authenticated;
grant all on table media.storage_gc_candidates to service_role;

create or replace function private.storage_asset_is_referenced(p_asset_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select
    exists (select 1 from media.submission_items item where item.media_asset_id = p_asset_id)
    or exists (select 1 from music.tracks track where track.media_asset_id = p_asset_id)
    or exists (select 1 from music.releases release where release.cover_asset_id = p_asset_id)
    or exists (select 1 from music.artists artist where artist.profile_image_asset_id = p_asset_id)
    or exists (select 1 from music.playlists playlist where playlist.cover_asset_id = p_asset_id)
    or exists (select 1 from learning.album_recordings recording where recording.media_asset_id = p_asset_id)
    or exists (select 1 from learning.lessons lesson where lesson.media_asset_id = p_asset_id)
    or exists (select 1 from learning.albums album where album.cover_asset_id = p_asset_id)
    or exists (select 1 from learning.lesson_sets lesson_set where lesson_set.cover_asset_id = p_asset_id)
    or exists (select 1 from learning.cantors cantor where cantor.profile_image_asset_id = p_asset_id)
    or exists (select 1 from learning.playlists playlist where playlist.cover_asset_id = p_asset_id)
    or exists (
      select 1
      from media.media_processing_jobs job
      where job.status in (
        'queued'::media.processing_job_status,
        'processing'::media.processing_job_status,
        'failed'::media.processing_job_status
      )
        and (
          job.media_asset_id = p_asset_id
          or exists (
            select 1
            from media.media_asset_versions version
            where version.id = job.media_asset_version_id
              and version.media_asset_id = p_asset_id
          )
        )
    );
$function$;

create or replace function private.storage_upload_intent_is_referenced(p_upload_intent_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select
    exists (select 1 from media.submission_items item where item.upload_intent_id = p_upload_intent_id)
    or exists (
      select 1
      from media.media_processing_jobs job
      where job.upload_intent_id = p_upload_intent_id
        and job.status in (
          'queued'::media.processing_job_status,
          'processing'::media.processing_job_status,
          'failed'::media.processing_job_status
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
        and private.storage_asset_is_referenced(version.media_asset_id)
    );
$function$;

revoke all on function private.storage_asset_is_referenced(uuid) from public;
revoke all on function private.storage_upload_intent_is_referenced(uuid) from public;
revoke all on function private.storage_object_is_referenced(text, text) from public;

create or replace function public.sync_storage_gc_candidates(
  p_worker_token text,
  p_objects jsonb
)
returns table (
  scanned_count integer,
  candidate_count integer,
  due_count integer
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.verify_media_worker_token(p_worker_token) then
    raise exception 'Invalid media worker token' using errcode = '28000';
  end if;

  if p_objects is null or jsonb_typeof(p_objects) <> 'array' then
    raise exception 'p_objects must be a JSON array' using errcode = '22023';
  end if;

  -- If something became referenced again during its grace period, its unused
  -- clock is discarded. A future transition back to unused starts a fresh
  -- three-day window.
  delete from media.storage_gc_candidates candidate
  where private.storage_object_is_referenced(candidate.bucket, candidate.path);

  insert into media.storage_gc_candidates (
    bucket,
    path,
    first_unused_at,
    last_seen_at,
    file_size_bytes,
    last_modified_at,
    reason
  )
  select
    trim(object_row.value->>'bucket'),
    trim(object_row.value->>'path'),
    now(),
    now(),
    case
      when nullif(object_row.value->>'file_size_bytes', '') is null then null
      else greatest(0, (object_row.value->>'file_size_bytes')::bigint)
    end,
    case
      when nullif(object_row.value->>'last_modified_at', '') is null then null
      else (object_row.value->>'last_modified_at')::timestamptz
    end,
    'unreferenced'
  from jsonb_array_elements(p_objects) object_row(value)
  where trim(coalesce(object_row.value->>'bucket', '')) in (
      'chc-submissions',
      'chc-music',
      'chc-learning',
      'chc-images'
    )
    and length(trim(coalesce(object_row.value->>'path', ''))) > 0
    and not private.storage_object_is_referenced(
      trim(object_row.value->>'bucket'),
      trim(object_row.value->>'path')
    )
  on conflict (bucket, path) do update
  set last_seen_at = excluded.last_seen_at,
      file_size_bytes = excluded.file_size_bytes,
      last_modified_at = excluded.last_modified_at,
      reason = excluded.reason;

  -- A candidate that is no longer present in the storage scan has already
  -- disappeared from R2, so do not keep a stale GC row around.
  delete from media.storage_gc_candidates candidate
  where not exists (
    select 1
    from jsonb_array_elements(p_objects) object_row(value)
    where trim(coalesce(object_row.value->>'bucket', '')) = candidate.bucket
      and trim(coalesce(object_row.value->>'path', '')) = candidate.path
  );

  return query
  select
    jsonb_array_length(p_objects)::integer,
    (select count(*)::integer from media.storage_gc_candidates),
    (
      select count(*)::integer
      from media.storage_gc_candidates candidate
      where candidate.first_unused_at <= now() - interval '3 days'
    );
end;
$function$;

create or replace function public.get_storage_gc_candidates(
  p_worker_token text,
  p_due_only boolean default true,
  p_limit integer default 250
)
returns table (
  bucket text,
  path text,
  file_size_bytes bigint,
  first_unused_at timestamptz,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.verify_media_worker_token(p_worker_token) then
    raise exception 'Invalid media worker token' using errcode = '28000';
  end if;

  delete from media.storage_gc_candidates candidate
  where private.storage_object_is_referenced(candidate.bucket, candidate.path);

  return query
  select
    candidate.bucket,
    candidate.path,
    candidate.file_size_bytes,
    candidate.first_unused_at,
    candidate.last_seen_at
  from media.storage_gc_candidates candidate
  where not p_due_only
     or candidate.first_unused_at <= now() - interval '3 days'
  order by candidate.first_unused_at, candidate.bucket, candidate.path
  limit greatest(1, least(coalesce(p_limit, 250), 1000));
end;
$function$;

create or replace function public.complete_storage_gc_candidate(
  p_worker_token text,
  p_bucket text,
  p_path text
)
returns table (
  deleted boolean,
  database_rows_removed integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  removed integer := 0;
  affected integer := 0;
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

  delete from media.media_asset_versions version
  where version.bucket = p_bucket
    and version.path = p_path
    and not private.storage_asset_is_referenced(version.media_asset_id);
  get diagnostics affected = row_count;
  removed := removed + affected;

  delete from media.media_assets asset
  where asset.bucket = p_bucket
    and asset.path = p_path
    and not private.storage_asset_is_referenced(asset.id);
  get diagnostics affected = row_count;
  removed := removed + affected;

  delete from media.upload_intents upload
  where upload.bucket = p_bucket
    and upload.path = p_path
    and not private.storage_upload_intent_is_referenced(upload.id);
  get diagnostics affected = row_count;
  removed := removed + affected;

  delete from media.storage_gc_candidates candidate
  where candidate.bucket = p_bucket and candidate.path = p_path;

  return query select true, removed;
end;
$function$;

create or replace function public.authorize_admin_storage_gc()
returns table (authorized boolean)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  return query select true;
end;
$function$;

create or replace function public.get_admin_unused_storage_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'count', (select count(*) from media.storage_gc_candidates),
    'bytes', (select coalesce(sum(file_size_bytes), 0) from media.storage_gc_candidates),
    'dueCount', (
      select count(*)
      from media.storage_gc_candidates
      where first_unused_at <= now() - interval '3 days'
    ),
    'oldestUnusedAt', (select min(first_unused_at) from media.storage_gc_candidates)
  );
end;
$function$;

revoke all on function public.sync_storage_gc_candidates(text, jsonb) from public, anon, authenticated;
revoke all on function public.get_storage_gc_candidates(text, boolean, integer) from public, anon, authenticated;
revoke all on function public.complete_storage_gc_candidate(text, text, text) from public, anon, authenticated;
grant execute on function public.sync_storage_gc_candidates(text, jsonb) to anon, authenticated;
grant execute on function public.get_storage_gc_candidates(text, boolean, integer) to anon, authenticated;
grant execute on function public.complete_storage_gc_candidate(text, text, text) to anon, authenticated;

revoke all on function public.authorize_admin_storage_gc() from public, anon;
revoke all on function public.get_admin_unused_storage_summary() from public, anon;
grant execute on function public.authorize_admin_storage_gc() to authenticated;
grant execute on function public.get_admin_unused_storage_summary() to authenticated;
