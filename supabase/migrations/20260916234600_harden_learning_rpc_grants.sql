revoke all on function public.set_learning_progress(uuid, learning.progress_state) from public;
revoke all on function public.get_my_learning_progress(text) from public;
revoke all on function public.create_learning_playlist(text, text, learning.playlist_visibility) from public;
revoke all on function public.add_learning_playlist_item(uuid, learning.playlist_item_kind, uuid, uuid) from public;
revoke all on function public.remove_learning_playlist_item(uuid, uuid) from public;
revoke all on function public.get_my_learning_playlists(text) from public;

grant execute on function public.set_learning_progress(uuid, learning.progress_state) to authenticated;
grant execute on function public.get_my_learning_progress(text) to authenticated;
grant execute on function public.create_learning_playlist(text, text, learning.playlist_visibility) to authenticated;
grant execute on function public.add_learning_playlist_item(uuid, learning.playlist_item_kind, uuid, uuid) to authenticated;
grant execute on function public.remove_learning_playlist_item(uuid, uuid) to authenticated;
grant execute on function public.get_my_learning_playlists(text) to authenticated;
