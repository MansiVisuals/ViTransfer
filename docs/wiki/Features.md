# Features (v0.9.5)

## Core functionality
- Video upload with resumable TUS uploads; originals preserved at any resolution.
- FFmpeg preview transcoding to 720p or 1080p.
- Customizable watermarks (center/corners), configurable per project or globally.
- Timestamped comments with threaded replies and version tracking.
- Annotation drawing on video frames (freehand, color picker, opacity control, undo/redo).
- Comment file attachments with TUS resumable uploads.
- Approval workflow per video; optional auto-approve project when all videos approved.
- Project archiving to hide completed work while preserving data.
- Share links with password, email OTP, both methods, or guest access.
- Due dates with calendar view (day/week/month/year), Gantt chart, and iCal feed.
- Automated due date reminders (day before or week before).
- Email notifications with scheduling (immediate, hourly, daily, weekly).
- Per-recipient unsubscribe for project emails.
- Optional push notifications (Gotify, ntfy, Pushover, Telegram).
- Browser push notifications per device with event filtering.
- PWA support (installable on desktop and mobile).
- Dark mode and fully responsive UI.

## Admin features
- Multiple admin accounts with JWT auth and optional WebAuthn passkeys.
- Secure password reset via email.
- Passkey enforcement for accounts that enable it.
- Client directory (companies and contacts management).
- Custom email templates (8 types with placeholder system).
- Custom branding logo (SVG upload, shown in email headers).
- Appearance settings (10 accent colors, theme selection).
- Calendar & Gantt views with day/week/month/year scales.
- iCal feed subscription for external calendar apps (per-admin token).
- Analytics dashboard for page visits and downloads.
- Security features: rate limiting, hotlink protection, security event logs, encrypted credentials, IP-bound tokens.
- IP and domain blocking.
- Browser push notification management.
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
