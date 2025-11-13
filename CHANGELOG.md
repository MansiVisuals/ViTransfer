# Changelog

All notable changes to ViTransfer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.6] - TBD

### Added
- **Complete Email Notification System** (originally planned for v0.3.0, delivered early!)
  - Configurable notification schedules: Immediate, Hourly, Daily, Weekly
  - Email notification summaries to reduce spam (batches updates by schedule)
  - Separate admin and client notification settings per project
  - Per-recipient notification preferences with opt-in/opt-out toggles
  - Notification queue system with automatic retry logic (3 attempts, permanent failure tracking)
  - BullMQ repeatable jobs for scheduled summary delivery (every minute check)
  - Professional email templates with project context and direct share links
  - Unified notification flow for all comment types (client comments, admin replies)
- Sort toggle for projects dashboard (status/alphabetical sorting)
- Sort toggle for project videos and versions (status/alphabetical sorting)
- Section dividers in share page sidebar (For Review / Approved sections)
- Green check mark icon for approved videos in sidebar (replaces play icon)
- New `formatDate()` utility for consistent date formatting (11-Nov-2025 format)
- **DEBUG_WORKER environment variable** for optional verbose logging (from v0.2.5)

### Changed
- **BREAKING**: All comments must now be video-specific (general comments removed)
- Email notifications now fully functional with flexible scheduling
- Share page sorting now checks if ANY version is approved (not just latest)
- Video groups in admin panel sorted by approval status (unapproved first)
- Versions within groups sorted by approval status (approved first)
- Projects list extracted to client component for better performance
- README development warning now includes 3-2-1 backup principle
- All recipient IDs migrated from UUID to CUID format for consistency
- All dates now display in consistent "11-Nov-2025" format

### Removed
- General/system comments (all comments must be attached to a video)
- System audit comments for approval/unapproval actions (status tracked in database)
- Old per-comment email notification system (replaced with unified notification queue)

### Improved
- Approved badge spacing in admin panel
- "All Versions" section spacing from content above
- Analytics projects card spacing to prevent overlap
- Version labels padding to prevent hover animation cutoff
- Mobile inline editing no longer overflows with action buttons
- Simplified comment filtering logic (no more null videoId checks)

### Fixed
- **CRITICAL**: Thumbnail generation failing for videos shorter than 10 seconds (from v0.2.5)
  - Previously hardcoded to seek to 10s, causing EOF for short videos
  - Now calculates safe timestamp: 10% of duration (min 0.5s, max 10s)
- Projects dashboard now loads correctly after refactoring
- Mobile overflow when editing video/group names
- Version label hover animation cutoff at top of container

### Database Migration
- Added notification schedule fields to Settings table (admin-wide defaults)
- Added notification schedule fields to Project table (per-project overrides)
- Added notification day field for weekly schedules
- Added lastAdminNotificationSent and lastClientNotificationSent timestamps
- Created NotificationQueue table for batched email delivery with retry tracking
- Added ProjectRecipient.receiveNotifications boolean field
- **IRREVERSIBLE**: Deleted all existing general comments (where videoId IS NULL)
- Made Comment.videoId field required (NOT NULL constraint)
- **IRREVERSIBLE**: Migrated all UUID format recipient IDs to CUID format

## [0.2.5] - 2025-11-12

### Added
- **DEBUG_WORKER environment variable**
  - Optional verbose logging for FFmpeg and worker operations
  - Logs command execution, process IDs, exit codes, timing breakdowns
  - Shows download/upload speeds, file sizes, processing time breakdown
  - Controllable without rebuilding Docker image (set env var and restart)
  - Helps diagnose video processing issues in production

### Fixed
- **CRITICAL**: Thumbnail generation failing for videos shorter than 10 seconds
  - Previously hardcoded to seek to 10 seconds, causing EOF for short videos
  - Now calculates safe timestamp: 10% of duration (min 0.5s, max 10s)
  - FFmpeg properly reports when no frames available for extraction

## [0.2.4] - 2025-11-10

### Added
- Auto-approve project setting with toggle in global settings

### Changed
- "Final Version" renamed to "Approved Version"
- Admin footer solid background, fixed at bottom on desktop
- Video information dialog clarifies it shows original video metadata
- Videos sorted by approval status (unapproved first)
- Mobile video selector now starts collapsed

### Improved
- Settings pages show save/error notifications at bottom for better mobile/long page UX
- Simplified video preview note text
- Comment section height and scrolling behavior

### Fixed
- Recipient name selector jumping to first option
- Mobile sidebar collapsing when selecting videos
- Share page auto-scrolling issues

## [0.2.3] - 2025-11-09

### Fixed
- Recipient name selector jumping back to first option when selecting another recipient

## [0.2.2] - 2025-11-09

### Fixed
- Validation error when creating projects without password protection
- Validation error when creating projects without recipient email

## [0.2.1] - 2025-11-09

### Fixed
- Docker entrypoint usermod timeout removed - allows natural completion on all platforms
- Clean startup output without false warning messages

### Added
- Version number now displays in admin footer
- Build script passes version to Docker image at build time

## [0.2.0] - 2025-11-09

### Added
- Multiple recipient support for projects (ProjectRecipient model)
- Recipient management UI in project settings (add, edit, remove)
- Primary recipient designation for each project
- Projects sorted by status on admin dashboard (In Review → Share Only → Approved)

### Changed
- Migrated from single clientEmail/clientName to multi-recipient system
- All notifications sent to all recipients
- Improved notification messages with recipient names

### Removed
- Legacy clientEmail and clientName fields from Project model

### Improvements
- Code refactoring for better maintainability and reusability
- Security enhancements

### Note
Future v0.2.x releases will include notification system changes (configurable email schedules and summary notifications)

## [0.1.9] - 2025-11-07

### Added
- Configurable session timeout for client share sessions (Security Settings)
- Password visibility toggle in project settings (show/hide share password)
- Configurable APP_HOST environment variable for Docker deployments
- Right-click download prevention on video player for non-admin users

### Fixed
- Project deletion now properly removes all folders and files
- Client names now persist correctly after page refresh
- Docker health check endpoint for K8s/TrueNAS compatibility
- TypeScript null handling for client names in comment routes
- Password field UI consistency across the application

### Improved
- Password input fields now use consistent PasswordInput component with eye icon
- Share page password field layout matches SMTP password field
- Security settings with real-time feedback for timeout values

## [0.1.6] - 2025-11-01

### Added
- Video reprocessing when project settings change
- Drag and drop for video uploads
- Resizable sidebar on share page

### Fixed
- Mobile video playback performance
- Upload cancellation deletes video records
- Share page viewport layout and scaling

### Improved
- Progress bar animations with visual feedback
- Sidebar sizing (reduced to 30% max width)

## [0.1.0] - 2025-10-28

### Initial Release

#### Features
- 📹 **Video Upload & Processing** - Automatic transcoding to multiple resolutions (720p/1080p)
- 💧 **Watermarking** - Customizable watermarks for preview videos
- 💬 **Timestamped Comments** - Collect feedback with precise video timestamps
- ✅ **Approval Workflow** - Client approval system with revision tracking
- 🔒 **Password Protection** - Secure projects with client passwords
- 📧 **Email Notifications** - Automated notifications for new videos and replies
- 🎨 **Dark Mode** - Beautiful dark/light theme support
- 📱 **Fully Responsive** - Works perfectly on all devices
- 👥 **Multi-User Support** - Create multiple admin accounts
- 📊 **Analytics Dashboard** - Track page visits, downloads, and engagement
- 🔐 **Security Logging** - Monitor access attempts and suspicious activity
- 🎯 **Version Management** - Hide/show specific video versions
- 🔄 **Revision Tracking** - Limit and track project revisions
- ⚙️ **Flexible Settings** - Per-project and global configuration options

#### Security
- 🔐 **JWT Authentication** - Secure admin sessions with 15-minute inactivity timeout
- 🔑 **AES-256 Encryption** - Encrypted password storage for share links
- 🛡️ **Rate Limiting** - Protection against brute force attacks
- 📝 **Security Event Logging** - Track all access attempts
- 🚫 **Hotlink Protection** - Prevent unauthorized embedding
- 🌐 **HTTPS Support** - SSL/TLS for secure connections
- ⏱️ **Session Monitoring** - Inactivity warnings with auto-logout

#### Technical
- 🐳 **Docker-First** - Easy deployment with Docker Compose
- 🚀 **Next.js 15 + React 19** - High performance modern stack
- 📦 **Redis Queue** - Background video processing with BullMQ
- 🎬 **FFmpeg Processing** - Industry-standard video transcoding
- 🗄️ **PostgreSQL Database** - Reliable data storage
- 🌐 **TUS Protocol** - Resumable uploads for large files
- 🏗️ **Multi-Architecture** - Support for amd64 and arm64

---

## Release Notes

### Version Tagging
Starting with v0.1.0, Docker images are tagged with both version numbers and "latest":
- `crypt010/vitransfer:0.1.0` - Specific version
- `crypt010/vitransfer:latest` - Always points to the latest stable release
