create or replace function public.get_admin_review_queue()
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

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', submission.id,
        'title', submission.title,
        'description', submission.description,
        'submissionType', submission.submission_type,
        'status', submission.status,
        'submittedAt', submission.submitted_at,
        'reviewDueAt', submission.review_due_at,
        'creatorAccountId', submission.creator_account_id,
        'creatorName', account.display_name,
        'submitterEmail', submitter.email,
        'itemCount', (
          select count(*) from media.submission_items item
          where item.submission_id = submission.id
        ),
        'audioCount', (
          select count(*)
          from media.submission_items item
          join media.upload_intents intent on intent.id = item.upload_intent_id
          where item.submission_id = submission.id
            and intent.media_type = 'audio'::media.media_type
        ),
        'artworkItemId', (
          select item.id
          from media.submission_items item
          where item.submission_id = submission.id
            and item.role = 'artwork'::media.submission_item_role
          order by item.sort_order, item.created_at
          limit 1
        )
      )
      order by submission.submitted_at asc nulls last, submission.created_at asc
    )
    from media.submissions submission
    join creator.creator_accounts account on account.id = submission.creator_account_id
    left join auth.users submitter on submitter.id = submission.created_by
    where submission.status = 'pending_review'::media.publication_status
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_admin_submission_detail(p_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  submission media.submissions%rowtype;
  creator_name text;
  submitter_email text;
  catalog jsonb := '{}'::jsonb;
  items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select *
  into submission
  from media.submissions s
  where s.id = p_submission_id;

  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;

  select account.display_name
  into creator_name
  from creator.creator_accounts account
  where account.id = submission.creator_account_id;

  select u.email
  into submitter_email
  from auth.users u
  where u.id = submission.created_by;

  if submission.submission_type = 'music_release'::media.submission_type then
    select jsonb_strip_nulls(jsonb_build_object(
      'kind', 'music_release',
      'id', release.id,
      'title', release.title,
      'subtitle', release.subtitle,
      'description', release.description,
      'releaseType', release.release_type,
      'releaseDate', release.release_date,
      'publicationStatus', release.publication_status,
      'artist', jsonb_build_object(
        'id', artist.id,
        'displayName', artist.display_name,
        'publicationStatus', artist.publication_status
      ),
      'localizations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'locale', localization.locale,
          'title', localization.title,
          'subtitle', localization.subtitle,
          'description', localization.description,
          'isPrimary', localization.is_primary,
          'publicationStatus', localization.publication_status
        ) order by localization.is_primary desc, localization.locale)
        from music.release_localizations localization
        where localization.release_id = release.id
      ), '[]'::jsonb),
      'metadata', release.metadata
    ))
    into catalog
    from music.releases release
    left join music.artists artist on artist.id = release.primary_artist_id
    where release.metadata ->> 'submissionId' = submission.id::text
    order by release.created_at desc
    limit 1;
  elsif submission.submission_type = 'learning_album'::media.submission_type then
    select jsonb_strip_nulls(jsonb_build_object(
      'kind', 'learning_album',
      'id', album.id,
      'title', album.title,
      'description', album.description,
      'publicationStatus', album.publication_status,
      'cantor', jsonb_build_object(
        'id', cantor.id,
        'displayName', cantor.display_name,
        'publicationStatus', cantor.publication_status
      ),
      'season', case when season.id is null then null else jsonb_build_object(
        'id', season.id,
        'title', season.title,
        'slug', season.slug
      ) end,
      'localizations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'locale', localization.locale,
          'title', localization.title,
          'description', localization.description
        ) order by localization.locale)
        from learning.album_localizations localization
        where localization.album_id = album.id
      ), '[]'::jsonb),
      'metadata', album.metadata
    ))
    into catalog
    from learning.albums album
    left join learning.cantors cantor on cantor.id = album.cantor_id
    left join learning.seasons season on season.id = album.season_id
    where album.submission_id = submission.id
    limit 1;
  elsif submission.submission_type = 'learning_lesson_set'::media.submission_type then
    select jsonb_strip_nulls(jsonb_build_object(
      'kind', 'learning_lesson_set',
      'id', lesson_set.id,
      'title', lesson_set.title,
      'description', lesson_set.description,
      'publicationStatus', lesson_set.publication_status,
      'cantor', jsonb_build_object(
        'id', cantor.id,
        'displayName', cantor.display_name,
        'publicationStatus', cantor.publication_status
      ),
      'season', case when season.id is null then null else jsonb_build_object(
        'id', season.id,
        'title', season.title,
        'slug', season.slug
      ) end,
      'hymn', case when hymn.id is null then null else jsonb_build_object(
        'id', hymn.id,
        'title', hymn.title,
        'subtitle', hymn.subtitle,
        'sourceHymnKey', hymn.source_hymn_key
      ) end,
      'localizations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'locale', localization.locale,
          'title', localization.title,
          'description', localization.description
        ) order by localization.locale)
        from learning.lesson_set_localizations localization
        where localization.lesson_set_id = lesson_set.id
      ), '[]'::jsonb),
      'metadata', lesson_set.metadata
    ))
    into catalog
    from learning.lesson_sets lesson_set
    left join learning.cantors cantor on cantor.id = lesson_set.cantor_id
    left join learning.seasons season on season.id = lesson_set.season_id
    left join learning.hymns hymn on hymn.id = lesson_set.hymn_id
    where lesson_set.submission_id = submission.id
    limit 1;
  end if;

  select coalesce(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'id', item.id,
      'title', item.title,
      'role', item.role,
      'sortOrder', item.sort_order,
      'required', item.required,
      'uploadIntentId', intent.id,
      'originalFilename', intent.original_filename,
      'mediaType', intent.media_type,
      'contentType', intent.content_type,
      'contentLength', intent.content_length,
      'uploadStatus', intent.status,
      'uploadedAt', intent.uploaded_at,
      'previewPath', case
        when intent.id is not null and intent.status = 'uploaded'::media.upload_intent_status
          then '/admin/submission-items/' || item.id::text || '/preview'
        else null
      end,
      'processingJob', case when job.id is null then null else jsonb_build_object(
        'id', job.id,
        'type', job.job_type,
        'status', job.status,
        'attemptCount', job.attempt_count,
        'maxAttempts', job.max_attempts,
        'errorMessage', job.error_message,
        'queuedAt', job.queued_at,
        'startedAt', job.started_at,
        'finishedAt', job.finished_at
      ) end,
      'mediaAsset', case when asset.id is null then null else jsonb_build_object(
        'id', asset.id,
        'bucket', asset.bucket,
        'path', asset.path,
        'mediaType', asset.media_type,
        'mimeType', asset.mime_type,
        'durationMs', asset.duration_ms,
        'fileSizeBytes', asset.file_size_bytes,
        'processingStatus', asset.processing_status,
        'publicationStatus', asset.publication_status
      ) end
    ))
    order by item.sort_order, item.created_at
  ), '[]'::jsonb)
  into items
  from media.submission_items item
  left join media.upload_intents intent on intent.id = item.upload_intent_id
  left join media.media_processing_jobs job on job.id = item.media_processing_job_id
  left join media.media_assets asset on asset.id = item.media_asset_id
  where item.submission_id = submission.id;

  return jsonb_strip_nulls(jsonb_build_object(
    'id', submission.id,
    'creatorAccountId', submission.creator_account_id,
    'creatorName', creator_name,
    'submitterEmail', submitter_email,
    'submissionType', submission.submission_type,
    'title', submission.title,
    'description', submission.description,
    'status', submission.status,
    'submittedAt', submission.submitted_at,
    'reviewDueAt', submission.review_due_at,
    'reviewerId', submission.reviewer_id,
    'reviewedAt', submission.reviewed_at,
    'reviewNotes', submission.review_notes,
    'approvedAt', submission.approved_at,
    'publishedAt', submission.published_at,
    'rejectedAt', submission.rejected_at,
    'createdAt', submission.created_at,
    'updatedAt', submission.updated_at,
    'catalog', coalesce(catalog, '{}'::jsonb),
    'items', items
  ));
end;
$$;

create or replace function public.get_admin_submission_preview_item(p_item_id uuid)
returns table(
  item_id uuid,
  submission_id uuid,
  bucket text,
  object_path text,
  content_type text,
  content_length bigint,
  original_filename text
)
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

  return query
  select
    item.id,
    item.submission_id,
    intent.bucket,
    intent.path,
    intent.content_type,
    intent.content_length,
    intent.original_filename
  from media.submission_items item
  join media.upload_intents intent on intent.id = item.upload_intent_id
  where item.id = p_item_id
    and intent.status = 'uploaded'::media.upload_intent_status;
end;
$$;

revoke all on function public.get_admin_review_queue() from public, anon;
revoke all on function public.get_admin_submission_detail(uuid) from public, anon;
revoke all on function public.get_admin_submission_preview_item(uuid) from public, anon;

grant execute on function public.get_admin_review_queue() to authenticated;
grant execute on function public.get_admin_submission_detail(uuid) to authenticated;
grant execute on function public.get_admin_submission_preview_item(uuid) to authenticated;
