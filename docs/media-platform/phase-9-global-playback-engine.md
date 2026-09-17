# Phase 9 - Global Playback Engine

Completed on 2026-09-16.

## Goal

Phase 9 replaces the Phase 8 Music-only playback implementation with one normalized app-wide playback foundation that can serve Music now and Learn & Study later.

The engine stays on the project's stable Expo SDK 57 stack rather than upgrading the entire application to the newly introduced SDK 58 beta solely for newer playlist-level lock-screen APIs.

## Architecture

New shared contracts live in:

- `src/types/playback.ts`
- `src/context/PlaybackContext.tsx`
- `src/utils/playbackEngine.ts`
- `src/utils/playbackStateStorage.ts`

`PlayableEntity` is the low-level contract. It carries only playback-facing information:

- canonical id
- entity kind (`music_track`, `learning_audio`, or `learning_video_audio`)
- title
- artist / presenter label
- album / collection title
- artwork URI
- duration
- local and remote source candidates
- optional lyric reference

Product-specific Music or future Learn data remains in `PlaybackQueueEntry.payload` instead of coupling the low-level engine to either schema.

`src/context/MusicPlayerContext.tsx` is now a compatibility/product adapter over `PlaybackContext`. Existing Phase 8 Music screens therefore continue using the same `useMusicPlayer()` API while playback itself is global and reusable.

## Playback Features

Implemented in the shared engine:

- play / pause
- seeking
- previous
- next
- ordered queue
- queue-index selection
- repeat off / repeat all / repeat one
- shuffle with restoration of the original queue order
- automatic next-track advancement
- automatic repeat-one replay
- background-capable audio session
- lock-screen / media controls supported by Expo Audio on SDK 57
- lock-screen title / artist / album / artwork metadata
- lock-screen seek forward/backward controls
- current playback position and duration
- source loading/buffering state
- playback error state
- app-wide state that survives navigation
- persisted queue, repeat/shuffle mode, selected index, and coarse resume position across application restarts
- synchronized lyrics remain driven from the shared playback clock

The Music Now Playing screen now exposes Shuffle and Repeat controls.

## Background Playback

`app.json` now configures the `expo-audio` config plugin with background playback enabled while explicitly disabling recording permissions/features that CHC does not need.

Runtime audio mode is configured with:

- `playsInSilentMode: true`
- `shouldPlayInBackground: true`
- `interruptionMode: 'doNotMix'`

`doNotMix` is required by Expo Audio for its lock-screen controls and also gives CHC normal OS audio-focus behavior for calls and competing audio sessions.

The current playable entity is registered with `setActiveForLockScreen`, including metadata and artwork. On Android this also activates the media-playback foreground service path required for sustained background playback.

Expo Audio itself handles noisy-route behavior such as headphones/Bluetooth disconnection.

## SDK 57 Compatibility Decision

Expo SDK 57 / `expo-audio ~57.0.5` supports background playback and lock-screen controls on `AudioPlayer`, which CHC uses as the native playback primitive.

Playlist-level lock-screen control support is an SDK 58-era addition. SDK 58 only entered beta on 2026-09-15, so Phase 9 deliberately does not migrate the whole CHC application to that beta.

Consequently:

- CHC has lock-screen play/pause, scrub/seek, metadata, artwork, and sustained background playback on the SDK 57 path.
- Previous / next / repeat / shuffle are fully supported by the CHC engine and in-app UI.
- A future stable SDK 58+ upgrade can move more queue behavior into Expo Audio's native `AudioPlaylist` and expose richer playlist-level lock-screen controls without changing CHC's normalized `PlayableEntity` contract.

## Remote and Downloaded Media

Each playable source may supply:

- `localUri`
- `remoteUri`
- optional remote headers

Resolution rules are:

1. Prefer the local URI when supplied and still present on disk.
2. If a `file://` download is missing, fall back to the remote URI.
3. If no valid local or remote source exists, expose a playback error instead of corrupting queue state.

Music queue items already accept an optional `localUri`. Phase 13 can attach its durable downloaded file directly without replacing the playback engine.

## Persistence

Playback state is stored separately from reading preferences using the existing CHC persistence conventions:

- `localStorage` on web
- an app-document JSON file on native

Persisted state includes:

- normalized queue
- original pre-shuffle queue
- current index
- coarse resume position
- repeat mode
- shuffle state

Restored sessions are loaded paused at the remembered position so opening CHC never starts audio unexpectedly.

## Queue Semantics

- Previous restarts the current item when playback has passed four seconds; otherwise it selects the previous item.
- Repeat All wraps manual/automatic navigation at queue boundaries.
- Repeat One replays the current entity when it finishes but does not trap the user's manual Next action.
- Shuffle preserves the currently playing entity while randomizing the remainder and can reconstruct the original ordered queue exactly.

## Synchronized Lyrics

No second timing source was introduced. Phase 7 lyrics continue using `currentTimeMs`, but that clock now comes from the shared Phase 9 engine.

This means Music lyrics already follow the same low-level clock that future learning-audio lyrics/transcripts can use.

## Tests

Added:

- `tests/playbackEngine.test.cjs`
- `npm run test:playback`

Coverage includes:

- manual next/previous queue boundaries
- repeat-all wrapping
- repeat-one completion behavior
- shuffle preserving the current item
- restoration of original queue order
- local-media preference and remote fallback
- playback snapshot sanitization

## Verification

The Phase 9 GitHub Actions verification run completed successfully with:

- `npm ci --ignore-scripts`
- `npx expo config --type public`
- `npx tsc --noEmit`
- `npm run test:playback`
- `npm run test:lyrics`

The Now Playing repeat/shuffle integration was committed only after those checks passed.

## Physical-Device QA

Background audio and lock-screen UI ultimately depend on iOS/Android native behavior and therefore cannot be exhaustively proven by a Linux CI runner. Phase 9 contains the required native config and runtime setup; Phase 18 production QA should explicitly exercise:

- iPhone background + screen lock
- iPad background + screen lock
- Android background + screen lock
- Control Center / notification play-pause and seek
- incoming-call / competing-audio interruption
- headphone/Bluetooth disconnect
- queue transition while backgrounded
- remote R2 track playback
- downloaded `file://` playback

This is release QA, not missing Phase 9 architecture.

## Follow-Up

- Phase 10/11 can build Learn & Study playback entries directly against `PlaybackContext`.
- Phase 13 should populate `localUri` from its offline-download index.
- A future stable Expo SDK 58+ upgrade can evaluate migrating the native primitive to `AudioPlaylist` while retaining the same CHC playback contract.
