# Phase 10 - Learn & Study Backend

Completed on 2026-09-16.

## Goal

Phase 10 creates a dedicated structured backend for CHC educational material instead of forcing learning content into the Music release model.

It reuses the existing Phase 1-5 creator/media/submission infrastructure and the Phase 9 normalized playback foundation.

## Learning schema

A dedicated `learning` schema now models:

- `cantors`
- `cantor_localizations`
- `cantor_permissions`
- `seasons`
- `season_localizations`
- `hymns`
- `hymn_localizations`
- `hymn_seasons`
- `hymn_relationships`
- `albums`
- `album_localizations`
- `album_recordings`
- `recording_localizations`
- `lesson_sets`
- `lesson_set_localizations`
- `lessons`
- `lesson_localizations`
- `playlists`
- `playlist_items`
- `hymn_progress`

All 20 tables have RLS enabled and explicit policies.

## Canonical hymn identity

`learning.hymns.source_hymn_key` references the existing `public.hymn_titles(hymn_key)` primary key.

That lets Learn & Study organize educational content around canonical CHC hymn identities instead of duplicating hymn identity in a separate catalog.

A learning hymn may also belong to one or more learning Seasons through `learning.hymn_seasons`, and hymns can be connected through typed `learning.hymn_relationships`.

## Discovery model

The backend follows the Phase 10 discovery model:

```text
Cantors
Seasons
```

Published detail APIs expose the deeper hierarchy:

```text
Cantor -> Season -> Album -> Ordered Recordings
```

and:

```text
Cantor -> Season -> Hymn -> Ordered Lessons
```

## Albums and recordings

Learning Albums are deliberately not Music releases. They carry learning-oriented metadata and ordered recordings without commercial release fields.

Each recording can reference a canonical learning Hymn and a processed `media.media_assets` row.

## Lesson sets and lessons

Lesson Sets connect a Cantor, Season, and canonical Hymn.

Lessons are ordered and support either:

- `audio`
- `video`

Each lesson references the canonical media pipeline through `media.media_assets`.

## Learning progress

Learning progress is represented as state on a canonical hymn, not as synthetic playlists:

- `will_learn`
- `learning`
- `finished`

The authenticated RPCs expose this as per-user state and preserve started/finished timestamps.

Custom learning playlists remain a separate model and can contain either album recordings or lessons.

## Permissions and publishing

Cantors can be owned by a creator account and may grant explicit creator-account permissions with the roles:

- `owner`
- `editor`
- `uploader`

Albums and Lesson Sets use the existing `media.publication_status` lifecycle and creator-account ownership model.

Admin publishing RPCs validate that required child media exists and that referenced assets are already processed/published before exposing the parent learning content.

The existing media submission enum already includes:

- `learning_album`
- `learning_lesson_set`
- `cantor_update`

so Learn & Study uses the shared upload, processing, moderation, and publication pipeline rather than creating parallel infrastructure.

## Public retrieval APIs

Phase 10 exposes RLS-backed `SECURITY INVOKER` retrieval RPCs for:

- learning home/discovery
- published Cantor detail
- published Season detail
- published Hymn detail
- published learning Album detail
- published Lesson Set detail
- public/unlisted learning playlist detail

Localized values fall back to the base stored text where a requested localization is unavailable.

## Authenticated user APIs

Authenticated-only RPCs support:

- setting hymn learning progress
- reading the current user's learning progress
- creating learning playlists
- reading the current user's playlists
- adding recording or lesson items
- removing playlist items

The final grant audit confirms these mutation/user-library functions are not executable by `anon`.

## Shared TypeScript contracts

`src/types/learningPlatform.ts` contains consumer-facing contracts for Phase 11, including Cantor, Season, Hymn, Album, Recording, Lesson Set, Lesson, progress, playlist, and media payloads.

These media payloads use the shared `MediaAssetReference` contract so Phase 11 can resolve Cloudflare media through the same delivery service as Music.

## Smoke verification

A published Phase 10 smoke catalog was created using the existing Phase 6 processed audio asset:

- Cantor: `Phase 10 Smoke Cantor`
- Season: `Phase 10 Smoke Season`
- canonical Hymn: `O King of Peace`
- source CHC hymn key: `epouro`
- learning Album: `Phase 10 Smoke Album`
- one ordered audio recording
- Lesson Set: `Phase 10 Smoke Lesson Set`
- one ordered audio lesson

The catalog was published through the guarded learning publish RPCs.

Anonymous readback was verified for Home, Cantor, Season, Hymn, Album, and Lesson Set payloads.

Authenticated verification also confirmed:

- `learning -> finished` progress transitions
- custom playlist creation
- adding both a learning recording and a lesson
- owner playlist readback
- private playlists returning `null` under the real `anon` Postgres role

Temporary user progress and playlist smoke state was removed after verification; the published catalog records remain available for Phase 11 UI development.

## Security verification

The final database inventory confirms:

- 20 learning tables
- RLS enabled on all 20
- explicit policies on all 20
- public content RPCs executable by `anon`
- user-state mutation/library RPCs authenticated-only
- learning publisher RPCs authenticated-only and internally admin-guarded
- no Phase 10 table appears in the Supabase `rls_enabled_no_policy` advisor
- the Phase 10 `search_path` advisor finding was fixed

The three learning publish RPCs intentionally remain authenticated `SECURITY DEFINER` operations because publication is a privileged state transition guarded by `private.is_admin()`. This matches the established Music/media publishing pattern.

## Deliverable

Phase 10's deliverable is satisfied: learning content can now be represented, connected to canonical CHC hymn identities, localized, submitted through the existing media workflow, processed using the existing media pipeline, published through guarded transitions, retrieved anonymously when published, and tracked privately per user.
