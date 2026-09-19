-- Keep every consumer-visible dependency in sync whenever a Music release
-- becomes public, regardless of which admin/automatic publication path ran.
-- This is deliberately release-driven: CHC Artists may create credit-only
-- artists and synchronized lyric sets while the submission is still private.

create or replace function private.publish_music_release_consumer_dependencies(
  p_release_id uuid,
  p_actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := p_actor_id;
begin
  update music.artists artist
  set publication_status = 'published'::media.publication_status,
      updated_by = coalesce(actor_id, artist.updated_by),
      updated_at = now()
  where artist.id in (
    select release.primary_artist_id
    from music.releases release
    where release.id = p_release_id
      and release.primary_artist_id is not null

    union

    select track_artist.artist_id
    from music.release_tracks release_track
    join music.track_artists track_artist
      on track_artist.track_id = release_track.track_id
    where release_track.release_id = p_release_id
  )
    and artist.publication_status <> 'published'::media.publication_status;

  update music.artist_localizations localization
  set publication_status = 'published'::media.publication_status,
      updated_by = coalesce(actor_id, localization.updated_by),
      updated_at = now()
  where localization.artist_id in (
    select release.primary_artist_id
    from music.releases release
    where release.id = p_release_id
      and release.primary_artist_id is not null

    union

    select track_artist.artist_id
    from music.release_tracks release_track
    join music.track_artists track_artist
      on track_artist.track_id = release_track.track_id
    where release_track.release_id = p_release_id
  )
    and localization.publication_status <> 'published'::media.publication_status;

  update music.tracks track
  set publication_status = 'published'::media.publication_status,
      updated_by = coalesce(actor_id, track.updated_by),
      updated_at = now()
  where track.id in (
    select release_track.track_id
    from music.release_tracks release_track
    where release_track.release_id = p_release_id
  )
    and track.publication_status <> 'published'::media.publication_status;

  update music.track_localizations localization
  set publication_status = 'published'::media.publication_status,
      updated_by = coalesce(actor_id, localization.updated_by),
      updated_at = now()
  where localization.track_id in (
    select release_track.track_id
    from music.release_tracks release_track
    where release_track.release_id = p_release_id
  )
    and localization.publication_status <> 'published'::media.publication_status;

  -- Lyrics authored in CHC Artists are saved while the submission is private.
  -- Promote only sets that satisfy the same basic synchronization invariants
  -- as publish_track_lyric_set; malformed/incomplete drafts remain private.
  update music.lyric_sets lyric_set
  set publication_status = 'published'::media.publication_status,
      updated_by = coalesce(actor_id, lyric_set.updated_by),
      updated_at = now()
  where lyric_set.track_id in (
    select release_track.track_id
    from music.release_tracks release_track
    where release_track.release_id = p_release_id
  )
    and lyric_set.publication_status <> 'published'::media.publication_status
    and lyric_set.sync_precision in (
      'line'::music.lyric_sync_precision,
      'word'::music.lyric_sync_precision
    )
    and exists (
      select 1
      from music.lyric_lines lyric_line
      where lyric_line.lyric_set_id = lyric_set.id
    )
    and not exists (
      select 1
      from music.lyric_lines lyric_line
      where lyric_line.lyric_set_id = lyric_set.id
        and lyric_line.start_ms is null
    )
    and not exists (
      select 1
      from (
        select
          lyric_line.start_ms,
          lag(lyric_line.start_ms) over (order by lyric_line.sequence) as previous_start_ms
        from music.lyric_lines lyric_line
        where lyric_line.lyric_set_id = lyric_set.id
      ) ordered_line
      where ordered_line.previous_start_ms is not null
        and ordered_line.start_ms < ordered_line.previous_start_ms
    )
    and not exists (
      select 1
      from (
        select
          lyric_line.end_ms,
          lead(lyric_line.start_ms) over (order by lyric_line.sequence) as next_start_ms
        from music.lyric_lines lyric_line
        where lyric_line.lyric_set_id = lyric_set.id
      ) ordered_line
      where ordered_line.end_ms is not null
        and ordered_line.next_start_ms is not null
        and ordered_line.end_ms > ordered_line.next_start_ms
    );
end;
$function$;

revoke all on function private.publish_music_release_consumer_dependencies(uuid, uuid) from public;

create or replace function private.on_music_release_publish_consumer_dependencies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.publication_status = 'published'::media.publication_status then
    perform private.publish_music_release_consumer_dependencies(
      new.id,
      coalesce(new.updated_by, new.created_by)
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.on_music_release_publish_consumer_dependencies() from public;

drop trigger if exists music_release_publish_consumer_dependencies on music.releases;
create trigger music_release_publish_consumer_dependencies
after insert or update of publication_status on music.releases
for each row
execute function private.on_music_release_publish_consumer_dependencies();

-- Repair releases that were published before the dependency trigger existed.
do $block$
declare
  release_row record;
begin
  for release_row in
    select release.id, coalesce(release.updated_by, release.created_by) as actor_id
    from music.releases release
    where release.publication_status = 'published'::media.publication_status
  loop
    perform private.publish_music_release_consumer_dependencies(
      release_row.id,
      release_row.actor_id
    );
  end loop;
end;
$block$;
