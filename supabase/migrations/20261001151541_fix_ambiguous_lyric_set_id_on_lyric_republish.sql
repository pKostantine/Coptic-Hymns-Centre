-- Republishing lyrics over an already-published set failed with
--   column reference "lyric_set_id" is ambiguous
-- because both functions declared a variable named exactly like the column:
--   delete from music.lyric_lines where lyric_set_id = <fn>.lyric_set_id;
-- Qualifying the right-hand side was not enough. Under plpgsql's default
-- variable_conflict = error, the bare left-hand `lyric_set_id` matches both the
-- variable and lyric_lines.lyric_set_id, so the statement is rejected outright.
-- That delete only runs in the branch where a set already exists, which is why
-- a first publish worked and every republish failed.
--
-- Renaming the variable to v_lyric_set_id (the convention the v1 function
-- already uses, and why v1 never had this bug) removes the collision at every
-- reference rather than at the one line that happened to raise.

create or replace function public.publish_track_lyric_languages_v2(
  p_track_id uuid,
  p_locales text[],
  p_sync_precision music.lyric_sync_precision default 'line'::music.lyric_sync_precision
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare request_user_id uuid:=auth.uid(); requested_locale text; draft music.lyric_edit_drafts%rowtype; v_lyric_set_id uuid; invalid_count integer;
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
    select id into v_lyric_set_id from music.lyric_sets where track_id=p_track_id and locale=requested_locale and kind='original'::music.lyric_kind for update;
    if v_lyric_set_id is null then
      insert into music.lyric_sets(track_id,locale,kind,sync_precision,description,publication_status,created_by,updated_by)
      values(p_track_id,requested_locale,'original'::music.lyric_kind,p_sync_precision,draft.description,'published'::media.publication_status,request_user_id,request_user_id)
      returning id into v_lyric_set_id;
    else
      update music.lyric_sets set sync_precision=p_sync_precision,description=draft.description,
        publication_status='published'::media.publication_status,updated_by=request_user_id,updated_at=now() where id=v_lyric_set_id;
      delete from music.lyric_lines ll where ll.lyric_set_id=v_lyric_set_id;
    end if;
    insert into music.lyric_lines(lyric_set_id,sequence,start_ms,end_ms,text)
    select v_lyric_set_id,line.ordinality::integer,
      case when p_sync_precision='line' then (line.value->>'startMs')::bigint end,
      case when p_sync_precision='line' and nullif(trim(coalesce(line.value->>'endMs','')),'') is not null then (line.value->>'endMs')::bigint end,
      coalesce(line.value->>'text','') from jsonb_array_elements(draft.lines) with ordinality line(value,ordinality);
    delete from music.lyric_edit_drafts where track_id=p_track_id and locale=requested_locale;
  end loop;
  return jsonb_build_object('trackId',p_track_id,'locales',to_jsonb(p_locales),'publishedAt',now());
end;
$function$;

create or replace function public.publish_learning_lyric_languages(
  p_item_kind learning.playlist_item_kind,
  p_item_id uuid,
  p_sync_precision music.lyric_sync_precision,
  p_locales text[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare request_user_id uuid:=auth.uid(); requested_locale text; draft learning.lyric_edit_drafts%rowtype; v_lyric_set_id uuid; invalid_count integer;
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
    select id into v_lyric_set_id from learning.lyric_sets s where s.item_kind=p_item_kind
      and coalesce(s.album_recording_id,s.lesson_id)=p_item_id and s.locale=requested_locale for update;
    if v_lyric_set_id is null then
      insert into learning.lyric_sets(item_kind,album_recording_id,lesson_id,locale,sync_precision,description,publication_status,created_by,updated_by)
      values(p_item_kind,case when p_item_kind='album_recording' then p_item_id end,case when p_item_kind='lesson' then p_item_id end,
        requested_locale,p_sync_precision,draft.description,'published'::media.publication_status,request_user_id,request_user_id)
      returning id into v_lyric_set_id;
    else
      update learning.lyric_sets set sync_precision=p_sync_precision,description=draft.description,
        publication_status='published'::media.publication_status,updated_by=request_user_id,updated_at=now() where id=v_lyric_set_id;
      delete from learning.lyric_lines ll where ll.lyric_set_id=v_lyric_set_id;
    end if;
    insert into learning.lyric_lines(lyric_set_id,sequence,start_ms,end_ms,text)
    select v_lyric_set_id,line.ordinality::integer,
      case when p_sync_precision='line' then (line.value->>'startMs')::bigint end,
      case when p_sync_precision='line' and nullif(trim(coalesce(line.value->>'endMs','')),'') is not null then (line.value->>'endMs')::bigint end,
      coalesce(line.value->>'text','') from jsonb_array_elements(draft.lines) with ordinality line(value,ordinality);
    delete from learning.lyric_edit_drafts d where d.item_kind=p_item_kind
      and coalesce(d.album_recording_id,d.lesson_id)=p_item_id and d.locale=requested_locale;
  end loop;
  return jsonb_build_object('trackId',p_item_id,'locales',to_jsonb(p_locales),'publishedAt',now());
end;
$function$;
