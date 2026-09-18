-- Nothing turned a submission's audio into music.tracks, so a release reached
-- publication with no songs in it and there was nothing for a credit to attach
-- to. A submission item now points at the track it becomes, created at
-- submission time so credits exist while the release is still under review.
alter table media.submission_items
  add column if not exists music_track_id uuid references music.tracks(id) on delete set null;

create index if not exists submission_items_music_track_id_idx
  on media.submission_items (music_track_id)
  where music_track_id is not null;

comment on column media.submission_items.music_track_id is
  'The music.tracks row this item becomes. Set when a music submission is created; its media asset is attached once processing completes.';

/**
 * Replaces a track's credits wholesale.
 *
 * The main artist defaults to the posting account's own identity, so the common
 * case needs no input at all. Featured artists are per track, and may be any
 * artist in the catalogue including credit-only ones.
 */
create or replace function private.set_track_credits(
  p_track_id uuid,
  p_owner_account_id uuid,
  p_main_artist_id uuid default null,
  p_featured_artist_ids uuid[] default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  resolved_main uuid;
  featured_id uuid;
  position integer := 1;
begin
  select coalesce(p_main_artist_id, account.identity_artist_id)
  into resolved_main
  from creator.creator_accounts account
  where account.id = p_owner_account_id;

  if resolved_main is null then
    raise exception 'No main artist for this track and the account has no artist identity'
      using errcode = '22023';
  end if;

  if not exists (select 1 from music.artists artist where artist.id = resolved_main) then
    raise exception 'Main artist not found' using errcode = 'P0002';
  end if;

  delete from music.track_artists
  where track_id = p_track_id
    and role in ('primary'::music.track_artist_role, 'featured'::music.track_artist_role);

  insert into music.track_artists (track_id, artist_id, role, sort_order)
  values (p_track_id, resolved_main, 'primary'::music.track_artist_role, 0);

  foreach featured_id in array coalesce(p_featured_artist_ids, array[]::uuid[])
  loop
    -- A featured credit that repeats the main artist is noise, and the same
    -- guest listed twice would violate the primary key.
    if featured_id is not null and featured_id <> resolved_main then
      insert into music.track_artists (track_id, artist_id, role, sort_order)
      values (p_track_id, featured_id, 'featured'::music.track_artist_role, position)
      on conflict (track_id, artist_id, role) do nothing;
      position := position + 1;
    end if;
  end loop;
end;
$function$;
