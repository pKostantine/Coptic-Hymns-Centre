-- Adds the three things a reviewer needs and the detail did not carry: the
-- audit trail, the problems that will block approval or publication, and the
-- synchronized lyrics attached to whatever the submission produced.
--
-- Validation is computed here rather than in the client so the review screen
-- and any later automation agree on what "ready" means.
create or replace function public.get_admin_submission_detail(p_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  submission media.submissions%rowtype;
  creator_name text;
  submitter_email text;
  catalog jsonb := '{}'::jsonb;
  items jsonb := '[]'::jsonb;
  events jsonb := '[]'::jsonb;
  lyric_sets jsonb := '[]'::jsonb;
  issues jsonb := '[]'::jsonb;
  artwork jsonb;
  localization_count integer := 0;
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
      'coverAssetId', release.cover_asset_id,
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
      'coverAssetId', album.cover_asset_id,
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
      'coverAssetId', lesson_set.cover_asset_id,
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
        'availableAt', job.available_at,
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

  -- The artwork the reviewer should actually look at: the delivery cover once
  -- it exists, and the original upload until then.
  select jsonb_strip_nulls(jsonb_build_object(
    'itemId', item.id,
    'title', item.title,
    'originalFilename', intent.original_filename,
    'previewPath', case
      when intent.status = 'uploaded'::media.upload_intent_status
        then '/admin/submission-items/' || item.id::text || '/preview'
      else null
    end,
    'deliveryBucket', asset.bucket,
    'deliveryPath', asset.path,
    'processingStatus', coalesce(asset.processing_status::text, job.status::text)
  ))
  into artwork
  from media.submission_items item
  left join media.upload_intents intent on intent.id = item.upload_intent_id
  left join media.media_assets asset on asset.id = item.media_asset_id
  left join media.media_processing_jobs job on job.id = item.media_processing_job_id
  where item.submission_id = submission.id
    and item.role = 'artwork'::media.submission_item_role
  order by item.sort_order, item.created_at
  limit 1;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', event.id,
    'action', event.action,
    'fromStatus', event.from_status,
    'toStatus', event.to_status,
    'notes', event.notes,
    'metadata', nullif(event.metadata, '{}'::jsonb),
    'actorId', event.actor_id,
    'actorEmail', actor.email,
    'createdAt', event.created_at
  )) order by event.created_at desc, event.id desc), '[]'::jsonb)
  into events
  from media.submission_events event
  left join auth.users actor on actor.id = event.actor_id
  where event.submission_id = submission.id;

  -- Lyrics reach a submission through the tracks its delivered audio produced,
  -- so this stays empty until publication creates them.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', lyric_set.id,
    'trackId', track.id,
    'trackTitle', track.title,
    'locale', lyric_set.locale,
    'kind', lyric_set.kind,
    'syncPrecision', lyric_set.sync_precision,
    'title', lyric_set.title,
    'publicationStatus', lyric_set.publication_status,
    'lineCount', (
      select count(*) from music.lyric_lines line where line.lyric_set_id = lyric_set.id
    ),
    'firstLines', coalesce((
      select jsonb_agg(preview.text order by preview.sequence)
      from (
        select line.sequence, line.text
        from music.lyric_lines line
        where line.lyric_set_id = lyric_set.id
        order by line.sequence
        limit 4
      ) preview
    ), '[]'::jsonb)
  ) order by track.title, lyric_set.locale, lyric_set.kind), '[]'::jsonb)
  into lyric_sets
  from media.submission_items item
  join music.tracks track on track.media_asset_id = item.media_asset_id
  join music.lyric_sets lyric_set on lyric_set.track_id = track.id
  where item.submission_id = submission.id
    and item.media_asset_id is not null;

  select count(*)
  into localization_count
  from jsonb_array_elements(coalesce(catalog -> 'localizations', '[]'::jsonb));

  -- Blocking issues stop a decision; warnings are worth a reviewer's attention
  -- but do not prevent one.
  select coalesce(jsonb_agg(issue order by ordinality), '[]'::jsonb)
  into issues
  from (
    select issue, ordinality
    from (
      select jsonb_build_object(
        'severity', 'blocking',
        'code', 'no_items',
        'message', 'This submission has no files attached.'
      ) as issue
      where not exists (
        select 1 from media.submission_items item where item.submission_id = submission.id
      )

      union all
      select jsonb_build_object(
        'severity', 'blocking',
        'code', 'upload_incomplete',
        'message', count(*) || ' required ' ||
          case when count(*) = 1 then 'file has' else 'files have' end ||
          ' not finished uploading.'
      )
      from media.submission_items item
      left join media.upload_intents intent on intent.id = item.upload_intent_id
      where item.submission_id = submission.id
        and item.required
        and (intent.id is null or intent.status <> 'uploaded'::media.upload_intent_status)
      having count(*) > 0

      union all
      select jsonb_build_object(
        'severity', 'blocking',
        'code', 'processing_failed',
        'message', count(*) || ' ' ||
          case when count(*) = 1 then 'file' else 'files' end ||
          ' failed processing and will not be retried.'
      )
      from media.submission_items item
      join media.media_processing_jobs job on job.id = item.media_processing_job_id
      where item.submission_id = submission.id
        and job.status = 'failed'::media.processing_job_status
      having count(*) > 0

      union all
      select jsonb_build_object(
        'severity', 'blocking',
        'code', 'processing_incomplete',
        'message', count(*) || ' required ' ||
          case when count(*) = 1 then 'file is' else 'files are' end ||
          ' still waiting on processing.'
      )
      from media.submission_items item
      left join media.media_assets asset
        on asset.id = item.media_asset_id
       and asset.processing_status = 'completed'::media.processing_status
      left join media.upload_intents intent on intent.id = item.upload_intent_id
      where item.submission_id = submission.id
        and item.required
        and asset.id is null
        and intent.media_type in (
          'audio'::media.media_type,
          'image'::media.media_type,
          'video'::media.media_type
        )
        and submission.status in (
          'approved'::media.publication_status,
          'processing'::media.publication_status
        )
      having count(*) > 0

      union all
      select jsonb_build_object(
        'severity', 'warning',
        'code', 'no_artwork',
        'message', 'No artwork was submitted, so this will publish without a cover.'
      )
      where not exists (
        select 1 from media.submission_items item
        where item.submission_id = submission.id
          and item.role = 'artwork'::media.submission_item_role
      )

      union all
      select jsonb_build_object(
        'severity', 'warning',
        'code', 'no_catalog_record',
        'message', 'No catalog record is linked to this submission.'
      )
      where catalog = '{}'::jsonb or catalog is null

      union all
      select jsonb_build_object(
        'severity', 'warning',
        'code', 'no_localizations',
        'message', 'No localized titles were provided.'
      )
      where localization_count = 0
        and catalog <> '{}'::jsonb
        and catalog is not null
    ) computed, lateral (select 1) as _(dummy)
  ) ordered(issue, ordinality);

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
    'dueState', case
      when submission.status <> 'pending_review'::media.publication_status then null
      when submission.review_due_at is null then null
      when submission.review_due_at < now() then 'overdue'
      when submission.review_due_at < now() + interval '12 hours' then 'due_soon'
      else 'on_track'
    end,
    'reviewerId', submission.reviewer_id,
    'reviewedAt', submission.reviewed_at,
    'reviewNotes', submission.review_notes,
    'approvedAt', submission.approved_at,
    'publishedAt', submission.published_at,
    'rejectedAt', submission.rejected_at,
    'createdAt', submission.created_at,
    'updatedAt', submission.updated_at,
    'catalog', coalesce(catalog, '{}'::jsonb),
    'artwork', artwork,
    'items', items,
    'lyricSets', lyric_sets,
    'events', events,
    'validationIssues', issues
  ));
end;
$function$;
