-- The public cover RPCs validate the authenticated playlist owner, the exact
-- owner-scoped Storage object path, its object owner, MIME type, and size
-- before touching media metadata. Let those narrowly granted functions own
-- the metadata write instead of adding overlapping policies to media_assets.

drop policy if exists "media_assets_select_own_playlist_covers" on media.media_assets;
drop policy if exists "media_assets_insert_own_playlist_covers" on media.media_assets;
drop policy if exists "media_assets_update_own_playlist_covers" on media.media_assets;

alter function public.set_music_playlist_cover(uuid) security definer;
alter function public.clear_music_playlist_cover(uuid) security definer;
