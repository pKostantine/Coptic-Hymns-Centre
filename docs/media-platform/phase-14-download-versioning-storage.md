# Phase 14 — Download Versioning and Storage Management

Status: complete (2026-09-17).

## Delivered

- Version-aware offline requests compare the stored resource identity with the currently published media URI, version, checksum, and file size.
- Download controls surface an **Update** state when a downloaded track, release, playlist, lesson, lesson set, album, recording, or learning playlist has newer media metadata.
- Updating replaces the old package and its orphaned files with the current published package.
- Downloaded media is validated by expected file size and published checksum. SHA-256 is supported to match the media-processing pipeline.
- Integrity failures move the affected file/package to a retryable failed state rather than silently playing corrupted media.
- Failed/cancelled partial files can be cleaned up from the Downloads & Storage screen.
- Storage reporting shows total, Music, and Learn & Study usage plus downloaded/attention counts.
- Individual packages and all downloads can be removed from device storage.
- Download network policy is persisted on-device and enforced before enqueue, resume, retry, and update:
  - Wi-Fi-only downloads
  - cellular downloads allowed/blocked
  - video-over-cellular allowed/blocked
- Settings now links to a dedicated Downloads & Storage screen.
- Web keeps the existing no-offline-media behavior and explains that downloads are managed in the iOS/Android apps.

## Verification

GitHub Actions verification passed for the completed Phase 14 branch:

- `npx tsc --noEmit`
- ESLint on all Phase 14 surfaces
- playback tests
- synchronized lyrics tests
- service-condition tests
- slideshow tests

The repository-wide lint command still contains pre-existing React Compiler lint failures in older screens outside Phase 14; Phase 14 changed surfaces pass lint.
