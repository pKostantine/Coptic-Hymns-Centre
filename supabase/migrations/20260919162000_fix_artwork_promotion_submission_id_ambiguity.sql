-- Fix PL/pgSQL ambiguity inside artwork promotion trigger.
create or replace function private.prepare_music_release_artwork_for_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_submission_id uuid;
  newest_artwork_id uuid;
  old_artwork_id uuid;
begin
  if new.publication_status <> 'published'::media.publication_status then
    return new;
  end if;

  v_submission_id := nullif(new.metadata ->> 'submissionId', '')::uuid;
  old_artwork_id := new.cover_asset_id;

  if v_submission_id is not null then
    select item.media_asset_id
    into newest_artwork_id
    from media.submission_items item
    join media.media_assets asset
      on asset.id = item.media_asset_id
     and asset.processing_status = 'completed'::media.processing_status
    where item.submission_id = v_submission_id
      and item.role = 'artwork'::media.submission_item_role
      and item.media_asset_id is not null
    order by item.created_at desc, item.id desc
    limit 1;

    if newest_artwork_id is not null then
      new.cover_asset_id := newest_artwork_id;
    end if;
  end if;

  if new.cover_asset_id is not null then
    update media.media_assets asset
    set publication_status = 'published'::media.publication_status,
        updated_at = now()
    where asset.id = new.cover_asset_id
      and asset.processing_status = 'completed'::media.processing_status;
  end if;

  if old_artwork_id is not null
     and new.cover_asset_id is distinct from old_artwork_id
     and not exists (
       select 1
       from music.releases other_release
       where other_release.id <> new.id
         and other_release.cover_asset_id = old_artwork_id
     )
     and not exists (
       select 1 from music.artists artist where artist.profile_image_asset_id = old_artwork_id
     )
     and not exists (
       select 1 from learning.cantors cantor where cantor.profile_image_asset_id = old_artwork_id
     ) then
    update media.media_assets asset
    set publication_status = 'archived'::media.publication_status,
        updated_at = now()
    where asset.id = old_artwork_id;
  end if;

  update media.media_assets asset
  set publication_status = 'published'::media.publication_status,
      updated_at = now()
  where asset.id in (
    select artist.profile_image_asset_id
    from music.artists artist
    where artist.profile_image_asset_id is not null
      and (
        artist.id = new.primary_artist_id
        or artist.id in (
          select track_artist.artist_id
          from music.release_tracks release_track
          join music.track_artists track_artist on track_artist.track_id = release_track.track_id
          where release_track.release_id = new.id
        )
      )
  )
    and asset.processing_status = 'completed'::media.processing_status;

  return new;
end;
$function$;
