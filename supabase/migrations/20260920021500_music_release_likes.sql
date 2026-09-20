-- Album/EP-level favourites used by the consumer release page.
create table if not exists music.release_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  release_id uuid not null references music.releases(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, release_id)
);

create index if not exists release_likes_release_idx
  on music.release_likes(release_id);

alter table music.release_likes enable row level security;

drop policy if exists release_likes_select_own on music.release_likes;
create policy release_likes_select_own
  on music.release_likes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists release_likes_insert_own on music.release_likes;
create policy release_likes_insert_own
  on music.release_likes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists release_likes_delete_own on music.release_likes;
create policy release_likes_delete_own
  on music.release_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.get_release_liked(p_release_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, music, auth
as $$
  select case
    when auth.uid() is null then false
    else exists (
      select 1
      from music.release_likes liked
      where liked.user_id = auth.uid()
        and liked.release_id = p_release_id
    )
  end;
$$;

create or replace function public.set_release_liked(
  p_release_id uuid,
  p_liked boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, music, media, auth
as $$
declare
  request_user_id uuid := auth.uid();
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from music.releases release
    where release.id = p_release_id
      and release.publication_status::text = 'published'
  ) then
    raise exception 'Published release not found' using errcode = '22023';
  end if;

  if coalesce(p_liked, false) then
    insert into music.release_likes (user_id, release_id)
    values (request_user_id, p_release_id)
    on conflict (user_id, release_id) do nothing;
    return true;
  end if;

  delete from music.release_likes
  where user_id = request_user_id
    and release_id = p_release_id;

  return false;
end;
$$;

revoke all on function public.get_release_liked(uuid) from public;
revoke all on function public.set_release_liked(uuid, boolean) from public;
grant execute on function public.get_release_liked(uuid) to anon, authenticated;
grant execute on function public.set_release_liked(uuid, boolean) to authenticated;
