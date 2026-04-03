# Configuration

## Environment variables

| Variable | Required | Description | Default | Example |
|----------|----------|-------------|---------|---------|
| `APP_PORT` | No | Port to expose on host | `4321` | `8080` |
| `PUID` | No | User ID for file permissions (Linux) | `1000` | `1000` |
| `PGID` | No | Group ID for file permissions (Linux) | `1000` | `1000` |
| `TZ` | No | Timezone for notification schedules | `UTC` | `Europe/Amsterdam` |
| `POSTGRES_USER` | Yes | PostgreSQL username | `vitransfer` | `vitransfer` |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password (hex only) | - | Generated with `openssl rand -hex 32` |
| `POSTGRES_DB` | Yes | PostgreSQL database name | `vitransfer` | `vitransfer` |
| `REDIS_PASSWORD` | Yes | Redis password (hex only) | - | Generated with `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Yes | Data encryption key (base64) | - | Generated with `openssl rand -base64 32` |
| `JWT_SECRET` | Yes | JWT signing secret (base64) | - | Generated with `openssl rand -base64 64` |
| `JWT_REFRESH_SECRET` | Yes | JWT refresh secret (base64) | - | Generated with `openssl rand -base64 64` |
| `ADMIN_EMAIL` | Yes | Initial admin email | - | `admin@example.com` |
| `ADMIN_PASSWORD` | Yes | Initial admin password | - | `Admin1234` |
| `ADMIN_NAME` | No | Initial admin display name | `Admin` | `Jane Doe` |
| `SHARE_TOKEN_SECRET` | Yes | Secret for signing share tokens | _none_ | |
| `HTTPS_ENABLED` | No | Enable HTTPS enforcement (HSTS) | `true` | `false` for localhost |
| `CPU_THREADS` | No | Override CPU thread count used by the worker/FFmpeg | auto-detect | `8` |
| `DEBUG_WORKER` | No | Enable verbose worker logging | `false` | `true` |
| `DEBUG_EXTERNAL_NOTIFICATIONS` | No | Enable verbose external notification logging | `false` | `true` |
| `STORAGE_PROVIDER` | No | Storage backend: `local` or `s3` | `local` | `s3` |
| `S3_ENDPOINT` | When `STORAGE_PROVIDER=s3` | S3-compatible endpoint URL | — | `https://s3.amazonaws.com` |
| `S3_BUCKET` | When `STORAGE_PROVIDER=s3` | Bucket name (must already exist) | — | `vitransfer` |
| `S3_REGION` | When `STORAGE_PROVIDER=s3` | AWS region or any value for region-agnostic stores | `us-east-1` | `us-east-1` |
| `S3_ACCESS_KEY_ID` | When `STORAGE_PROVIDER=s3` | Access key ID | — | |
| `S3_SECRET_ACCESS_KEY` | When `STORAGE_PROVIDER=s3` | Secret access key | — | |

### Notes
- Use `openssl rand -hex 32` for database passwords (URL-safe).
- Use `openssl rand -base64 32/64` for encryption keys and JWT secrets.
- Avoid special characters in `ADMIN_PASSWORD` due to JSON parsing.
- `HTTPS_ENABLED` always overrides the admin setting.
- Set `TZ` for correct notification scheduling and due date reminder timing.

---

## S3-Compatible Storage

Set `STORAGE_PROVIDER=s3` to have uploads and downloads bypass Node.js and go directly between the browser and your object store. No rebuild needed — the setting is read at runtime.

**Tested with:** MinIO AIStor (self-hosted Docker container). Other S3-compatible stores (AWS S3, Cloudflare R2, Backblaze B2, Garage, etc.) should work but have not been tested — please [open an issue](https://github.com/MansiVisuals/ViTransfer/issues) if you run into any problems.

**How it works:**
- **Uploads** — the browser requests presigned part URLs from ViTransfer, then PUTs each chunk straight to the store. Node.js never touches the file bytes. This applies to all uploads: videos, comment attachments, and client file submissions (reverse share).
- **Individual downloads** — the server generates a short-lived presigned GET URL and issues a 302 redirect. Node.js proxies nothing. This covers single video downloads, asset downloads, and client upload downloads.
- **ZIP downloads** — "Download All Videos" and single-video-with-assets ZIPs stream file data from S3 through the server, since the archive must be assembled before delivery. The ZIP is streamed to the browser as it is built (not buffered in memory).
- **Worker** — FFmpeg jobs stream directly from/to object storage via the SDK; no shared volume is needed.

**Important:** Local and S3 storage cannot be mixed. Switching from one to the other does not move or delete any files — they remain where they are — but ViTransfer will only read from the active backend. Projects stored in the previous backend will not work until their files are manually migrated to the new storage. There is no built-in migration tool. This is by design.

**Requirements:**
1. Create the bucket before starting ViTransfer.
2. Configure CORS on the bucket to allow `PUT` requests from your app origin (required for presigned multipart uploads from the browser).
3. Set `STORAGE_PROVIDER=s3` and the `S3_*` variables in your `.env`.

**Example `.env`:**
```
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://s3.amazonaws.com        # or your store's endpoint
S3_BUCKET=vitransfer
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
```

### Provider notes

**MinIO AIStor** — uses path-style addressing, which ViTransfer enables automatically when `S3_ENDPOINT` is set. Set `S3_ENDPOINT` to your MinIO hostname (e.g. `http://minio:9000`).

**AWS S3** — set `S3_ENDPOINT=https://s3.amazonaws.com` and the correct `S3_REGION`.

**Cloudflare R2** — endpoint is `https://<account-id>.r2.cloudflarestorage.com`. Set `S3_REGION=auto`.

**Backblaze B2** — endpoint is `https://s3.<region>.backblazeb2.com`. Use your B2 application key ID and key.

### CORS configuration

The browser must be allowed to `PUT` parts directly to your store **and** read the `ETag` response header (required for multipart upload completion).

**MinIO AIStor** — CORS is typically permissive by default, but if you've locked it down:
```bash
mc alias set myminio http://minio:9000 <access-key> <secret-key>
mc admin config set myminio/ api cors_allow_origin=https://vitransfer.example.com
mc admin service restart myminio/
```

**AWS S3 / R2 / B2** — configure the bucket CORS policy via the provider's console or CLI. The policy must:
- Allow `PUT` from your app origin
- Expose the `ETag` header (browsers block it otherwise)

Example JSON CORS policy for AWS S3 / R2:
```json
[
  {
    "AllowedOrigins": ["https://vitransfer.example.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

If `ETag` is not exposed, uploads will fail with "Part returned no ETag".

---

## CPU Threads & Video Processing

### Overview

`CPU_THREADS` controls how ViTransfer allocates CPU resources for video encoding. When set, it overrides the auto-detected CPU count and determines three things:

1. **Worker concurrency** — how many video jobs run simultaneously
2. **Threads per job** — how many threads FFmpeg uses per transcode (the `-threads` flag)
3. **Encoding preset** — the FFmpeg speed/compression tradeoff (`faster`, `fast`, or `medium`)

The allocation is intentionally conservative, targeting 25-50% CPU utilization so the server remains responsive for uploads, playback, and general usage during processing.

### Allocation table

| CPU_THREADS | Concurrent jobs | FFmpeg threads/job | Preset   | Max threads used |
|:-----------:|:---------------:|:------------------:|:--------:|:----------------:|
| 1-2         | 1               | 1                  | faster   | 2 (~100%)        |
| 3-4         | 1               | 1                  | faster   | 2 (~50%)         |
| 5-8         | 1               | 2                  | fast     | 4 (~50-67%)      |
| 9-16        | 1               | 2                  | fast     | 4 (~25-33%)      |
| 17+         | 2               | 2                  | medium   | 6 (~25%)         |

"Max threads used" includes both the video processing worker and the clean preview worker (generates non-watermarked versions on approval).

### Preset tradeoff

| Preset   | Encode speed | Output size | Applied when    |
|----------|:------------:|:-----------:|:---------------:|
| `faster` | Fastest      | Larger      | 1-4 threads     |
| `fast`   | Balanced     | Medium      | 5-16 threads    |
| `medium` | Slower       | Smallest    | 17+ threads     |

With fewer threads available, a faster preset is selected so encoding completes in reasonable time. With more threads, the encoder can spend more effort on compression.

### When to set this

- **Docker**: Containers may report the host CPU count rather than the cgroup limit. Set `CPU_THREADS` to match your `--cpus` or `deploy.resources.limits.cpus` value for accurate allocation.
- **Shared servers**: Lower the value to leave headroom for other services.
- **Dedicated servers**: Leave unset — auto-detection works correctly.

### Example

An 8-thread server with `CPU_THREADS` unset (auto-detected as 8):

```
Detected threads: 8
 → 1 concurrent video job
 → 2 FFmpeg threads per job
 → Preset: fast
 → Max 4/8 threads in use (~50%)
 → Remaining threads available for the web app, database, and uploads
```

---
Navigation: [Home](Home) | [Features](Features) | [Installation](Installation) | [Platform Guides](Platform-Guides) | [Configuration](Configuration) | [Admin Settings](Admin-Settings) | [Usage Guide](Usage-Guide) | [Client Guide](Client-Guide) | [Security](Security) | [Maintenance](Maintenance) | [Troubleshooting](Troubleshooting) | [Screenshots](Screenshots) | [Contributing](Contributing) | [License](License)
