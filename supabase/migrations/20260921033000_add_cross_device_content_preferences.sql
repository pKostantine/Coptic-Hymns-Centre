create table if not exists public.user_content_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  bookmarks text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_content_preferences_object_check
    check (jsonb_typeof(preferences) = 'object'),
  constraint user_content_preferences_size_check
    check (octet_length(preferences::text) <= 131072),
  constraint user_content_preferences_bookmark_count_check
    check (cardinality(bookmarks) <= 500)
);

alter table public.user_content_preferences enable row level security;

drop policy if exists user_content_preferences_select_own on public.user_content_preferences;
create policy user_content_preferences_select_own
  on public.user_content_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_content_preferences_insert_own on public.user_content_preferences;
create policy user_content_preferences_insert_own
  on public.user_content_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists user_content_preferences_update_own on public.user_content_preferences;
create policy user_content_preferences_update_own
  on public.user_content_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.user_content_preferences from public, anon;
grant select, insert, update on table public.user_content_preferences to authenticated;

create or replace function public.get_my_content_preferences()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  payload jsonb;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'exists', true,
    'preferences', account_preferences.preferences,
    'bookmarks', to_jsonb(account_preferences.bookmarks),
    'updatedAt', account_preferences.updated_at
  )
  into payload
  from public.user_content_preferences account_preferences
  where account_preferences.user_id = request_user_id;

  return coalesce(payload, jsonb_build_object(
    'exists', false,
    'preferences', '{}'::jsonb,
    'bookmarks', '[]'::jsonb,
    'updatedAt', null
  ));
end;
$$;

create or replace function public.save_my_content_preferences(
  p_preferences jsonb,
  p_bookmarks text[] default '{}'::text[]
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  clean_bookmarks text[];
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(coalesce(p_preferences, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_preferences, '{}'::jsonb)::text) > 131072 then
    raise exception 'Invalid content preferences' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_bookmarks, '{}'::text[])) > 500 then
    raise exception 'Too many bookmarks' using errcode = '22023';
  end if;

  select coalesce(array_agg(bookmark order by first_position), '{}'::text[])
  into clean_bookmarks
  from (
    select trim(candidate.bookmark) as bookmark, min(candidate.position) as first_position
    from unnest(coalesce(p_bookmarks, '{}'::text[])) with ordinality candidate(bookmark, position)
    where length(trim(candidate.bookmark)) between 1 and 512
    group by trim(candidate.bookmark)
  ) normalized;

  insert into public.user_content_preferences (user_id, preferences, bookmarks)
  values (request_user_id, coalesce(p_preferences, '{}'::jsonb), clean_bookmarks)
  on conflict (user_id) do update
  set preferences = excluded.preferences,
      bookmarks = excluded.bookmarks,
      updated_at = now();

  return true;
end;
$$;

revoke all on function public.get_my_content_preferences() from public;
revoke all on function public.save_my_content_preferences(jsonb, text[]) from public;
grant execute on function public.get_my_content_preferences() to authenticated;
grant execute on function public.save_my_content_preferences(jsonb, text[]) to authenticated;
