-- `artist_id` was both a local variable and a column on the tables being
-- written, and qualifying it with the function name does not resolve that for a
-- declared variable. Renaming the locals removes the ambiguity outright.
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
      if nullif(trim(coalesce(link ->> 'url', '')), '') is not null then
        insert into music.artist_social_links (artist_id, platform, url, sort_order)
        values (
          v_artist_id,
          lower(trim(link ->> 'platform')),
          trim(link ->> 'url'),
          v_position
        )
        on conflict (artist_id, platform) do update
        set url = excluded.url,
            sort_order = excluded.sort_order,
            updated_at = now();
        v_position := v_position + 1;
      end if;
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

grant execute on function public.update_creator_artist_profile(uuid, text, text, text, jsonb, uuid[], uuid) to authenticated;
