-- Honor explicit artist-profile selections when editing an existing music
-- release. Existing name-only edits still fall back to normalized matching.
do $patch$
declare body text;
begin
  select pg_get_functiondef('public.update_creator_release_v2(uuid,text,text,timestamptz,date,boolean,jsonb,text,text,jsonb,uuid)'::regprocedure)
    into body;
  if position('perform private.set_track_credit_names(' in body)=0 then
    raise exception 'Credit update call changed';
  end if;
  body:=replace(body,
    $old$perform private.set_track_credit_names(
        v_track_id,
        account_id,
        entry ->> 'mainArtistName',
        coalesce(entry -> 'contributors', '[]'::jsonb)
      )$old$,
    $new$perform private.set_track_credit_refs(
        v_track_id,
        account_id,
        entry ->> 'mainArtistName',
        nullif(entry ->> 'mainArtistId','')::uuid,
        coalesce(entry -> 'contributors', '[]'::jsonb)
      )$new$);
  if position('perform private.set_track_credit_names(' in body)>0 then
    raise exception 'Could not safely patch release editor';
  end if;
  execute body;
end;
$patch$;
