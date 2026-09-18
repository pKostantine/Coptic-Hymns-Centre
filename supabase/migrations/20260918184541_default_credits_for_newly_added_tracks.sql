-- A track added to an existing release only got credits when the caller sent
-- them, so a song added without an explicit artist ended up with no main artist
-- at all. A new track now always gets the default credit, exactly like one
-- created at submission time.
do $$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(p.oid)
  into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'update_creator_release';

  patched := replace(
    definition,
    '      if entry ? ''mainArtistId'' or entry ? ''featuredArtistIds'' then',
    '      -- A track just created has no credits yet, so it always takes the'
      || chr(10) || '      -- default even when the caller named no artist.'
      || chr(10) || '      if v_is_new or entry ? ''mainArtistId'' or entry ? ''featuredArtistIds'' then'
  );

  patched := replace(
    patched,
    '  keep_ids uuid[] := array[]::uuid[];',
    '  keep_ids uuid[] := array[]::uuid[];' || chr(10) || '  v_is_new boolean;'
  );

  patched := replace(
    patched,
    '      v_track_id := nullif(entry ->> ''id'', '''')::uuid;',
    '      v_track_id := nullif(entry ->> ''id'', '''')::uuid;' || chr(10) || '      v_is_new := v_track_id is null;'
  );

  if patched = definition then
    raise exception 'update_creator_release did not match the expected shape';
  end if;

  execute patched;
end $$;
