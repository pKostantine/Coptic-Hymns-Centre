-- Root cause of the persistent CHC Artists Submissions banner:
-- get_creator_dashboard is a SECURITY INVOKER by default, and calling the
-- owner-verification helper raises 42501 because private has no USAGE for
-- authenticated users. Keep private inaccessible; execute this authenticated
-- RPC as the definer after the existing strict creator account ownership check.
alter function public.get_creator_dashboard(uuid) security definer;
alter function public.get_creator_dashboard(uuid) set search_path = '';
revoke execute on function public.get_creator_dashboard(uuid) from public, anon;
grant execute on function public.get_creator_dashboard(uuid) to authenticated;
