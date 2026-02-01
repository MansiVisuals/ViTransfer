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
- Set `TZ` for correct notification scheduling.

---
Navigation: [Home](Home) | [Features](Features) | [Installation](Installation) | [Platform Guides](Platform-Guides) | [Configuration](Configuration) | [Admin Settings](Admin-Settings) | [Usage Guide](Usage-Guide) | [Security](Security) | [Maintenance](Maintenance) | [Troubleshooting](Troubleshooting) | [Screenshots](Screenshots) | [Contributing](Contributing) | [License](License)
