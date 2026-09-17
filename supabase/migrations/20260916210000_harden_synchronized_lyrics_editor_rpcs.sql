alter function public.get_lyric_editor_tracks() security invoker;
alter function public.get_track_lyric_draft(uuid, text, music.lyric_kind) security invoker;
alter function public.save_track_lyric_draft(
  uuid,
  text,
  music.lyric_kind,
  music.lyric_sync_precision,
  text,
  text,
  jsonb
) security invoker;
