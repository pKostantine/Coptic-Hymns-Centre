-- Preserve a separate English, Arabic and French title per uploaded learning
-- recording/lesson throughout review, processing and scheduled publication.
alter table media.submission_items
  add column if not exists localized_titles jsonb not null default '{}'::jsonb;
alter table media.submission_items
  add constraint submission_item_localized_titles_object
  check (jsonb_typeof(localized_titles)='object');

CREATE OR REPLACE FUNCTION public.create_creator_submission_v3(p_creator_account_id uuid, p_mode text, p_title text, p_description text DEFAULT NULL::text, p_release_type music.release_type DEFAULT NULL::music.release_type, p_music_type text DEFAULT NULL::text, p_recording_type text DEFAULT NULL::text, p_artist_id uuid DEFAULT NULL::uuid, p_cantor_id uuid DEFAULT NULL::uuid, p_season_id uuid DEFAULT NULL::uuid, p_hymn_id uuid DEFAULT NULL::uuid, p_localized_titles jsonb DEFAULT '{}'::jsonb, p_items jsonb DEFAULT '[]'::jsonb, p_release_timing_mode text DEFAULT 'asap'::text, p_scheduled_release_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_original_release_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result_payload jsonb;
  catalog_id uuid;
  normalized_timing text := lower(trim(coalesce(p_release_timing_mode, 'asap')));
begin
  if p_mode in ('music', 'learning_album', 'learning_lesson_set') then
    if normalized_timing not in ('asap', 'scheduled') then
      raise exception 'Release timing must be asap or scheduled' using errcode = '22023';
    end if;

    if normalized_timing = 'scheduled' and p_scheduled_release_at is null then
      raise exception 'Choose a scheduled release date and time' using errcode = '22023';
    end if;
  else
    normalized_timing := 'asap';
  end if;

  if p_mode <> 'music' and normalized_timing = 'scheduled'
     and p_scheduled_release_at < public.earliest_release_at() then
    raise exception 'Choose a release date at least 48 hours from now' using errcode = '22023';
  end if;

  result_payload := public.create_creator_submission_v2(
    p_creator_account_id,
    p_mode,
    p_title,
    p_description,
    p_release_type,
    p_music_type,
    p_recording_type,
    p_artist_id,
    p_cantor_id,
    p_season_id,
    p_hymn_id,
    p_localized_titles,
    p_items,
    case when normalized_timing = 'scheduled' then p_scheduled_release_at else null end,
    p_original_release_date
  );

  -- Save localized titles on individual learning submission items so that
  -- processing and scheduled publishing cannot lose the submitted languages.
  -- Match by unique upload intent rather than the display title.
  if p_mode in ('learning_album', 'learning_lesson_set') then
    update media.submission_items submission_item
       set localized_titles = case
             when jsonb_typeof(entry.value -> 'localizedTitles') = 'object'
               then entry.value -> 'localizedTitles'
             else '{}'::jsonb end,
           updated_at = now()
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) entry(value)
     where submission_item.submission_id=(result_payload ->> 'submissionId')::uuid
       and submission_item.upload_intent_id=(entry.value ->> 'uploadIntentId')::uuid
       and coalesce(entry.value ->> 'role', 'media') <> 'artwork';
  end if;

  catalog_id := nullif(result_payload ->> 'catalogId', '')::uuid;

  if p_mode = 'music' then
    update music.releases release
    set release_timing_mode = normalized_timing,
        scheduled_release_at = case
          when normalized_timing = 'asap' then null
          else release.scheduled_release_at
        end,
        updated_at = now()
    where release.id = catalog_id;
  elsif p_mode = 'learning_album' then
    update learning.albums album
       set release_timing_mode = normalized_timing,
           scheduled_release_at = case when normalized_timing = 'scheduled' then p_scheduled_release_at else null end,
           original_release_date = p_original_release_date, updated_at = now()
     where album.id = catalog_id;
  elsif p_mode = 'learning_lesson_set' then
    update learning.lesson_sets lesson_set
       set release_timing_mode = normalized_timing,
           scheduled_release_at = case when normalized_timing = 'scheduled' then p_scheduled_release_at else null end,
           original_release_date = p_original_release_date, updated_at = now()
     where lesson_set.id = catalog_id;
  end if;

  return result_payload;
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
  locale_entry record;
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
    select i.id,i.title,i.sort_order,i.role,i.media_asset_id,i.localized_titles,
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

    -- Titles for each recording or lesson follow the same per-language logic
    -- as music tracks, independent of the parent album or lesson-set title.
    if item.role <> 'artwork'::media.submission_item_role then
      for locale_entry in
        select key as locale, btrim(value) as title
        from jsonb_each_text(coalesce(item.localized_titles, '{}'::jsonb))
        where key in ('en','ar','fr') and nullif(btrim(value),'') is not null
      loop
        if is_album then
          insert into learning.recording_localizations(recording_id,locale,title)
          select rec.id,locale_entry.locale,locale_entry.title
          from learning.album_recordings rec
          where rec.album_id=album.id and rec.metadata->>'submissionItemId'=item.id::text
          on conflict(recording_id,locale) do update
            set title=excluded.title,updated_at=now();
        else
          insert into learning.lesson_localizations(lesson_id,locale,title)
          select lesson.id,locale_entry.locale,locale_entry.title
          from learning.lessons lesson
          where lesson.lesson_set_id=lesson_set.id
            and lesson.metadata->>'submissionItemId'=item.id::text
          on conflict(lesson_id,locale) do update
            set title=excluded.title,updated_at=now();
        end if;
      end loop;
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
