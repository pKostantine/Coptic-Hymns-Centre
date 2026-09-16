# Phase 8 - Hymns & Songs Consumer Experience

Completed on 2026-09-16.

## Scope

Phase 8 adds the first complete consumer-facing Hymns & Songs experience to the main CHC application. It uses CHC's existing navy/gold design language and shared typography/spacing while adopting interaction patterns appropriate to a music product rather than copying the Books document UI.

The consumer experience is backed by the published Phase 6 music catalog, Phase 7 synchronized lyrics, canonical Cloudflare R2 media references, and the existing Supabase RLS model.

## Consumer Experience

Implemented in the main CHC Expo application:

- Music as a peer top-level experience beside Books and App Settings
- Music Home / discovery
- artist pages
- release pages
- ordered track lists
- English/Arabic music search
- Library
- Liked Songs
- private playlists
- playlist detail and track removal
- mini player
- full Now Playing
- queue browsing and selection
- synchronized lyric-set selection and live line highlighting
- tap-a-lyric-line seeking
- Arabic RTL lyric rendering
- Coptic lyric font rendering
- Like action in Now Playing
- download actions on releases, playlists, and Now Playing

Download actions are intentionally consumer affordances only in Phase 8. Persistent local storage, download lifecycle/versioning, and fully offline playback remain Phase 13/14 work.

## Playback Boundary

Phase 8 adds an in-app music playback context using `expo-audio` so the Music experience is actually playable and the mini-player/queue/lyrics can function while navigating the current app session.

This is deliberately not treated as the final global playback engine. Phase 9 remains responsible for:

- robust persistent playback across the entire application
- background playback
- lock-screen / OS media controls
- repeat and shuffle behavior
- persistent playback state
- normalized local-download versus remote-media playback
- broader Music + Learn & Study playback sharing

This keeps Phase 8 focused on the consumer product experience while preserving the Phase 9 architecture boundary.

## Supabase Migrations

Phase 8 adds:

- `20260916224200_add_music_consumer_read_rpcs.sql`
- `20260916225500_add_music_library_consumer_rpcs.sql`
- `20260916230500_fix_music_playlist_creation_rls.sql`
- `20260916231500_add_music_playlist_read_rpc.sql`
- `20260916233000_add_localized_music_release_rpc.sql`

## Consumer APIs

Published catalog reads:

- `public.get_music_home(p_locale)`
- `public.get_published_music_artist(p_artist_id, p_locale)`
- `public.get_published_music_release_for_locale(p_release_id, p_locale)`
- `public.search_published_music(p_query, p_locale)`
- existing Phase 7 `public.get_published_track_lyrics(...)`

Library operations:

- `public.get_my_music_library(p_locale)`
- `public.set_track_liked(p_track_id, p_liked)`
- `public.create_music_playlist(...)`
- `public.add_track_to_music_playlist(...)`
- `public.remove_track_from_music_playlist(...)`
- `public.get_music_playlist(p_playlist_id, p_locale)`

Normal Phase 8 consumer RPCs execute as `SECURITY INVOKER` and rely on the existing music-table RLS policies.

## RLS Verification

Library behavior was tested against the live CHC Supabase project.

Verified:

- anonymous Library reads return `authenticated = false` with empty private-library collections
- an authenticated user can like the published smoke track
- an authenticated user can create a private playlist
- the same user can add the published smoke track to that playlist
- Library reads return the liked track and playlist count correctly
- the playlist-detail RPC returns the owner's ordered track payload
- when the database session actually executes as the `anon` Postgres role, the same private playlist returns `null`

Playlist creation originally used `INSERT ... RETURNING`. PostgreSQL RLS rejected that return path in this ownership model, so the final invoker implementation pre-generates the UUID, inserts without `RETURNING`, and returns the generated ID separately. RLS remains intact.

## Localization and Media

Music Home, artist, release, search, library, and playlist data resolve localized English/Arabic text where available and fall back to the canonical catalog values when a localization is absent.

Release detail was given a dedicated localized consumer RPC so its title, description, track titles, artist credits, artwork, and media metadata remain consistent with Music Home and Artist pages.

Media remains canonical as:

```text
provider
bucket
path
```

and is resolved by the existing `src/services/mediaService.ts` Cloudflare resolver. No complete mutable R2 URL is stored in music UI state or catalog rows.

## Phase 7 Integration

Now Playing consumes `get_published_track_lyrics` directly.

The active lyric line is derived from the live playback position using each line's `startMs`, `endMs`, and the next timed line where necessary. Multiple published lyric sets can be selected per recording, and tapping a timed line seeks playback to that line.

The Phase 7 smoke track therefore exercises the Phase 8 path end to end: published R2 audio, published music metadata, queue playback, and published synchronized lyrics.

## Dependency and Build Verification

Phase 8 adds Expo SDK 57's `expo-audio ~57.0.5` dependency.

The npm lockfile was regenerated through GitHub Actions and records the exact `expo-audio 57.0.5` package and integrity metadata.

Final branch verification passed:

- `npm ci --ignore-scripts`
- `npx tsc --noEmit`
- `npm run test:lyrics`

## Security Review

Supabase security advisors were run after the final Phase 8 database migration. The Phase 8 consumer functions introduced no new `SECURITY DEFINER` warnings and remain invoker-mode.

Existing project-wide findings in older schemas/backups and intentionally privileged publishing/processing functions remain outside Phase 8.

## Follow-Up

- Phase 9 should replace the provisional in-app playback layer with CHC's robust global playback engine while preserving the Phase 8 Music UI contracts.
- Phase 12 can broaden Music search into CHC's unified cross-domain search.
- Phase 13/14 should make the Phase 8 download actions perform real local persistence, offline playback, versioning, and storage management.
