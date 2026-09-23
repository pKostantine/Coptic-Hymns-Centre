-- Safe automatic claiming: reuse historic credit records only when the
-- future account is authenticated as the very user who originally created them.
-- Matches created by another user remain suggestions for review, not ownership.
CREATE OR REPLACE FUNCTION public.ensure_creator_workspace(p_display_name text DEFAULT NULL::text)
 RETURNS TABLE(creator_account_id uuid, display_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  request_user_id uuid := auth.uid();
  account_id uuid;
  account_name text;
  resolved_name text;
  identity_id uuid;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select coalesce(
    nullif(trim(p_display_name), ''),
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'CHC Creator'
  )
  into resolved_name
  from auth.users u
  where u.id = request_user_id;

  if resolved_name is null then
    resolved_name := 'CHC Creator';
  end if;

  insert into creator.profiles (id, display_name)
  values (request_user_id, resolved_name)
  on conflict (id) do update
  set display_name = coalesce(creator.profiles.display_name, excluded.display_name),
      updated_at = now();

  insert into creator.user_roles (user_id, role, granted_by, granted_at, revoked_at, notes)
  values (
    request_user_id,
    'creator'::creator.app_role,
    request_user_id,
    now(),
    null,
    'Self-service CHC Artists onboarding'
  )
  on conflict (user_id, role) do update
  set granted_by = request_user_id,
      granted_at = now(),
      revoked_at = null,
      notes = 'Self-service CHC Artists onboarding';

  select member.creator_account_id, account.display_name
  into account_id, account_name
  from creator.creator_account_members member
  join creator.creator_accounts account on account.id = member.creator_account_id
  where member.user_id = request_user_id
    and account.status = 'active'::creator.creator_account_status
  order by member.created_at
  limit 1;

  if account_id is null then
    insert into creator.creator_accounts (
      display_name,
      status,
      created_by,
      updated_by
    )
    values (
      resolved_name,
      'active'::creator.creator_account_status,
      request_user_id,
      request_user_id
    )
    returning id, creator.creator_accounts.display_name
    into account_id, account_name;

    insert into creator.creator_account_members (
      creator_account_id,
      user_id,
      role,
      invited_by
    )
    values (
      account_id,
      request_user_id,
      'owner'::creator.creator_account_role,
      request_user_id
    );
  end if;

  select account.identity_artist_id into identity_id
  from creator.creator_accounts account
  where account.id = account_id;

  if identity_id is null then
    -- A creator may have been credited by this same authenticated user before
    -- creating their own CHC Artists workspace. Reclaim that exact unowned
    -- credit so historic music.track_artists links remain intact. A matching
    -- name created by another user is NEVER sufficient to transfer ownership.
    select artist.id into identity_id
    from music.artists artist
    where artist.owner_creator_account_id is null
      and artist.created_by=request_user_id
      and private.normalize_creator_name(artist.display_name)=
        private.normalize_creator_name(coalesce(account_name,resolved_name))
    order by artist.publication_status='published'::media.publication_status desc,
      artist.created_at
    limit 1 for update;

    if identity_id is not null then
      update music.artists artist
      set owner_creator_account_id=account_id,
          is_credit_only=false,
          updated_by=request_user_id,
          updated_at=now()
      where artist.id=identity_id;
    else
      insert into music.artists (owner_creator_account_id, display_name, created_by, updated_by)
      values (account_id, coalesce(account_name, resolved_name), request_user_id, request_user_id)
      returning id into identity_id;
    end if;

    update creator.creator_accounts account
    set identity_artist_id = identity_id,
        updated_by = request_user_id,
        updated_at = now()
    where account.id = account_id;
  end if;

  return query select account_id, account_name;
end;
$function$
;
