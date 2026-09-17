# Phase 4 Media Processing Pipeline

Status: complete.

## Supabase

Migrations:

- `supabase/migrations/20260916190541_create_media_processing_jobs.sql`
- `supabase/migrations/20260916191115_fix_media_processing_complete_ambiguous_column.sql`

Created:

- `media.processing_job_type`
- `media.processing_job_status`
- `private.media_worker_tokens`
- `media.media_processing_jobs`
- `public.enqueue_media_processing_job(...)`
- `public.claim_media_processing_job(...)`
- `public.complete_media_processing_job(...)`
- `public.fail_media_processing_job(...)`

The queue uses `FOR UPDATE SKIP LOCKED` inside `claim_media_processing_job` so two workers cannot claim the same queued job.

## Worker

Source:

- `workers/media-processor`

Runtime:

- Node 22
- Dockerfile included
- `ffmpeg-static`
- `ffprobe-static`
- R2 S3 mode for production credentials
- Wrangler R2 fallback for this workspace, because R2 S3 credentials have not been provisioned yet

Audio transcode target:

```text
M4A
AAC-LC
256k target bitrate
```

Command shape:

```text
ffmpeg -i input -vn -c:a aac -b:a 256k -movflags +faststart audio.m4a
```

## Verified Job

Test upload intent:

```text
85712f4f-0873-4cd8-b80f-bf5aad1a85c8
```

Processing job:

```text
407d666b-8ed6-4cbf-90fa-0be90b79fc84
```

Output:

```text
chc-music/processed/5facb1fd-4aff-43ed-9cf7-6f5670cf693a/85712f4f-0873-4cd8-b80f-bf5aad1a85c8/v1/audio.m4a
```

Database result:

- `media.media_processing_jobs.status = 'completed'`
- `media.media_assets.processing_status = 'completed'`
- `media.media_assets.publication_status = 'draft'`
- `media_asset_id = 3a6918f2-a446-4a36-b7b3-6d278cd31a4e`
- `media_asset_version_id = 1d0f3805-f540-4324-9703-83cfd44f586e`

R2/resolver result:

- `HEAD /music/processed/.../audio.m4a` returned `200`
- `Content-Type: audio/mp4`
- `Content-Length: 162028`
- immutable cache headers and byte-range support present

Downloaded object verification:

- size: `162028` bytes
- SHA-256: `c877fb3936ee3255973f558718d9240bc4f66e7517db7e650b6793fbabf2fc86`

ffprobe result:

```json
{
  "format": "mov,mp4,m4a,3gp,3g2,mj2",
  "duration": "5.000000",
  "bit_rate": "259244",
  "audio": [
    {
      "codec": "aac",
      "profile": "LC",
      "sample_rate": "44100",
      "channels": 2,
      "bit_rate": "255378"
    }
  ]
}
```

## Security Notes

The worker RPCs are `SECURITY DEFINER` and callable by `anon` only when the caller has a valid high-entropy media worker token. This is intentionally narrow so the Docker worker can operate without a browser user session or service-role key in app code. Rotate the Phase 4 local worker token before production deployment and store the live token in the container secret manager.
