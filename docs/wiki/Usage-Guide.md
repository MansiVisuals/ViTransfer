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
1. Go to **Calendar** and click the **Subscribe** button.
2. Copy the generated iCal feed URL.
3. Add it to your calendar app (Google Calendar, Apple Calendar, Outlook, etc.) as a URL subscription.
4. Projects with due dates appear as all-day events in your calendar.
5. Changes sync automatically when your calendar app refreshes the feed.
6. To invalidate the feed URL, click **Regenerate** — this creates a new token and the old URL stops working.

## Admin tips
- Use custom URLs for memorable share links.
- Enable revision tracking for complex projects.
- Configure watermarks globally or per-project.
- Monitor analytics to track engagement.
- Use Security Logs to track access attempts.
- Set due dates and use the calendar view to manage project deadlines.

---
Navigation: [Home](Home) | [Features](Features) | [Installation](Installation) | [Platform Guides](Platform-Guides) | [Configuration](Configuration) | [Admin Settings](Admin-Settings) | [Usage Guide](Usage-Guide) | [Security](Security) | [Maintenance](Maintenance) | [Troubleshooting](Troubleshooting) | [Screenshots](Screenshots) | [Contributing](Contributing) | [License](License)
