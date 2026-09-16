create or replace function public.create_music_playlist(
  p_name text,
  p_description text default null,
  p_visibility music.playlist_visibility default 'private'::music.playlist_visibility
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  playlist_id uuid := gen_random_uuid();
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Playlist name is required' using errcode = '22023';
  end if;

  insert into music.playlists (id, owner_user_id, name, description, visibility)
  values (playlist_id, request_user_id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_visibility);

  return playlist_id;
end;
$$;
