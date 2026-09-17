# Phase 5 - Submission, Moderation, and Publishing

Completed on 2026-09-16.

## Scope

Phase 5 adds the backend workflow that connects creator uploads to admin review, media processing, and publication.

## Supabase Migrations

- `20260916192454_create_submission_moderation_publication_workflow.sql`
- `20260916192807_add_submission_workflow_fk_indexes.sql`

## Schema Added

- `media.submission_type`
- `media.submissions`
- `media.submission_items`
- `media.submission_events`

The workflow reuses the existing `media.publication_status` lifecycle:

- `draft`
- `uploading`
- `ready_to_submit`
- `pending_review`
- `changes_requested`
- `approved`
- `processing`
- `published`
- `rejected`

## RPCs Added

- `public.create_media_submission`
- `public.add_media_submission_item`
- `public.submit_media_submission`
- `public.review_media_submission`
- `public.publish_media_submission`

Creator-facing RPCs require authentication and creator-account edit permission. Admin RPCs require the `admin` app role through `private.is_admin()`.

## Publication Contract

Approval does not publish content directly.

Approval validates the submission, attaches any already-completed processing result, and enqueues processing jobs for required unprocessed upload items. Publishing is allowed only after all required items have completed processed assets.

`publish_media_submission` updates the submission and all attached assets in one database transaction.

## Smoke Test

Verified a fresh music submission through the full flow:

- Upload intent: `5339f85a-7efc-40a2-96fb-e9f458146394`
- Submission: `961b382b-5ce4-41a7-b3cb-438ad7dc9ebd`
- Submission item: `f008191e-9dcc-4d73-baaa-3b9e9bf4d322`
- Processing job: `214b0928-d529-42ea-b924-ebbf0663f9a9`
- Media asset: `9bab5973-0ec9-41fa-852e-7225a15f29db`
- Media asset version: `df229207-b018-43c5-9405-52b03c24fd2b`

Source object:

```text
chc-submissions/submissions/5facb1fd-4aff-43ed-9cf7-6f5670cf693a/5339f85a-7efc-40a2-96fb-e9f458146394/original.wav
```

Published delivery object:

```text
chc-music/processed/5facb1fd-4aff-43ed-9cf7-6f5670cf693a/5339f85a-7efc-40a2-96fb-e9f458146394/v1/audio.m4a
```

Delivery verification:

- Resolver HEAD: `200`
- Content-Type: `audio/mp4`
- Content-Length: `83652`
- Cache-Control: `public, max-age=31536000, immutable`
- Accept-Ranges: `bytes`
- SHA-256: `2ae71e1fa6f7caad1fcd883a941eb9c5a92f03103a7fedc3765a0dcb8b9b06ca`

Event history verified:

```text
created -> item_added -> submitted -> approved -> processing_started -> published
```

The submission ended in `published`, the processing job ended in `completed`, and the media asset ended in `published` with `processing_status = completed`.

## Verification

- `npx.cmd tsc --noEmit`
- Supabase migration list includes both Phase 5 migrations.
- Focused index check confirmed the new Phase 4/5 foreign-key covering indexes exist.
- Supabase advisors still report older project-wide backup/staging-table issues and intentional `SECURITY DEFINER` RPC warnings. The Phase 5 RPCs are intentionally exposed to `authenticated` users and guard internally with creator membership or admin checks.

## Follow-Up

- Remove or rotate the temporary smoke-test admin role before production use.
- In Phase 6, wire published submissions into canonical music catalog tables instead of treating submission publication as the final catalog surface.
