/**
 * Reads the profile an account edits: its own identity artist.
 */
create or replace function public.get_creator_artist_profile(p_creator_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
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
      select jsonb_build_object('assetId', asset.id, 'bucket', asset.bucket, 'path', asset.path)
      from media.media_assets asset
      where asset.id = artist_record.profile_image_asset_id
    ),
    -- A picture that is still transcoding, so the screen can say so rather than
    -- looking like the upload was lost.
    'profileImagePending', artist_record.metadata ->> 'pendingProfileImageUploadIntentId',
    'socialLinks', coalesce((
      select jsonb_agg(jsonb_build_object('platform', link.platform, 'url', link.url)
                       order by link.sort_order, link.platform)
      from music.artist_social_links link
      where link.artist_id = artist_record.id
    ), '[]'::jsonb),
    'pinnedReleases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', release.id,
        'title', release.title,
        'releaseType', release.release_type,
        'publicationStatus', release.publication_status
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

grant execute on function public.get_creator_artist_profile(uuid) to authenticated;

/**
 * Updates the account's own artist profile.
 *
 * Every argument is optional and null means "leave alone", so a screen can save
 * one field without resending the rest. Social links and pins are replaced
 * wholesale when supplied, because that is how the editor presents them.
 *
 * A profile picture arrives as an upload intent: the image still has to be
 * transcoded, so the intent is queued and recorded, and the finished asset is
 * attached when processing completes.
 */
create or replace function public.update_creator_artist_profile(
  p_creator_account_id uuid,
  p_display_name text default null,
  p_sort_name text default null,
  p_biography text default null,
  p_social_links jsonb default null,
  p_pinned_release_ids uuid[] default null,
  p_profile_image_upload_intent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  request_user_id uuid := auth.uid();
  artist_id uuid;
  clean_name text := nullif(trim(coalesce(p_display_name, '')), '');
  link jsonb;
  position integer := 0;
  release_id uuid;
  intent_record media.upload_intents%rowtype;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.can_edit_creator_account(p_creator_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;

  select account.identity_artist_id into artist_id
  from creator.creator_accounts account
  where account.id = p_creator_account_id;

  if artist_id is null then
    raise exception 'This account has no artist identity yet' using errcode = 'P0002';
  end if;

  update music.artists artist
  set display_name = coalesce(clean_name, artist.display_name),
      sort_name = coalesce(nullif(trim(coalesce(p_sort_name, '')), ''), artist.sort_name),
      biography = case when p_biography is null then artist.biography else nullif(trim(p_biography), '') end,
      updated_by = request_user_id,
      updated_at = now()
  where artist.id = artist_id;

  -- The account is the artist, so renaming one renames the other.
  if clean_name is not null then
    update creator.creator_accounts account
    set display_name = clean_name,
        updated_by = request_user_id,
        updated_at = now()
    where account.id = p_creator_account_id;
  end if;

  if p_social_links is not null then
    if jsonb_typeof(p_social_links) <> 'array' then
      raise exception 'Social links must be a list' using errcode = '22023';
    end if;

    delete from music.artist_social_links where artist_social_links.artist_id = update_creator_artist_profile.artist_id;

    for link in select value from jsonb_array_elements(p_social_links)
    loop
      if nullif(trim(coalesce(link ->> 'url', '')), '') is not null then
        insert into music.artist_social_links (artist_id, platform, url, sort_order)
        values (
          update_creator_artist_profile.artist_id,
          lower(trim(link ->> 'platform')),
          trim(link ->> 'url'),
          position
        )
        on conflict (artist_id, platform) do update
        set url = excluded.url,
            sort_order = excluded.sort_order,
            updated_at = now();
        position := position + 1;
      end if;
    end loop;
  end if;

  if p_pinned_release_ids is not null then
    delete from music.artist_pinned_releases
    where artist_pinned_releases.artist_id = update_creator_artist_profile.artist_id;

    position := 0;
    foreach release_id in array p_pinned_release_ids
    loop
      -- You can only pin your own work.
      if exists (
        select 1 from music.releases release
        where release.id = release_id
          and release.owner_creator_account_id = p_creator_account_id
      ) then
        insert into music.artist_pinned_releases (artist_id, release_id, sort_order)
        values (update_creator_artist_profile.artist_id, release_id, position)
        on conflict (artist_id, release_id) do update set sort_order = excluded.sort_order;
        position := position + 1;
      end if;
    end loop;
  end if;

  if p_profile_image_upload_intent_id is not null then
    select * into intent_record
    from media.upload_intents intent
    where intent.id = p_profile_image_upload_intent_id;

    if not found or intent_record.creator_account_id <> p_creator_account_id then
      raise exception 'Profile picture upload not found for this account' using errcode = 'P0002';
    end if;

    if intent_record.media_type <> 'image'::media.media_type then
      raise exception 'A profile picture must be an image' using errcode = '22023';
    end if;

    perform public.enqueue_media_processing_job(
      p_profile_image_upload_intent_id,
      'image_delivery'::media.processing_job_type,
      'chc-images'
    );

    update music.artists artist
    set metadata = coalesce(artist.metadata, '{}'::jsonb)
                   || jsonb_build_object('pendingProfileImageUploadIntentId', p_profile_image_upload_intent_id),
        updated_by = request_user_id,
        updated_at = now()
    where artist.id = artist_id;
  end if;

  return public.get_creator_artist_profile(p_creator_account_id);
end;
$function$;

grant execute on function public.update_creator_artist_profile(uuid, text, text, text, jsonb, uuid[], uuid) to authenticated;
