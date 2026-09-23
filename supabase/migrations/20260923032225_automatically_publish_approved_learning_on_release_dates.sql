
-- Publication is gated on CHC admin approval and completed processed media.
-- Only the existing approved submission may be automatically released.
create or replace function private.publish_learning_submission_internal(
  p_submission_id uuid, p_actor_id uuid default null, p_reason text default 'automatic'
) returns jsonb
language plpgsql security definer set search_path=''
as $learning$
declare
  sub media.submissions%rowtype;
  album learning.albums%rowtype;
  lesson_set learning.lesson_sets%rowtype;
  item record;
  actor uuid;
  prior media.publication_status;
  media_count integer := 0;
  is_album boolean;
begin
  select * into sub from media.submissions where id=p_submission_id for update;
  if not found then raise exception 'Learning submission not found' using errcode='P0002'; end if;
  is_album := sub.submission_type = 'learning_album'::media.submission_type;
  if not is_album and sub.submission_type <> 'learning_lesson_set'::media.submission_type then
    raise exception 'Not a learning submission' using errcode='22023';
  end if;
  if sub.status = 'published'::media.publication_status then
    return jsonb_build_object('submissionId',sub.id,'status','published');
  end if;
  if sub.status <> 'approved'::media.publication_status or sub.approved_at is null then
    raise exception 'CHC approval is required before publishing' using errcode='42501';
  end if;

  if is_album then
    select * into album from learning.albums where submission_id=sub.id for update;
    if not found then raise exception 'Learning album not found' using errcode='P0002'; end if;
    if album.release_timing_mode='scheduled' and
      (album.scheduled_release_at is null or album.scheduled_release_at>now()) then
      return jsonb_build_object('submissionId',sub.id,'status','scheduled');
    end if;
  else
    select * into lesson_set from learning.lesson_sets where submission_id=sub.id for update;
    if not found then raise exception 'Learning lesson set not found' using errcode='P0002'; end if;
    if lesson_set.release_timing_mode='scheduled' and
      (lesson_set.scheduled_release_at is null or lesson_set.scheduled_release_at>now()) then
      return jsonb_build_object('submissionId',sub.id,'status','scheduled');
    end if;
  end if;

  perform private.attach_completed_submission_jobs(sub.id);
  if not private.submission_required_items_ready(sub.id) then
    raise exception 'Learning submission media is not ready' using errcode='22023';
  end if;
  actor := coalesce(p_actor_id,sub.reviewer_id,sub.created_by);
  select count(*) into media_count
    from media.submission_items i
    where i.submission_id=sub.id and i.role<>'artwork'::media.submission_item_role;
  if media_count=0 then raise exception 'Learning submission has no media' using errcode='22023'; end if;

  if is_album then
    if not exists(select 1 from learning.cantors c where c.id=album.cantor_id and
      (c.publication_status='published'::media.publication_status or c.owner_creator_account_id=sub.creator_account_id)) then
      raise exception 'Cantor must be published before learning album' using errcode='22023';
    end if;
    if album.season_id is not null and not exists(select 1 from learning.seasons s where s.id=album.season_id
      and s.publication_status='published'::media.publication_status) then
      raise exception 'Learning season must be published' using errcode='22023';
    end if;
    update learning.cantors set publication_status='published'::media.publication_status, updated_by=actor
      where id=album.cantor_id and owner_creator_account_id=sub.creator_account_id;
  else
    if not exists(select 1 from learning.cantors c where c.id=lesson_set.cantor_id and
      (c.publication_status='published'::media.publication_status or c.owner_creator_account_id=sub.creator_account_id)) then
      raise exception 'Cantor must be published before lesson set' using errcode='22023';
    end if;
    if not exists(select 1 from learning.hymns h where h.id=lesson_set.hymn_id
      and h.publication_status='published'::media.publication_status) then
      raise exception 'Hymn must be published before lesson set' using errcode='22023';
    end if;
    if lesson_set.season_id is not null and not exists(select 1 from learning.seasons s where s.id=lesson_set.season_id
      and s.publication_status='published'::media.publication_status) then
      raise exception 'Learning season must be published' using errcode='22023';
    end if;
    update learning.cantors set publication_status='published'::media.publication_status, updated_by=actor
      where id=lesson_set.cantor_id and owner_creator_account_id=sub.creator_account_id;
  end if;

  -- Make all processed assets visible before linking them to published content.
  update media.media_assets asset set publication_status='published'::media.publication_status,
      updated_by=actor, updated_at=now()
    where asset.id in (
      select distinct i.media_asset_id from media.submission_items i
      where i.submission_id=sub.id and i.media_asset_id is not null
    ) and asset.processing_status='completed'::media.processing_status;

  for item in
    select i.id,i.title,i.sort_order,i.role,i.media_asset_id,
      asset.media_type,asset.duration_ms,asset.processing_status
    from media.submission_items i
    left join media.media_assets asset on asset.id=i.media_asset_id
    where i.submission_id=sub.id
    order by i.sort_order,i.id
  loop
    if item.media_asset_id is null or item.processing_status <> 'completed'::media.processing_status then
      raise exception 'Incomplete learning submission item' using errcode='22023';
    end if;
    if item.role='artwork'::media.submission_item_role then
      if item.media_type <> 'image'::media.media_type then
        raise exception 'Learning artwork must be an image' using errcode='22023';
      end if;
      if is_album then
        update learning.albums set cover_asset_id=item.media_asset_id where id=album.id;
      else
        update learning.lesson_sets set cover_asset_id=item.media_asset_id where id=lesson_set.id;
      end if;
    elsif is_album then
      if item.media_type <> 'audio'::media.media_type then
        raise exception 'Learning album recordings must be audio' using errcode='22023';
      end if;
      if not exists(select 1 from learning.album_recordings r
        where r.album_id=album.id and r.metadata->>'submissionItemId'=item.id::text) then
        insert into learning.album_recordings
          (album_id,media_asset_id,title,duration_ms,sort_order,publication_status,metadata,created_by,updated_by)
        values
          (album.id,item.media_asset_id,coalesce(item.title,album.title),item.duration_ms,item.sort_order,
            'published'::media.publication_status,
            jsonb_build_object('submissionItemId',item.id),actor,actor);
      end if;
    else
      if item.media_type not in ('audio'::media.media_type,'video'::media.media_type) then
        raise exception 'Lesson media must be audio or video' using errcode='22023';
      end if;
      if not exists(select 1 from learning.lessons l
        where l.lesson_set_id=lesson_set.id and l.metadata->>'submissionItemId'=item.id::text) then
        insert into learning.lessons
          (lesson_set_id,media_asset_id,media_type,title,duration_ms,sort_order,publication_status,metadata,created_by,updated_by)
        values
          (lesson_set.id,item.media_asset_id,item.media_type::text::learning.lesson_media_type,
            coalesce(item.title,lesson_set.title),item.duration_ms,item.sort_order,
            'published'::media.publication_status,
            jsonb_build_object('submissionItemId',item.id),actor,actor);
      end if;
    end if;
  end loop;

  if is_album then
    update learning.albums set publication_status='published'::media.publication_status,
      updated_by=actor where id=album.id;
  else
    update learning.lesson_sets set publication_status='published'::media.publication_status,
      updated_by=actor where id=lesson_set.id;
  end if;
  prior:=sub.status;
  update media.submissions set status='published'::media.publication_status,
    published_at=now(),updated_by=actor where id=sub.id;
  perform private.add_media_submission_event(
    sub.id,actor,case when p_reason='scheduled' then 'published_automatically_on_schedule'
      else 'published_automatically' end,
    prior,'published'::media.publication_status,null,
    jsonb_build_object('learningType',sub.submission_type,'mediaItemCount',media_count)
  );
  return jsonb_build_object('submissionId',sub.id,'status','published','mediaItemCount',media_count);
end;
$learning$;

revoke all on function private.publish_learning_submission_internal(uuid,uuid,text)
  from public,anon,authenticated;

create or replace function private.publish_due_learning_releases()
returns integer language plpgsql security definer set search_path=''
as $due$
declare entry record; published_count integer:=0;
begin
  for entry in
    select sub.id,sub.reviewer_id
    from media.submissions sub
    where sub.status='approved'::media.publication_status
      and sub.approved_at is not null
      and private.submission_required_items_ready(sub.id)
      and (
        exists(select 1 from learning.albums a where a.submission_id=sub.id
          and a.release_timing_mode='scheduled' and a.scheduled_release_at <= now())
        or exists(select 1 from learning.lesson_sets ls where ls.submission_id=sub.id
          and ls.release_timing_mode='scheduled' and ls.scheduled_release_at <= now())
      )
    order by sub.approved_at
  loop
    begin
      perform private.publish_learning_submission_internal(entry.id,entry.reviewer_id,'scheduled');
      published_count:=published_count+1;
    exception when others then
      perform private.add_media_submission_event(
        entry.id,entry.reviewer_id,'scheduled_publish_failed',null,null,sqlerrm,'{}'::jsonb);
    end;
  end loop;
  return published_count;
end;
$due$;
revoke all on function private.publish_due_learning_releases() from public,anon,authenticated;

-- Runs alongside the existing minute-granularity scheduled music releases.
do $schedule$
begin
  if not exists(select 1 from cron.job where jobname='chc-publish-due-learning-releases') then
    perform cron.schedule('chc-publish-due-learning-releases','* * * * *',
      'select private.publish_due_learning_releases();');
  end if;
end;
$schedule$;
CREATE OR REPLACE FUNCTION public.review_media_submission(p_submission_id uuid, p_action text, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(submission_id uuid, status media.publication_status, review_due_at timestamp with time zone, processing_jobs_queued integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  request_user_id uuid := auth.uid();
  current_submission media.submissions%rowtype;
  previous_status media.publication_status;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  normalized_notes text := nullif(trim(coalesce(p_notes, '')), '');
  release_record music.releases%rowtype;
begin
  processing_jobs_queued := 0;

  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  if normalized_action not in ('approve', 'request_changes', 'reject') then
    raise exception 'Unsupported review action' using errcode = '22023';
  end if;

  if normalized_action = 'request_changes' and normalized_notes is null then
    raise exception 'Review notes are required when requesting changes' using errcode = '22023';
  end if;

  select *
  into current_submission
  from media.submissions submission
  where submission.id = p_submission_id
  for update;

  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;

  if current_submission.status <> 'pending_review'::media.publication_status then
    raise exception 'Submission is not pending review' using errcode = '22023';
  end if;

  previous_status := current_submission.status;

  if normalized_action = 'request_changes' then
    update media.submissions submission
    set status = 'changes_requested'::media.publication_status,
        reviewer_id = request_user_id,
        reviewed_at = now(),
        review_notes = normalized_notes,
        approved_at = null,
        rejected_at = null,
        updated_by = request_user_id
    where submission.id = current_submission.id
    returning * into current_submission;

    perform private.add_media_submission_event(
      current_submission.id,
      request_user_id,
      'changes_requested',
      previous_status,
      current_submission.status,
      normalized_notes,
      '{}'::jsonb
    );

  elsif normalized_action = 'reject' then
    update media.submissions submission
    set status = 'rejected'::media.publication_status,
        reviewer_id = request_user_id,
        reviewed_at = now(),
        review_notes = normalized_notes,
        rejected_at = now(),
        approved_at = null,
        updated_by = request_user_id
    where submission.id = current_submission.id
    returning * into current_submission;

    perform private.add_media_submission_event(
      current_submission.id,
      request_user_id,
      'rejected',
      previous_status,
      current_submission.status,
      normalized_notes,
      '{}'::jsonb
    );

  else
    if not exists (
      select 1
      from media.submission_items item
      where item.submission_id = current_submission.id
    ) then
      raise exception 'Submission must have at least one item' using errcode = '22023';
    end if;

    perform private.attach_completed_submission_jobs(current_submission.id);

    if not (select private.submission_required_items_ready(current_submission.id)) then
      raise exception 'Submission media is still processing. Approve once processing completes.' using errcode = '22023';
    end if;

    update media.submissions submission
    set status = 'approved'::media.publication_status,
        reviewer_id = request_user_id,
        reviewed_at = now(),
        review_notes = normalized_notes,
        approved_at = now(),
        rejected_at = null,
        updated_by = request_user_id
    where submission.id = current_submission.id
    returning * into current_submission;

    perform private.add_media_submission_event(
      current_submission.id,
      request_user_id,
      'approved',
      previous_status,
      current_submission.status,
      normalized_notes,
      jsonb_build_object('processingJobsQueued', 0)
    );

    if current_submission.submission_type = 'music_release'::media.submission_type then
      select *
      into release_record
      from music.releases release
      where nullif(release.metadata ->> 'submissionId', '')::uuid = current_submission.id
      for update;

      if found then
        if release_record.release_timing_mode = 'asap'
           or (
             release_record.release_timing_mode = 'scheduled'
             and release_record.scheduled_release_at is not null
             and release_record.scheduled_release_at <= now()
           ) then
          perform private.publish_music_submission_internal(
            current_submission.id,
            request_user_id,
            case when release_record.release_timing_mode = 'asap' then 'approval_asap' else 'scheduled_due_at_approval' end
          );

          select *
          into current_submission
          from media.submissions submission
          where submission.id = p_submission_id;
        end if;
      end if;
    elsif current_submission.submission_type in (
      'learning_album'::media.submission_type,
      'learning_lesson_set'::media.submission_type
    ) then
      if exists (
        select 1 from learning.albums album
        where album.submission_id=current_submission.id
          and (album.release_timing_mode='asap'
            or (album.release_timing_mode='scheduled' and album.scheduled_release_at<=now()))
      ) or exists (
        select 1 from learning.lesson_sets lesson_set
        where lesson_set.submission_id=current_submission.id
          and (lesson_set.release_timing_mode='asap'
            or (lesson_set.release_timing_mode='scheduled' and lesson_set.scheduled_release_at<=now()))
      ) then
        perform private.publish_learning_submission_internal(
          current_submission.id,request_user_id,'approval');
        select * into current_submission
          from media.submissions submission where submission.id=p_submission_id;
      end if;
    end if;
  end if;

  return query
  select
    current_submission.id,
    current_submission.status,
    current_submission.review_due_at,
    processing_jobs_queued;
end;
$function$
;
