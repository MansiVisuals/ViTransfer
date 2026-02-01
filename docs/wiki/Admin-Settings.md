# Admin Settings

Configure in the admin panel under Settings.

## Company branding
- Company Name: shown in emails and comments.
- App Domain: required for passkeys and deep links (e.g., `https://yourdomain.com`).

## Notifications (email + push)
**Email settings**
- SMTP server, port, username, password, from address.
- Security mode: STARTTLS (default), TLS, or NONE.
- Admin notification schedule: IMMEDIATE, HOURLY, DAILY, WEEKLY.
- Client email unsubscribe per recipient (project recipients list reflects status).

**Push notifications**
- Providers: Gotify, ntfy, Pushover, Telegram.
- Implemented via Apprise inside app/worker image.
- Delivered by BullMQ worker (`external-notifications`).
- Deep links use the configured App Domain.

**Events**
- Failed admin login attempts (email, method, link).
- Unauthorized OTP requests (project, email, method, link).
- Successful share access (project, method, optional client email, link).
- Client comments (project, video, timecode, client, comment preview, deep link).
- Video approvals (project, action, client, video list, link).

**Notes**
- IP and user-agent details are stored in Security Events.
- Worker logs: `docker compose logs -f worker | rg EXTERNAL-NOTIFICATIONS`.
- Verbose logs: set `DEBUG_EXTERNAL_NOTIFICATIONS=true` (or `DEBUG_WORKER=true`).
- Unsubscribe links open `/unsubscribe#token=...` (token stays out of server access logs).

## Video processing defaults
- Preview resolution: 720p (default) or 1080p.
- Watermark enabled and text for preview videos.

## Project behavior
- Auto-approve project when all videos approved (default: true).

## Security settings
**Access protection**
- Hotlink protection: DISABLED, LOG_ONLY (default), or BLOCK_STRICT.
- Session timeout (minutes/hours/days/weeks).
- Max password attempts before lockout (default: 5).

**Rate limiting**
- IP rate limit (requests/minute per IP).
- Session rate limit (requests/minute per session).

**HTTPS enforcement**
- HTTPS Enabled controls HSTS header (default: true).
- `HTTPS_ENABLED` env var overrides this setting.

**Logging**
- Track analytics for page visits/downloads.
- Track security logs for events.
- Show Security Events dashboard in admin navigation.

## Per-project settings
**Video processing**
- Preview resolution override.
- Watermark text and enable/disable.

**Client access**
- Auth mode: PASSWORD (default) or GUEST (view-only).
- Guest mode (view-only, no editing).
- Password (AES-256 encrypted).
- Custom URL slug.

**Workflow**
- Revision limit.
- Allow comments.
- Allow downloads.
- Client can approve (disable for admin-only approval).

**Notifications**
- Client notification schedule override.
- Recipients list.

---
Navigation: [Home](Home) | [Features](Features) | [Installation](Installation) | [Platform Guides](Platform-Guides) | [Configuration](Configuration) | [Admin Settings](Admin-Settings) | [Usage Guide](Usage-Guide) | [Security](Security) | [Maintenance](Maintenance) | [Troubleshooting](Troubleshooting) | [Screenshots](Screenshots) | [Contributing](Contributing) | [License](License)
