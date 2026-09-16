create or replace function private.learning_album_child_is_visible(p_album_id uuid, p_status media.publication_status)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_status = 'published' or private.learning_album_is_editable(p_album_id);
$$;

create or replace function private.learning_lesson_child_is_visible(p_lesson_set_id uuid, p_status media.publication_status)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_status = 'published' or private.learning_lesson_set_is_editable(p_lesson_set_id);
$$;

revoke all on function private.learning_album_child_is_visible(uuid, media.publication_status) from public;
revoke all on function private.learning_lesson_child_is_visible(uuid, media.publication_status) from public;
grant execute on function private.learning_album_child_is_visible(uuid, media.publication_status) to anon, authenticated;
grant execute on function private.learning_lesson_child_is_visible(uuid, media.publication_status) to anon, authenticated;

drop policy if exists learning_recordings_select on learning.album_recordings;
create policy learning_recordings_select on learning.album_recordings
for select using (
  private.learning_album_is_visible(album_id)
  and private.learning_album_child_is_visible(album_id, publication_status)
);

drop policy if exists learning_lessons_select on learning.lessons;
create policy learning_lessons_select on learning.lessons
for select using (
  private.learning_lesson_set_is_visible(lesson_set_id)
  and private.learning_lesson_child_is_visible(lesson_set_id, publication_status)
);
