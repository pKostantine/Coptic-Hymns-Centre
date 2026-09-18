create or replace function public.get_admin_processing_jobs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'queued', (select count(*) from media.media_processing_jobs where status = 'queued'::media.processing_job_status),
      'processing', (select count(*) from media.media_processing_jobs where status = 'processing'::media.processing_job_status),
      'completed', (select count(*) from media.media_processing_jobs where status = 'completed'::media.processing_job_status),
      'failed', (select count(*) from media.media_processing_jobs where status = 'failed'::media.processing_job_status),
      'cancelled', (select count(*) from media.media_processing_jobs where status = 'cancelled'::media.processing_job_status)
    ),
    'jobs', coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'id', job.id,
          'jobType', job.job_type,
          'status', job.status,
          'attemptCount', job.attempt_count,
          'maxAttempts', job.max_attempts,
          'workerId', job.worker_id,
          'inputBucket', job.input_bucket,
          'inputPath', job.input_path,
          'outputBucket', job.output_bucket,
          'outputPath', job.output_path,
          'outputMimeType', job.output_mime_type,
          'outputSizeBytes', job.output_size_bytes,
          'errorMessage', job.error_message,
          'queuedAt', job.queued_at,
          'availableAt', job.available_at,
          'claimedAt', job.claimed_at,
          'startedAt', job.started_at,
          'finishedAt', job.finished_at,
          'createdAt', job.created_at,
          'updatedAt', job.updated_at,
          'item', case when item.id is null then null else jsonb_build_object(
            'id', item.id,
            'title', item.title,
            'role', item.role,
            'sortOrder', item.sort_order,
            'required', item.required
          ) end,
          'upload', case when upload.id is null then null else jsonb_build_object(
            'id', upload.id,
            'originalFilename', upload.original_filename,
            'mediaType', upload.media_type,
            'contentType', upload.content_type,
            'contentLength', upload.content_length
          ) end,
          'submission', case when submission.id is null then null else jsonb_build_object(
            'id', submission.id,
            'title', submission.title,
            'submissionType', submission.submission_type,
            'status', submission.status,
            'creatorName', account.display_name,
            'artworkItemId', (
              select artwork.id
              from media.submission_items artwork
              where artwork.submission_id = submission.id
                and artwork.role = 'artwork'::media.submission_item_role
              order by artwork.sort_order, artwork.created_at
              limit 1
            )
          ) end
        ))
        order by
          case job.status
            when 'processing'::media.processing_job_status then 0
            when 'queued'::media.processing_job_status then 1
            when 'failed'::media.processing_job_status then 2
            when 'completed'::media.processing_job_status then 3
            else 4
          end,
          job.queued_at desc
      )
      from media.media_processing_jobs job
      left join media.submission_items item on item.media_processing_job_id = job.id
      left join media.upload_intents upload on upload.id = job.upload_intent_id
      left join media.submissions submission on submission.id = item.submission_id
      left join creator.creator_accounts account on account.id = submission.creator_account_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_admin_processing_jobs() from public, anon;
grant execute on function public.get_admin_processing_jobs() to authenticated;
