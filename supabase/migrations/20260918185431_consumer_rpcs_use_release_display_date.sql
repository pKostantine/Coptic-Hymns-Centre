-- Everything listeners see now reads the display date: where the record first
-- came out if that is known, otherwise when it went live on CHC. The old
-- release_date column is left in place but no longer drives any reader.
do $$
declare
  target record;
  definition text;
  patched text;
  changed integer := 0;
begin
  for target in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'get_music_home',
        'get_published_music_artist',
        'get_published_music_release',
        'get_published_music_release_for_locale',
        'search_published_music'
      )
  loop
    definition := pg_get_functiondef(target.oid);

    -- Both spellings appear across these functions.
    patched := replace(
      definition,
      '''releaseDate'', release.release_date',
      '''releaseDate'', music.release_display_date(release.original_release_date, release.scheduled_release_at, release.release_date)'
    );
    patched := replace(
      patched,
      '''releaseDate'', releases.release_date',
      '''releaseDate'', music.release_display_date(releases.original_release_date, releases.scheduled_release_at, releases.release_date)'
    );
    patched := replace(
      patched,
      '''releaseDate'', r.release_date',
      '''releaseDate'', music.release_display_date(r.original_release_date, r.scheduled_release_at, r.release_date)'
    );

    if patched <> definition then
      execute patched;
      changed := changed + 1;
    end if;
  end loop;

  if changed = 0 then
    raise exception 'No consumer function exposed a release date in the expected shape';
  end if;

  raise notice 'Updated % consumer functions', changed;
end $$;
