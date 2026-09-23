-- Lyric Studio entry point invokes private.music_track_is_editable,
-- which authenticated callers cannot execute as a security invoker.
-- Keep the private schema restricted and the existing track-ownership check.
alter function public.get_lyric_editor_tracks() security definer;
alter function public.get_lyric_editor_tracks() set search_path = '';
revoke execute on function public.get_lyric_editor_tracks() from public, anon;
grant execute on function public.get_lyric_editor_tracks() to authenticated;
