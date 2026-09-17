# CHC Media Processor

Docker-ready FFmpeg worker for Phase 4 media normalization.

## Runtime

The worker claims one queued Supabase processing job, downloads the source object from private R2, probes it, transcodes audio to AAC-LC M4A at `256k`, uploads the delivery object, and completes the job in Supabase.

Required environment:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `MEDIA_WORKER_TOKEN`

Production R2 S3 mode:

- `R2_DRIVER=s3`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Local workspace fallback:

- `R2_DRIVER=wrangler`
- authenticated Wrangler CLI

## Commands

```powershell
npm install
npm run process:once
```

```powershell
docker build -t chc-media-processor .
docker run --env-file .env chc-media-processor
```
