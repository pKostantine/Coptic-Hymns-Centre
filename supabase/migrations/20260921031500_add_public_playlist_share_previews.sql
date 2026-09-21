create or replace function public.get_music_playlist_share_preview(p_playlist_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'title', playlist.name,
    'description', coalesce(
      nullif(trim(playlist.description), ''),
      'Listen to ' || playlist.name || ' on Coptic Hymns Centre.'
    ),
    'imageAsset', coalesce(
      case when cover.id is null then null else jsonb_build_object(
        'id', cover.id,
        'provider', cover.provider,
        'bucket', cover.bucket,
        'path', cover.path,
        'mimeType', cover.mime_type
      ) end,
      (
        select jsonb_build_object(
          'id', release_cover.id,
          'provider', release_cover.provider,
          'bucket', release_cover.bucket,
          'path', release_cover.path,
          'mimeType', release_cover.mime_type
        )
        from music.playlist_tracks playlist_track
        join music.release_tracks release_track
          on release_track.track_id = playlist_track.track_id
        join music.releases release
          on release.id = release_track.release_id
         and release.publication_status = 'published'::media.publication_status
        join media.media_assets release_cover
          on release_cover.id = release.cover_asset_id
         and release_cover.publication_status = 'published'::media.publication_status
        where playlist_track.playlist_id = playlist.id
        order by playlist_track.sort_order, playlist_track.created_at
        limit 1
      )
    )
  )
  from music.playlists playlist
  left join media.media_assets cover
    on cover.id = playlist.cover_asset_id
   and cover.publication_status = 'published'::media.publication_status
  where playlist.id = p_playlist_id
    and playlist.visibility = 'public'::music.playlist_visibility;
$$;

revoke all on function public.get_music_playlist_share_preview(uuid) from public;
grant execute on function public.get_music_playlist_share_preview(uuid) to anon, authenticated;
