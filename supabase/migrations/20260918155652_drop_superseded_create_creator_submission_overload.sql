-- The 13-argument version replaces this one. Leaving both in place makes an
-- 11-argument call ambiguous, which PostgREST resolves by argument name and
-- would resolve to the old body that creates no tracks.
drop function if exists public.create_creator_submission(
  uuid, text, text, text, music.release_type, uuid, uuid, uuid, uuid, jsonb, jsonb
);
