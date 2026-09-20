create or replace function public.get_music_artist_search_art(p_artist_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when cover.id is null then null else jsonb_build_object(
    'id', cover.id,
    'provider', cover.provider,
    'bucket', cover.bucket,
    'path', cover.path,
    'mimeType', cover.mime_type,
    'fileSizeBytes', cover.file_size_bytes,
    'checksum', cover.checksum
  ) end
  from music.track_artists track_artist
  join music.release_tracks release_track
    on release_track.track_id = track_artist.track_id
  join music.releases release
    on release.id = release_track.release_id
   and release.publication_status = 'published'::media.publication_status
  join media.media_assets cover
    on cover.id = release.cover_asset_id
   and cover.publication_status = 'published'::media.publication_status
  where track_artist.artist_id = p_artist_id
  order by release.scheduled_release_at desc nulls last,
    release.release_date desc nulls last,
    release_track.disc_number,
    release_track.track_number
  limit 1;
$$;

revoke all on function public.get_music_artist_search_art(uuid) from public;
grant execute on function public.get_music_artist_search_art(uuid) to anon, authenticated;
