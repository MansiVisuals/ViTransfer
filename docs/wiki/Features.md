# Features (v0.8.9)

## Core functionality
- Video upload with resumable TUS uploads; originals preserved at any resolution.
- FFmpeg preview transcoding to 720p or 1080p.
- Customizable watermarks (center/corners), configurable per project or globally.
- Timestamped comments with threaded replies and version tracking.
- Approval workflow per video; optional auto-approve project when all videos approved.
- Project archiving to hide completed work while preserving data.
- Share links with password, email OTP, both methods, or guest access.
- Email notifications with scheduling (immediate, hourly, daily, weekly).
- Per-recipient unsubscribe for project emails.
- Optional push notifications (Gotify, ntfy, Pushover, Telegram).
- Dark mode and fully responsive UI.

## Admin features
- Multiple admin accounts with JWT auth and optional WebAuthn passkeys.
- Secure password reset via email.
- Passkey enforcement for accounts that enable it.
- Analytics dashboard for page visits and downloads.
- Security features: rate limiting, hotlink protection, security event logs, encrypted credentials, IP-bound tokens.
- Version control: multiple video versions with revision tracking and optional limits.
- Guest controls (view-only, latest-version restriction).
- Asset management: images, audio, subtitles, project files, and documents with magic byte validation.
- Per-version thumbnails from uploaded image assets.
- Per-project overrides for global settings.

## Technical features
- Custom video player with comment markers and frame-accurate seeking.
- Docker-first deployment with Compose, Unraid, TrueNAS, and Podman/Quadlet support.
- Next.js 16 + React 19 UI; worker uses CPU-aware FFmpeg presets.
- BullMQ + Redis background processing for transcoding and notifications.
- PostgreSQL + Prisma ORM for data access.
- JWT refresh rotation, bearer-only auth, and passkey support.
- Resumable uploads with progress tracking.

---
Navigation: [Home](Home) | [Features](Features) | [Installation](Installation) | [Platform Guides](Platform-Guides) | [Configuration](Configuration) | [Admin Settings](Admin-Settings) | [Usage Guide](Usage-Guide) | [Security](Security) | [Maintenance](Maintenance) | [Troubleshooting](Troubleshooting) | [Screenshots](Screenshots) | [Contributing](Contributing) | [License](License)
