-- A reviewer approves a release without being able to see when it goes live,
-- when it says it came out, or who each song is credited to. All three are
-- decisions the review is meant to catch, so the catalog block carries them.
do $$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(p.oid)
  into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_admin_submission_detail';

  patched := replace(
    definition,
    $old$      'releaseDate', release.release_date,$old$,
    $new$      'releaseDate', release.release_date,
      'scheduledReleaseAt', release.scheduled_release_at,
      'originalReleaseDate', release.original_release_date,
      'displayDate', music.release_display_date(
        release.original_release_date, release.scheduled_release_at, release.release_date
      ),
      'tracks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', track.id,
          'trackNumber', release_track.track_number,
          'discNumber', release_track.disc_number,
          'title', track.title,
          'durationMs', track.duration_ms,
          'publicationStatus', track.publication_status,
          'hasMedia', track.media_asset_id is not null,
          'mainArtist', (
            select credited.display_name
            from music.track_artists track_artist
            join music.artists credited on credited.id = track_artist.artist_id
            where track_artist.track_id = track.id
              and track_artist.role = 'primary'::music.track_artist_role
            limit 1
          ),
          'featuredArtists', coalesce((
            select jsonb_agg(credited.display_name order by track_artist.sort_order)
            from music.track_artists track_artist
            join music.artists credited on credited.id = track_artist.artist_id
            where track_artist.track_id = track.id
              and track_artist.role = 'featured'::music.track_artist_role
          ), '[]'::jsonb)
        ) order by release_track.disc_number, release_track.track_number)
        from music.release_tracks release_track
        join music.tracks track on track.id = release_track.track_id
        where release_track.release_id = release.id
      ), '[]'::jsonb),$new$
  );

  if patched = definition then
    raise exception 'The music catalog block was not found in get_admin_submission_detail';
  end if;

  execute patched;
end $$;
