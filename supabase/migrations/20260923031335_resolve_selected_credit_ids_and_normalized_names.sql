-- Keep the v2 entry point compatible with older clients, but honor selected
-- IDs when the v3 CHC Artists form supplies them.
do $patch$
declare body text;
  before_call text := $old$
    perform private.set_track_credit_names(
      v_track_id,
      p_creator_account_id,
      item ->> 'mainArtistName',
      coalesce(item -> 'contributors', '[]'::jsonb)
    );$old$;
  after_call text := $new$
    perform private.set_track_credit_refs(
      v_track_id,
      p_creator_account_id,
      item ->> 'mainArtistName',
      nullif(item ->> 'mainArtistId','')::uuid,
      coalesce(item -> 'contributors', '[]'::jsonb)
    );$new$;
begin
  select pg_get_functiondef('public.create_creator_submission_v2(uuid,text,text,text,music.release_type,text,text,uuid,uuid,uuid,uuid,jsonb,jsonb,timestamptz,date)'::regprocedure) into body;
  if body not like '%'||before_call||'%' then raise exception 'v2 credit mapping changed; cannot safely patch'; end if;
  execute replace(body,before_call,after_call);
end;
$patch$;

-- Typing "Ibrahim Ayad" after someone else credited "Cantor Ibrahim Ayad"
-- reuses the same existing row. Similar but non-identical names remain separate
-- until the submitter explicitly selects one of the suggestions.
do $patch$
declare body text;
begin
  select pg_get_functiondef('private.resolve_track_credit_artist(uuid,text,boolean)'::regprocedure) into body;
  if body not like '%lower(trim(artist.display_name)) = lower(clean_name)%' then
    raise exception 'Credit name resolver changed';
  end if;
  body := replace(body,
     'lower(trim(artist.display_name)) = lower(clean_name)',
     'private.normalize_creator_name(artist.display_name) = private.normalize_creator_name(clean_name)');
  execute body;

  select pg_get_functiondef('public.create_creator_artist(uuid,text)'::regprocedure) into body;
  if body not like '%lower(artist.display_name) = lower(clean_name)%' then
    raise exception 'Artist creation name resolver changed';
  end if;
  body:=replace(body,'lower(artist.display_name) = lower(clean_name)',
    'private.normalize_creator_name(artist.display_name) = private.normalize_creator_name(clean_name)');
  execute body;

  select pg_get_functiondef('public.create_creator_cantor(uuid,text,text)'::regprocedure) into body;
  if body not like '%lower(trim(cantor.display_name)) = lower(clean_name)%' then
    raise exception 'Cantor creation name resolver changed';
  end if;
  body:=replace(body,'lower(trim(cantor.display_name)) = lower(clean_name)',
    'private.normalize_creator_name(cantor.display_name) = private.normalize_creator_name(clean_name)');
  execute body;
end;
$patch$;
