# Admin Settings

Configure in the admin panel under Settings.

## Company branding
- Company Name: shown in emails and comments.
- App Domain: required for passkeys and deep links (e.g., `https://yourdomain.com`).

## Branding & Appearance
- Logo upload: SVG format, max 300KB. Displayed in email headers and admin panel.
- Accent colors: 10 preset color options.
- Default theme: select the default theme for new visitors.
- Email header style: logo appears in notification emails when uploaded.

## Client Directory
- Companies: create and manage client companies.
- Contacts: associate contacts with companies.
- Auto-sync: contacts are automatically created from project recipients.

## Email Templates
- 9 template types: customize emails for different notification events.
- Placeholder system: dynamic values (project name, client name, links, etc.).
- Preview: preview rendered templates before saving.
- Enable/disable: toggle individual templates on or off.

## Notifications (email + push)
**Email settings**
- SMTP server, port, username, password, from address.
- Security mode: STARTTLS (default), TLS, or NONE.
- Admin notification schedule: IMMEDIATE, HOURLY, DAILY, WEEKLY.
- Client email unsubscribe per recipient (project recipients list reflects status).

**Push notifications (external)**
- Providers: Gotify, ntfy, Pushover, Telegram.
- Implemented via Apprise inside app/worker image.
- Delivered by BullMQ worker (`external-notifications`).
- Deep links use the configured App Domain.

**Browser push notifications**
- Per-device subscriptions: each device registers independently.
- Event filtering: choose which events trigger browser push notifications.
- VAPID: auto-generated key pair for Web Push protocol.
- Test notifications: send a test push to verify device registration.

**Events**
- Failed admin login attempts (email, method, link).
- Unauthorized OTP requests (project, email, method, link).
- Successful share access (project, method, optional client email, link).
- Client comments (project, video, timecode, client, comment preview, deep link).
- Video approvals (project, action, client, video list, link).
- Due date reminders (project, due date, reminder type).

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

**IP & domain blocking**
- IP blocking: block specific IP addresses from accessing the platform.
- Domain blocking: block access from specific email domains.

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

## Calendar & Due Dates
- Calendar view: day, week, month (default), and year scales.
- Gantt chart: visual timeline of project due dates color-coded by status.
- Due date reminders: automated notifications sent day-before or week-before (configurable per project).
- Reminder channels: browser push, external providers (Gotify/ntfy/Pushover/Telegram), and email to all admins.
- Due date reminder email template: customizable in Settings > Email Templates with placeholders for project title, due date, and reminder type.
- Reminders run daily via the background worker using the server timezone (`TZ` env var).

### iCal Feed
Subscribe to project deadlines from any calendar app (Google Calendar, Apple Calendar, Outlook, etc.).

**Setup**
- Navigate to **Calendar** in the admin panel.
- Copy the iCal feed URL shown at the bottom of the page.
- Add it to your calendar app as a URL/subscription calendar.
- Feed URL format: `https://yourdomain.com/api/calendar/feed?token=<token>`.

**Token management**
- Each admin gets a unique feed URL with a secure 64-character token.
- Click **Regenerate** to create a new token — the old URL stops working immediately.
- Tokens are stored per admin user; deleting a user invalidates their feed.

**Feed behavior**
- The feed includes **all projects with a due date**, regardless of status or age.
- Events are never removed from the feed — past deadlines persist as historical records.
- All events use iCal `STATUS:CONFIRMED` so calendar apps always display them.
- Approved projects are prefixed with a checkmark in the title (e.g. "✓ Summer Campaign").
- Archived projects are prefixed with a cross (e.g. "✗ Old Project").
- Active/in-review projects show the plain title.
- Events are all-day events (date-only, no time component) — they appear in the top banner of calendar apps, not as time-blocked slots.
- Each event includes a direct URL link back to the project in the admin panel.
- The `UID` for each event is the project ID, so calendar apps correctly update existing events on refresh.

**Sync & caching**
- The feed response includes `Cache-Control: no-cache` headers, but calendar apps control their own refresh interval (typically 15 minutes to 24 hours).
- To force a refresh: remove and re-add the subscription in your calendar app.
- Rate limited to 10 requests per minute per IP.

**Technical details (RFC 5545)**
- Format: iCalendar (`.ics`) with `METHOD:PUBLISH`.
- Events are `VEVENT` with `VALUE=DATE` (all-day).
- `STATUS:CONFIRMED` for all events (not `COMPLETED`, which causes calendar apps to hide events).
- Calendar name: "ViTransfer Deadlines" (`X-WR-CALNAME`).

## Per-project settings
**Video processing**
- Preview resolution override.
- Watermark text and enable/disable.
- Max upload size override.

**Client access**
- Auth mode: PASSWORD (default), OTP, BOTH, NONE, or GUEST.
- Password (AES-256 encrypted).
- Custom URL slug.

**Workflow**
- Revision limit.
- Allow comments.
- Comment attachments toggle.
- Allow downloads.
- Client can approve (disable for admin-only approval).
- Hide feedback from other clients.
- Restrict comments to latest version only.
- Timestamp display format.

**Due dates**
- Due date: optional date picker for project deadline.
- Due reminder: NONE, DAY_BEFORE, or WEEK_BEFORE.
- Due dates are stored at noon UTC to prevent timezone day-boundary issues.
- Displayed in the user's local timezone (browser timezone client-side, `TZ` env var server-side).

**Notifications**
- Client notification schedule override.
- Recipients list.

---
Navigation: [Home](Home) | [Features](Features) | [Installation](Installation) | [Platform Guides](Platform-Guides) | [Configuration](Configuration) | [Admin Settings](Admin-Settings) | [Usage Guide](Usage-Guide) | [Security](Security) | [Maintenance](Maintenance) | [Troubleshooting](Troubleshooting) | [Screenshots](Screenshots) | [Contributing](Contributing) | [License](License)
