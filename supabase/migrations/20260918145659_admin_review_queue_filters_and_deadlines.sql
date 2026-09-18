-- The queue only ever returned pending_review, so an admin could approve a
-- submission and then lose sight of it: everything waiting on processing, or
-- approved and ready to publish, was invisible.
--
-- It now takes a status filter, reports the count of every status so the
-- filters can show what is behind them, and derives the review deadline state
-- rather than leaving each client to reimplement it.
drop function if exists public.get_admin_review_queue();

create function public.get_admin_review_queue(p_statuses text[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  wanted media.publication_status[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  -- No filter means everything an admin still has work to do on. Published,
  -- rejected and archived submissions are asked for by name.
  if p_statuses is null or cardinality(p_statuses) = 0 then
    wanted := array[
      'pending_review'::media.publication_status,
      'changes_requested'::media.publication_status,
      'approved'::media.publication_status,
      'processing'::media.publication_status
    ];
  else
    begin
      select array_agg(status::media.publication_status)
      into wanted
      from unnest(p_statuses) as status;
    exception when others then
      raise exception 'Unknown submission status in filter' using errcode = '22023';
    end;
  end if;

  return jsonb_build_object(
    'counts', coalesce((
      select jsonb_object_agg(grouped.status, grouped.total)
      from (
        select submission.status::text as status, count(*) as total
        from media.submissions submission
        group by submission.status
      ) grouped
    ), '{}'::jsonb),
    'submissions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', submission.id,
          'title', submission.title,
          'description', submission.description,
          'submissionType', submission.submission_type,
          'status', submission.status,
          'submittedAt', submission.submitted_at,
          'reviewDueAt', submission.review_due_at,
          'reviewedAt', submission.reviewed_at,
          'publishedAt', submission.published_at,
          'updatedAt', submission.updated_at,
          'creatorAccountId', submission.creator_account_id,
          'creatorName', account.display_name,
          'submitterEmail', submitter.email,
          -- Only a submission still awaiting a decision can be late.
          'dueState', case
            when submission.status <> 'pending_review'::media.publication_status then null
            when submission.review_due_at is null then null
            when submission.review_due_at < now() then 'overdue'
            when submission.review_due_at < now() + interval '12 hours' then 'due_soon'
            else 'on_track'
          end,
          'itemCount', counts.item_count,
          'audioCount', counts.audio_count,
          'imageCount', counts.image_count,
          'videoCount', counts.video_count,
          'readyCount', counts.ready_count,
          'failedCount', counts.failed_count,
          'artworkItemId', (
            select item.id
            from media.submission_items item
            where item.submission_id = submission.id
              and item.role = 'artwork'::media.submission_item_role
            order by item.sort_order, item.created_at
            limit 1
          )
        )
        order by
          -- Overdue work first, then the oldest submission waiting.
          case when submission.status = 'pending_review'::media.publication_status then 0 else 1 end,
          submission.review_due_at asc nulls last,
          submission.submitted_at asc nulls last,
          submission.created_at asc
      )
      from media.submissions submission
      join creator.creator_accounts account on account.id = submission.creator_account_id
      left join auth.users submitter on submitter.id = submission.created_by
      cross join lateral (
        select
          count(*) as item_count,
          count(*) filter (where intent.media_type = 'audio'::media.media_type) as audio_count,
          count(*) filter (where intent.media_type = 'image'::media.media_type) as image_count,
          count(*) filter (where intent.media_type = 'video'::media.media_type) as video_count,
          count(*) filter (where asset.processing_status = 'completed'::media.processing_status) as ready_count,
          count(*) filter (where job.status = 'failed'::media.processing_job_status) as failed_count
        from media.submission_items item
        left join media.upload_intents intent on intent.id = item.upload_intent_id
        left join media.media_assets asset on asset.id = item.media_asset_id
        left join media.media_processing_jobs job on job.id = item.media_processing_job_id
        where item.submission_id = submission.id
      ) counts
      where submission.status = any (wanted)
    ), '[]'::jsonb)
  );
end;
$function$;

grant execute on function public.get_admin_review_queue(text[]) to authenticated;
