# Usage Guide

## Creating your first project
1. Login to the admin panel.
2. Create a project with title, description, client name/email, and password (recommended).
3. Upload videos.
4. Share the client link.
5. Collect timestamped feedback.
6. Approve when the client accepts the final version.

## Client workflow
1. Open the share link.
2. Enter password/OTP if required.
3. Watch videos and leave timestamped feedback.
4. Approve when satisfied.
5. Download approved videos if enabled.

## Drawing annotations on video
1. Pause the video at the desired frame.
2. Click the annotation tool in the player toolbar.
3. Draw freehand on the video frame using the selected color and opacity.
4. Use undo/redo to adjust your drawing.
5. Submit the annotation — it is attached to the comment at the current timecode.

## Attaching files to comments
1. Click the attachment icon in the comment input area.
2. Select one or more files to upload (uses TUS resumable uploads).
3. Files upload in the background with progress tracking.
4. Submit the comment — attachments are linked to the comment.

## Installing as a PWA
1. Open ViTransfer in a supported browser (Chrome, Edge, Safari).
2. Click the install prompt in the address bar or browser menu.
3. The app installs to your device home screen or dock.
4. Works offline-capable with full UI access.

## Enabling browser push notifications
1. Go to Settings > Browser Push Notifications (admin) or enable via the bell icon (client).
2. Allow the browser notification permission when prompted.
3. Select which events you want to receive push notifications for.
4. Use "Send Test" to verify your device receives notifications.

## Setting due dates on projects
1. When creating or editing a project, use the **Due Date** picker to set a deadline.
2. Optionally set a **Due Reminder** (Day Before or Week Before) to receive automated notifications.
3. Due dates appear on the project card, project detail page, and in the calendar view.
4. Color-coded urgency: red (overdue), orange (today/tomorrow), blue (within 7 days).

## Using the calendar view
1. Navigate to **Calendar** in the admin sidebar.
2. Switch between **Calendar** and **Gantt** tabs.
3. Calendar supports day, week, month (default), and year views via the scale toggle.
4. Click a date to see projects due that day; click a project to navigate to it.
5. The Gantt chart shows a timeline of all projects with due dates, color-coded by status.

## Subscribing to the iCal feed
1. Go to **Calendar** in the admin panel.
2. Copy the iCal feed URL shown at the bottom of the page.
3. Add it to your calendar app (Google Calendar, Apple Calendar, Outlook, etc.) as a URL subscription.
4. All projects with due dates appear as all-day events in your calendar.
5. Changes sync automatically when your calendar app refreshes the feed (typically every 15 min to 24 hours depending on the app).
6. To force a refresh, remove and re-add the subscription in your calendar app.
7. To invalidate the feed URL, click **Regenerate** — this creates a new token and the old URL stops working.

**What appears in the feed:**
- All projects with a due date are included, regardless of status or whether the date is in the past.
- Approved projects show with a ✓ prefix (e.g. "✓ Summer Campaign").
- Archived projects show with a ✗ prefix (e.g. "✗ Old Project").
- Events are never removed — deadlines are preserved as historical records.
- Each event links back to the project in the admin panel.

## Comparing video versions
1. Open a project with 2 or more versions of the same video.
2. Click the **Compare** button in the version selector bar.
3. A fullscreen comparison view opens with two version selectors (A and B).
4. By default, A is the previous version and B is the latest version.
5. Use **Side-by-Side** mode to view both versions next to each other with synced playback.
6. Switch to **Slider** mode for an overlay comparison — drag the vertical divider to reveal each side.
7. Controls are shared: play/pause, seek, frame step, and speed affect both videos simultaneously.
8. On mobile, side-by-side mode stacks vertically (top/bottom). Slider mode works as-is.
9. Press **Escape** or the X button to close the comparison view.

## Configuring privacy disclosure
1. Go to **Settings** in the admin panel.
2. Enable **Privacy Disclosure** under the Privacy section.
3. Optionally enter custom disclosure text (leave blank to use the default i18n text).
4. Clients will see a privacy banner on share pages and can accept or decline analytics tracking.

## Setting up activity summary emails
1. Go to **Settings > Notifications**.
2. Set **Admin Notification Schedule** to DAILY or WEEKLY for periodic admin digests.
3. Configure the time and day for scheduled deliveries.
4. Per-project client notification schedules can be set under project settings (DAILY/WEEKLY with specific time and day).
5. Customize the email content via **Settings > Email Templates** (CLIENT_ACTIVITY_SUMMARY and ADMIN_ACTIVITY_SUMMARY templates).

## Admin tips
- Use custom URLs for memorable share links.
- Enable revision tracking for complex projects.
- Configure watermarks globally or per-project (text, opacity, font size, positions).
- Monitor analytics to track engagement.
- Use Security Logs to track access attempts.
- Set due dates and use the calendar view to manage project deadlines.
- Enable privacy disclosure for GDPR compliance.
- Use skip-transcoding mode for projects that don't need watermarked previews.
- Set admin session inactivity timeout for enhanced security.

---
Navigation: [Home](Home) | [Features](Features) | [Installation](Installation) | [Platform Guides](Platform-Guides) | [Configuration](Configuration) | [Admin Settings](Admin-Settings) | [Usage Guide](Usage-Guide) | [Client Guide](Client-Guide) | [Security](Security) | [Maintenance](Maintenance) | [Troubleshooting](Troubleshooting) | [Screenshots](Screenshots) | [Contributing](Contributing) | [License](License)
