-- Cover reverse item lookups used by library lists, cascade checks, and playlist cleanup.
create index if not exists learning_item_progress_recording_idx
  on learning.item_progress(album_recording_id)
  where album_recording_id is not null;

create index if not exists learning_item_progress_lesson_idx
  on learning.item_progress(lesson_id)
  where lesson_id is not null;

create index if not exists learning_item_likes_recording_idx
  on learning.item_likes(album_recording_id)
  where album_recording_id is not null;

create index if not exists learning_item_likes_lesson_idx
  on learning.item_likes(lesson_id)
  where lesson_id is not null;

create index if not exists learning_playlist_items_recording_idx
  on learning.playlist_items(album_recording_id)
  where album_recording_id is not null;

create index if not exists learning_playlist_items_lesson_idx
  on learning.playlist_items(lesson_id)
  where lesson_id is not null;

create index if not exists media_submission_items_audio_only_asset_idx
  on media.submission_items(audio_only_asset_id)
  where audio_only_asset_id is not null;
