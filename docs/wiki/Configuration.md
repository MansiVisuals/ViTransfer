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
| `NEXT_PUBLIC_TUS_ENDPOINT` | No | If TUS is on another origin, add it to connect-src | _none_ | |
| `CPU_THREADS` | No | Override CPU thread count used by the worker/FFmpeg | auto-detect | `8` |

### Notes
- Use `openssl rand -hex 32` for database passwords (URL-safe).
- Use `openssl rand -base64 32/64` for encryption keys and JWT secrets.
- Avoid special characters in `ADMIN_PASSWORD` due to JSON parsing.
- `HTTPS_ENABLED` always overrides the admin setting.
- Set `TZ` for correct notification scheduling and due date reminder timing.

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
