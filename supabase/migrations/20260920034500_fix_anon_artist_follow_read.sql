create or replace function public.get_artist_followed(p_artist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    else exists (
      select 1
      from music.artist_follows follow
      where follow.user_id = auth.uid()
        and follow.artist_id = p_artist_id
    )
  end;
$$;

revoke all on function public.get_artist_followed(uuid) from public;
grant execute on function public.get_artist_followed(uuid) to anon, authenticated;
