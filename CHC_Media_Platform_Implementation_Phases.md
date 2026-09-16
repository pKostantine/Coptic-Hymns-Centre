# CHC Media Platform — Implementation Phases

## Project Goal

The goal of these implementation phases is to evolve CHC into **one cohesive media and liturgical ecosystem** rather than a collection of disconnected features.

The finished product should consist of:

### CHC Consumer App

The main CHC application should contain three distinct but related experiences:

1. **Books**
   - The existing textual, biblical, liturgical, and reference experience.
   - This remains an important part of CHC and serves as the main reference for CHC's existing visual design language.

2. **Hymns & Songs**
   - A full music experience for Coptic Orthodox hymns and spiritual songs.
   - Release-based music catalog using Singles, EPs, and Albums.
   - Artists, releases, playlists, likes, synchronized lyrics, search, background playback, and offline downloads.
   - It should behave like a proper modern music app while still looking unmistakably like CHC.

3. **Learn & Study**
   - A structured educational media experience.
   - Organized primarily through Cantors, Seasons, Hymns, Albums, and Lesson Sets.
   - Supports both audio and video lessons.
   - Includes learning progress states:
     - Will Learn
     - Currently Learning
     - Finished Learning
   - Includes custom learning playlists and full offline access.
   - It should feel purpose-built for learning rather than simply duplicating either Books or Hymns & Songs.

### CHC Artists

CHC Artists should be a **separate creator/management companion application** connected to the same backend.

It should allow authorized creators and cantors to:

- manage artist and cantor profiles
- create music releases
- upload original masters
- create Learn & Study albums and lesson sets
- upload audio and video
- enter English/Arabic metadata
- create synchronized lyrics
- submit content for review
- receive requested changes
- monitor media processing
- manage approved/published content

Pierre/admin should have a complete review and moderation experience for approving, requesting changes to, or rejecting submissions.

## CHC Artists Repository

The CHC Artists repository already exists:

https://github.com/pKostantine/CHC-Artists.git

Use this repository for all CHC Artists work.

Do NOT create another repository, monorepo substitute, or temporary embedded CHC Artists app inside the main CHC repository.

CHC Artists should remain a separate application/repository while sharing:

- the existing CHC Supabase project
- the existing CHC Cloudflare account
- the same R2 media infrastructure
- shared backend contracts/types where appropriate

Inspect this repository during Phase 0 alongside the main CHC repository.

If it is empty or minimally initialized, scaffold the application here according to the existing CHC technology stack and design language rather than creating it somewhere else.

---

## Target Technical Architecture

The long-term architecture should be:

```text
                              CHC ECOSYSTEM

                    ┌─────────────────────────┐
                    │       CHC Consumer      │
                    │                         │
                    │  Books                  │
                    │  Hymns & Songs          │
                    │  Learn & Study          │
                    └────────────┬────────────┘
                                 │
                  ┌──────────────┴──────────────┐
                  │                             │
             Supabase                      Cloudflare
                  │                             │
          PostgreSQL / Auth                    R2
          RLS / metadata                    Workers
          playlists / likes                  CDN
          lyrics / progress                 uploads
          submissions / search              media
                  │                             │
                  └──────────────┬──────────────┘
                                 │
                          Media Processing
                           FFmpeg Worker
                                 │
                                 │
                    ┌────────────┴────────────┐
                    │       CHC Artists       │
                    │ creator/cantor portal   │
                    └─────────────────────────┘
```

### Responsibility Split

**Supabase is the structured backend and identity layer.**

It should own:

- PostgreSQL data
- authentication
- profiles
- permissions
- RLS
- artists
- releases
- tracks
- cantors
- seasons
- hymns
- lessons
- playlists
- likes
- lyrics
- learning progress
- submissions
- moderation
- search metadata
- publishing state
- creator permissions

**Cloudflare is the media infrastructure and delivery layer.**

It should own:

- R2 object storage
- private submission files
- private source masters
- published music
- published learning audio
- published learning video
- images/artwork
- CDN delivery
- media domain
- secure upload authorization
- Worker-based media APIs where appropriate
- observability

**The device owns offline playback.**

It should use:

- persistent local media storage
- SQLite for offline metadata
- downloaded lyrics and timings
- download state/versioning

---

## Media Standards

All published CHC audio should use:

```text
Container: M4A
Codec: AAC-LC
Bitrate: 256 kbps
```

Original source files should be retained privately and should not be destructively replaced.

Published objects should use immutable versioned paths such as:

```text
track_uuid/v1/audio.m4a
track_uuid/v2/audio.m4a
```

Heavy media processing should be performed by a separate Dockerized FFmpeg worker, not by Expo and not by long-running Cloudflare Workers.

---

## Design Goal

The existing **Books section** is the primary reference for CHC's visual identity.

However, the goal is **not** to make every experience look identical.

The desired relationship is:

```text
same CHC design DNA
+
purpose-built experience for each feature set
```

Books should feel like a reading/reference product.

Hymns & Songs should feel like a modern music product.

Learn & Study should feel like a structured educational media product.

CHC Artists should feel like a professional creator/management companion application.

They should clearly belong to the same CHC product family without looking like one interface copied four times.

---

# Phase Overview

| Phase | Name | Primary Outcome |
|---|---|---|
| 0 | Integrations, Audit, and Baseline | Claude understands and can access the existing CHC infrastructure |
| 1 | Shared Backend Foundation | Core database, roles, localization, and media models exist |
| 2 | Cloudflare R2 Media Infrastructure | CHC has a working canonical object-storage and delivery layer |
| 3 | Secure Creator Upload Pipeline | Creators can securely upload large files directly to R2 |
| 4 | Media Processing Pipeline | Uploaded masters can be normalized into CHC delivery media |
| 5 | Submission, Moderation, and Publishing | Creator → review → processing → publication works |
| 6 | Hymns & Songs Data Model | Complete music catalog backend exists |
| 7 | Synchronized Lyrics | Structured multilingual timed lyrics work |
| 8 | Hymns & Songs Consumer Experience | CHC has a polished streaming music interface |
| 9 | Global Playback Engine | Playback is reliable across screens, background, and local/remote sources |
| 10 | Learn & Study Backend | Learning content has a dedicated structured backend |
| 11 | Learn & Study Consumer Experience | CHC has a dedicated educational media interface |
| 12 | Unified Search | English, Arabic, aliases, music, and learning can be searched coherently |
| 13 | Offline Downloads | Music and learning media work completely offline |
| 14 | Download Versioning & Storage Management | Offline libraries remain maintainable after content revisions |
| 15 | CHC Artists Application | Creators can manage and submit content without manual backend work |
| 16 | Admin Review Experience | Pierre can operate the review workflow through a proper UI |
| 17 | Cross-Linking with Existing CHC Content | Read / Listen / Learn begin connecting through canonical identities |
| 18 | Hardening, QA, and Production Readiness | System is tested, secured, and release-ready |
| 19 | Documentation and Operational Handoff | Architecture is documented and maintainable |

---

# Phase 0 ✅ — Integrations, Audit, and Baseline

## Goal

Get Claude fully connected to the existing CHC infrastructure and understand what already exists **before changing anything**.

The first priority is Cloudflare.

## Work

- Get Cloudflare integrations working first.
- Verify the official Cloudflare Claude integration/skills where available.
- Verify Cloudflare MCP access.
- Verify Wrangler authentication.
- Verify access to:
  - Workers
  - R2
  - existing website deployment
  - Pages/Workers configuration
  - routes/domains
  - DNS information where required
  - logs/observability
- Identify existing CHC Cloudflare resources before creating anything.
- Preserve existing Cloudflare infrastructure.
- Inspect the CHC GitHub repositories.
- Inspect the existing Expo/React Native/web architecture.
- Inspect navigation and package versions.
- Inspect current audio/video dependencies.
- Inspect Supabase integration.
- Inspect:
  - schemas
  - migrations
  - Auth
  - profiles
  - RLS
  - existing user structures
  - canonical season/event structures
  - existing hymn structures
- Inspect the current Books UI.
- Identify CHC's existing design primitives:
  - typography
  - colors
  - spacing
  - surfaces
  - corner radii
  - buttons
  - sheets/modals
  - navigation
  - iconography
  - dark/light behavior
  - reusable components
- Determine what should be reused rather than duplicated.

## Do Not

Do not start building the new media platform before completing the audit.

Do not create duplicate Cloudflare resources.

Do not create a new Supabase project.

Do not replace existing infrastructure simply because a blank-slate implementation would be easier.

## Deliverable

A concise architecture/audit report covering:

- integrations successfully connected
- existing Cloudflare resources
- existing app architecture
- existing database architecture
- existing Books design system
- what can be reused
- what must be added
- identified conflicts or risks

## Phase 0 Audit Report - 2026-09-16

Status: complete. Cloudflare API/MCP access, Wrangler CLI authentication, Supabase MCP access, repository audit, app audit, database audit, and design-system audit have been verified from this Codex session.

- local Wrangler is authenticated through `npx.cmd wrangler` as `pierrek3419@gmail.com` for Cloudflare account `pKostantine` (`cf3267bfcb8e3b6d980e9a690c7e7a00`)
- per user direction, Claude-side integration verification is no longer tracked as a blocker for this phase

### Integrations Verified

- Expo SDK 57 docs were checked before implementation work. The repo uses `expo ~57.0.21`, React Native `0.86.3`, React `19.2.3`, and local Node `v22.17.0`, which matches the SDK 57 Node requirement range.
- Supabase MCP access works for project `wtuujmeinzqfikvuofmh` (`Coptic Hymns Centre`, `us-east-2`, Postgres `17.6.1.155`, active/healthy).
- Cloudflare API/MCP access works for account `pKostantine` (`cf3267bfcb8e3b6d980e9a690c7e7a00`).
- GitHub remote for the main app is `https://github.com/pKostantine/Coptic-Hymns-Centre.git`, current branch `master`, current HEAD `6abf333a992b60be218d32015b6f7bdb31322c43`.
- CHC Artists remote `https://github.com/pKostantine/CHC-Artists.git` exists but appears empty/uninitialized: `git ls-remote` returns no refs/HEAD, and it is not checked out locally.

### Existing Cloudflare Resources

- One Cloudflare zone is present in the connected account: `pierrek.ca`, active, full setup, free plan.
- DNS records on `pierrek.ca` are for the portfolio Pages project and iCloud mail. No CHC media domain or `coptichymnscentre.com` zone was found in this account inventory.
- Existing Cloudflare Pages project:
  - name: `coptic-hymns-centre`
  - source: GitHub `pKostantine/Coptic-Hymns-Centre`
  - production branch: `master`
  - build command: `npx expo export --platform web --clear`
  - output directory: `dist`
  - latest production deployment: successful on 2026-09-16 from commit `6abf333a992b60be218d32015b6f7bdb31322c43`
  - Pages Functions: not used
- No standalone Workers are currently listed.
- No R2 buckets are currently listed.
- No existing Cloudflare media storage, upload Worker, or media delivery domain was found.

### Existing App Architecture

- The app is an Expo Router application with routes under `src/app`.
- The current consumer experience is Books-focused:
  - `psalmody`
  - `liturgy`
  - `veneration`
  - `lectionary`
  - `agpeya`
  - `bible`
- Root layout uses a single `Stack`, `ReadingPreferencesProvider`, `CalendarProvider`, `SafeAreaProvider`, and a custom `BottomTabBar` for Books/App Settings.
- Shared app logic lives under:
  - `src/components/chc`
  - `src/constants`
  - `src/context`
  - `src/utils`
- Supabase is configured in `src/utils/supabase.ts` using `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`; client session persistence is currently disabled.
- Local settings/bookmarks/collapse state use `window.localStorage` on web and `expo-file-system/legacy` JSON files on native.
- There is no existing global playback engine, audio/video player dependency, download manager, SQLite offline store, media resolver, or media-domain abstraction.
- Current media-adjacent dependencies:
  - present: `expo-file-system`, `expo-image`, `react-native-webview`
  - absent: `expo-audio`, `expo-video`, `expo-sqlite`, background audio/media controls libraries

### Existing Database Architecture

- Supabase project `wtuujmeinzqfikvuofmh` has 270 migrations, from `20260622235632` through `20260914124330`.
- Existing application schemas are textual/liturgical rather than media-oriented:
  - `agpeya`
  - `bible`
  - `calendar`
  - `psalmody`
  - `liturgy`
  - `veneration`
  - plus supporting liturgical schemas such as `canons`, `doxologies`, `gospel_responses`, `gospel_rite`, `holy_week`, `hymn_of_the_intercessions`, `litanies`, `praxis_response`, `readings`, `seasonal_liturgy_hymns`, `synaxarium`, and `verses_of_the_cymbals`
- Supabase-managed `auth`, `storage`, `realtime`, `vault`, `extensions`, and migration schemas exist.
- No app-level `profiles`, roles, creator permissions, media, music, artist, cantor, release, track, playlist, lyric, lesson, learning, or submission tables were found outside Supabase's internal `auth.users`/`auth.scim_users`.
- Existing hymn schemas generally use:
  - `hymn_titles`
  - `hymn_texts`
  - service/order tables such as `psalmody.midnight_praises`
  - multilingual columns (`english`, `coptic`, `arabic`)
  - liturgical condition fields
  - typed item/prayer/person enums
- Existing Bible/search structures include `bible.verses`, multilingual Bible columns, `tsvector` search columns, `bible.verse_parts`, and `bible.verse_search_normalized`.
- Existing calendar structures include `calendar.calendar_event_instances`, `calendar.season_ranges`, `calendar.reading_rules`, condition flags, and active-season/readings RPCs.
- Current RLS pattern is mostly public read policies for Books data exposed to `anon` and `authenticated`.

### Books Design System

- The main CHC design source is `src/constants/theme.ts`.
- Current design DNA:
  - dark-only visual system
  - navy/black surfaces
  - gold primary accent
  - muted light text
  - liturgical role colors
  - `Georgia` title typography, system body typography, bundled `CopticCHC-Regular`, `Arial` for Arabic
  - spacing scale: 4/8/16/24/32
  - reusable radii: 8/16/18/pill
  - simple card shadows
- Reusable primitives include:
  - `AppHeader`
  - `BottomTabBar`
  - `CategoryCard`
  - `HymnCard`
  - `Icon`
  - `ToggleRow`
  - `ContentSelectorDrawer`
  - `DocumentSurface`
  - `DocumentWebView`
- Future Music, Learn, and CHC Artists work should reuse tokens and chrome where appropriate, but avoid copying Books document layouts into media workflows.

### What Can Be Reused

- Supabase project, existing auth backend, existing public read model for published liturgical data, and established schema-per-domain precedent.
- Cloudflare account and existing Pages deployment for the consumer web app.
- Expo SDK 57 + Expo Router app structure.
- CHC design tokens, header/button/card/icon treatment, language preference model, and safe-area/orientation patterns.
- Existing Bible/calendar/search normalization ideas, especially `unaccent`, `pg_trgm`, `tsvector`, and language-specific normalization tables/functions.
- Existing `hymn_key`, calendar season, and event structures as future cross-linking anchors after a canonical identity model is designed.

### What Must Be Added

- Source-controlled Supabase migration files in the repo.
- App-level profile/role/permission tables and RLS policies for normal users, creators, admins, and service roles.
- New media-oriented schemas such as `media`, `music`, `learning`, and `creator` or an equivalent boundary that fits the existing DB.
- `media_assets`, media versions, processing jobs, submissions, moderation state, publication state, and localization tables.
- Cloudflare R2 buckets for private submissions/masters and published music/learning/images.
- Upload authorization Worker/API and path-restricted direct-upload flow.
- Dockerized FFmpeg worker outside Expo and outside long-running Cloudflare Workers.
- Media resolver abstraction in the app.
- Playback engine, audio/video dependencies, synchronized lyrics support, offline download manager, and SQLite metadata store.
- CHC Artists application in the existing `CHC-Artists` repository, not embedded in this repo.

### Conflicts, Risks, and Required Follow-Up

- Local Wrangler is authenticated through `npx.cmd wrangler`; continue using the `.cmd` shims from PowerShell on this machine.
- PowerShell blocks the `npm.ps1` shim on this machine; use `npm.cmd`/`npx.cmd` or adjust execution policy for local development commands.
- The connected Cloudflare account currently has no R2 buckets and no standalone Workers, so Phase 2 will be greenfield inside the existing account. Be careful not to create duplicate resources if Claude creates them first.
- Supabase advisor reports RLS disabled on:
  - `calendar.psalms_ref_classification_20260827`
  - `calendar.psalms_reading_ref_map_20260827`
  - `bible.new_coptic_psalter_translation`
- Supabase advisor also reports security-definer views/functions and mutable search paths. These should be reviewed before expanding auth-sensitive creator/admin workflows.
- Several Supabase Edge Functions appear temporary/import-oriented and several have `verify_jwt = false`; they should be reviewed or retired before production hardening.
- The main repo contains `.env` with Supabase public configuration; never commit real secrets, and add `.env` handling to the operational handoff.
- CHC Artists is empty/uninitialized, so Phase 15 should scaffold there when its turn arrives.
- Work alongside Claude by re-checking `git status`, Cloudflare inventory, and Supabase schema state before each phase or migration.

---

# Phase 1 ✅ — Shared Backend Foundation

## Goal

Build the common data foundation shared by Music, Learn & Study, CHC Artists, and the future cross-linking of media with existing CHC content.

## Implement

- shared `media_assets` abstraction
- localization architecture
- creator/admin roles
- publication states
- media versions
- audit fields
- creator permissions
- common timestamps
- shared search foundations where appropriate
- TypeScript database models/types

Potential schema boundaries may include:

```text
media
music
learning
creator
```

Use whatever organization best fits the existing CHC database after inspection.

## Media Asset Model

Conceptually:

```sql
media_assets
------------
id uuid primary key
provider text
bucket text
path text
media_type text
mime_type text
codec text
duration_ms bigint
file_size_bytes bigint
bitrate integer
sample_rate integer
width integer
height integer
version integer
checksum text
processing_status text
created_at timestamptz
updated_at timestamptz
```

Canonical media references should store:

```text
provider
bucket
path
```

rather than hardcoded complete URLs.

## Security

Establish RLS foundations and least-privilege access.

Normal users, creators, admins, and server-side services should have clearly separate capabilities.

## Deliverable

- source-controlled migrations
- shared database foundation
- shared TypeScript types/models

## Phase 1 Implementation Report - 2026-09-16

Status: complete. The shared backend foundation has been created in the existing Supabase project and documented locally.

- Supabase migrations added and applied:
  - `20260916140850_create_shared_media_foundation`
  - `20260916141249_add_media_foundation_fk_indexes`
  - `20260916141400_add_media_locale_fk_indexes`
- New schemas:
  - `creator` for app profiles, app roles, creator accounts, and account membership
  - `media` for media references, media versions, locales, localized text, search documents, and aliases
  - `private` for RLS helper functions and trigger utilities
- New tables:
  - `creator.profiles`
  - `creator.user_roles`
  - `creator.creator_accounts`
  - `creator.creator_account_members`
  - `media.locales`
  - `media.media_assets`
  - `media.media_asset_versions`
  - `media.localized_texts`
  - `media.search_documents`
  - `media.search_aliases`
- Seeded locales: English, Arabic, Coptic, and French.
- RLS is enabled on every new table, with creator/admin/private-owner/public-published boundaries.
- Security-definer helper functions are kept in `private` with pinned empty `search_path`.
- Foreign key columns in the new `creator` and `media` schemas have covering indexes.
- Shared TypeScript models were added in `src/types/mediaPlatform.ts`.
- Phase documentation was added in `docs/media-platform/phase-1-shared-backend-foundation.md`.
- Supabase advisors were run after migration work. Remaining advisor findings are pre-existing outside the new Phase 1 schemas, except expected unused-index notices on brand-new empty tables.
- initial RLS policies
- localization foundation
- documented schema boundaries

---

# Phase 2 ✅ — Cloudflare R2 Media Infrastructure

## Goal

Make Cloudflare R2 the canonical CHC media-storage layer.

## Configure

Conceptually:

```text
chc-submissions     PRIVATE
chc-masters         PRIVATE

chc-music           PUBLISHED
chc-learning        PUBLISHED
chc-images          PUBLISHED
```

Adapt bucket organization if existing Cloudflare conventions suggest a better structure, while preserving the same privacy boundaries.

## Object Paths

Use immutable UUID-based paths.

Examples:

```text
submissions/
  {submission_uuid}/
    {track_uuid}/
      original.wav
```

```text
artists/
  {artist_uuid}/
    releases/
      {release_uuid}/
        tracks/
          {track_uuid}/
            v1/
              audio.m4a
```

Never use mutable artist/track display names as canonical identifiers.

Never overwrite published versions in place.

## Media Domain

Configure a clean delivery domain if appropriate, ideally:

```text
media.coptichymnscentre.com
```

or the appropriate existing CHC equivalent.

Verify:

- delivery
- Range requests
- CORS
- caching
- public/private behavior
- versioned assets

## Media Resolution

Create a reusable application-level resolver:

```ts
mediaService.resolve(asset)
```

The rest of CHC should not need to understand R2 URLs directly.

## Deliverable

A test media asset can be stored in R2, represented in Supabase, resolved through the CHC media service, and streamed successfully.

## Phase 2 Implementation Report - 2026-09-16

Status: complete. Cloudflare R2 is now the canonical media storage layer for the new CHC media platform foundation.

- Created R2 buckets in Cloudflare account `pKostantine` (`cf3267bfcb8e3b6d980e9a690c7e7a00`) with location hint `ENAM`:
  - `chc-submissions` private
  - `chc-masters` private
  - `chc-music` published delivery assets
  - `chc-learning` published delivery assets
  - `chc-images` published delivery assets
- Added and deployed the `chc-media-resolver` Worker:
  - source: `workers/media-resolver`
  - deployed URL: `https://chc-media-resolver.hrmpdd8d6c.workers.dev`
  - version ID: `e7908fc2-b905-4f2e-b34a-aab0b71b295c`
- The Worker exposes only:
  - `/music/{object_key}`
  - `/learning/{object_key}`
  - `/images/{object_key}`
  - `/health`
- The Worker intentionally does not expose `chc-submissions` or `chc-masters`.
- Added app-level media resolution in `src/services/mediaService.ts`.
- Added Phase 2 documentation in `docs/media-platform/phase-2-r2-media-infrastructure.md`.
- Uploaded a smoke-test WAV to:
  - bucket: `chc-music`
  - path: `artists/00000000-0000-4000-8000-000000000001/releases/00000000-0000-4000-8000-000000000002/tracks/00000000-0000-4000-8000-000000000003/v1/audio.wav`
- Represented that object in Supabase:
  - `media.media_assets.id = 1dde0683-faae-4312-9700-910d543a3216`
  - `media.media_asset_versions.id = ebdc5473-b101-4b3f-926d-62a7a9133e03`
- Verified:
  - Worker health returns 200
  - published media HEAD returns `audio/wav`, `Content-Length: 16044`, immutable cache headers, CORS, and `Accept-Ranges: bytes`
  - range request returns `206 Partial Content` with `Content-Range: bytes 0-15/16044`
  - private-style `/submissions/...` route returns 404

Custom domain note: `media.coptichymnscentre.com` is not configured yet because the connected Cloudflare account does not currently include the `coptichymnscentre.com` zone. The Worker URL is the active delivery base until that DNS access exists.

---

# Phase 3 ✅ — Secure Creator Upload Pipeline

## Goal

Allow CHC Artists to securely upload large original media files directly to Cloudflare R2.

## Flow

```text
CHC Artists
    ↓
authenticated upload request
    ↓
Cloudflare Worker / secure backend
    ↓
verify Supabase identity
    ↓
verify creator permission
    ↓
verify submission ownership
    ↓
issue temporary upload authorization
    ↓
direct upload to R2
```

Use either:

- presigned R2 S3 URLs
- temporary scoped R2 credentials

depending on which approach best fits the upload workflow.

## Requirements

Support:

- large files
- upload progress
- retry
- failure states
- resumability where practical
- expected content type/size checks
- strict object-path restrictions

A creator must not be able to:

- upload into another creator's submission
- upload directly into published buckets
- overwrite arbitrary R2 objects
- receive permanent R2 credentials

## Deliverable

An authenticated authorized test creator can upload an original file directly into the correct private submission path without routing the file through Supabase.

## Phase 3 Completion — 2026-09-16

Implemented:

- Added `media.upload_intent_status` and `media.upload_intents`.
- Added corrective migration `20260916185209_fix_upload_intent_path_regex.sql` for private submission object keys with file extensions.
- Added upload-intent RPCs:
  - `public.create_media_upload_intent(...)`
  - `public.get_media_upload_intent_for_upload(...)`
  - `public.complete_media_upload_intent(...)`
- Deployed Cloudflare Worker `chc-upload-authorizer`.
- Active Worker URL: `https://chc-upload-authorizer.hrmpdd8d6c.workers.dev`
- Bound Worker to private R2 bucket `chc-submissions`.
- Stored the Supabase publishable key as a Cloudflare Worker secret.
- Added TypeScript upload-intent types in `src/types/mediaPlatform.ts`.
- Added implementation notes in `docs/media-platform/phase-3-secure-creator-upload-pipeline.md`.

Verified:

- `npx.cmd tsc --noEmit` passes.
- Worker dry-run deploy passes.
- Worker health endpoint returns `200`.
- Missing bearer token returns `401 auth_required`.
- Malformed bearer token reaches Supabase and returns `401 PGRST301`.
- `media.upload_intents` has RLS enabled and creator/requester/expiry indexes.
- Creator/media foreign-key coverage check returns no missing FK indexes.
- Authenticated test creator `creator-test@coptichymnscentre.com` uploaded an original WAV directly through the upload Worker into private R2.
- Upload intent: `b414ff43-67ae-49d1-8b75-21e714f83a64`
- Creator account: `5facb1fd-4aff-43ed-9cf7-6f5670cf693a`
- R2 object: `chc-submissions/submissions/5facb1fd-4aff-43ed-9cf7-6f5670cf693a/b414ff43-67ae-49d1-8b75-21e714f83a64/original.wav`
- Size: `16044` bytes
- SHA-256: `56d4af65701c26df20bd4021eda95b6e830348ce3a746086079fe89285548dc9`
- Database finalized `media.upload_intents.status = 'uploaded'`, `uploaded_size = 16044`, and an R2 ETag was recorded.
- Downloading the private object via Wrangler returned the same byte count and SHA-256.

Implementation note:

- The deployed flow uses a Worker-authorized upload URL with an R2 binding rather than R2 S3 presigned URLs because R2 S3 credentials have not been provisioned yet. The file still bypasses Supabase and lands directly in the private R2 submission bucket.

---

# Phase 4 ✅ — Media Processing Pipeline

## Goal

Turn creator-uploaded source files into standardized CHC delivery media.

## Audio Standard

```text
M4A
AAC-LC
256 kbps
```

## Worker

Create a Dockerized FFmpeg/ffprobe media worker.

Conceptual flow:

```text
claim queued job
↓
download original from private R2
↓
ffprobe
↓
validate
↓
preserve master
↓
transcode delivery copy
↓
extract metadata
↓
calculate checksum
↓
upload delivery asset to R2
↓
update Supabase
↓
complete job
```

## Processing Jobs

Conceptually:

```sql
media_processing_jobs
---------------------
id
submission_id
media_asset_id
job_type
status
attempt_count
input_bucket
input_path
output_bucket
output_path
error_message
created_at
started_at
finished_at
```

Statuses:

```text
queued
processing
completed
failed
```

Use safe job claiming.

Do not allow two workers to process the same job concurrently.

## Video Groundwork

For Learn & Study video, establish a sensible compatible format such as:

```text
MP4
H.264
AAC
```

where appropriate.

Do not add unnecessary adaptive-streaming complexity yet.

## Deliverable

A test WAV/FLAC source can enter the queue and automatically produce a valid, playable 256 kbps AAC M4A delivery file in R2.

## Phase 4 Completion — 2026-09-16

Implemented:

- Added media processing job enums and queue table.
- Added safe worker claiming with `FOR UPDATE SKIP LOCKED`.
- Added token-guarded worker RPCs for claim, complete, and failure reporting.
- Added creator enqueue RPC for uploaded audio intents.
- Added Docker-ready media processor in `workers/media-processor`.
- Added `ffmpeg-static` and `ffprobe-static` processor dependencies.
- Added S3-compatible R2 runtime path plus Wrangler fallback for this workspace.
- Added Phase 4 TypeScript types in `src/types/mediaPlatform.ts`.
- Added implementation notes in `docs/media-platform/phase-4-media-processing-pipeline.md`.

Verified:

- Authenticated test creator uploaded a 44.1 kHz stereo WAV source.
- Upload intent `85712f4f-0873-4cd8-b80f-bf5aad1a85c8` entered the processing queue.
- Job `407d666b-8ed6-4cbf-90fa-0be90b79fc84` was claimed and completed by the media processor.
- Output object:
  `chc-music/processed/5facb1fd-4aff-43ed-9cf7-6f5670cf693a/85712f4f-0873-4cd8-b80f-bf5aad1a85c8/v1/audio.m4a`
- Output size: `162028` bytes
- Output SHA-256: `c877fb3936ee3255973f558718d9240bc4f66e7517db7e650b6793fbabf2fc86`
- Resolver HEAD returned `200`, `Content-Type: audio/mp4`, immutable cache headers, CORS, and byte-range support.
- ffprobe confirmed M4A/MP4 container, AAC-LC audio, stereo 44.1 kHz, and audio bit rate about `255378` bps.

Implementation note:

- The current workspace processor uses Wrangler for R2 object transfer because R2 S3 credentials are not provisioned yet. The Docker worker already supports an S3-compatible R2 path for production credentials.

---

# Phase 5 ✅ — Submission, Moderation, and Publishing

## Goal

Establish the complete creator → Pierre/admin → processing → publication workflow before consumer features depend on it.

## Submission Types

Potentially:

```text
music_release
learning_album
learning_lesson_set
artist_update
cantor_update
```

## Submission Lifecycle

```text
draft
uploading
ready_to_submit
pending_review
changes_requested
approved
processing
published
rejected
```

## Track

- creator
- created timestamp
- submitted timestamp
- review deadline
- reviewer
- reviewed timestamp
- review notes
- status
- audit history

On submission:

```text
review_due_at = submitted_at + 48 hours
```

This is an administrative SLA.

Do **not** automatically publish or approve after 48 hours.

## Admin Actions

```text
Approve
Request Changes
Reject
```

Creators must be able to receive feedback and resubmit.

## Publication

Approval should trigger validation and processing, not simply toggle an `is_published` boolean.

Conceptually:

```text
approve
↓
validate
↓
enqueue processing
↓
process required assets
↓
verify all outputs
↓
write/update canonical catalog
↓
publish lyrics/search data
↓
atomically expose content
```

Do not partially publish broken albums or incomplete learning sets.

## Deliverable

A complete test submission can move successfully from draft through approval, processing, and publication.

## Phase 5 Completion — 2026-09-16

Status: complete. The creator submission, admin moderation, processing, and publication workflow is now implemented and verified against the live Supabase project and Cloudflare media path.

Implemented:

- Added `media.submission_type`.
- Added `media.submissions`, `media.submission_items`, and `media.submission_events`.
- Added RLS-backed read access for creator-account members/admins.
- Added submission workflow RPCs:
  - `public.create_media_submission`
  - `public.add_media_submission_item`
  - `public.submit_media_submission`
  - `public.review_media_submission`
  - `public.publish_media_submission`
- Added Phase 5 TypeScript contracts in `src/types/mediaPlatform.ts`.
- Added follow-up FK covering indexes reported by Supabase performance advisor.
- Added implementation notes in `docs/media-platform/phase-5-submission-moderation-publishing.md`.

Migrations:

- `20260916192454_create_submission_moderation_publication_workflow.sql`
- `20260916192807_add_submission_workflow_fk_indexes.sql`

Verified:

- Fresh creator upload was submitted as a music release.
- Submission `961b382b-5ce4-41a7-b3cb-438ad7dc9ebd` moved through:
  `draft -> ready_to_submit -> pending_review -> approved -> processing -> published`.
- Processing job `214b0928-d529-42ea-b924-ebbf0663f9a9` completed.
- Media asset `9bab5973-0ec9-41fa-852e-7225a15f29db` was published.
- Published object:
  `chc-music/processed/5facb1fd-4aff-43ed-9cf7-6f5670cf693a/5339f85a-7efc-40a2-96fb-e9f458146394/v1/audio.m4a`
- Resolver HEAD returned `200`, `Content-Type: audio/mp4`, immutable cache headers, and byte-range support.
- `npx.cmd tsc --noEmit` passed.

Implementation note:

- The Phase 5 RPCs are intentionally exposed to authenticated users and guarded internally with creator membership/admin checks. Supabase advisors still report this class of `SECURITY DEFINER` warning, plus older project-wide backup/staging-table warnings that predate this phase.
- The temporary smoke-test admin role should be removed or rotated before production use.

---

# Phase 6 ✅ — Hymns & Songs Data Model

## Goal

Create the full canonical backend for the CHC music experience.

## Core Concepts

```text
artists
artist_localizations
artist_memberships

releases
release_localizations

tracks
track_localizations

release_tracks
track_artists

likes
follows
playlists
playlist_tracks
play_history
```

## Release Model

Every public track belongs to a release.

Release types:

```text
single
ep
album
```

A Single is still a release containing one track.

There should be no public orphan tracks.

## Artist Pages Must Support

- profile image
- English/Arabic names
- biography where provided
- Albums
- Singles & EPs
- track/release credits

## Deliverable

A complete published album can exist in Supabase, reference R2 delivery assets, and be queried cleanly by the consumer application.

## Phase 6 Completion — 2026-09-16

Status: complete. The canonical Hymns & Songs backend schema now exists and has been verified with a published album that references a Phase 5/6 published R2 delivery asset.

Implemented:

- Added the `music` schema.
- Added music catalog enums:
  - `music.release_type`
  - `music.track_artist_role`
  - `music.playlist_visibility`
- Added artist, release, track, localization, membership, credit, playlist, like, follow, and play-history tables.
- Added RLS policies for published catalog reads, creator/admin catalog management, and user-owned library data.
- Added admin publishing RPC `public.publish_music_release`.
- Added anonymous consumer read RPC `public.get_published_music_release`.
- Added Phase 6 TypeScript contracts in `src/types/mediaPlatform.ts`.
- Added implementation notes in `docs/media-platform/phase-6-hymns-songs-data-model.md`.

Migrations:

- `20260916193730_create_music_catalog_schema.sql`
- `20260916193923_add_music_catalog_audit_fk_indexes.sql`

Verified:

- Created and published test artist `425654dd-e56c-4845-ab6c-d7ea89766e05`.
- Created and published test album `436a9f01-f74a-4279-be13-37fc6545db48`.
- Created and published test track `003b6ff2-b639-4050-ac72-f19c33dba82f`.
- Track references published media asset `9bab5973-0ec9-41fa-852e-7225a15f29db`.
- Anonymous `get_published_music_release` returned album title, release type, primary artist, ordered track, track artist, R2 bucket/path, and `audio/mp4` media metadata.
- Focused music-schema FK-index check returned no missing covering indexes.
- `npx.cmd tsc --noEmit` passed.

Implementation note:

- `publish_music_release` is intentionally a `SECURITY DEFINER` authenticated RPC guarded by the admin role. Supabase advisors flag this class of function by design.
- Supabase advisors still report older project-wide backup/staging-table and security-definer findings outside this phase.

---

# Phase 7 — Synchronized Lyrics

## Goal

Implement structured multilingual synchronized lyrics as a native CHC feature.

## Canonical Data

Do not use LRC files as the canonical storage format.

Conceptually:

```sql
music.lyric_sets
----------------
id
track_id
locale
kind
sync_precision
```

Kinds may include:

```text
original
translation
transliteration
```

Lines:

```sql
music.lyric_lines
-----------------
id
lyric_set_id
sequence
start_ms
end_ms
text
```

Future optional word timing:

```sql
music.lyric_words
-----------------
id
lyric_line_id
sequence
start_ms
end_ms
text
```

## Requirements

Support multiple lyric sets for the same recording, such as:

- Coptic
- Arabic
- English
- transliteration

Line synchronization must work now.

Word-level synchronization may remain future-facing.

## CHC Artists Editor

Build a first useful lyrics editor supporting:

- paste/type lyrics
- split lines
- reorder
- playback
- mark line timestamps
- edit timestamps
- preview
- save draft
- import LRC
- export LRC

## Deliverable

A test track can play while its selected synchronized lyric set highlights correctly in real time.

---

# Phase 8 — Hymns & Songs Consumer Experience

## Goal

Build the actual CHC music experience.

## Design Direction

Use:

```text
CHC visual identity
+
modern music-app interaction patterns
```

Do not clone Spotify or Apple Music visually.

Do not force Books layouts onto music screens.

Reuse CHC typography, colors, spacing, surfaces, buttons, sheets, icon treatment, and other shared visual primitives where they make sense.

## Build

- music home/discovery
- artist pages
- release pages
- track lists
- search interface
- playlists
- Liked Songs
- library
- mini player
- full Now Playing
- queue
- synchronized lyrics
- download actions

## Deliverable

A polished streaming music experience exists inside CHC and visually belongs to the same application as Books.

---

# Phase 9 — Global Playback Engine

## Goal

Create one robust playback foundation that survives navigation and can serve both Music and Learn & Study.

## Support

- play
- pause
- seek
- previous
- next
- queue
- repeat
- shuffle where appropriate
- background playback
- lock-screen/media controls
- metadata/artwork
- persistent state during navigation
- remote playback
- local downloaded playback
- synchronized lyrics

The player should accept a normalized playable entity so music and learning can share the low-level engine where practical.

## Deliverable

Playback remains stable across navigation, background state, remote media, and local media on supported platforms.

---

# Phase 10 — Learn & Study Backend

## Goal

Create a dedicated structured backend for educational material rather than forcing it into the music release model.

## Core Concepts

- cantors
- cantor localizations
- cantor permissions
- seasons
- canonical hymns / hymn relationships
- learning albums
- album recordings
- lesson sets
- lessons
- learning playlists
- user learning progress

## Discovery Model

Primary entry points:

```text
Cantors
Seasons
```

## Learning Album

Conceptually:

```text
Cantor
→ Season
→ Album
→ Ordered Recordings
```

Learning albums do not require Spotify-style commercial release metadata.

## Lesson Set

Conceptually:

```text
Cantor
→ Season
→ Hymn
→ Ordered Lessons
```

Lessons may be:

```text
audio
video
```

## Learning Progress

Use state, not fake playlists:

```text
will_learn
learning
finished
```

Presented to users as:

- Will Learn
- Currently Learning
- Finished Learning

Custom learning playlists remain a separate feature.

## Deliverable

Learning content can be represented, submitted, processed, published, and retrieved cleanly.

---

# Phase 11 — Learn & Study Consumer Experience

## Goal

Build a dedicated educational media experience.

## Design Direction

Learn & Study should feel related to CHC but distinct from both Books and Hymns & Songs.

Use CHC's shared visual language, while designing learning-specific interactions.

## Build

- Learn landing page
- Cantors
- Seasons
- cantor detail
- season detail
- learning albums
- lesson sets
- hymn-learning pages
- audio lessons
- video lessons
- Will Learn
- Currently Learning
- Finished Learning
- custom playlists
- search
- download actions

Cantor profiles may borrow useful concepts from artist pages, but they should expose learning-oriented structures.

Lesson sets should feel like structured study playlists/courses rather than music releases.

## Deliverable

Users can discover, play, track, and navigate published learning content through a coherent CHC learning interface.

---

# Phase 12 — Unified Search

## Goal

Create useful multilingual discovery across Music and Learn & Study.

## Search Music

- artists
- releases
- tracks

## Search Learning

- cantors
- seasons
- hymns
- learning albums
- lessons

## Arabic Normalization

Keep displayed Arabic untouched.

For search indexing/matching only, account for:

- tashkeel
- tatweel
- alef variants
- other common orthographic normalization

For example, normalize where appropriate:

```text
أ
إ
آ
ا
```

## Aliases

Support alternate spellings/transliterations.

Example:

```text
Ibrahim Ayad
Ebrahim Ayad
Ibrahim Ayyad
إبراهيم عياد
```

can all map to the same canonical entity when aliases are configured.

## Technology

Use PostgreSQL-based search first.

Do not introduce Algolia, Elasticsearch, or Typesense unless the native solution genuinely becomes insufficient.

## Deliverable

Useful English/Arabic/transliterated searches return correctly typed and sensibly ranked Music and Learning results.

---

# Phase 13 — Offline Downloads

## Goal

Make both Hymns & Songs and Learn & Study fully useful without internet connectivity.

## Storage

Use persistent application document storage.

Do not treat offline downloads as disposable cache.

Use SQLite for local offline metadata.

## Download Manager

Create a central abstraction supporting:

```ts
DownloadManager.enqueue()
DownloadManager.pause()
DownloadManager.resume()
DownloadManager.cancel()
DownloadManager.retry()
DownloadManager.remove()
DownloadManager.getProgress()
DownloadManager.isDownloaded()
DownloadManager.resolvePlaybackUri()
```

## Music Downloads

Support:

- individual track
- Single
- EP
- Album
- playlist
- Liked Songs

## Learning Downloads

Support:

- individual lesson
- entire lesson set
- learning album
- learning playlist

Support both audio and video.

## Offline Metadata

Music should retain locally:

- media
- title
- artist
- release
- artwork
- lyrics
- lyric timings
- duration
- version/checksum information

Learning should retain locally:

- media
- cantor
- season
- hymn
- album/lesson set
- ordering
- artwork
- duration
- relevant learning metadata

## Playback Resolution

```text
if valid local download exists:
    play local file
else:
    stream Cloudflare media
```

## Deliverable

Downloaded music and learning material remain usable in airplane mode, including synchronized lyrics and lesson ordering where applicable.

---

# Phase 14 — Download Versioning and Storage Management

## Goal

Keep offline libraries reliable after published content is corrected or replaced.

## Version Detection

Example:

```text
local version = v1
canonical version = v2

→ update available
```

Use immutable R2 paths.

Store version/checksum locally.

## Implement

- stale-download detection
- checksum validation
- interrupted/incomplete download cleanup
- replacement/update flow
- storage usage reporting
- Remove All Downloads
- Wi-Fi-only downloads
- cellular-download preferences
- video-over-cellular preference

Storage reporting should distinguish where useful:

```text
Music
Learning Audio
Learning Video
Total
```

## Deliverable

A downloaded library survives canonical media revisions without silently playing corrupt or outdated content.

---

# Phase 15 — CHC Artists Application

## Goal

Build the creator/cantor companion application so creators can manage and submit content without manually interacting with Supabase, R2, or developer tools.

## Design

CHC Artists should share CHC branding and design DNA, but should be purpose-built as a creator dashboard.

It does not need to use the same screen layouts as Books, Hymns & Songs, or Learn & Study.

## Build

- authentication
- creator dashboard
- artist management
- cantor management
- release creation
- learning-album creation
- lesson-set creation
- localized metadata editing
- artwork upload
- large media upload
- upload progress
- track ordering
- lesson ordering
- media preview
- lyrics editor
- submission preview
- submit
- submission status
- requested-changes flow
- processing state
- publication state

## Music Flow

```text
Create Release
→ Single / EP / Album
→ metadata
→ artwork
→ tracks
→ localized titles
→ masters
→ artist credits
→ synchronized lyrics
→ preview
→ submit
```

## Learning Flow

```text
choose cantor
→ choose season
→ Learning Album or Lesson Set
→ hymn where applicable
→ upload media
→ order content
→ preview
→ submit
```

## Deliverable

An authorized creator can complete both a Music submission and a Learn & Study submission entirely through CHC Artists.

---

# Phase 16 — Admin Review Experience

## Goal

Give Pierre/admin a proper interface for operating the moderation and publishing workflow.

## Build

- pending review queue
- filters
- creator information
- submission type
- metadata
- artwork
- media previews
- synchronized lyrics preview
- validation issues
- submitted timestamp
- 48-hour review deadline
- due-soon indicator
- overdue indicator
- approval
- request changes
- rejection
- review notes
- audit history
- processing status
- publication status

## Deliverable

Pierre can review and operate the full content-publishing workflow without manually editing database records.

---

# Phase 17 — Cross-Linking with Existing CHC Content

## Goal

Begin connecting the new media platform to the existing textual/liturgical CHC ecosystem through stable canonical identities.

## Investigate

Determine how existing CHC hymn/content structures should relate to:

- music recordings
- learning lesson sets
- lyric sets
- translations
- textual hymn pages

## Long-Term Experience

Where appropriate, CHC should eventually be able to expose concepts like:

```text
Read
Listen
Learn
```

for the same hymn.

Do not create fragile title-string matching as the permanent relationship.

Do not redesign the entire Books system simply to accomplish this phase.

## Deliverable

A clean canonical-linking architecture exists, with initial cross-links implemented where safe and useful.

---

# Phase 18 — Hardening, QA, and Production Readiness

## Goal

Validate the complete platform before public release.

## Run

- TypeScript checks
- lint
- unit tests
- integration tests
- Expo builds
- web builds
- Worker tests
- Wrangler validation
- R2 access tests
- Supabase migration validation
- RLS/security tests
- upload authorization tests
- playback tests
- background playback tests
- synchronized lyrics tests
- offline tests
- download revision tests
- failed-processing tests
- failed-publication tests
- creator-permission tests

## End-to-End Music Test

```text
creator upload
↓
review
↓
approval
↓
processing
↓
publication
↓
search
↓
stream
↓
lyrics
↓
like
↓
playlist
↓
download
↓
airplane mode
```

## End-to-End Learning Test

```text
creator upload
↓
review
↓
processing
↓
publication
↓
discover through Cantor/Season
↓
play lesson set
↓
mark Currently Learning
↓
download
↓
airplane mode
```

## Regression Testing

Verify that the new media platform does not break existing CHC Books or other existing CHC functionality.

## Deliverable

A production-ready build with documented known issues and validated core workflows.

---

# Phase 19 — Documentation and Operational Handoff

## Goal

Ensure the system remains understandable and maintainable after initial implementation.

## Document

- overall architecture
- Cloudflare integration
- Cloudflare account/resource assumptions
- Wrangler setup
- R2 buckets
- R2 path conventions
- Workers
- media custom domain
- Supabase schemas
- RLS
- authentication
- creator permissions
- environment variables
- media worker
- FFmpeg requirements
- upload pipeline
- processing jobs
- submission lifecycle
- moderation
- publication pipeline
- synchronized lyrics
- search normalization
- offline SQLite architecture
- download manager
- download versioning
- consumer navigation
- CHC Artists architecture
- design-system relationship
- adding future locales
- local development
- deployments
- troubleshooting/recovery

Provide `.env.example` files where appropriate.

Never commit real secrets.

## Final Implementation Report

The final report should clearly list:

1. what was changed
2. Cloudflare resources used or created
3. R2 buckets created/configured
4. Workers created/modified
5. Supabase migrations created
6. schemas/tables/types/policies introduced
7. major modules/components introduced
8. media-worker status
9. CHC Artists status
10. offline-download status
11. tested end-to-end flows
12. design decisions relative to Books
13. manual configuration still required
14. unresolved issues
15. recommended next steps

## Deliverable

A maintainable, documented production architecture rather than a system that only the original implementation session understands.

---

# Recommended Execution Groups

Claude should **not** attempt all phases at once.

A safer working sequence is:

## Group A — Understand and Build the Infrastructure

```text
Phase 0
Phase 1
Phase 2
Phase 3
Phase 4
Phase 5
```

At the end of this group, the backend and creator-to-publication pipeline should exist even if the final consumer UI does not.

---

## Group B — Build the Music Platform

```text
Phase 6
Phase 7
Phase 8
Phase 9
```

At the end of this group, Hymns & Songs should function as a real music experience.

---

## Group C — Build the Learning Platform

```text
Phase 10
Phase 11
```

At the end of this group, Learn & Study should function as a dedicated educational experience.

---

## Group D — Discovery and Offline

```text
Phase 12
Phase 13
Phase 14
```

At the end of this group, the media platform should be searchable and genuinely usable offline.

---

## Group E — Complete the Creator/Admin Ecosystem

```text
Phase 15
Phase 16
```

At the end of this group, content management should no longer require manual developer/database intervention.

---

## Group F — Integrate, Harden, and Hand Off

```text
Phase 17
Phase 18
Phase 19
```

At the end of this group, the new media system should be integrated with the broader CHC ecosystem, production-tested, and documented.

---

# Final Outcome

After all phases are complete, CHC should no longer be simply a textual application with media added onto it.

It should be a unified Coptic Orthodox platform with three first-class consumer experiences:

```text
Books
Hymns & Songs
Learn & Study
```

supported by:

```text
CHC Artists
```

for creator/cantor workflows.

The final architecture should maintain clear responsibility boundaries:

```text
Supabase
→ data, identity, permissions, metadata, catalog, user state

Cloudflare
→ media storage, delivery, uploads, CDN infrastructure

FFmpeg Worker
→ media normalization and processing

CHC
→ listening, studying, reading, search, playlists, downloads

CHC Artists
→ content creation, uploads, submissions, creator management

Device Storage + SQLite
→ true offline media access
```

The product should feel like **one CHC ecosystem**, with a consistent underlying design identity but purpose-built interfaces for reading, music, learning, and creator administration.

The implementation should prioritize:

- maintainability
- security
- data integrity
- reliable offline behavior
- low media infrastructure cost
- good creator workflows
- polished consumer UX
- reuse of existing CHC systems
- future compatibility with Coptic/French localization and deeper Read / Listen / Learn integration
