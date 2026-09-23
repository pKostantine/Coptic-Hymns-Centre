-- Complete Learn & Study creator lyrics and produce a real audio-only
-- rendition for every video lesson. The primary lesson asset remains video;
-- the smaller M4A is used only when the listener chooses Audio only.

alter table media.submission_items
  add column if not exists audio_only_asset_id uuid references media.media_assets(id) on delete set null;

alter table learning.lessons
  add column if not exists audio_asset_id uuid references media.media_assets(id) on delete set null;

create index if not exists learning_lessons_audio_asset_idx
  on learning.lessons(audio_asset_id) where audio_asset_id is not null;

create or replace function public.enqueue_media_processing_job(
  p_upload_intent_id uuid,
  p_job_type media.processing_job_type default 'audio_delivery'::media.processing_job_type,
  p_output_bucket text default null
)
returns table(
  job_id uuid,
  status media.processing_job_status,
  input_bucket text,
  input_path text,
  output_bucket text,
  output_path text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  request_user_id uuid := auth.uid();
  source_intent media.upload_intents%rowtype;
  generated_output_path text;
  resolved_bucket text;
  allowed_buckets text[];
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_job_type = 'metadata_probe'::media.processing_job_type then
    raise exception 'metadata_probe jobs are not implemented by any worker' using errcode = '22023';
  end if;

  allowed_buckets := case p_job_type
    when 'audio_delivery'::media.processing_job_type then array['chc-music', 'chc-learning']
    when 'video_delivery'::media.processing_job_type then array['chc-learning']
    when 'image_delivery'::media.processing_job_type then array['chc-images']
  end;
  if allowed_buckets is null then
    raise exception 'Unsupported processing job type: %', p_job_type using errcode = '22023';
  end if;
  resolved_bucket := coalesce(p_output_bucket, allowed_buckets[1]);
  if not (resolved_bucket = any(allowed_buckets)) then
    raise exception '% jobs cannot write to %', p_job_type, resolved_bucket using errcode = '22023';
  end if;

  select * into source_intent from media.upload_intents where id = p_upload_intent_id;
  if not found then raise exception 'Upload intent not found' using errcode = 'P0002'; end if;
  if source_intent.status <> 'uploaded'::media.upload_intent_status then
    raise exception 'Upload intent is not uploaded' using errcode = '22023';
  end if;

  -- Video uploads intentionally create both video_delivery and audio_delivery.
  if not (
    (p_job_type = 'audio_delivery' and source_intent.media_type in ('audio'::media.media_type, 'video'::media.media_type))
    or (p_job_type = 'video_delivery' and source_intent.media_type = 'video'::media.media_type)
    or (p_job_type = 'image_delivery' and source_intent.media_type = 'image'::media.media_type)
  ) then
    raise exception 'A % upload cannot be enqueued for %', source_intent.media_type, p_job_type using errcode = '22023';
  end if;
  if source_intent.requested_by <> request_user_id
    and not (select private.can_edit_creator_account(source_intent.creator_account_id)) then
    raise exception 'Not authorized for upload intent' using errcode = '42501';
  end if;

  generated_output_path := private.media_processing_output_path(
    source_intent.creator_account_id, source_intent.id, p_job_type
  );
  insert into media.media_processing_jobs(
    upload_intent_id, job_type, status, input_bucket, input_path, output_bucket, output_path
  ) values (
    source_intent.id, p_job_type, 'queued'::media.processing_job_status,
    source_intent.bucket, source_intent.path, resolved_bucket, generated_output_path
  )
  on conflict (upload_intent_id, job_type) do update set
    available_at = case when media.media_processing_jobs.status in ('failed','cancelled') then now() else media.media_processing_jobs.available_at end,
    status = case when media.media_processing_jobs.status in ('failed','cancelled') then 'queued'::media.processing_job_status else media.media_processing_jobs.status end,
    attempt_count = case when media.media_processing_jobs.status in ('failed','cancelled') then 0 else media.media_processing_jobs.attempt_count end,
    finished_at = case when media.media_processing_jobs.status in ('failed','cancelled') then null else media.media_processing_jobs.finished_at end,
    output_bucket = case when media.media_processing_jobs.status in ('failed','cancelled') then excluded.output_bucket else media.media_processing_jobs.output_bucket end,
    output_path = case when media.media_processing_jobs.status in ('failed','cancelled') then excluded.output_path else media.media_processing_jobs.output_path end,
    error_message = case when media.media_processing_jobs.status in ('failed','cancelled') then null else media.media_processing_jobs.error_message end
  returning id, media.media_processing_jobs.status, media.media_processing_jobs.input_bucket,
    media.media_processing_jobs.input_path, media.media_processing_jobs.output_bucket,
    media.media_processing_jobs.output_path
  into job_id, status, input_bucket, input_path, output_bucket, output_path;

  update media.upload_intents set error_message = null where id = source_intent.id;
  return next;
end;
$function$;

create or replace function private.attach_completed_submission_jobs(p_submission_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  affected_count integer := 0;
  changed_count integer := 0;
begin
  -- Only the delivery matching the source media type becomes the item's
  -- primary asset. This prevents a video's extracted M4A replacing its MP4.
  with primary_jobs as (
    select distinct on (item.id) item.id item_id, job.id processing_job_id, job.media_asset_id
    from media.submission_items item
    join media.upload_intents intent on intent.id = item.upload_intent_id
    join media.media_processing_jobs job on job.upload_intent_id = intent.id
      and job.job_type = case intent.media_type
        when 'audio'::media.media_type then 'audio_delivery'::media.processing_job_type
        when 'video'::media.media_type then 'video_delivery'::media.processing_job_type
        when 'image'::media.media_type then 'image_delivery'::media.processing_job_type end
      and job.status = 'completed'::media.processing_job_status
      and job.media_asset_id is not null
    where item.submission_id = p_submission_id
    order by item.id, job.finished_at desc nulls last, job.created_at desc
  )
  update media.submission_items item set
    media_asset_id = coalesce(item.media_asset_id, primary_jobs.media_asset_id),
    media_processing_job_id = primary_jobs.processing_job_id
  from primary_jobs where item.id = primary_jobs.item_id
    and (item.media_asset_id is distinct from coalesce(item.media_asset_id, primary_jobs.media_asset_id)
      or item.media_processing_job_id is distinct from primary_jobs.processing_job_id);
  get diagnostics affected_count = row_count;

  with audio_jobs as (
    select distinct on (item.id) item.id item_id, job.media_asset_id
    from media.submission_items item
    join media.upload_intents intent on intent.id=item.upload_intent_id and intent.media_type='video'::media.media_type
    join media.media_processing_jobs job on job.upload_intent_id=intent.id
      and job.job_type='audio_delivery'::media.processing_job_type
      and job.status='completed'::media.processing_job_status and job.media_asset_id is not null
    where item.submission_id=p_submission_id
    order by item.id,job.finished_at desc nulls last,job.created_at desc
  )
  update media.submission_items item set audio_only_asset_id=audio_jobs.media_asset_id,updated_at=now()
  from audio_jobs where item.id=audio_jobs.item_id and item.audio_only_asset_id is distinct from audio_jobs.media_asset_id;
  get diagnostics changed_count = row_count;
  affected_count := affected_count + changed_count;

  update music.tracks track set
    media_asset_id=item.media_asset_id,
    duration_ms=coalesce(track.duration_ms,nullif(round((job.probe->'output'->'format'->>'duration')::numeric*1000),0)::bigint),
    updated_at=now()
  from media.submission_items item
  left join media.media_processing_jobs job on job.id=item.media_processing_job_id
  where item.submission_id=p_submission_id and item.music_track_id=track.id
    and item.media_asset_id is not null and track.media_asset_id is distinct from item.media_asset_id;

  -- This also fills existing published video lessons when their backfilled
  -- audio job completes.
  update learning.lessons lesson set audio_asset_id=item.audio_only_asset_id,updated_at=now()
  from media.submission_items item
  where item.submission_id=p_submission_id and item.audio_only_asset_id is not null
    and lesson.metadata->>'submissionItemId'=item.id::text
    and lesson.audio_asset_id is distinct from item.audio_only_asset_id;

  update media.media_assets asset set publication_status='published'::media.publication_status,updated_at=now()
  where asset.id in (
    select lesson.audio_asset_id from learning.lessons lesson
    where lesson.publication_status='published'::media.publication_status and lesson.audio_asset_id is not null
  ) and asset.publication_status is distinct from 'published'::media.publication_status;

  return affected_count;
end;
$function$;

create or replace function private.submission_required_items_ready(p_submission_id uuid)
returns boolean language sql stable security definer set search_path to '' as $function$
  select exists(select 1 from media.submission_items where submission_id=p_submission_id and required)
    and not exists(
      select 1 from media.submission_items item
      left join media.media_assets asset on asset.id=item.media_asset_id and asset.processing_status='completed'::media.processing_status
      left join media.upload_intents intent on intent.id=item.upload_intent_id
      left join media.media_assets audio_asset on audio_asset.id=item.audio_only_asset_id and audio_asset.processing_status='completed'::media.processing_status
      where item.submission_id=p_submission_id and item.required
        and (asset.id is null or (intent.media_type='video'::media.media_type and audio_asset.id is null))
        and intent.media_type in ('audio'::media.media_type,'image'::media.media_type,'video'::media.media_type)
    );
$function$;

create or replace function private.attach_lesson_audio_asset()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_asset_id uuid;
begin
  if new.media_type='video'::learning.lesson_media_type and new.metadata ? 'submissionItemId' then
    select audio_only_asset_id into v_asset_id from media.submission_items
      where id=(new.metadata->>'submissionItemId')::uuid;
    new.audio_asset_id := v_asset_id;
    if new.publication_status='published'::media.publication_status and v_asset_id is not null then
      update media.media_assets set publication_status='published'::media.publication_status,
        updated_by=coalesce(new.updated_by,new.created_by),updated_at=now() where id=v_asset_id;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists learning_lesson_attach_audio_asset on learning.lessons;
create trigger learning_lesson_attach_audio_asset before insert or update of publication_status on learning.lessons
for each row execute function private.attach_lesson_audio_asset();

-- Process audio-only renditions for existing lesson-set video uploads too.
insert into media.media_processing_jobs(
  upload_intent_id,job_type,status,input_bucket,input_path,output_bucket,output_path
)
select intent.id,'audio_delivery'::media.processing_job_type,'queued'::media.processing_job_status,
  intent.bucket,intent.path,'chc-learning',private.media_processing_output_path(intent.creator_account_id,intent.id,'audio_delivery'::media.processing_job_type)
from media.submission_items item
join media.submissions submission on submission.id=item.submission_id and submission.submission_type='learning_lesson_set'::media.submission_type
join media.upload_intents intent on intent.id=item.upload_intent_id and intent.media_type='video'::media.media_type
where intent.status='uploaded'::media.upload_intent_status
on conflict(upload_intent_id,job_type) do nothing;

create or replace function public.get_learning_lyric_editor_items()
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare request_user_id uuid:=auth.uid(); payload jsonb;
begin
  if request_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select coalesce(jsonb_agg(items.payload order by items.updated_at desc,items.title),'[]'::jsonb) into payload
  from (
    select r.updated_at,r.title,jsonb_build_object(
      'id',r.id,'targetType','learning_album_recording','title',r.title,'subtitle',a.title,
      'durationMs',coalesce(r.duration_ms,asset.duration_ms),'publicationStatus',r.publication_status,
      'maxSyncPrecision','line','mediaAsset',jsonb_build_object('id',asset.id,'provider',asset.provider,
        'bucket',asset.bucket,'path',asset.path,'mimeType',asset.mime_type,'durationMs',asset.duration_ms,
        'publicationStatus',asset.publication_status)) payload
    from learning.album_recordings r join learning.albums a on a.id=r.album_id
    join media.media_assets asset on asset.id=r.media_asset_id
    where private.learning_lyric_item_is_editable('album_recording'::learning.playlist_item_kind,r.id)
    union all
    select l.updated_at,'Lesson '||(l.sort_order+1),jsonb_build_object(
      'id',l.id,'targetType','learning_lesson','title','Lesson '||(l.sort_order+1),'subtitle',s.title,
      'durationMs',coalesce(l.duration_ms,audio.duration_ms,asset.duration_ms),'publicationStatus',l.publication_status,
      'maxSyncPrecision','unsynced','mediaAsset',jsonb_build_object('id',coalesce(audio.id,asset.id),
        'provider',coalesce(audio.provider,asset.provider),'bucket',coalesce(audio.bucket,asset.bucket),
        'path',coalesce(audio.path,asset.path),'mimeType',coalesce(audio.mime_type,asset.mime_type),
        'durationMs',coalesce(audio.duration_ms,asset.duration_ms),'publicationStatus',coalesce(audio.publication_status,asset.publication_status))) payload
    from learning.lessons l join learning.lesson_sets s on s.id=l.lesson_set_id
    join media.media_assets asset on asset.id=l.media_asset_id
    left join media.media_assets audio on audio.id=l.audio_asset_id
    where private.learning_lyric_item_is_editable('lesson'::learning.playlist_item_kind,l.id)
  ) items;
  return payload;
end;
$function$;

create or replace function public.get_learning_lyric_language_draft(
  p_item_kind learning.playlist_item_kind,p_item_id uuid,p_locale text
)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare draft learning.lyric_edit_drafts%rowtype; lyric_set learning.lyric_sets%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.learning_lyric_item_is_editable(p_item_kind,p_item_id) then raise exception 'Learning item not editable' using errcode='42501'; end if;
  select * into draft from learning.lyric_edit_drafts d where d.item_kind=p_item_kind
    and coalesce(d.album_recording_id,d.lesson_id)=p_item_id and d.locale=p_locale;
  select * into lyric_set from learning.lyric_sets s where s.item_kind=p_item_kind
    and coalesce(s.album_recording_id,s.lesson_id)=p_item_id and s.locale=p_locale;
  if draft.locale is not null then
    return jsonb_build_object('id',lyric_set.id,'trackId',p_item_id,'locale',p_locale,
      'description',draft.description,'publicationStatus',coalesce(lyric_set.publication_status,'draft'::media.publication_status),
      'hasDraft',true,'syncPrecision',draft.sync_precision,'lines',draft.lines);
  end if;
  if lyric_set.id is null then return null; end if;
  return jsonb_build_object('id',lyric_set.id,'trackId',p_item_id,'locale',p_locale,
    'description',lyric_set.description,'publicationStatus',lyric_set.publication_status,'hasDraft',false,
    'syncPrecision',lyric_set.sync_precision,'lines',coalesce((select jsonb_agg(jsonb_build_object(
      'id',line.id,'sequence',line.sequence,'startMs',line.start_ms,'endMs',line.end_ms,'text',line.text
    ) order by line.sequence) from learning.lyric_lines line where line.lyric_set_id=lyric_set.id),'[]'::jsonb));
end;
$function$;

create or replace function public.save_learning_lyric_studio_draft(
  p_item_kind learning.playlist_item_kind,p_item_id uuid,
  p_sync_precision music.lyric_sync_precision,p_languages jsonb
)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare request_user_id uuid:=auth.uid(); language_row record; normalized_lines jsonb; saved jsonb:='[]'::jsonb;
begin
  if request_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.learning_lyric_item_is_editable(p_item_kind,p_item_id) then raise exception 'Learning item not editable' using errcode='42501'; end if;
  if p_item_kind='lesson' and p_sync_precision<>'unsynced' then raise exception 'Lesson sets support unsynced lyrics only' using errcode='22023'; end if;
  if p_sync_precision not in ('unsynced','line') then raise exception 'Unsupported lyric sync precision' using errcode='22023'; end if;
  if jsonb_typeof(p_languages)<>'array' then raise exception 'p_languages must be a JSON array' using errcode='22023'; end if;
  for language_row in select value from jsonb_array_elements(p_languages) loop
    if not exists(select 1 from media.locales where code=language_row.value->>'locale' and enabled) then raise exception 'Unsupported lyric locale' using errcode='22023'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',nullif(line.value->>'id',''),'sequence',line.ordinality::integer,
      'startMs',case when p_sync_precision='unsynced' or nullif(trim(coalesce(line.value->>'startMs','')),'') is null then null else (line.value->>'startMs')::bigint end,
      'endMs',case when p_sync_precision='unsynced' or nullif(trim(coalesce(line.value->>'endMs','')),'') is null then null else (line.value->>'endMs')::bigint end,
      'text',coalesce(line.value->>'text','')) order by line.ordinality),'[]'::jsonb)
      into normalized_lines from jsonb_array_elements(coalesce(language_row.value->'lines','[]'::jsonb)) with ordinality line(value,ordinality);
    insert into learning.lyric_edit_drafts(item_kind,album_recording_id,lesson_id,locale,sync_precision,description,lines,created_by,updated_by)
    values(p_item_kind,case when p_item_kind='album_recording' then p_item_id end,case when p_item_kind='lesson' then p_item_id end,
      language_row.value->>'locale',p_sync_precision,nullif(trim(language_row.value->>'description'),''),normalized_lines,request_user_id,request_user_id)
    on conflict do nothing;
    update learning.lyric_edit_drafts d set sync_precision=p_sync_precision,
      description=nullif(trim(language_row.value->>'description'),''),lines=normalized_lines,updated_by=request_user_id,updated_at=now()
    where d.item_kind=p_item_kind and coalesce(d.album_recording_id,d.lesson_id)=p_item_id and d.locale=language_row.value->>'locale';
    saved:=saved||jsonb_build_array(jsonb_build_object('trackId',p_item_id,'locale',language_row.value->>'locale',
      'description',nullif(trim(language_row.value->>'description'),''),'publicationStatus','draft','hasDraft',true,
      'syncPrecision',p_sync_precision,'lines',normalized_lines));
  end loop;
  return jsonb_build_object('trackId',p_item_id,'languages',saved,'savedAt',now());
end;
$function$;

create or replace function public.publish_learning_lyric_languages(
  p_item_kind learning.playlist_item_kind,p_item_id uuid,
  p_sync_precision music.lyric_sync_precision,p_locales text[]
)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare request_user_id uuid:=auth.uid(); requested_locale text; draft learning.lyric_edit_drafts%rowtype; lyric_set_id uuid; invalid_count integer;
begin
  if request_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.learning_lyric_item_is_editable(p_item_kind,p_item_id) then raise exception 'Learning item not editable' using errcode='42501'; end if;
  if p_item_kind='lesson' and p_sync_precision<>'unsynced' then raise exception 'Lesson sets support unsynced lyrics only' using errcode='22023'; end if;
  if p_sync_precision not in ('unsynced','line') then raise exception 'Unsupported lyric sync precision' using errcode='22023'; end if;
  foreach requested_locale in array p_locales loop
    select * into draft from learning.lyric_edit_drafts d where d.item_kind=p_item_kind
      and coalesce(d.album_recording_id,d.lesson_id)=p_item_id and d.locale=requested_locale;
    if draft.lines is null or jsonb_array_length(draft.lines)=0 then raise exception 'Add lyric lines before publishing' using errcode='22023'; end if;
    if p_sync_precision='line' then
      select count(*) into invalid_count from jsonb_array_elements(draft.lines) line
        where nullif(trim(coalesce(line->>'startMs','')),'') is null;
      if invalid_count>0 then raise exception 'Every lyric row needs a start time' using errcode='22023'; end if;
    end if;
    select id into lyric_set_id from learning.lyric_sets s where s.item_kind=p_item_kind
      and coalesce(s.album_recording_id,s.lesson_id)=p_item_id and s.locale=requested_locale for update;
    if lyric_set_id is null then
      insert into learning.lyric_sets(item_kind,album_recording_id,lesson_id,locale,sync_precision,description,publication_status,created_by,updated_by)
      values(p_item_kind,case when p_item_kind='album_recording' then p_item_id end,case when p_item_kind='lesson' then p_item_id end,
        requested_locale,p_sync_precision,draft.description,'published'::media.publication_status,request_user_id,request_user_id)
      returning id into lyric_set_id;
    else
      update learning.lyric_sets set sync_precision=p_sync_precision,description=draft.description,
        publication_status='published'::media.publication_status,updated_by=request_user_id,updated_at=now() where id=lyric_set_id;
      delete from learning.lyric_lines where lyric_set_id=publish_learning_lyric_languages.lyric_set_id;
    end if;
    insert into learning.lyric_lines(lyric_set_id,sequence,start_ms,end_ms,text)
    select lyric_set_id,line.ordinality::integer,
      case when p_sync_precision='line' then (line.value->>'startMs')::bigint end,
      case when p_sync_precision='line' and nullif(trim(coalesce(line.value->>'endMs','')),'') is not null then (line.value->>'endMs')::bigint end,
      coalesce(line.value->>'text','') from jsonb_array_elements(draft.lines) with ordinality line(value,ordinality);
    delete from learning.lyric_edit_drafts d where d.item_kind=p_item_kind
      and coalesce(d.album_recording_id,d.lesson_id)=p_item_id and d.locale=requested_locale;
  end loop;
  return jsonb_build_object('trackId',p_item_id,'locales',to_jsonb(p_locales),'publishedAt',now());
end;
$function$;

create or replace function public.publish_track_lyric_languages_v2(
  p_track_id uuid,p_locales text[],p_sync_precision music.lyric_sync_precision default 'line'
)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare request_user_id uuid:=auth.uid(); requested_locale text; draft music.lyric_edit_drafts%rowtype; lyric_set_id uuid; invalid_count integer;
begin
  if request_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.music_track_is_editable(p_track_id) then raise exception 'Track not editable' using errcode='42501'; end if;
  if p_sync_precision not in ('unsynced','line') then raise exception 'Unsupported lyric sync precision' using errcode='22023'; end if;
  foreach requested_locale in array p_locales loop
    select * into draft from music.lyric_edit_drafts d where d.track_id=p_track_id and d.locale=requested_locale;
    if draft.lines is null or jsonb_array_length(draft.lines)=0 then raise exception 'Add lyric lines before publishing' using errcode='22023'; end if;
    if p_sync_precision='line' then
      select count(*) into invalid_count from jsonb_array_elements(draft.lines) line where nullif(trim(coalesce(line->>'startMs','')),'') is null;
      if invalid_count>0 then raise exception 'Every lyric row needs a start time' using errcode='22023'; end if;
    end if;
    select id into lyric_set_id from music.lyric_sets where track_id=p_track_id and locale=requested_locale and kind='original'::music.lyric_kind for update;
    if lyric_set_id is null then
      insert into music.lyric_sets(track_id,locale,kind,sync_precision,description,publication_status,created_by,updated_by)
      values(p_track_id,requested_locale,'original'::music.lyric_kind,p_sync_precision,draft.description,'published'::media.publication_status,request_user_id,request_user_id)
      returning id into lyric_set_id;
    else
      update music.lyric_sets set sync_precision=p_sync_precision,description=draft.description,
        publication_status='published'::media.publication_status,updated_by=request_user_id,updated_at=now() where id=lyric_set_id;
      delete from music.lyric_lines where lyric_set_id=publish_track_lyric_languages_v2.lyric_set_id;
    end if;
    insert into music.lyric_lines(lyric_set_id,sequence,start_ms,end_ms,text)
    select lyric_set_id,line.ordinality::integer,
      case when p_sync_precision='line' then (line.value->>'startMs')::bigint end,
      case when p_sync_precision='line' and nullif(trim(coalesce(line.value->>'endMs','')),'') is not null then (line.value->>'endMs')::bigint end,
      coalesce(line.value->>'text','') from jsonb_array_elements(draft.lines) with ordinality line(value,ordinality);
    delete from music.lyric_edit_drafts where track_id=p_track_id and locale=requested_locale;
  end loop;
  return jsonb_build_object('trackId',p_track_id,'locales',to_jsonb(p_locales),'publishedAt',now());
end;
$function$;

revoke all on function public.get_learning_lyric_editor_items() from public,anon;
revoke all on function public.get_learning_lyric_language_draft(learning.playlist_item_kind,uuid,text) from public,anon;
revoke all on function public.save_learning_lyric_studio_draft(learning.playlist_item_kind,uuid,music.lyric_sync_precision,jsonb) from public,anon;
revoke all on function public.publish_learning_lyric_languages(learning.playlist_item_kind,uuid,music.lyric_sync_precision,text[]) from public,anon;
revoke all on function public.publish_track_lyric_languages_v2(uuid,text[],music.lyric_sync_precision) from public,anon;
grant execute on function public.get_learning_lyric_editor_items() to authenticated;
grant execute on function public.get_learning_lyric_language_draft(learning.playlist_item_kind,uuid,text) to authenticated;
grant execute on function public.save_learning_lyric_studio_draft(learning.playlist_item_kind,uuid,music.lyric_sync_precision,jsonb) to authenticated;
grant execute on function public.publish_learning_lyric_languages(learning.playlist_item_kind,uuid,music.lyric_sync_precision,text[]) to authenticated;
grant execute on function public.publish_track_lyric_languages_v2(uuid,text[],music.lyric_sync_precision) to authenticated;

create or replace function public.get_published_learning_lesson_set(p_lesson_set_id uuid, p_locale text default 'en')
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
  select jsonb_build_object(
    'id',ls.id,'title',coalesce(lsl.title,ls.title),'description',coalesce(lsl.description,ls.description),
    'releaseTimingMode',ls.release_timing_mode,'scheduledReleaseAt',ls.scheduled_release_at,
    'originalReleaseDate',ls.original_release_date,
    'displayDate',coalesce(ls.original_release_date::timestamptz,ls.scheduled_release_at,ls.created_at),
    'cantor',jsonb_build_object('id',c.id,'displayName',coalesce(cl.display_name,c.display_name)),
    'season',case when s.id is null then null else jsonb_build_object('id',s.id,'slug',s.slug,'title',coalesce(sl.title,s.title)) end,
    'hymn',jsonb_build_object('id',h.id,'sourceHymnKey',h.source_hymn_key,'title',coalesce(hl.title,h.title),'subtitle',coalesce(hl.subtitle,h.subtitle)),
    'coverAsset',case when cover.id is null then null else jsonb_build_object('id',cover.id,'provider',cover.provider,'bucket',cover.bucket,'path',cover.path,'mimeType',cover.mime_type,'fileSizeBytes',cover.file_size_bytes,'checksum',cover.checksum) end,
    'lessons',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'mediaType',l.media_type,
      'title',case when p_locale='ar' then 'الدرس '||(l.sort_order+1)::text else 'Lesson '||(l.sort_order+1)::text end,
      'description',coalesce(ll.description,l.description),'durationMs',coalesce(l.duration_ms,audio.duration_ms,asset.duration_ms),
      'sortOrder',l.sort_order,
      'mediaAsset',jsonb_build_object('id',asset.id,'provider',asset.provider,'bucket',asset.bucket,'path',asset.path,'mimeType',asset.mime_type,'durationMs',asset.duration_ms,'fileSizeBytes',asset.file_size_bytes,'checksum',asset.checksum),
      'audioAsset',case when audio.id is null then null else jsonb_build_object('id',audio.id,'provider',audio.provider,'bucket',audio.bucket,'path',audio.path,'mimeType',audio.mime_type,'durationMs',audio.duration_ms,'fileSizeBytes',audio.file_size_bytes,'checksum',audio.checksum) end
    ) order by l.sort_order,l.id)
    from learning.lessons l
    join media.media_assets asset on asset.id=l.media_asset_id and asset.publication_status='published'
    left join media.media_assets audio on audio.id=l.audio_asset_id and audio.publication_status='published'
    left join learning.lesson_localizations ll on ll.lesson_id=l.id and ll.locale=p_locale
    where l.lesson_set_id=ls.id and l.publication_status='published'),'[]'::jsonb)
  )
  from learning.lesson_sets ls
  join learning.cantors c on c.id=ls.cantor_id and c.publication_status='published'
  join learning.hymns h on h.id=ls.hymn_id and h.publication_status='published'
  left join learning.cantor_localizations cl on cl.cantor_id=c.id and cl.locale=p_locale
  left join learning.lesson_set_localizations lsl on lsl.lesson_set_id=ls.id and lsl.locale=p_locale
  left join learning.hymn_localizations hl on hl.hymn_id=h.id and hl.locale=p_locale
  left join learning.seasons s on s.id=ls.season_id and s.publication_status='published'
  left join learning.season_localizations sl on sl.season_id=s.id and sl.locale=p_locale
  left join media.media_assets cover on cover.id=ls.cover_asset_id and cover.publication_status='published'
  where ls.id=p_lesson_set_id and ls.publication_status='published';
$$;
grant execute on function public.get_published_learning_lesson_set(uuid,text) to anon,authenticated;

create or replace function public.get_track_lyric_language_draft(p_track_id uuid,p_locale text)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare draft music.lyric_edit_drafts%rowtype; lyric_set music.lyric_sets%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.music_track_is_editable(p_track_id) then raise exception 'Track not found or not editable' using errcode='42501'; end if;
  select * into draft from music.lyric_edit_drafts where track_id=p_track_id and locale=p_locale;
  select * into lyric_set from music.lyric_sets where track_id=p_track_id and locale=p_locale and kind='original'::music.lyric_kind;
  if draft.track_id is not null then
    return jsonb_build_object('id',lyric_set.id,'trackId',p_track_id,'locale',p_locale,
      'description',draft.description,'publicationStatus',coalesce(lyric_set.publication_status,'draft'::media.publication_status),
      'hasDraft',true,'syncPrecision',coalesce(lyric_set.sync_precision,'line'::music.lyric_sync_precision),'lines',draft.lines);
  end if;
  if lyric_set.id is null then return null; end if;
  return jsonb_build_object('id',lyric_set.id,'trackId',p_track_id,'locale',p_locale,
    'description',lyric_set.description,'publicationStatus',lyric_set.publication_status,
    'hasDraft',false,'syncPrecision',lyric_set.sync_precision,
    'lines',coalesce((select jsonb_agg(jsonb_build_object('id',line.id,'sequence',line.sequence,
      'startMs',line.start_ms,'endMs',line.end_ms,'text',line.text) order by line.sequence)
      from music.lyric_lines line where line.lyric_set_id=lyric_set.id),'[]'::jsonb));
end;
$function$;
revoke all on function public.get_track_lyric_language_draft(uuid,text) from public,anon;
grant execute on function public.get_track_lyric_language_draft(uuid,text) to authenticated;
