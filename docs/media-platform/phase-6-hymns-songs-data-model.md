# Phase 6 - Hymns & Songs Data Model

Completed on 2026-09-16.

## Scope

Phase 6 adds the canonical backend model for CHC Hymns & Songs.

## Supabase Migrations

- `20260916193730_create_music_catalog_schema.sql`
- `20260916193923_add_music_catalog_audit_fk_indexes.sql`

## Schema Added

New schema:

- `music`

Enums:

- `music.release_type`: `single`, `ep`, `album`
- `music.track_artist_role`: `primary`, `featured`, `composer`, `lyricist`, `arranger`, `producer`
- `music.playlist_visibility`: `private`, `unlisted`, `public`

Catalog tables:

- `music.artists`
- `music.artist_localizations`
- `music.artist_memberships`
- `music.releases`
- `music.release_localizations`
- `music.tracks`
- `music.track_localizations`
- `music.release_tracks`
- `music.track_artists`

User-library tables:

- `music.track_likes`
- `music.artist_follows`
- `music.playlists`
- `music.playlist_tracks`
- `music.play_history`

## API Added

- `public.publish_music_release(p_release_id uuid)`
- `public.get_published_music_release(p_release_id uuid)`

`publish_music_release` is an admin-gated publishing RPC. It refuses releases with no tracks and refuses tracks that do not reference completed, published media assets.

`get_published_music_release` is callable by `anon` and returns a release payload with primary artist, ordered tracks, track artists, and R2 media asset references.

## Smoke Test

Verified a complete published album can exist and be queried cleanly.

Catalog records:

- Artist: `425654dd-e56c-4845-ab6c-d7ea89766e05`
- Release: `436a9f01-f74a-4279-be13-37fc6545db48`
- Track: `003b6ff2-b639-4050-ac72-f19c33dba82f`
- Media asset: `9bab5973-0ec9-41fa-852e-7225a15f29db`

Published release:

```text
Phase 6 Smoke Album
```

Published track:

```text
Phase 6 Smoke Track
```

Media path returned by the public query:

```text
chc-music/processed/5facb1fd-4aff-43ed-9cf7-6f5670cf693a/5339f85a-7efc-40a2-96fb-e9f458146394/v1/audio.m4a
```

Anonymous API verification returned:

- release type: `album`
- publication status: `published`
- primary artist: `Phase 6 Smoke Artist`
- track count: `1`
- track MIME type: `audio/mp4`

## Verification

- `npx.cmd tsc --noEmit`
- Supabase migration list includes both Phase 6 migrations.
- Focused FK-index check for schema `music` returned no missing covering indexes.
- Supabase advisors report no new missing-RLS issues for `music`. Remaining warnings are older project-wide debt, expected unused-index warnings for newly-created indexes, and intentional authenticated `SECURITY DEFINER` RPC warnings.

## Follow-Up

- Phase 7 should add synchronized lyric tables that attach to `music.tracks`.
- Phase 8 can use `get_published_music_release` as the first consumer-facing read path, then broaden into artist/release listing endpoints as the UI takes shape.
