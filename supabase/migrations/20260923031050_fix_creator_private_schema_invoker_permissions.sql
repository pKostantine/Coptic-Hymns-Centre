-- Existing authenticated creator RPCs called private helper functions as security
-- invokers. Authenticated clients cannot (and must not) be granted USAGE on
-- the private schema; run only these validated entry points as definer instead.
-- Both existing function bodies check auth.uid(), creator membership, types,
-- and upload-intent ownership before they mutate rows.
alter function public.create_creator_cantor(uuid,text,text) security definer;
alter function public.create_creator_cantor(uuid,text,text) set search_path = '';
alter function public.create_creator_submission_v3(uuid,text,text,text,music.release_type,text,text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,timestamptz,date) security definer;
alter function public.create_creator_submission_v3(uuid,text,text,text,music.release_type,text,text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,timestamptz,date) set search_path = '';
revoke execute on function public.create_creator_cantor(uuid,text,text) from public, anon;
revoke execute on function public.create_creator_submission_v3(uuid,text,text,text,music.release_type,text,text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,timestamptz,date) from public, anon;
grant execute on function public.create_creator_cantor(uuid,text,text) to authenticated;
grant execute on function public.create_creator_submission_v3(uuid,text,text,text,music.release_type,text,text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,timestamptz,date) to authenticated;
