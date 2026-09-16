# Phase 7 - Synchronized Lyrics

Completed on 2026-09-16.

## Scope

Phase 7 adds structured multilingual synchronized lyrics to the CHC music platform and the first focused creator surface in the separate `pKostantine/CHC-Artists` repository.

LRC is supported only as an interchange format. Canonical lyrics remain structured PostgreSQL data.

## Supabase Migrations

- `20260916195530_create_synchronized_lyrics_schema.sql`
- `20260916204300_add_synchronized_lyrics_editor_rpcs.sql`
- `20260916210000_harden_synchronized_lyrics_editor_rpcs.sql`
- `20260916211200_fix_synchronized_lyrics_editor_rls_returning.sql`

## Canonical Model

Enums:

- `music.lyric_kind`: `original`, `translation`, `transliteration`
- `music.lyric_sync_precision`: `unsynced`, `line`, `word`

Tables:

- `music.lyric_sets`
- `music.lyric_lines`
- `music.lyric_words`

`music.lyric_words` is intentionally future-facing. Phase 7 requires line synchronization now; the schema can add word timing without replacing the canonical lyric model later.

A track may have independent lyric sets by locale and kind, including Coptic, Arabic, English, French, translations, and transliterations.

## Public and Editor APIs

Consumer/publishing RPCs:

- `public.get_published_track_lyrics(p_track_id, p_locale, p_kind)`
- `public.publish_track_lyric_set(p_lyric_set_id)`

Authenticated editor RPCs:

- `public.get_lyric_editor_tracks()`
- `public.get_track_lyric_draft(p_track_id, p_locale, p_kind)`
- `public.save_track_lyric_draft(...)`

The editor RPCs execute as `SECURITY INVOKER` and rely on the existing creator/music RLS model. Draft saves replace the ordered line set atomically in one database transaction.

The first implementation used `INSERT ... RETURNING` inside the invoker save RPC. Authenticated RLS verification showed PostgreSQL rejected that return path even though the insert policy predicates passed. The final implementation inserts/updates first and then performs a separately authorized select, preserving RLS rather than weakening the function to `SECURITY DEFINER`.

## CHC Artists Lyrics Studio

Phase 7 initializes the separate `pKostantine/CHC-Artists` repository with a focused Expo 57 Lyrics Studio. This is not the full Phase 15 creator portal.

Implemented:

- creator/admin Supabase sign-in
- editable track discovery
- Coptic, Arabic, English, and French lyric-set selection
- original / translation / transliteration kinds
- paste/type lyrics
- split pasted text into lines
- edit lyric text
- reorder and delete lines
- playback through `expo-audio`
- 100 ms playback-position updates for synchronized preview
- play/pause and +/-5 second seeking
- one-tap line timestamp marking from the live playback position
- manual timestamp editing
- real-time active-line highlighting
- tap a timed preview line to seek to it
- RTL Arabic preview treatment
- atomic draft save
- LRC import
- LRC export

The editor resolves published audio through the same Cloudflare media resolver contract used by CHC instead of storing R2 URLs in lyric records.

## Shared CHC Utilities

The main CHC repository contains:

- `src/utils/synchronizedLyrics.ts`
- `tests/synchronizedLyrics.test.cjs`
- synchronized lyric TypeScript contracts in `src/types/mediaPlatform.ts`

The helpers cover LRC parsing/formatting, pasted-line creation, reorder/renumber behavior, timestamp assignment, line timing windows, and active-line selection from playback position.

## Smoke Test

Phase 7 uses the existing Phase 6 published smoke track:

- Track: `003b6ff2-b639-4050-ac72-f19c33dba82f`
- Media asset: `9bab5973-0ec9-41fa-852e-7225a15f29db`
- Duration: `3000 ms`

Published lyric sets:

- English original: `ab96fccd-64c7-421d-a9fb-f0eb3386725a`
- Arabic translation: `a15172cf-11e4-4a19-8606-0444ced723e7`

Both sets contain three timed lines spanning 0-3000 ms.

Anonymous consumer verification of `get_published_track_lyrics` returned both sets with:

- correct locale and kind
- `syncPrecision = line`
- ordered line sequences
- `startMs` values of 0, 1000, and 2000
- `endMs` values of 1000, 2000, and 3000
- empty `words` arrays ready for future word synchronization

Authenticated editor verification also confirmed:

- the admin/creator track list returns the smoke track and its canonical `chc-music` asset reference
- an authenticated atomic draft save succeeds through RLS using `SECURITY INVOKER`
- a draft save creates ordered timed lines and returns the resulting draft payload
- the draft-save smoke transaction was rolled back after verification
- all three editor RPCs report `security_definer = false`

## Security

RLS is enabled for lyric sets, lines, and words.

Published lyrics are readable for published tracks. Draft/edit access follows creator ownership/admin permissions inherited from the music model.

The admin-only publication RPC remains intentionally privileged because publishing is a controlled state transition. The three normal editor RPCs do not use elevated execution.

Project-wide Supabase advisor findings that predate Phase 7 remain outside this phase.

## Validation Note

The CHC Artists dependency versions are exact-pinned in `package.json`. The execution environment used for this phase could not reach the npm registry because of DNS resolution failures, so a new `package-lock.json` and a full dependency-backed `tsc --noEmit` run could not be generated here. Source syntax/transpilation was checked, and database/RLS/API behavior was verified directly against the live CHC Supabase project.

## Follow-Up

- Phase 8 can consume `get_published_track_lyrics` in the Hymns & Songs Now Playing experience.
- Phase 9 should make lyric highlighting follow the shared global playback engine rather than a screen-local player.
- Phase 15 can expand the focused CHC Artists Lyrics Studio into the complete creator/management application.
