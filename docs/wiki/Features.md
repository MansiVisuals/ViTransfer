# Features (v0.9.5)

## Core functionality
- Video upload with resumable TUS uploads; originals preserved at any resolution.
- FFmpeg preview transcoding to 720p or 1080p.
- Customizable watermarks (center/corners), configurable per project or globally.
- Timestamped comments with threaded replies and version tracking.
- Annotation drawing on video frames (freehand, color picker, opacity control, undo/redo).
- Comment file attachments with TUS resumable uploads (multiple files, drag-and-drop).
- Approval workflow per video; optional auto-approve project when all videos approved.
- Project archiving to hide completed work while preserving data.
- Share links with password, email OTP, both methods, or guest access.
- Due dates with calendar view (day/week/month/year), Gantt chart, and iCal feed.
- Automated due date reminders via push, external providers, and email (day before or week before).
- Video version comparison: side-by-side and slider overlay modes with synced playback.
- Client asset uploads: allow clients to upload files to projects (configurable per project).
- Email notifications with scheduling (immediate, hourly, daily, weekly).
- Per-recipient unsubscribe for project emails.
- Optional push notifications (Gotify, ntfy, Pushover, Telegram).
- Browser push notifications per device with event filtering.
- Multi-language support (English and Dutch, extensible).
- PWA support (installable on desktop and mobile).
- Dark mode and fully responsive UI.

## Admin features
- Multiple admin accounts with JWT auth and optional WebAuthn passkeys.
- Secure password reset via email.
- Passkey enforcement for accounts that enable it.
- Admin account management: create, edit, and manage admin users.
- Client directory (companies and contacts management with search).
- Custom email templates (9 types with placeholder system and live preview).
- Custom branding logo (SVG upload, shown in email headers).
- Appearance settings (10 accent colors, theme selection).
- Language selection (applies globally to all UI and emails).
- Calendar & Gantt views with day/week/month/year scales.
- iCal feed subscription for external calendar apps (per-admin token).
- Analytics dashboard for page visits and downloads.
- Security event logging with filterable dashboard.
- Rate limiting, hotlink protection, encrypted credentials, IP-bound tokens.
- IP and domain blocking.
- Browser push notification management.
- Version control: multiple video versions with revision tracking and optional limits.
- Guest controls (view-only, latest-version restriction).
- Asset management: images, audio, subtitles, project files, and documents with content validation.
- Per-version thumbnails from uploaded image assets.
- Configurable global defaults for new projects (resolution, watermark, downloads, comments, approval).
- Per-project overrides for global settings.
- Video reprocessing: re-transcode videos when settings change (resolution, watermark).
- Configurable max upload size and max comment attachments.
- Option to use preview quality for approved playback (instead of original).

## Technical features
- Custom video player with comment markers, frame-accurate seeking, and version comparison.
- Docker-first deployment with Compose, Unraid, TrueNAS, and Podman/Quadlet support.
- Multi-architecture images (amd64 and arm64).
- Next.js 16 + React 19 UI; worker uses CPU-aware FFmpeg presets.
- BullMQ + Redis background processing for transcoding and notifications.
- PostgreSQL + Prisma ORM for data access.
- JWT refresh rotation, bearer-only auth, and passkey support.
- Resumable uploads with progress tracking.
- Deep linking support (video, version, timestamp, and comment parameters in share URLs).

---
Navigation: [Home](Home) | [Features](Features) | [Installation](Installation) | [Platform Guides](Platform-Guides) | [Configuration](Configuration) | [Admin Settings](Admin-Settings) | [Usage Guide](Usage-Guide) | [Client Guide](Client-Guide) | [Security](Security) | [Maintenance](Maintenance) | [Troubleshooting](Troubleshooting) | [Screenshots](Screenshots) | [Contributing](Contributing) | [License](License)
