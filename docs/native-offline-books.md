# Native offline books

## Scope

Offline books exist only in the Expo iOS and Android targets, including Expo
Go. The web target uses `contentDataClient.web.ts`,
`BookSyncBootstrap.web.tsx`, and `downloads.web.tsx`: it remains online-only,
does not start the manager, and exposes no book download UI on desktop, iPhone,
or iPad browsers.

Synchronization runs on app launch, foreground/resume, and Wi-Fi connection
events. Expo Go cannot promise execution while the process is suspended or
terminated; optional native background work can be added later without
changing the package contract.

## Model

A user installs one of six book identities: Psalmody, Liturgy, Veneration,
Agpeya, Bible, or Holy Week. Internally, a book references shared content resources. A
resource currently maps to one published Supabase schema and has its own
version and chunks. Public is forced into every book graph. Calendar is a
system-owned resource and is never removed with an optional book.

The dependency registry is centralized in two places with the same keys:

- `src/constants/bookDependencyRegistry.ts` validates manifests and supplies a
  safe client fallback.
- `offline_content.resources`, `resource_dependencies`, and `books` in the
  package migration are the publishing source of truth.

The initial graph was audited from `SUBDOCUMENT_MAP`, `READING_SENTINEL_MAP`,
the hymn fallback lookup sequence, `saintHymns.ts`, Bible services, calendar
services, and every home-screen entry point. Circular references are accepted;
graph traversal deduplicates every resource.

## Publishing and direct Supabase changes

Migration `20260924120000_native_offline_content_packages.sql` installs
statement triggers on every registered source table. Inserts, updates,
deletes, and truncates increment the owning resource revision and enqueue a
publication. The trigger-refresh function is also called before each snapshot
so newly registered tables receive triggers.

`begin_offline_package_snapshot()` copies all dirty resources into staging in
one database transaction. This gives tables and interdependent schemas a
consistent database snapshot even if package generation takes longer. It uses
`to_jsonb(row)`, so schemas do not need to share a table shape. Calendar RPC
results and Synaxarium day JSON are materialized by date because their server
logic is required offline. Backups, archives, working, staging, admin, draft,
history, and audit tables are excluded; Calendar and Public also use explicit
allowlists.

The Cloudflare Worker in `workers/content-packages` pages staged rows into
roughly 2 MiB JSON chunks, calculates SHA-256 digests, gzip-compresses objects,
and writes immutable objects to R2. Bible chunks use deterministic table/book/
chapter boundaries. Payload bytes and client file keys are content-addressed,
so a Bible revision reuses the preceding immutable URL and local file for every
chapter whose digest is unchanged; only changed chapters transfer. The small
root manifest is written last, and that single write publishes the snapshot
atomically. A resource revision changes only when one of its contributing
tables changes, so clients download unchanged resources zero times.

Deployment prerequisites and commands are in the Worker's README. The app must
receive `EXPO_PUBLIC_CONTENT_PACKAGES_URL` at build/start time.

## Native installation and recovery

The existing `chc-offline.db` and resumable Expo FileSystem download manager
are extended rather than replaced. Content packages use the `books` domain;
Music and Learn & Study keep their existing request formats and playback
resolution.

Each resource version is downloaded and verified per chunk. Identity, version,
chunk ID, SHA-256, and row count are checked. Rows are imported under an
inactive version. Only after every required resource is staged does one
exclusive SQLite transaction switch active versions and book references. A
failed update therefore leaves the previous active rows readable. Failed
chunks are marked individually and retry without restarting completed chunks.

`content_book_resources` is the reference-count table. Removing a book deletes
only resources with no remaining book reference and `system_owned = 0`.
Calendar therefore survives every removal, and shared Public, Agpeya,
Doxologies, Bible, etc. survive while any installed book still needs them.
User bookmarks, reading positions, highlights, sermon notes, preferences, and
media are stored outside replaceable content rows.

## Rendering

The existing renderer was not forked. Document, Bible, reading, saint, and
calendar services import `contentDataClient`. Native queries use active SQLite
rows when that schema is installed and otherwise use Supabase. The adapter
supports the exact select aliases, equality/range/in/ILIKE filters, ordering,
limits, single-row reads, and RPCs used by these services. Bible metadata,
verses, verse parts, and every distributed translation column are packaged;
Bible search and navigation have local implementations. Calendar flags,
reading results, and Synaxarium results use their materialized published RPC
outputs, keeping seasonal conditions and offline date changes aligned with
the server.

## Adding Weddings or another book

1. Register its resource/schema in `offline_content.resources`. Use an explicit
   table allowlist if the schema also contains administrative data.
2. Add dependency edges for every inline/subdocument/reference target. Add any
   new sentinel to the reader registry and its corresponding resource edge.
3. Add the book row with one or more root resources.
4. Mirror the book key and dependency fallback in
   `bookDependencyRegistry.ts`, then add the native home route/card and set
   its `downloadKey` in `src/constants/manifest.ts`.
5. Run `offline_content.refresh_change_triggers()`, publish, and run the
   offline tests. Unknown resources and missing manifest chunks fail closed.

No downloader, SQLite schema, synchronization loop, or renderer changes are
needed for a newly registered book.

## Verification

Run:

```sh
npm run test:offline
npm run test:conditions
npm run test:reading
npm run test:slideshow
npm run lint
npm run build
npx wrangler deploy -c workers/content-packages/wrangler.jsonc --dry-run
```

For device acceptance, publish a test snapshot and exercise airplane-mode
opening, language/display changes, liturgical-date changes, interrupted Bible
chunks, Psalmody then Liturgy deduplication, shared dependency removal, Public
and inline-hymn updates, Wi-Fi reconnect, and failed update rollback. Check web
at desktop, iPhone, and iPad viewport sizes and confirm there is no download
route, button, status, setting, manager initialization, or browser storage.
