-- Keep the Storage object name comparison at policy scope. Inside the
-- playlist subquery, an unqualified `name` resolves to playlists.name.

drop policy if exists "Users upload own playlist covers" on storage.objects;
create policy "Users upload own playlist covers"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'playlist-covers'
  and name in (
    select (select auth.uid())::text || '/' || playlist.id::text || '/cover'
    from music.playlists playlist
    where playlist.owner_user_id = (select auth.uid())
  )
);

drop policy if exists "Users update own playlist covers" on storage.objects;
create policy "Users update own playlist covers"
on storage.objects for update
to authenticated
using (
  bucket_id = 'playlist-covers'
  and name in (
    select (select auth.uid())::text || '/' || playlist.id::text || '/cover'
    from music.playlists playlist
    where playlist.owner_user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'playlist-covers'
  and name in (
    select (select auth.uid())::text || '/' || playlist.id::text || '/cover'
    from music.playlists playlist
    where playlist.owner_user_id = (select auth.uid())
  )
);

drop policy if exists "Users delete own playlist covers" on storage.objects;
create policy "Users delete own playlist covers"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'playlist-covers'
  and name in (
    select (select auth.uid())::text || '/' || playlist.id::text || '/cover'
    from music.playlists playlist
    where playlist.owner_user_id = (select auth.uid())
  )
);
