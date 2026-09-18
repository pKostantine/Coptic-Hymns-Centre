create or replace function public.get_admin_publication_overview()
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
    'ready', coalesce((
      select jsonb_agg(entry order by sort_at desc)
      from (
        select
          coalesce(submission.approved_at, submission.updated_at, submission.created_at) as sort_at,
          jsonb_strip_nulls(jsonb_build_object(
            'id', submission.id,
            'title', submission.title,
            'description', submission.description,
            'submissionType', submission.submission_type,
            'status', submission.status,
            'creatorName', account.display_name,
            'approvedAt', submission.approved_at,
            'publishedAt', submission.published_at,
            'itemsReady', private.submission_required_items_ready(submission.id),
            'itemCount', (select count(*) from media.submission_items item where item.submission_id = submission.id),
            'assetCount', (select count(*) from media.submission_items item where item.submission_id = submission.id and item.media_asset_id is not null),
            'artworkItemId', (
              select item.id from media.submission_items item
              where item.submission_id = submission.id and item.role = 'artwork'::media.submission_item_role
              order by item.sort_order, item.created_at limit 1
            ),
            'catalog', case
              when submission.submission_type = 'music_release'::media.submission_type then (
                select jsonb_strip_nulls(jsonb_build_object(
                  'kind', 'music_release',
                  'id', release.id,
                  'title', release.title,
                  'publicationStatus', release.publication_status,
                  'itemCount', (select count(*) from music.release_tracks rt where rt.release_id = release.id),
                  'itemsWithMedia', (
                    select count(*) from music.release_tracks rt
                    join music.tracks track on track.id = rt.track_id
                    where rt.release_id = release.id and track.media_asset_id is not null
                  ),
                  'coverAssetId', release.cover_asset_id
                ))
                from music.releases release
                where release.metadata ->> 'submissionId' = submission.id::text
                order by release.created_at desc limit 1
              )
              when submission.submission_type = 'learning_album'::media.submission_type then (
                select jsonb_strip_nulls(jsonb_build_object(
                  'kind', 'learning_album',
                  'id', album.id,
                  'title', album.title,
                  'publicationStatus', album.publication_status,
                  'itemCount', (select count(*) from learning.album_recordings recording where recording.album_id = album.id),
                  'itemsWithMedia', (
                    select count(*) from learning.album_recordings recording
                    where recording.album_id = album.id and recording.media_asset_id is not null
                  ),
                  'coverAssetId', album.cover_asset_id
                ))
                from learning.albums album
                where album.submission_id = submission.id limit 1
              )
              when submission.submission_type = 'learning_lesson_set'::media.submission_type then (
                select jsonb_strip_nulls(jsonb_build_object(
                  'kind', 'learning_lesson_set',
                  'id', lesson_set.id,
                  'title', lesson_set.title,
                  'publicationStatus', lesson_set.publication_status,
                  'itemCount', (select count(*) from learning.lessons lesson where lesson.lesson_set_id = lesson_set.id),
                  'itemsWithMedia', (
                    select count(*) from learning.lessons lesson
                    where lesson.lesson_set_id = lesson_set.id and lesson.media_asset_id is not null
                  ),
                  'coverAssetId', lesson_set.cover_asset_id
                ))
                from learning.lesson_sets lesson_set
                where lesson_set.submission_id = submission.id limit 1
              )
              else null
            end
          )) as entry
        from media.submissions submission
        join creator.creator_accounts account on account.id = submission.creator_account_id
        where submission.status in ('approved'::media.publication_status, 'processing'::media.publication_status)
          and private.submission_required_items_ready(submission.id)
      ) ready_entries
    ), '[]'::jsonb),
    'waiting', coalesce((
      select jsonb_agg(entry order by sort_at desc)
      from (
        select
          coalesce(submission.approved_at, submission.updated_at, submission.created_at) as sort_at,
          jsonb_strip_nulls(jsonb_build_object(
            'id', submission.id,
            'title', submission.title,
            'description', submission.description,
            'submissionType', submission.submission_type,
            'status', submission.status,
            'creatorName', account.display_name,
            'approvedAt', submission.approved_at,
            'publishedAt', submission.published_at,
            'itemsReady', false,
            'itemCount', (select count(*) from media.submission_items item where item.submission_id = submission.id),
            'assetCount', (select count(*) from media.submission_items item where item.submission_id = submission.id and item.media_asset_id is not null),
            'artworkItemId', (
              select item.id from media.submission_items item
              where item.submission_id = submission.id and item.role = 'artwork'::media.submission_item_role
              order by item.sort_order, item.created_at limit 1
            )
          )) as entry
        from media.submissions submission
        join creator.creator_accounts account on account.id = submission.creator_account_id
        where submission.status in ('approved'::media.publication_status, 'processing'::media.publication_status)
          and not private.submission_required_items_ready(submission.id)
      ) waiting_entries
    ), '[]'::jsonb),
    'published', coalesce((
      select jsonb_agg(entry order by sort_at desc)
      from (
        select
          coalesce(submission.published_at, submission.updated_at, submission.created_at) as sort_at,
          jsonb_strip_nulls(jsonb_build_object(
            'id', submission.id,
            'title', submission.title,
            'description', submission.description,
            'submissionType', submission.submission_type,
            'status', submission.status,
            'creatorName', account.display_name,
            'approvedAt', submission.approved_at,
            'publishedAt', submission.published_at,
            'itemsReady', private.submission_required_items_ready(submission.id),
            'itemCount', (select count(*) from media.submission_items item where item.submission_id = submission.id),
            'assetCount', (select count(*) from media.submission_items item where item.submission_id = submission.id and item.media_asset_id is not null),
            'artworkItemId', (
              select item.id from media.submission_items item
              where item.submission_id = submission.id and item.role = 'artwork'::media.submission_item_role
              order by item.sort_order, item.created_at limit 1
            ),
            'catalog', case
              when submission.submission_type = 'music_release'::media.submission_type then (
                select jsonb_strip_nulls(jsonb_build_object(
                  'kind', 'music_release',
                  'id', release.id,
                  'title', release.title,
                  'publicationStatus', release.publication_status,
                  'itemCount', (select count(*) from music.release_tracks rt where rt.release_id = release.id),
                  'itemsWithMedia', (
                    select count(*) from music.release_tracks rt
                    join music.tracks track on track.id = rt.track_id
                    where rt.release_id = release.id and track.media_asset_id is not null
                  ),
                  'coverAssetId', release.cover_asset_id
                ))
                from music.releases release
                where release.metadata ->> 'submissionId' = submission.id::text
                order by release.created_at desc limit 1
              )
              when submission.submission_type = 'learning_album'::media.submission_type then (
                select jsonb_strip_nulls(jsonb_build_object(
                  'kind', 'learning_album',
                  'id', album.id,
                  'title', album.title,
                  'publicationStatus', album.publication_status,
                  'itemCount', (select count(*) from learning.album_recordings recording where recording.album_id = album.id),
                  'itemsWithMedia', (
                    select count(*) from learning.album_recordings recording
                    where recording.album_id = album.id and recording.media_asset_id is not null
                  ),
                  'coverAssetId', album.cover_asset_id
                ))
                from learning.albums album
                where album.submission_id = submission.id limit 1
              )
              when submission.submission_type = 'learning_lesson_set'::media.submission_type then (
                select jsonb_strip_nulls(jsonb_build_object(
                  'kind', 'learning_lesson_set',
                  'id', lesson_set.id,
                  'title', lesson_set.title,
                  'publicationStatus', lesson_set.publication_status,
                  'itemCount', (select count(*) from learning.lessons lesson where lesson.lesson_set_id = lesson_set.id),
                  'itemsWithMedia', (
                    select count(*) from learning.lessons lesson
                    where lesson.lesson_set_id = lesson_set.id and lesson.media_asset_id is not null
                  ),
                  'coverAssetId', lesson_set.cover_asset_id
                ))
                from learning.lesson_sets lesson_set
                where lesson_set.submission_id = submission.id limit 1
              )
              else null
            end
          )) as entry
        from media.submissions submission
        join creator.creator_accounts account on account.id = submission.creator_account_id
        where submission.status = 'published'::media.publication_status
      ) published_entries
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_admin_publication_overview() from public, anon;
grant execute on function public.get_admin_publication_overview() to authenticated;
