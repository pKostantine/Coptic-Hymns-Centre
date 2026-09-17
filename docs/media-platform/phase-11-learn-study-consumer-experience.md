# Phase 11 - Learn & Study Consumer Experience

Completed on 2026-09-17.

## Scope

Phase 11 adds the complete consumer-facing Learn & Study product to the CHC Expo application. It consumes the Phase 10 learning catalog and user-state APIs, and it reuses the Phase 9 global playback engine without treating learning material as Music releases.

Learn & Study remains recognizably CHC through the existing navy surfaces, gold supporting accents, typography, spacing, and bilingual behavior. A restrained teal accent and course-oriented information hierarchy distinguish the educational experience from both Books and Music.

## Consumer experience

Implemented in the main CHC application:

- Learn & Study as a peer top-level tab beside Books, Music, and Settings
- bilingual English/Arabic Learn landing and discovery
- Cantor directory and Cantor detail
- Season directory and Season detail
- canonical Hymn learning pages
- learning Album detail with ordered recordings
- Lesson Set detail with ordered audio/video lessons
- individual audio and video lesson pages
- Learn search across Cantors, Seasons, Hymns, Albums, Lesson Sets, and lessons
- Will Learn, Currently Learning, and Finished Learning state controls
- My Learning library grouped by progress state
- custom learning playlist creation and detail
- mixed recording/lesson playlist playback
- playlist item removal for playlist owners
- mini player and full Learn Now Playing experience
- queue selection, seeking, previous/next, and repeat controls
- download actions throughout the learning experience

Download controls are intentionally consumer affordances in Phase 11. Phase 13 owns durable local storage, download lifecycle/versioning, and complete offline behavior.

## Navigation and product boundary

The Learn tree lives under `src/app/learn` and includes dedicated routes for discovery, search, personal library, Cantors, Seasons, Hymns, Albums, Lesson Sets, lessons, playlists, and Now Playing.

Its information architecture follows the Phase 10 learning relationships:

```text
Cantor -> Album -> Ordered Recordings
Cantor -> Lesson Set -> Ordered Lessons
Season -> Hymn -> Lesson Sets
```

This keeps learning navigation focused on teachers, liturgical seasons, canonical hymns, and ordered instruction. Music continues to organize around artists, releases, and tracks, while Books remains document-oriented.

## Playback and video

`LearningPlayerContext` adapts learning recordings and audio lessons to the Phase 9 normalized `PlaybackContext` as `learning_audio` entities. Learn and Music therefore share one real audio session, persistent queue engine, background behavior, lock-screen metadata path, local-versus-remote source selection, seeking, and repeat behavior.

Learning queues retain their educational container metadata so the mini player and Now Playing screen can return the listener to the source Album or Lesson Set.

Video lessons use Expo SDK 57's `expo-video ~57.0.4` package with native controls and fullscreen support. Opening a video lesson pauses active global audio so audio and video do not compete.

## Learning progress and playlists

The consumer uses Phase 10's authenticated APIs directly:

- `get_my_learning_progress`
- `set_learning_progress`
- `get_my_learning_playlists`
- `create_learning_playlist`
- `get_learning_playlist`
- `add_learning_playlist_item`
- `remove_learning_playlist_item`

Anonymous visitors can browse, listen, and watch all published learning material. Progress and custom playlist controls detect an anonymous session and explain that a CHC account is required instead of attempting unauthorized mutations.

Progress is kept on the canonical Hymn identity, independent of playlists. Custom playlists may mix learning Album recordings with audio or video lessons.

## Search

Phase 10 intentionally shipped focused retrieval RPCs rather than a dedicated search RPC. Phase 11 builds a five-minute in-memory index from those published read APIs, applies English/Arabic normalization, and searches all learning entity types.

This provides a complete Phase 11 search experience without extending the Phase 10 database contract. Phase 12 can replace the client aggregation with unified cross-domain server search while preserving the UI result model.

## Media delivery

All audio, video, artwork, and profile image references remain canonical media references:

```text
provider
bucket
path
```

`learningService` resolves them through the shared `mediaService`. No mutable complete Cloudflare R2 URL is stored in learning catalog state.

## Verification

Verified locally:

- `npx tsc --noEmit`
- ESLint across every Phase 11 file and each shared file changed by Phase 11
- `npm run test:slideshow` - 20 passing tests
- `npm run test:conditions` - 4 passing tests
- `npm run test:lyrics` - 5 passing tests
- `npm run test:playback` - 5 passing tests

The repository-wide lint command also reports existing React Compiler rule failures in pre-Phase-11 Books and Music files. The Phase 11 and shared changed-file lint target completes with no warnings or errors.

The live Phase 10 smoke catalog was read successfully through Home, Cantor, Season, Hymn, Album, and Lesson Set APIs before integration. No Phase 11 database migration was required.

## Follow-up

- Phase 12 can move Learn search into CHC's unified server-backed search experience.
- Phase 13 should connect the download controls to durable media storage, version checks, and local playback.
- Phase 14 should finish offline-first state synchronization and conflict handling for user progress and playlists.
