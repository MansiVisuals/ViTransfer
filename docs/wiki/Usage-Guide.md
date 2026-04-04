# Usage Guide

## Creating your first project
1. Login to the admin panel.
2. Click **New Project**.
3. Choose a project type: **Video** or **Photo**.
4. Fill in the title, description, client name/email, and password (recommended).
5. Upload videos or photos depending on the project type.
6. Share the client link.
7. Collect feedback (timestamped for video, pin-based for photo).
8. Approve when the client accepts the deliverables.

## Creating a photo project
1. Click **New Project** in the admin panel.
2. Select **Photo** as the project type.
3. Fill in the project details and save.
4. Upload photos using the photo upload modal — drag and drop or click to browse.
5. Supported formats: JPEG, PNG, WebP, TIFF, AVIF, HEIF/HEIC, BMP, GIF, and RAW (CR2, CR3, NEF, ARW, RAF, ORF, RW2, DNG, PEF, SRW, ERF, MOS, IIQ, 3FR, FFF, GPR).
6. Reorder photos by dragging them in the gallery.
7. Share the client link — clients see a photo-optimized grid layout.

> **Note:** Photo projects hide video-specific settings (watermark, transcoding, preview LUT, resolution) since they do not apply to photos.

## Client workflow
1. Open the share link.
2. Enter password/OTP if required.
3. For video projects: watch videos and leave timestamped feedback.
4. For photo projects: browse the photo gallery, click photos to open the lightbox, and leave pin comments.
5. Approve when satisfied.
6. Download approved content if enabled.

## Drawing annotations on video
1. Pause the video at the desired frame.
2. Click the annotation tool in the player toolbar.
3. Draw freehand on the video frame using the selected color and opacity.
4. Use undo/redo to adjust your drawing.
5. Submit the annotation — it is attached to the comment at the current timecode.

## Pin comments on photos
1. Open a photo in the lightbox (click any photo in the gallery).
2. Click anywhere on the photo to place a pin at that location.
3. A numbered marker appears on the photo and the comment input is focused.
4. Type your feedback and click **Send**.
5. The pin comment appears in the comment panel with a numbered badge matching the marker on the photo.
6. Other reviewers can see all pin markers on the photo, numbered in order.
7. Pin positions are resolution-independent — they render correctly at any display size.

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

## Using reverse share (client file submissions)

Reverse share lets clients upload files directly to a project from the share page — useful for collecting raw footage, audio, project files, or any deliverable without requiring a comment.

**Enabling it:**
1. Open the project, go to **Settings**.
2. Under **Client Share Page**, enable **Allow Client File Submissions**.
3. Save. A "Submit Files" button now appears in the top-left corner of the client share page.

**Viewing submitted files (admin):**
1. Open the project page in the admin panel.
2. A **Client Uploads** block appears below the videos section.
3. Each entry shows the file name, size, uploader name/email (if authenticated), and upload date.
4. Click the download icon to download a single file, or the trash icon to delete it.

## Bulk selecting assets and client uploads

Both the **video asset list** (per video) and the **Client Uploads** block support multi-select for bulk download or delete.

1. Click the checkbox on the left of any row to start selecting.
2. A bulk action bar appears at the top of the list showing the count of selected items.
3. Click the count to toggle **Select All / Deselect All**.
4. Click **Download** to download all selected files sequentially.
5. Click **Delete** to delete all selected files after a single confirmation prompt.
6. Individual per-row actions still work as before.

## Admin tips
- Enable reverse share to collect raw files or deliverables from clients without needing a comment.
- Use bulk select on video assets and client uploads to download or delete multiple files at once.
- Use custom URLs for memorable share links.
- Enable revision tracking for complex projects.
- Configure watermarks globally or per-project (text, opacity, font size, positions).
- Monitor analytics to track engagement.
- Use Security Logs to track access attempts.
- Set due dates and use the calendar view to manage project deadlines.
- Enable privacy disclosure for GDPR compliance.
- Use skip-transcoding mode for projects that don't need watermarked previews.
- Set admin session inactivity timeout for enhanced security.
- Use photo projects for still image review — they skip video-specific processing entirely.
- Pin comments let clients give precise feedback on specific areas of a photo.

---
Navigation: [Home](Home) | [Features](Features) | [Installation](Installation) | [Platform Guides](Platform-Guides) | [Configuration](Configuration) | [Admin Settings](Admin-Settings) | [Usage Guide](Usage-Guide) | [Client Guide](Client-Guide) | [Security](Security) | [Maintenance](Maintenance) | [Troubleshooting](Troubleshooting) | [Screenshots](Screenshots) | [Contributing](Contributing) | [License](License)
