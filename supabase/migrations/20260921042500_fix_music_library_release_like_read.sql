-- get_my_music_library is SECURITY INVOKER, so authenticated callers need
-- read access to release_likes in addition to the table's RLS ownership policy.
-- This grant mirrors the live hotfix and prevents 42501 failures after a fresh
-- migration/rebuild.

grant select on table music.release_likes to authenticated;
