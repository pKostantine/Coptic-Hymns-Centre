create or replace function public.is_chc_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin();
$$;

revoke all on function public.is_chc_admin() from public, anon;
grant execute on function public.is_chc_admin() to authenticated;
