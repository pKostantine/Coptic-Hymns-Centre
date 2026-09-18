-- The validation block ordered by `ordinality`, which only exists for a
-- set-returning function in FROM, so every call to the detail RPC failed.
-- Each branch now carries its own sort key.
do $$
declare
  definition text;
  patched text;
  new_block text := $block$select coalesce(jsonb_agg(computed.issue order by computed.sort), '[]'::jsonb)
  into issues
  from (
    select 1 as sort, jsonb_build_object(
      'severity', 'blocking',
      'code', 'no_items',
      'message', 'This submission has no files attached.'
    ) as issue
    where not exists (
      select 1 from media.submission_items item where item.submission_id = submission.id
    )

    union all
    select 2, jsonb_build_object(
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
    select 3, jsonb_build_object(
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
    select 4, jsonb_build_object(
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
    select 5, jsonb_build_object(
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
    select 6, jsonb_build_object(
      'severity', 'warning',
      'code', 'no_catalog_record',
      'message', 'No catalog record is linked to this submission.'
    )
    where catalog = '{}'::jsonb or catalog is null

    union all
    select 7, jsonb_build_object(
      'severity', 'warning',
      'code', 'no_localizations',
      'message', 'No localized titles were provided.'
    )
    where localization_count = 0
      and catalog <> '{}'::jsonb
      and catalog is not null
  ) computed;$block$;
begin
  select pg_get_functiondef(p.oid)
  into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_admin_submission_detail';

  patched := regexp_replace(
    definition,
    'select coalesce\(jsonb_agg\(issue order by ordinality\).*?\) ordered\(issue, ordinality\);',
    new_block,
    'g'
  );

  if patched = definition then
    raise exception 'Validation block was not found in get_admin_submission_detail';
  end if;

  execute patched;
end $$;
