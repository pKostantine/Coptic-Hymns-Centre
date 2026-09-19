-- Separate creator Releases from the submission/review inbox and expose
-- complete release-edit metadata. Also version profile-image responses so a
-- newly processed image never gets stuck behind an immutable browser cache.

create or replace function public.get_creator_releases(p_creator_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.can_edit_creator_account(p_creator_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', release.id,
        'title', release.title,
        'releaseType', release.release_type,
        'publicationStatus', release.publication_status,
        'scheduledReleaseAt', release.scheduled_release_at,
        'originalReleaseDate', release.original_release_date,
        'displayDate', music.release_display_date(
          release.original_release_date,
          release.scheduled_release_at,
          release.release_date
        ),
        'submissionId', submission.id,
        'submissionStatus', submission.status,
        'mediaReady', case
          when submission.id is null then release.publication_status = 'published'::media.publication_status
          else private.submission_required_items_ready(submission.id)
        end,
        'trackCount', (
          select count(*)::integer
          from music.release_tracks release_track
          where release_track.release_id = release.id
        ),
        'cover', (
          select jsonb_build_object(
            'assetId', asset.id,
            'bucket', asset.bucket,
            'path', asset.path,
            'version', extract(epoch from asset.updated_at)::bigint
          )
          from media.media_assets asset
          where asset.id = release.cover_asset_id
        ),
        'releaseState', case
          when release.publication_status = 'published'::media.publication_status then 'released'
          else 'ready'
        end
      )
      order by
        case when release.publication_status = 'published'::media.publication_status then 1 else 0 end,
        coalesce(release.scheduled_release_at, release.created_at) asc,
        release.created_at desc
    )
    from music.releases release
    left join media.submissions submission
      on submission.id = nullif(release.metadata ->> 'submissionId', '')::uuid
    where release.owner_creator_account_id = p_creator_account_id
      and (
        release.publication_status = 'published'::media.publication_status
        or (
          submission.status = 'approved'::media.publication_status
          and private.submission_required_items_ready(submission.id)
        )
      )
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.get_creator_release(p_release_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  release_record music.releases%rowtype;
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
      release_record.original_release_date, release_record.scheduled_release_at, release_record.release_date
    ),
    'earliestReleaseAt', public.earliest_release_at(),
    'primaryArtist', (
      select jsonb_build_object('id', artist.id, 'displayName', artist.display_name)
      from music.artists artist where artist.id = release_record.primary_artist_id
    ),
    'cover', (
      select jsonb_build_object(
        'assetId', asset.id,
        'bucket', asset.bucket,
        'path', asset.path,
        'version', extract(epoch from asset.updated_at)::bigint
      )
      from media.media_assets asset where asset.id = release_record.cover_asset_id
    ),
    'localizations', coalesce((
      select jsonb_agg(jsonb_build_object('locale', l.locale, 'title', l.title) order by l.is_primary desc, l.locale)
      from music.release_localizations l where l.release_id = release_record.id
    ), '[]'::jsonb),
    'tracks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', track.id,
        'trackNumber', rt.track_number,
        'discNumber', rt.disc_number,
        'title', track.title,
        'durationMs', track.duration_ms,
        'publicationStatus', track.publication_status,
        'hasMedia', track.media_asset_id is not null,
        'mainArtist', (
          select jsonb_build_object('id', a.id, 'displayName', a.display_name)
          from music.track_artists ta join music.artists a on a.id = ta.artist_id
          where ta.track_id = track.id and ta.role = 'primary'::music.track_artist_role
          limit 1
        ),
        'featuredArtists', coalesce((
          select jsonb_agg(jsonb_build_object('id', a.id, 'displayName', a.display_name) order by ta.sort_order)
          from music.track_artists ta join music.artists a on a.id = ta.artist_id
          where ta.track_id = track.id and ta.role = 'featured'::music.track_artist_role
        ), '[]'::jsonb)
      ) order by rt.disc_number, rt.track_number)
      from music.release_tracks rt
      join music.tracks track on track.id = rt.track_id
      where rt.release_id = release_record.id
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.update_creator_release_metadata(
  p_release_id uuid,
  p_music_type text default null,
  p_recording_type text default null,
  p_localized_titles jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_user_id uuid := auth.uid();
  account_id uuid;
  locale_entry record;
begin
  if request_user_id is null then
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

  update music.releases release
  set metadata =
        (coalesce(release.metadata, '{}'::jsonb) - 'musicType' - 'recordingType')
        || case
             when nullif(trim(coalesce(p_music_type, '')), '') is null then '{}'::jsonb
             else jsonb_build_object('musicType', trim(p_music_type))
           end
        || case
             when nullif(trim(coalesce(p_recording_type, '')), '') is null then '{}'::jsonb
             else jsonb_build_object('recordingType', trim(p_recording_type))
           end,
      updated_by = request_user_id,
      updated_at = now()
  where release.id = p_release_id;

  if p_localized_titles is not null then
    delete from music.release_localizations localization
    where localization.release_id = p_release_id
      and localization.locale in ('en', 'ar', 'fr');

    for locale_entry in
      select key as locale, trim(value) as title
      from jsonb_each_text(p_localized_titles)
      where key in ('en', 'ar', 'fr')
        and nullif(trim(value), '') is not null
    loop
      insert into music.release_localizations (
        release_id, locale, title, is_primary, created_by, updated_by
      )
      values (
        p_release_id,
        locale_entry.locale,
        locale_entry.title,
        locale_entry.locale = 'en',
        request_user_id,
        request_user_id
      );
    end loop;
  end if;
end;
$function$;

-- Rebuild the artist-profile reader only to add a cache-busting version to
-- profileImage and displayDate to pinned releases. Its visibility rules stay
-- the same as the existing profile RPC.
create or replace function public.get_creator_artist_profile(p_creator_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  artist_record music.artists%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.can_edit_creator_account(p_creator_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;

  select artist.*
  into artist_record
  from creator.creator_accounts account
  join music.artists artist on artist.id = account.identity_artist_id
  where account.id = p_creator_account_id;

  if not found then
    raise exception 'This account has no artist identity yet' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', artist_record.id,
    'displayName', artist_record.display_name,
    'sortName', artist_record.sort_name,
    'biography', artist_record.biography,
    'publicationStatus', artist_record.publication_status,
    'profileImage', (
      select jsonb_build_object(
        'assetId', asset.id,
        'bucket', asset.bucket,
        'path', asset.path,
        'version', extract(epoch from asset.updated_at)::bigint
      )
      from media.media_assets asset
      where asset.id = artist_record.profile_image_asset_id
    ),
    'profileImagePending', artist_record.metadata ->> 'pendingProfileImageUploadIntentId',
    'socialLinks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', link.id,
        'platform', link.platform,
        'label', link.label,
        'url', link.url
      ) order by link.sort_order, link.platform)
      from music.artist_social_links link
      where link.artist_id = artist_record.id
    ), '[]'::jsonb),
    'pinnedReleases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', release.id,
        'title', release.title,
        'releaseType', release.release_type,
        'publicationStatus', release.publication_status,
        'displayDate', music.release_display_date(
          release.original_release_date, release.scheduled_release_at, release.release_date
        )
      ) order by pinned.sort_order)
      from music.artist_pinned_releases pinned
      join music.releases release on release.id = pinned.release_id
      where pinned.artist_id = artist_record.id
    ), '[]'::jsonb),
    'releases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', release.id,
        'title', release.title,
        'releaseType', release.release_type,
        'publicationStatus', release.publication_status,
        'displayDate', music.release_display_date(
          release.original_release_date, release.scheduled_release_at, release.release_date
        )
      ) order by release.created_at desc)
      from music.releases release
      where release.owner_creator_account_id = p_creator_account_id
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_creator_releases(uuid) from public, anon;
revoke all on function public.update_creator_release_metadata(uuid, text, text, jsonb) from public, anon;

grant execute on function public.get_creator_releases(uuid) to authenticated;
grant execute on function public.get_creator_release(uuid) to authenticated;
grant execute on function public.update_creator_release_metadata(uuid, text, text, jsonb) to authenticated;
grant execute on function public.get_creator_artist_profile(uuid) to authenticated;
