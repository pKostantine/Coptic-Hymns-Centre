# Phase 1 Shared Backend Foundation

This phase introduces the shared database vocabulary that Music, Learn & Study, CHC Artists, and admin review will build on.

## Applied Migrations

- `20260916140850_create_shared_media_foundation`
- `20260916141249_add_media_foundation_fk_indexes`
- `20260916141400_add_media_locale_fk_indexes`

## Schema Boundaries

`creator`

- App-level user profiles linked to `auth.users`.
- App roles: `user`, `creator`, and `admin`.
- Creator accounts and account membership.
- Creator account roles: `owner`, `manager`, `editor`, `uploader`, and `viewer`.

`media`

- Canonical media references as `provider`, `bucket`, and `path`.
- Media asset metadata and immutable asset versions.
- Shared publication and processing states.
- Supported locales.
- Generic localized text records for early shared metadata.
- Shared search documents and aliases.

`private`

- RLS helper functions and trigger utilities.
- Not intended as a Data API surface.

## Security Model

- RLS is enabled on every new table.
- Client roles get explicit grants.
- `anon` can only read enabled locales and rows marked `published`.
- Authenticated users can read and modify rows for creator accounts they belong to.
- Admin checks are stored in `creator.user_roles`, not user-editable JWT metadata.
- Server-side service credentials retain full access for ingestion, processing, and moderation workflows.
- Security-definer helper functions live in the non-exposed `private` schema and pin `search_path` to an empty value.

## Verification

- Confirmed all new `creator` and `media` tables have RLS enabled and at least one policy.
- Confirmed English, Arabic, Coptic, and French locale seed rows exist.
- Confirmed new `creator` and `media` foreign keys have covering indexes, including leading-locale indexes.
- Ran Supabase security and performance advisors after migration work. Remaining findings are pre-existing outside the new Phase 1 schemas, except expected unused-index notices on brand-new empty tables.

## Media Reference Rule

Canonical media references store:

```text
provider
bucket
path
```

Complete public URLs are intentionally not stored as canonical data. Later phases should resolve URLs through an application service.

## Follow-Up Phases

- Phase 2 should create/configure R2 buckets and add the media URL resolver.
- Phase 3 should add upload authorization and path restrictions.
- Phase 4 should add processing jobs and worker-specific status transitions.
- Phase 5 should add submissions, review history, and publication orchestration.
- Phases 6 and 10 should add domain-specific music and learning catalog tables on top of this foundation.
