-- Admin-only permanent media-file deletion from the CHC Admin Processing tab.
-- The Cloudflare upload-authorizer deletes the R2 objects first, then calls the
-- finalize RPC so database references cannot survive after the bytes are gone.

create or replace function public.prepare_admin_processing_file_deletion(p_job_id uuid)
returns table (
  job_id uuid,
  upload_intent_id uuid,
  media_asset_id uuid,
  related_job_count integer,
  objects jsonb
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  root_job media.media_processing_jobs%rowtype;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select *
  into root_job
  from media.media_processing_jobs job
  where job.id = p_job_id
  for update;

  if not found then
    raise exception 'Processing job not found' using errcode = 'P0002';
  end if;

  -- Cancel every job that belongs to the same underlying upload/asset before
  -- object deletion. A worker trying to complete afterwards will be rejected
  -- because complete_media_processing_job requires status = processing.
  update media.media_processing_jobs job
  set status = 'cancelled'::media.processing_job_status,
      worker_id = null,
      finished_at = coalesce(job.finished_at, now()),
      error_message = 'Permanently deleted by CHC Admin',
      updated_at = now()
  where job.id = root_job.id
     or (root_job.upload_intent_id is not null and job.upload_intent_id = root_job.upload_intent_id)
     or (root_job.media_asset_id is not null and job.media_asset_id = root_job.media_asset_id);

  return query
  with related_jobs as (
    select job.*
    from media.media_processing_jobs job
    where job.id = root_job.id
       or (root_job.upload_intent_id is not null and job.upload_intent_id = root_job.upload_intent_id)
       or (root_job.media_asset_id is not null and job.media_asset_id = root_job.media_asset_id)
  ),
  object_rows as (
    select related.input_bucket as bucket, related.input_path as path
    from related_jobs related
    where related.input_bucket is not null and related.input_path is not null

    union
    select related.output_bucket, related.output_path
    from related_jobs related
    where related.output_bucket is not null and related.output_path is not null

    union
    select upload.bucket, upload.path
    from media.upload_intents upload
    where upload.id = root_job.upload_intent_id

    union
    select asset.bucket, asset.path
    from media.media_assets asset
    where asset.id = root_job.media_asset_id

    union
    select version.bucket, version.path
    from media.media_asset_versions version
    where version.media_asset_id = root_job.media_asset_id
  )
  select
    root_job.id,
    root_job.upload_intent_id,
    root_job.media_asset_id,
    (select count(*)::integer from related_jobs),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('bucket', object_rows.bucket, 'path', object_rows.path)
          order by object_rows.bucket, object_rows.path
        )
        from object_rows
      ),
      '[]'::jsonb
    );
end;
$function$;

create or replace function public.finalize_admin_processing_file_deletion(p_job_id uuid)
returns table (
  job_id uuid,
  deleted boolean,
  deleted_job_count integer,
  deleted_submission_item_count integer,
  deleted_media_asset_id uuid,
  deleted_upload_intent_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  root_job media.media_processing_jobs%rowtype;
  affected_jobs integer := 0;
  affected_items integer := 0;
  asset_id uuid;
  upload_id uuid;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select *
  into root_job
  from media.media_processing_jobs job
  where job.id = p_job_id
  for update;

  if not found then
    return query select p_job_id, false, 0, 0, null::uuid, null::uuid;
    return;
  end if;

  asset_id := root_job.media_asset_id;
  upload_id := root_job.upload_intent_id;

  -- Non-nullable Learn media relations represent the file itself; removing the
  -- bytes therefore removes those recording/lesson rows too.
  if asset_id is not null then
    delete from learning.album_recordings recording where recording.media_asset_id = asset_id;
    delete from learning.lessons lesson where lesson.media_asset_id = asset_id;

    update music.tracks track set media_asset_id = null, updated_at = now()
    where track.media_asset_id = asset_id;

    update music.releases release set cover_asset_id = null, updated_at = now()
    where release.cover_asset_id = asset_id;
    update music.artists artist set profile_image_asset_id = null, updated_at = now()
    where artist.profile_image_asset_id = asset_id;
    update music.playlists playlist set cover_asset_id = null, updated_at = now()
    where playlist.cover_asset_id = asset_id;

    update learning.albums album set cover_asset_id = null, updated_at = now()
    where album.cover_asset_id = asset_id;
    update learning.lesson_sets lesson_set set cover_asset_id = null, updated_at = now()
    where lesson_set.cover_asset_id = asset_id;
    update learning.cantors cantor set profile_image_asset_id = null, updated_at = now()
    where cantor.profile_image_asset_id = asset_id;
    update learning.playlists playlist set cover_asset_id = null, updated_at = now()
    where playlist.cover_asset_id = asset_id;
  end if;

  delete from media.submission_items item
  where item.media_processing_job_id = root_job.id
     or (upload_id is not null and item.upload_intent_id = upload_id)
     or (asset_id is not null and item.media_asset_id = asset_id);
  get diagnostics affected_items = row_count;

  delete from media.media_processing_jobs job
  where job.id = root_job.id
     or (upload_id is not null and job.upload_intent_id = upload_id)
     or (asset_id is not null and job.media_asset_id = asset_id);
  get diagnostics affected_jobs = row_count;

  if asset_id is not null then
    delete from media.media_assets asset where asset.id = asset_id;
  end if;

  if upload_id is not null then
    delete from media.upload_intents upload where upload.id = upload_id;
  end if;

  return query
  select p_job_id, true, affected_jobs, affected_items, asset_id, upload_id;
end;
$function$;

revoke all on function public.prepare_admin_processing_file_deletion(uuid) from public, anon;
revoke all on function public.finalize_admin_processing_file_deletion(uuid) from public, anon;
grant execute on function public.prepare_admin_processing_file_deletion(uuid) to authenticated;
grant execute on function public.finalize_admin_processing_file_deletion(uuid) to authenticated;

-- Purge the database/catalog side of the old Phase 2-6 smoke-test fixtures.
-- The exact R2 object keys are intentionally retained in Git history so the
-- object-store cleanup can be audited separately from application data.
do $cleanup$
declare
  phase6_release uuid := '436a9f01-f74a-4279-be13-37fc6545db48';
  phase6_track uuid := '003b6ff2-b639-4050-ac72-f19c33dba82f';
  phase6_artist uuid := '425654dd-e56c-4845-ab6c-d7ea89766e05';
  phase5_submission uuid := '961b382b-5ce4-41a7-b3cb-438ad7dc9ebd';
  phase5_upload uuid := '5339f85a-7efc-40a2-96fb-e9f458146394';
  phase3_upload uuid := 'b414ff43-67ae-49d1-8b75-21e714f83a64';
  phase4_upload uuid := '85712f4f-0873-4cd8-b80f-bf5aad1a85c8';
  phase2_asset uuid := '1dde0683-faae-4312-9700-910d543a3216';
  asset_ids uuid[];
begin
  select coalesce(array_agg(distinct id), '{}'::uuid[])
  into asset_ids
  from media.media_assets
  where id = phase2_asset
     or metadata ->> 'sourceUploadIntentId' in (phase3_upload::text, phase4_upload::text, phase5_upload::text)
     or id = (select track.media_asset_id from music.tracks track where track.id = phase6_track);

  delete from music.releases release where release.id = phase6_release;
  delete from music.tracks track where track.id = phase6_track;
  update creator.creator_accounts account set identity_artist_id = null, updated_at = now()
  where account.identity_artist_id = phase6_artist;
  delete from music.artists artist where artist.id = phase6_artist;

  delete from media.submission_events event where event.submission_id = phase5_submission;
  delete from media.submission_items item
  where item.submission_id = phase5_submission
     or item.upload_intent_id in (phase3_upload, phase4_upload, phase5_upload)
     or item.media_asset_id = any(asset_ids);
  delete from media.submissions submission where submission.id = phase5_submission;

  delete from media.media_processing_jobs job
  where job.upload_intent_id in (phase3_upload, phase4_upload, phase5_upload)
     or job.media_asset_id = any(asset_ids);

  delete from media.media_assets asset where asset.id = any(asset_ids);
  delete from media.upload_intents upload where upload.id in (phase3_upload, phase4_upload, phase5_upload);
end;
$cleanup$;
