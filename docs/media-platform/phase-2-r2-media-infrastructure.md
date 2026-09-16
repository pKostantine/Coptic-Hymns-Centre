# Phase 2 R2 Media Infrastructure

## Buckets

Created in Cloudflare account `pKostantine` (`cf3267bfcb8e3b6d980e9a690c7e7a00`) with location hint `ENAM` and Standard storage:

- `chc-submissions`: private creator upload/submission files
- `chc-masters`: private retained source masters
- `chc-music`: published music delivery assets
- `chc-learning`: published learning audio/video delivery assets
- `chc-images`: published artwork and image assets

R2 buckets are private by default. Public delivery goes through the `chc-media-resolver` Worker rather than exposing private buckets directly.

## Delivery Worker

Source: `workers/media-resolver`

Deployed Worker:

```text
https://chc-media-resolver.hrmpdd8d6c.workers.dev
```

Current deployed version:

```text
e7908fc2-b905-4f2e-b34a-aab0b71b295c
```

Routes exposed by the Worker:

- `/music/{object_key}` resolves objects from `chc-music`
- `/learning/{object_key}` resolves objects from `chc-learning`
- `/images/{object_key}` resolves objects from `chc-images`
- `/health` returns a no-cache JSON health response

The Worker supports:

- `GET`
- `HEAD`
- `OPTIONS`
- byte-range requests via the R2 Workers API
- CORS for media playback and browser access
- immutable cache headers for published versioned paths

The Worker intentionally does not bind or expose:

- `chc-submissions`
- `chc-masters`

## Application Resolver

The CHC app should resolve canonical media references through `src/services/mediaService.ts`.

Canonical database values remain:

```text
provider = cloudflare_r2
bucket = chc-music | chc-learning | chc-images
path = immutable/versioned/object/path
```

The app runtime needs:

```text
EXPO_PUBLIC_CHC_MEDIA_BASE_URL
```

set to the deployed Worker base URL, or a future custom media domain such as `https://media.coptichymnscentre.com`.

## Custom Domain Status

`media.coptichymnscentre.com` is not configured yet because the Phase 0 Cloudflare inventory did not find a `coptichymnscentre.com` zone in the connected account. The Worker can be moved behind that domain once the zone or appropriate DNS access exists.

## Smoke Test

Uploaded remote R2 object:

```text
bucket: chc-music
path: artists/00000000-0000-4000-8000-000000000001/releases/00000000-0000-4000-8000-000000000002/tracks/00000000-0000-4000-8000-000000000003/v1/audio.wav
sha256: 56d4af65701c26df20bd4021eda95b6e830348ce3a746086079fe89285548dc9
size: 16044 bytes
```

Supabase rows:

```text
media.media_assets.id = 1dde0683-faae-4312-9700-910d543a3216
media.media_asset_versions.id = ebdc5473-b101-4b3f-926d-62a7a9133e03
```

Verified:

- `GET /health` returns 200.
- `HEAD /music/.../audio.wav` returns `audio/wav`, `Content-Length: 16044`, `Accept-Ranges: bytes`, CORS, and immutable cache headers.
- `Range: bytes=0-15` returns `206 Partial Content` and `Content-Range: bytes 0-15/16044`.
- `/submissions/...` returns 404 because private buckets are not exposed by the public delivery Worker.
