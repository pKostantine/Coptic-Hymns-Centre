-- Artist profile reliability and link cleanup.
--
-- Adds Linktree and named custom links, validates known platform URLs on the
-- server, and returns link labels/ids to the Artists profile editor.

alter table music.artist_social_links
  add column if not exists label text;

alter table music.artist_social_links
  drop constraint if exists artist_social_links_platform_known;

alter table music.artist_social_links
  add constraint artist_social_links_platform_known check (
    platform in (
      'website', 'linktree', 'youtube', 'soundcloud', 'spotify',
      'apple_music', 'facebook', 'instagram', 'tiktok', 'x', 'bandcamp'
    )
    or platform like 'custom:%'
  );

alter table music.artist_social_links
  drop constraint if exists artist_social_links_custom_label_required;

alter table music.artist_social_links
  add constraint artist_social_links_custom_label_required check (
    platform not like 'custom:%'
    or nullif(trim(label), '') is not null
  );

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
  v_artist_id uuid;
  clean_name text := nullif(trim(coalesce(p_display_name, '')), '');
  link jsonb;
  v_platform text;
  v_label text;
  v_url text;
  v_position integer := 0;
  v_release_id uuid;
  intent_record media.upload_intents%rowtype;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.can_edit_creator_account(p_creator_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;

  select account.identity_artist_id into v_artist_id
  from creator.creator_accounts account
  where account.id = p_creator_account_id;

  if v_artist_id is null then
    raise exception 'This account has no artist identity yet' using errcode = 'P0002';
  end if;

  update music.artists artist
  set display_name = coalesce(clean_name, artist.display_name),
      sort_name = coalesce(nullif(trim(coalesce(p_sort_name, '')), ''), artist.sort_name),
      biography = case when p_biography is null then artist.biography else nullif(trim(p_biography), '') end,
      updated_by = request_user_id,
      updated_at = now()
  where artist.id = v_artist_id;

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

    delete from music.artist_social_links link_row where link_row.artist_id = v_artist_id;

    for link in select value from jsonb_array_elements(p_social_links)
    loop
      v_platform := lower(trim(coalesce(link ->> 'platform', '')));
      v_label := nullif(trim(coalesce(link ->> 'label', '')), '');
      v_url := nullif(trim(coalesce(link ->> 'url', '')), '');

      if v_url is null then
        continue;
      end if;

      if v_url !~* '^https?://' then
        v_url := 'https://' || v_url;
      end if;

      if v_url !~* '^https?://[^[:space:]]+$' then
        raise exception 'Enter a valid web link for %', coalesce(v_label, v_platform)
          using errcode = '22023';
      end if;

      if v_platform not in (
        'website', 'linktree', 'youtube', 'soundcloud', 'spotify',
        'apple_music', 'facebook', 'instagram', 'tiktok', 'x', 'bandcamp'
      ) and v_platform not like 'custom:%' then
        raise exception 'Unknown artist link type: %', v_platform using errcode = '22023';
      end if;

      if v_platform like 'custom:%' and v_label is null then
        raise exception 'Extra links need a name' using errcode = '22023';
      end if;

      if v_platform = 'linktree'
         and v_url !~* '^https?://(www\.)?linktr\.ee(/|$)' then
        raise exception 'The Linktree field must contain a linktr.ee URL' using errcode = '22023';
      elsif v_platform = 'youtube'
         and v_url !~* '^https?://(([^/]+\.)?youtube\.com|youtu\.be)(/|$)' then
        raise exception 'The YouTube field must contain a YouTube URL' using errcode = '22023';
      elsif v_platform = 'soundcloud'
         and v_url !~* '^https?://([^/]+\.)?soundcloud\.com(/|$)' then
        raise exception 'The SoundCloud field must contain a SoundCloud URL' using errcode = '22023';
      elsif v_platform = 'spotify'
         and v_url !~* '^https?://(([^/]+\.)?spotify\.com|spotify\.link)(/|$)' then
        raise exception 'The Spotify field must contain a Spotify URL' using errcode = '22023';
      elsif v_platform = 'apple_music'
         and v_url !~* '^https?://music\.apple\.com(/|$)' then
        raise exception 'The Apple Music field must contain a music.apple.com URL' using errcode = '22023';
      elsif v_platform = 'facebook'
         and v_url !~* '^https?://(([^/]+\.)?facebook\.com|fb\.com|fb\.me)(/|$)' then
        raise exception 'The Facebook field must contain a Facebook URL' using errcode = '22023';
      elsif v_platform = 'instagram'
         and v_url !~* '^https?://([^/]+\.)?instagram\.com(/|$)' then
        raise exception 'The Instagram field must contain an Instagram URL' using errcode = '22023';
      end if;

      insert into music.artist_social_links (artist_id, platform, label, url, sort_order)
      values (
        v_artist_id,
        v_platform,
        case when v_platform like 'custom:%' then v_label else null end,
        v_url,
        v_position
      )
      on conflict (artist_id, platform) do update
      set label = excluded.label,
          url = excluded.url,
          sort_order = excluded.sort_order,
          updated_at = now();

      v_position := v_position + 1;
    end loop;
  end if;

  if p_pinned_release_ids is not null then
    delete from music.artist_pinned_releases pin_row where pin_row.artist_id = v_artist_id;

    v_position := 0;
    foreach v_release_id in array p_pinned_release_ids
    loop
      -- You can only pin your own work.
      if exists (
        select 1 from music.releases release
        where release.id = v_release_id
          and release.owner_creator_account_id = p_creator_account_id
      ) then
        insert into music.artist_pinned_releases (artist_id, release_id, sort_order)
        values (v_artist_id, v_release_id, v_position)
        on conflict (artist_id, release_id) do update set sort_order = excluded.sort_order;
        v_position := v_position + 1;
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
    where artist.id = v_artist_id;
  end if;

  return public.get_creator_artist_profile(p_creator_account_id);
end;
$function$;

revoke all on function public.get_creator_artist_profile(uuid) from public, anon;
grant execute on function public.get_creator_artist_profile(uuid) to authenticated;

revoke all on function public.update_creator_artist_profile(uuid, text, text, text, jsonb, uuid[], uuid) from public, anon;
grant execute on function public.update_creator_artist_profile(uuid, text, text, text, jsonb, uuid[], uuid) to authenticated;
