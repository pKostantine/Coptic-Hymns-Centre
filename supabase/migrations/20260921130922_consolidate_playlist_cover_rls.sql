-- Keep the public RPCs as security invokers. Playlist-cover access is folded
-- into the existing media policies so each command retains one permissive
-- policy and the existing creator/admin behavior remains unchanged.

alter function public.set_music_playlist_cover(uuid) security invoker;
alter function public.clear_music_playlist_cover(uuid) security invoker;

drop policy if exists "media_assets_select_published_or_owner" on media.media_assets;
create policy "media_assets_select_published_or_owner"
on media.media_assets for select
to anon, authenticated
using (
  publication_status = 'published'::media.publication_status
  or (select private.can_read_media_owner(media_assets.owner_creator_account_id))
  or (
    provider = 'external'::media.media_provider
    and bucket = 'playlist-covers'
    and owner_creator_account_id is null
    and created_by = (select auth.uid())
    and exists (
      select 1
      from music.playlists playlist
      where playlist.id::text = media_assets.metadata ->> 'playlistId'
        and playlist.owner_user_id = (select auth.uid())
    )
  )
);

drop policy if exists "media_assets_insert_owner_or_admin" on media.media_assets;
create policy "media_assets_insert_owner_or_admin"
on media.media_assets for insert
to authenticated
with check (
  (select private.can_edit_creator_account(media_assets.owner_creator_account_id))
  or (
    provider = 'external'::media.media_provider
    and bucket = 'playlist-covers'
    and media_type = 'image'::media.media_type
    and owner_creator_account_id is null
    and created_by = (select auth.uid())
    and updated_by = (select auth.uid())
    and exists (
      select 1
      from music.playlists playlist
      where playlist.id::text = media_assets.metadata ->> 'playlistId'
        and playlist.owner_user_id = (select auth.uid())
    )
    and path = regexp_replace((select auth.jwt() ->> 'iss'), '/auth/v1/?$', '')
      || '/storage/v1/object/public/playlist-covers/'
      || (select auth.uid())::text || '/'
      || (metadata ->> 'playlistId') || '/cover'
  )
);

drop policy if exists "media_assets_update_owner_or_admin" on media.media_assets;
create policy "media_assets_update_owner_or_admin"
on media.media_assets for update
to authenticated
using (
  (select private.can_edit_creator_account(media_assets.owner_creator_account_id))
  or (
    provider = 'external'::media.media_provider
    and bucket = 'playlist-covers'
    and owner_creator_account_id is null
    and created_by = (select auth.uid())
    and exists (
      select 1
      from music.playlists playlist
      where playlist.id::text = media_assets.metadata ->> 'playlistId'
        and playlist.owner_user_id = (select auth.uid())
    )
  )
)
with check (
  (select private.can_edit_creator_account(media_assets.owner_creator_account_id))
  or (
    provider = 'external'::media.media_provider
    and bucket = 'playlist-covers'
    and media_type = 'image'::media.media_type
    and owner_creator_account_id is null
    and created_by = (select auth.uid())
    and updated_by = (select auth.uid())
    and exists (
      select 1
      from music.playlists playlist
      where playlist.id::text = media_assets.metadata ->> 'playlistId'
        and playlist.owner_user_id = (select auth.uid())
    )
    and path = regexp_replace((select auth.jwt() ->> 'iss'), '/auth/v1/?$', '')
      || '/storage/v1/object/public/playlist-covers/'
      || (select auth.uid())::text || '/'
      || (metadata ->> 'playlistId') || '/cover'
  )
);
