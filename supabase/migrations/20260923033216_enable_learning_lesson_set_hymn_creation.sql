-- Lesson sets can name a new hymn even while the curated learning.hymns
-- catalog is initially empty. New hymn records remain drafts until CHC
-- approves the accompanying lesson set.
create or replace function public.create_creator_hymn(
  p_creator_account_id uuid,p_title text
) returns jsonb language plpgsql security definer set search_path=''
as $hymn$
declare clean_title text:=nullif(trim(coalesce(p_title,'')),'');
  found_hymn learning.hymns%rowtype;
begin
  if auth.uid() is null or not private.can_edit_creator_account(p_creator_account_id) then
    raise exception 'Not authorized for creator account' using errcode='42501';
  end if;
  if clean_title is null or char_length(clean_title)>180 then
    raise exception 'Enter a hymn title of at most 180 characters' using errcode='22023';
  end if;
  select * into found_hymn from learning.hymns h
    where lower(trim(h.title))=lower(clean_title)
      and (h.publication_status='published'::media.publication_status
        or h.created_by=auth.uid())
    order by h.publication_status='published'::media.publication_status desc
    limit 1;
  if not found then
    insert into learning.hymns(title,publication_status,metadata,created_by,updated_by)
    values(clean_title,'draft'::media.publication_status,
      jsonb_build_object('creatorAccountId',p_creator_account_id),auth.uid(),auth.uid())
    returning * into found_hymn;
  end if;
  return jsonb_build_object('id',found_hymn.id,'title',found_hymn.title,
    'subtitle',case when found_hymn.publication_status='published'::media.publication_status
      then 'Existing hymn' else 'New hymn awaiting CHC review' end);
end;
$hymn$;
revoke all on function public.create_creator_hymn(uuid,text) from public,anon;
grant execute on function public.create_creator_hymn(uuid,text) to authenticated;

CREATE OR REPLACE FUNCTION public.get_creator_catalog_options()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object('id', season.id, 'title', season.title, 'titleArabic', (select sl.title from learning.season_localizations sl where sl.season_id=season.id and sl.locale='ar'), 'subtitle', season.slug)
        order by season.sort_order, season.title)
      from learning.seasons season
      where season.publication_status = 'published'::media.publication_status
    ), '[]'::jsonb),
    'hymns', coalesce((
      select jsonb_agg(jsonb_build_object('id', hymn.id, 'title', hymn.title, 'subtitle', hymn.subtitle)
        order by hymn.title)
      from learning.hymns hymn
      where (hymn.publication_status = 'published'::media.publication_status
           or hymn.created_by=auth.uid())
    ), '[]'::jsonb)
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION private.publish_learning_submission_internal(p_submission_id uuid, p_actor_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'automatic'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and (h.publication_status='published'::media.publication_status
        or (h.created_by=sub.created_by
          and h.metadata->>'creatorAccountId'=sub.creator_account_id::text))) then
      raise exception 'Hymn must be published or created by this submitter' using errcode='22023';
    end if;
    update learning.hymns
       set publication_status='published'::media.publication_status,
           updated_by=actor
     where id=lesson_set.hymn_id
       and created_by=sub.created_by
       and metadata->>'creatorAccountId'=sub.creator_account_id::text;
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
$function$
;
