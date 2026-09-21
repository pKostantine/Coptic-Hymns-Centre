-- Each listener may store only the single deterministic cover object for a
-- playlist they own. This keeps the public artwork bucket from becoming a
-- general-purpose owner-folder upload surface.

drop policy if exists "Users upload own playlist covers" on storage.objects;
create policy "Users upload own playlist covers"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'playlist-covers'
  and exists (
    select 1
    from music.playlists playlist
    where playlist.owner_user_id = (select auth.uid())
      and name = (select auth.uid())::text || '/' || playlist.id::text || '/cover'
  )
);

drop policy if exists "Users update own playlist covers" on storage.objects;
create policy "Users update own playlist covers"
on storage.objects for update
to authenticated
using (
  bucket_id = 'playlist-covers'
  and exists (
    select 1
    from music.playlists playlist
    where playlist.owner_user_id = (select auth.uid())
      and name = (select auth.uid())::text || '/' || playlist.id::text || '/cover'
  )
)
with check (
  bucket_id = 'playlist-covers'
  and exists (
    select 1
    from music.playlists playlist
    where playlist.owner_user_id = (select auth.uid())
      and name = (select auth.uid())::text || '/' || playlist.id::text || '/cover'
  )
);

drop policy if exists "Users delete own playlist covers" on storage.objects;
create policy "Users delete own playlist covers"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'playlist-covers'
  and exists (
    select 1
    from music.playlists playlist
    where playlist.owner_user_id = (select auth.uid())
      and name = (select auth.uid())::text || '/' || playlist.id::text || '/cover'
  )
);
