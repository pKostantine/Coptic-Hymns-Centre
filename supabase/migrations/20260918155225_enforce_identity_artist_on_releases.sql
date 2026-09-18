-- A release belongs to the account's own identity. This is the rule that makes
-- CHC Artists different from Spotify for Artists: you cannot put a record out
-- under a name that is not yours.
create or replace function private.enforce_release_identity_artist()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  identity_id uuid;
  account_name text;
begin
  if new.owner_creator_account_id is null or new.primary_artist_id is null then
    return new;
  end if;

  select account.identity_artist_id, account.display_name
  into identity_id, account_name
  from creator.creator_accounts account
  where account.id = new.owner_creator_account_id;

  if identity_id is null then
    raise exception 'Creator account % has no artist identity yet', coalesce(account_name, new.owner_creator_account_id::text)
      using errcode = '22023';
  end if;

  if new.primary_artist_id <> identity_id then
    raise exception 'A release can only be published under its own account''s artist identity'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists releases_enforce_identity_artist on music.releases;

create trigger releases_enforce_identity_artist
before insert or update of owner_creator_account_id, primary_artist_id
on music.releases
for each row
execute function private.enforce_release_identity_artist();

-- Onboarding now hands a new account the artist it releases as, so it can put
-- something out without an administrator wiring anything up.
create or replace function public.ensure_creator_workspace(p_display_name text default null::text)
returns table(creator_account_id uuid, display_name text)
language plpgsql
security definer
set search_path to ''
as $function$
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
    insert into music.artists (owner_creator_account_id, display_name, created_by, updated_by)
    values (account_id, coalesce(account_name, resolved_name), request_user_id, request_user_id)
    returning id into identity_id;

    update creator.creator_accounts account
    set identity_artist_id = identity_id,
        updated_by = request_user_id,
        updated_at = now()
    where account.id = account_id;
  end if;

  return query select account_id, account_name;
end;
$function$;

-- An account cannot mint more artists to release as. What it can create is a
-- credit-only artist: a guest or cantor it can credit on a track.
create or replace function public.create_creator_artist(p_creator_account_id uuid, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  request_user_id uuid := auth.uid();
  new_id uuid := gen_random_uuid();
  clean_name text := nullif(trim(coalesce(p_display_name, '')), '');
  existing_id uuid;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if clean_name is null then
    raise exception 'Artist name is required' using errcode = '22023';
  end if;

  if not (select private.can_edit_creator_account(p_creator_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;

  -- Reuse an existing artist of the same name rather than creating a duplicate
  -- credit: two "Cantor Tharwat" rows would split his catalogue in half.
  select artist.id into existing_id
  from music.artists artist
  where lower(artist.display_name) = lower(clean_name)
  order by artist.owner_creator_account_id nulls last, artist.created_at
  limit 1;

  if existing_id is not null then
    return (
      select jsonb_build_object(
        'id', artist.id,
        'title', artist.display_name,
        'subtitle', case when artist.is_credit_only then 'credit only' else 'artist' end
      )
      from music.artists artist
      where artist.id = existing_id
    );
  end if;

  insert into music.artists (id, owner_creator_account_id, display_name, created_by, updated_by)
  values (new_id, null, clean_name, request_user_id, request_user_id);

  return jsonb_build_object('id', new_id, 'title', clean_name, 'subtitle', 'credit only');
end;
$function$;

grant execute on function public.create_creator_artist(uuid, text) to authenticated;
