# Phase 3 Secure Creator Upload Pipeline

Status: implemented and deployed, pending authenticated creator end-to-end upload validation.

## Supabase

Migration:

- `supabase/migrations/20260916143010_create_media_upload_intents.sql`

Created:

- `media.upload_intent_status`
- `media.upload_intents`
- `public.create_media_upload_intent(...)`
- `public.get_media_upload_intent_for_upload(...)`
- `public.complete_media_upload_intent(...)`

The upload-intent table is limited to `chc-submissions` and enforces paths shaped like:

```text
submissions/{creator_account_id}/{upload_intent_id}/original.{ext}
```

Public upload RPC execute grants are only available to `authenticated`, not `anon`. The RPCs are `SECURITY DEFINER` because they create and finalize rows without granting broad table mutation rights to clients; each RPC pins `search_path = ''` and re-checks `auth.uid()` plus creator-account edit permissions.

## Cloudflare Worker

Worker:

- `workers/upload-authorizer`
- Deployed URL: `https://chc-upload-authorizer.hrmpdd8d6c.workers.dev`
- Current deployed version: `9c646a89-a644-496e-9249-3fedff91b556`

Bindings and secrets:

- `CHC_SUBMISSIONS` -> R2 bucket `chc-submissions`
- `SUPABASE_URL` -> `https://wtuujmeinzqfikvuofmh.supabase.co`
- `MAX_UPLOAD_BYTES` -> `21474836480`
- `SUPABASE_PUBLISHABLE_KEY` -> Cloudflare Worker secret

Endpoints:

- `GET /health`
- `POST /uploads/authorize`
- `PUT /uploads/{uploadIntentId}`
- `OPTIONS *`

Authorization:

- Both upload endpoints require `Authorization: Bearer {supabase_access_token}`.
- The Worker forwards that user token to Supabase RPCs with the project publishable key.
- The Worker never receives or exposes permanent R2 credentials.

Upload behavior:

- `POST /uploads/authorize` validates filename, media type, content type, content length, optional SHA-256, and creator-account UUID before asking Supabase to create an intent.
- `PUT /uploads/{uploadIntentId}` reloads the intent through Supabase, verifies it is active for the same user, checks `Content-Length` and `Content-Type`, then streams the request body to the exact R2 key returned by Supabase.
- If database finalization fails after the R2 write, the Worker attempts to delete the just-written object to avoid orphaned private submissions.

## Smoke Checks

Completed:

- `npx.cmd tsc --noEmit` passed.
- `npx.cmd wrangler deploy --config workers\upload-authorizer\wrangler.jsonc --dry-run` passed.
- `GET /health` returned `200` with `{"ok":true,"service":"chc-upload-authorizer"}`.
- `POST /uploads/authorize` without a bearer token returned `401 auth_required`.
- `PUT /uploads/{uuid}` without a bearer token returned `401 auth_required`.
- `POST /uploads/authorize` with a malformed bearer token reached Supabase and returned `401 PGRST301`.
- Supabase migration list includes `20260916143010 create_media_upload_intents`.
- `media.upload_intents` has RLS enabled, one select policy, and indexed creator/requester/expiry access paths.
- Creator/media foreign-key coverage check returned no missing FK indexes.

Not completed:

- Authenticated authorized happy-path upload. The Supabase project currently has zero auth users, so there is no real creator session/access token to use without creating a permanent test account in production auth.

## Next Validation Step

After creating or signing in as a real CHC Artists creator user:

1. Insert or approve a `creator.creator_accounts` row for that user.
2. Add a `creator.creator_account_members` row with `owner`, `manager`, `editor`, or `uploader`.
3. Call `POST /uploads/authorize` with that user's Supabase access token.
4. Upload the exact authorized file bytes to the returned `uploadUrl`.
5. Confirm `media.upload_intents.status = 'uploaded'` and the object exists only in `chc-submissions`.

## Notes

This implementation uses a Worker-authorized upload URL instead of an R2 S3 presigned URL because R2 S3 credentials have not been provisioned in this workspace. It still keeps the file out of Supabase, keeps `chc-submissions` private, enforces the object path server-side, and avoids distributing permanent R2 credentials. If R2 S3 credentials are later provisioned, the `POST /uploads/authorize` endpoint can be extended to return short-lived S3 presigned URLs for multipart/resumable uploads.
