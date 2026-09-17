# Phase 12 - Unified Search

Completed on 2026-09-17.

## Scope

Phase 12 replaces the separate Music search RPC and Phase 11's client-built Learn index with one PostgreSQL-backed discovery path. The shared result stream covers:

- Music artists, releases, and tracks
- Learn & Study Cantors, Seasons, Hymns, learning Albums, and lessons
- English, Arabic, and any other enabled catalog localization
- configured aliases and transliterations
- exact, prefix, full-text, substring, and typo-tolerant matches

The implementation uses the Phase 1 `media.search_documents` and `media.search_aliases` foundation. No external search platform was introduced.

## Database implementation

Phase 12 adds:

- `20260917090000_add_unified_media_search.sql`
- `20260917090500_serialize_unified_search_refresh.sql`

Published catalog entities are materialized into typed, locale-specific search documents. Each document retains unchanged display text and a separate normalized matching value, weighted PostgreSQL `tsvector`, publication state, and typed JSON metadata needed for navigation or playback.

Catalog and localization statement triggers refresh the search index after relevant Music, Learn, relationship, or media-asset changes. Refreshes use a transaction advisory lock so concurrent publishing transactions cannot race while replacing indexed rows.

The public consumer API is:

```text
public.search_media_catalog(p_query, p_locale, p_scope, p_limit)
```

It runs as `SECURITY INVOKER`, reads only published rows through the existing RLS policies, accepts `all`, `music`, or `learning` scope, and returns a ranked discriminated result list. Anonymous and authenticated consumers have explicit execute permission; internal index maintenance functions are not executable by either role.

## Matching and ranking

`media.normalize_search_text` is used only for matching. It:

- lowercases and removes Latin accents
- removes Arabic tashkeel and Quranic combining marks
- removes tatweel
- folds alef variants to bare alef
- folds alef maqsura, waw-hamza, and ya-hamza variants
- collapses punctuation and repeated whitespace

Display titles, descriptions, artist names, and lesson metadata remain untouched.

Configured `media.search_aliases` are normalized automatically on insert/update. This allows alternate English spellings, transliterations, and Arabic names to resolve to one canonical entity without duplicating the entity itself.

Ranking prioritizes exact titles, exact aliases, title prefixes, alias matches, weighted full text, substrings, and trigram similarity in that order, with a small preference for the requested display locale. Results are deduplicated by canonical entity before the limit is applied.

## Consumer experience

`/search` is a bilingual, shared search surface with All, Music, and Learn scopes. Music and Learn section search actions now enter this route, while the previous `/music/search` and `/learn/search` URLs remain as compatibility redirects.

The result list preserves database rank across domains and identifies every result by type. Entity results open their existing detail routes. Music track results and audio lesson results can play directly from search through the Phase 9 shared playback engine; video lessons open their lesson route. The appropriate Music or Learn mini player remains visible after playback starts.

`musicService.search` and `learningService.search` now adapt the same unified RPC for backward compatibility. The Phase 11 five-minute, multi-request client search cache has been removed.

## Verification

Verified against the live CHC Supabase project:

- the initial refresh produced all eight requested entity types
- English exact, prefix, contextual full-text, and typo-tolerant searches
- Arabic search with alef variants, tashkeel, and tatweel
- English queries that match Arabic-localized entities and localized display selection
- a temporary transliteration alias produced an exact alias match and was removed afterward
- Music-only and Learn-only scopes
- empty normalized queries return no results
- the RPC executes successfully while the database session is the `anon` role
- alias normalization trigger, 21 refresh triggers, and consumer grants are present
- Supabase security advisors report no finding on any Phase 12 object

Local verification:

- `npx tsc --noEmit`
- ESLint across every Phase 12 file and each shared file changed by Phase 12
- `npm run test:slideshow` - 20 passing tests
- `npm run test:conditions` - 4 passing tests
- `npm run test:lyrics` - 5 passing tests
- `npm run test:playback` - 5 passing tests

The web export reaches Metro bundling but the repository does not contain the pre-existing `assets/fonts/CopticCHC-Regular-V3.ttf` required by the root layout. That packaging issue is unrelated to Phase 12; type checking and changed-file lint complete cleanly.

## Follow-up

- Creator/Admin work in Phases 15 and 16 can expose alias management without changing the consumer search contract.
- Search telemetry can later tune weights and similarity thresholds using real queries while retaining the PostgreSQL implementation.
- Phase 13 can make direct search-result playback prefer durable local media when downloads are available.
