-- Fix creator release editing fidelity, catalog artwork attachment, and artist/cantor images.

-- A creator release editor must return the exact localized track titles and all
-- named credits that were entered during submission.
create or replace function public.get_creator_release(p_release_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  release_record music.releases%rowtype;
  identity_artist_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into release_record
  from music.releases release
  where release.id = p_release_id;

  if not found then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  if not (select private.can_edit_creator_account(release_record.owner_creator_account_id)) then
    raise exception 'Not authorized for this release' using errcode = '42501';
  end if;

  select account.identity_artist_id
  into identity_artist_id
  from creator.creator_accounts account
  where account.id = release_record.owner_creator_account_id;

  return jsonb_build_object(
    'id', release_record.id,
    'title', release_record.title,
    'subtitle', release_record.subtitle,
    'description', release_record.description,
    'releaseType', release_record.release_type,
    'publicationStatus', release_record.publication_status,
    'musicType', release_record.metadata ->> 'musicType',
    'recordingType', release_record.metadata ->> 'recordingType',
    'scheduledReleaseAt', release_record.scheduled_release_at,
    'originalReleaseDate', release_record.original_release_date,
    'displayDate', music.release_display_date(
      release_record.original_release_date,
      release_record.scheduled_release_at,
      release_record.release_date
    ),
    'earliestReleaseAt', public.earliest_release_at(),
    'primaryArtist', (
      select jsonb_build_object('id', artist.id, 'displayName', artist.display_name)
      from music.artists artist
      where artist.id = release_record.primary_artist_id
    ),
    'cover', (
      select jsonb_build_object(
        'assetId', asset.id,
        'bucket', asset.bucket,
        'path', asset.path,
        'version', extract(epoch from asset.updated_at)::bigint
      )
      from media.media_assets asset
      where asset.id = release_record.cover_asset_id
    ),
    'localizations', coalesce((
      select jsonb_agg(
        jsonb_build_object('locale', l.locale, 'title', l.title)
        order by l.is_primary desc, l.locale
      )
      from music.release_localizations l
      where l.release_id = release_record.id
    ), '[]'::jsonb),
    'tracks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', track.id,
          'trackNumber', rt.track_number,
          'discNumber', rt.disc_number,
          'title', track.title,
          'durationMs', track.duration_ms,
          'publicationStatus', track.publication_status,
          'hasMedia', track.media_asset_id is not null,
          'localizedTitle', jsonb_build_object(
            'en', coalesce((select tl.title from music.track_localizations tl where tl.track_id = track.id and tl.locale = 'en' limit 1), ''),
            'ar', coalesce((select tl.title from music.track_localizations tl where tl.track_id = track.id and tl.locale = 'ar' limit 1), ''),
            'cop', coalesce((select tl.title from music.track_localizations tl where tl.track_id = track.id and tl.locale = 'cop' limit 1), ''),
            'fr', coalesce((select tl.title from music.track_localizations tl where tl.track_id = track.id and tl.locale = 'fr' limit 1), '')
          ),
          'mainArtistName', coalesce((
            select case when artist.id = identity_artist_id then '' else artist.display_name end
            from music.track_artists ta
            join music.artists artist on artist.id = ta.artist_id
            where ta.track_id = track.id
              and ta.role = 'primary'::music.track_artist_role
            order by ta.sort_order
            limit 1
          ), ''),
          'contributors', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', ta.artist_id::text || ':' || ta.role::text,
                'name', artist.display_name,
                'role', ta.role::text
              )
              order by ta.sort_order, artist.display_name
            )
            from music.track_artists ta
            join music.artists artist on artist.id = ta.artist_id
            where ta.track_id = track.id
              and ta.role <> 'primary'::music.track_artist_role
          ), '[]'::jsonb),
          'mainArtist', (
            select jsonb_build_object('id', artist.id, 'displayName', artist.display_name)
            from music.track_artists ta
            join music.artists artist on artist.id = ta.artist_id
            where ta.track_id = track.id
              and ta.role = 'primary'::music.track_artist_role
            order by ta.sort_order
            limit 1
          ),
          'featuredArtists', coalesce((
            select jsonb_agg(
              jsonb_build_object('id', artist.id, 'displayName', artist.display_name)
              order by ta.sort_order
            )
            from music.track_artists ta
            join music.artists artist on artist.id = ta.artist_id
            where ta.track_id = track.id
              and ta.role = 'featured'::music.track_artist_role
          ), '[]'::jsonb)
        )
        order by rt.disc_number, rt.track_number
      )
      from music.release_tracks rt
      join music.tracks track on track.id = rt.track_id
      where rt.release_id = release_record.id
    ), '[]'::jsonb)
  );
end;
$function$;

-- V2 keeps the existing release-edit lifecycle but applies the exact same
-- free-text credit model and localized track-title model as new submissions.
create or replace function public.update_creator_release_v2(
  p_release_id uuid,
  p_title text default null,
  p_description text default null,
  p_scheduled_release_at timestamptz default null,
  p_original_release_date date default null,
  p_clear_original_release_date boolean default false,
  p_localized_titles jsonb default null,
  p_music_type text default null,
  p_recording_type text default null,
  p_tracks jsonb default null,
  p_cover_upload_intent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  base_payload jsonb;
  account_id uuid;
  submission_id uuid;
  submission_status media.publication_status;
  entry jsonb;
  track_id uuid;
  position integer := 0;
  locale_entry record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select release.owner_creator_account_id
  into account_id
  from music.releases release
  where release.id = p_release_id;

  if account_id is null then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  if not (select private.can_edit_creator_account(account_id)) then
    raise exception 'Not authorized for this release' using errcode = '42501';
  end if;

  select nullif(release.metadata ->> 'submissionId', '')::uuid
  into submission_id
  from music.releases release
  where release.id = p_release_id;

  if submission_id is not null then
    select submission.status
    into submission_status
    from media.submissions submission
    where submission.id = submission_id
    for update;

    if submission_status is not null
       and submission_status not in (
         'draft'::media.publication_status,
         'uploading'::media.publication_status,
         'ready_to_submit'::media.publication_status,
         'changes_requested'::media.publication_status
       ) then
      update media.submissions submission
      set status = 'ready_to_submit'::media.publication_status,
          updated_by = auth.uid(),
          updated_at = now()
      where submission.id = submission_id;
    end if;
  end if;

  base_payload := public.update_creator_release(
    p_release_id,
    p_title,
    p_description,
    p_scheduled_release_at,
    p_original_release_date,
    p_clear_original_release_date,
    null,
    p_tracks,
    p_cover_upload_intent_id
  );

  perform public.update_creator_release_metadata(
    p_release_id,
    p_music_type,
    p_recording_type,
    p_localized_titles
  );

  if p_tracks is not null then
    for entry in
      select value
      from jsonb_array_elements(p_tracks)
      with ordinality as item(value, ordinality)
      order by item.ordinality
    loop
      position := position + 1;

      select rt.track_id
      into track_id
      from music.release_tracks rt
      where rt.release_id = p_release_id
        and rt.disc_number = 1
        and rt.track_number = position;

      if track_id is null then
        raise exception 'Could not resolve track % after release update', position;
      end if;

      perform private.set_track_credit_names(
        track_id,
        account_id,
        entry ->> 'mainArtistName',
        coalesce(entry -> 'contributors', '[]'::jsonb)
      );

      if entry ? 'localizedTitles' then
        delete from music.track_localizations tl
        where tl.track_id = track_id
          and tl.locale in ('en', 'ar', 'fr');

        for locale_entry in
          select key as locale, trim(value) as title
          from jsonb_each_text(coalesce(entry -> 'localizedTitles', '{}'::jsonb))
          where key in ('en', 'ar', 'fr')
            and nullif(trim(value), '') is not null
        loop
          insert into music.track_localizations (
            track_id, locale, title, is_primary, publication_status, created_by, updated_by
          )
          values (
            track_id,
            locale_entry.locale,
            locale_entry.title,
            locale_entry.locale = 'en',
            'draft'::media.publication_status,
            auth.uid(),
            auth.uid()
          )
          on conflict (track_id, locale) do update
          set title = excluded.title,
              is_primary = excluded.is_primary,
              updated_by = excluded.updated_by,
              updated_at = now();
        end loop;
      end if;
    end loop;
  end if;

  return public.get_creator_release(p_release_id);
end;
$function$;

revoke all on function public.update_creator_release_v2(
  uuid, text, text, timestamptz, date, boolean, jsonb, text, text, jsonb, uuid
) from public, anon;
grant execute on function public.update_creator_release_v2(
  uuid, text, text, timestamptz, date, boolean, jsonb, text, text, jsonb, uuid
) to authenticated;

-- A published release should always adopt the processed artwork from the
-- submission and publish every image that the public consumer is expected to show.
create or replace function private.prepare_music_release_artwork_for_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  submission_id uuid;
  artwork_asset_id uuid;
begin
  if new.publication_status <> 'published'::media.publication_status then
    return new;
  end if;

  submission_id := nullif(new.metadata ->> 'submissionId', '')::uuid;

  if new.cover_asset_id is null and submission_id is not null then
    select item.media_asset_id
    into artwork_asset_id
    from media.submission_items item
    where item.submission_id = submission_id
      and item.role = 'artwork'::media.submission_item_role
      and item.media_asset_id is not null
    order by item.sort_order, item.created_at desc
    limit 1;

    if artwork_asset_id is not null then
      new.cover_asset_id := artwork_asset_id;
    end if;
  end if;

  if new.cover_asset_id is not null then
    update media.media_assets asset
    set publication_status = 'published'::media.publication_status,
        updated_at = now()
    where asset.id = new.cover_asset_id
      and asset.processing_status = 'completed'::media.processing_status;
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
          select ta.artist_id
          from music.release_tracks rt
          join music.track_artists ta on ta.track_id = rt.track_id
          where rt.release_id = new.id
        )
      )
  )
    and asset.processing_status = 'completed'::media.processing_status;

  return new;
end;
$function$;

drop trigger if exists music_release_prepare_artwork_for_publication on music.releases;
create trigger music_release_prepare_artwork_for_publication
before insert or update of publication_status on music.releases
for each row
execute function private.prepare_music_release_artwork_for_publication();

-- If a profile picture is uploaded after an artist/cantor is already public,
-- make that image public immediately instead of waiting for another release.
create or replace function private.publish_public_profile_image()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.publication_status = 'published'::media.publication_status
     and new.profile_image_asset_id is not null then
    update media.media_assets asset
    set publication_status = 'published'::media.publication_status,
        updated_at = now()
    where asset.id = new.profile_image_asset_id
      and asset.processing_status = 'completed'::media.processing_status;
  end if;
  return new;
end;
$function$;

drop trigger if exists music_artist_publish_profile_image on music.artists;
create trigger music_artist_publish_profile_image
after insert or update of profile_image_asset_id, publication_status on music.artists
for each row execute function private.publish_public_profile_image();

drop trigger if exists learning_cantor_publish_profile_image on learning.cantors;
create trigger learning_cantor_publish_profile_image
after insert or update of profile_image_asset_id, publication_status on learning.cantors
for each row execute function private.publish_public_profile_image();

-- When the same person exists as both a Music artist and a Learn cantor, reuse
-- the artist's profile art instead of showing an empty cantor card.
with preferred_artist as (
  select distinct on (lower(trim(artist.display_name)))
    lower(trim(artist.display_name)) as name_key,
    artist.profile_image_asset_id
  from music.artists artist
  where artist.profile_image_asset_id is not null
  order by lower(trim(artist.display_name)),
           (artist.publication_status = 'published'::media.publication_status) desc,
           (artist.owner_creator_account_id is not null) desc,
           artist.updated_at desc
)
update learning.cantors cantor
set profile_image_asset_id = preferred.profile_image_asset_id,
    updated_at = now()
from preferred_artist preferred
where cantor.profile_image_asset_id is null
  and lower(trim(cantor.display_name)) = preferred.name_key;

create or replace function private.sync_music_artist_image_to_learning_cantor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.profile_image_asset_id is not null then
    update learning.cantors cantor
    set profile_image_asset_id = new.profile_image_asset_id,
        updated_at = now()
    where cantor.profile_image_asset_id is null
      and lower(trim(cantor.display_name)) = lower(trim(new.display_name));
  end if;
  return new;
end;
$function$;

drop trigger if exists music_artist_sync_learning_cantor_image on music.artists;
create trigger music_artist_sync_learning_cantor_image
after insert or update of profile_image_asset_id, display_name on music.artists
for each row execute function private.sync_music_artist_image_to_learning_cantor();

-- Backfill already-published releases and artists from their existing processed
-- submission/profile assets.
with release_artwork as (
  select
    release.id as release_id,
    (
      select item.media_asset_id
      from media.submission_items item
      where item.submission_id = nullif(release.metadata ->> 'submissionId', '')::uuid
        and item.role = 'artwork'::media.submission_item_role
        and item.media_asset_id is not null
      order by item.sort_order, item.created_at desc
      limit 1
    ) as asset_id
  from music.releases release
  where release.cover_asset_id is null
)
update music.releases release
set cover_asset_id = artwork.asset_id,
    updated_at = now()
from release_artwork artwork
where release.id = artwork.release_id
  and artwork.asset_id is not null;

update media.media_assets asset
set publication_status = 'published'::media.publication_status,
    updated_at = now()
where asset.processing_status = 'completed'::media.processing_status
  and (
    asset.id in (
      select release.cover_asset_id
      from music.releases release
      where release.publication_status = 'published'::media.publication_status
        and release.cover_asset_id is not null
    )
    or asset.id in (
      select artist.profile_image_asset_id
      from music.artists artist
      where artist.publication_status = 'published'::media.publication_status
        and artist.profile_image_asset_id is not null
    )
    or asset.id in (
      select cantor.profile_image_asset_id
      from learning.cantors cantor
      where cantor.publication_status = 'published'::media.publication_status
        and cantor.profile_image_asset_id is not null
    )
  );

-- Worker context used to preserve profile-picture pixels exactly for normal web
-- image formats instead of transcoding them through the album-art pipeline.
create or replace function public.get_media_worker_image_context(
  p_worker_token text,
  p_upload_intent_id uuid
)
returns table(is_profile_image boolean)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.verify_media_worker_token(p_worker_token) then
    raise exception 'Invalid media worker token' using errcode = '28000';
  end if;

  return query
  select exists (
    select 1
    from music.artists artist
    left join media.media_assets asset on asset.id = artist.profile_image_asset_id
    where artist.metadata ->> 'pendingProfileImageUploadIntentId' = p_upload_intent_id::text
       or asset.metadata ->> 'sourceUploadIntentId' = p_upload_intent_id::text
  );
end;
$function$;

revoke all on function public.get_media_worker_image_context(text, uuid) from public, authenticated;
grant execute on function public.get_media_worker_image_context(text, uuid) to anon, service_role;
