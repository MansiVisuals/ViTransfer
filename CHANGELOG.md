# Changelog

All notable changes to ViTransfer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.5] - 2025-11-16

### Security
- **Resolved 4 HIGH severity Go CVEs** in esbuild dependency
  - Upgraded esbuild from 0.25.12 to 0.27.0 via npm overrides
  - Fixed CVE-2025-58188, CVE-2025-61725, CVE-2025-58187, CVE-2025-61723
  - Reduced total CVE count from 0C 5H 7M 2L to 0C 1H 6M 2L
  - All Go CVEs resolved - esbuild now compiled with patched Go 1.25.4
- Updated Docker base image to node:25.2.0-alpine3.22
- Updated SECURITY.md with current CVE status
  - Removed all fixed Go CVEs
  - Added curl CVE-2025-10966
  - All remaining CVEs are in Alpine/npm packages awaiting upstream fixes

### Improved
- UI consistency across admin interface
  - Standardized form styling and spacing
  - Improved visual consistency in user management
  - Better alignment of UI elements

## [0.3.4] - 2025-11-16

### Added
- **OTP (One-Time Password) Authentication** - Alternative authentication method for share links
  - Modern 6-box OTP input component with auto-focus and keyboard navigation
  - Automatic paste support for codes from email or SMS
  - Configurable via per-project authMode setting (password, OTP, or both)
  - Requires SMTP configuration and at least one recipient
  - Integrates with existing rate limiting and security event logging
  - OTP codes are 6-digit, expire after 10 minutes, and are one-time use only
  - Stored securely in Redis with automatic cleanup
  - Email delivery with professional template including OTP code
- Centralized Redis connection management (`src/lib/redis.ts`)
  - Singleton pattern for consistent connection handling
  - `getRedis()` and `getRedisConnection()` functions
  - Replaces 6 duplicate Redis connection implementations
- Centralized comment sanitization (`src/lib/comment-sanitization.ts`)
  - `sanitizeComment()` function for consistent PII removal
  - Used across all comment API routes
  - Prevents email/name exposure to non-admins
- OTPInput component for user-friendly code entry
  - Individual boxes for each digit with auto-advance
  - Paste support that distributes digits across boxes
  - Backspace support with smart cursor movement
  - Arrow key navigation between boxes

### Changed
- Authentication session storage now supports multiple projects simultaneously
  - Changed from single project ID to Redis SET for auth sessions
  - Changed from single project ID to Redis SET for video access sessions
  - Reuse existing session cookies when authenticating to new projects
  - Add projects to session SET instead of overwriting single value
  - Refresh TTL on each project access to maintain active sessions
  - Update validation to use SISMEMBER instead of exact match
  - Each project still requires authentication before being added to session
- Comment section height increased from 50vh to 75vh (150% larger display area)
- Authentication Attempts setting now applies to both password and OTP verification
- Rate limiting now reads max attempts from Settings instead of hardcoded values
- `verifyProjectAccess()` now supports authMode parameter for flexible authentication
- Company Name validation now properly allows empty strings
  - Changed minimum length from 1 to 0 characters
  - Fixes validation mismatch where UI shows field as optional but validation required it
  - Updated in createProjectSchema, updateProjectSchema, and updateSettingsSchema

### Fixed
- **CRITICAL**: Multi-project session conflicts resolved
  - Opening a second project no longer breaks access to the first project
  - Video playback and comments work correctly across all authenticated projects
  - Session state properly maintained when switching between projects
- Comment section auto-scroll behavior improved
  - Now works correctly for both admin and client users
  - Fixed page-level scroll issue by using scrollTop instead of scrollIntoView
  - Auto-scroll only affects comments container, not entire page
  - Prevents page jumping when switching video versions or when new comments appear
- Recipient change callback keeps project settings page in sync with recipient updates

### Improved
- Code maintainability with major refactoring following DRY principles
  - Removed 241 lines of dead/duplicate code
  - Centralized Redis connection management
  - Consolidated duplicate comment sanitization logic
  - Flattened deep nesting in getPasskeyConfigStatus()
- Authentication UI with more concise and helpful messages
- Security event logging now tracks OTP attempts and rate limiting

### Removed
- Duplicate Redis connection implementations across 6 files
- Duplicate sanitizeComment() functions from 3 API route files
- `src/lib/api-responses.ts` (85 lines, unused)
- `src/lib/error-handler.ts` (156 lines, unused)

### Database Migration
- Added authMode field to Project table (password, OTP, or both)

## [0.3.3] - 2025-11-15

### Added
- **PassKey/WebAuthn Authentication** - Modern passwordless login for admin accounts
  - Usernameless authentication support (no email required at login)
  - Multi-device support with auto-generated device names (iPhone, Mac, Windows PC, etc.)
  - Per-user PassKey management in admin user settings
  - Built with SimpleWebAuthn following official security patterns
  - Challenge stored in Redis with 5-minute TTL and one-time use
  - Replay attack prevention via signature counter tracking
  - Comprehensive security event logging for all PassKey operations
  - Rate limiting on authentication endpoints
  - Strict domain validation (production requires HTTPS, localhost allows HTTP)
  - Configuration via Settings.appDomain (no environment variables needed)

### Changed
- Restore SMTP password reveal functionality (reverted to v0.3.0 behavior)
  - Admin-authenticated GET /api/settings now returns decrypted SMTP password
  - Eye icon in password field works normally to show/hide actual password
  - Removed unnecessary placeholder logic for cleaner implementation
- Smart password update logic prevents unnecessary database writes
  - SMTP password only updates if value actually changes
  - Project share password only updates if value actually changes
  - Prevents unnecessary session invalidations when password unchanged

### Fixed
- SMTP password no longer lost when saving other settings
- Project password updates now properly compare with current value before updating
- Session invalidation only triggered when password actually changes

### Security
- PassKey authentication endpoints protected with rate limiting
- Generic error messages prevent information disclosure
  - Client sees: "PassKey authentication failed. Please try again."
  - Server logs detailed error for debugging
- All PassKey operations require admin authentication (except login)
- Session invalidation on password change prevents race conditions

### Database Migration
- Added PasskeyCredential model for WebAuthn credential storage
  - credentialID (unique identifier)
  - publicKey (verification key)
  - counter (replay attack prevention)
  - transports (USB, NFC, BLE, internal)
  - deviceType (single-device or multi-device)
  - backedUp (synced credential indicator)
  - aaguid (authenticator identifier)
  - userAgent and credentialName (device tracking)
  - lastUsedAt and lastUsedIP (security monitoring)

## [0.3.2] - 2025-11-14

### Added
- Comment UI with color-coded message borders and improved visual contrast
- HTTPS configuration support
- Unapprove functionality
- Build script: optional --no-cache flag support

### Changed
- Settings UX improvements
- Project approval logic fixes
- Security settings enhancements

## [0.3.1] - 2025-01-13

### Security
- Add runtime JWT secret validation to prevent undefined secret usage
- Fix fingerprint hash truncation (use full 256-bit SHA-256 instead of 96-bit)
- Add CRLF injection protection for companyName field in email headers
- Strengthen FFmpeg watermark escaping with defense-in-depth approach
- Implement reusable Content-Disposition header sanitization for file downloads
- Add rate limiting to admin endpoints (batch ops, approve/unapprove, users)
- Add batch operation size limits (max 100 items)
- Fix SMTP password exposure in API responses (return placeholder)

### Added
- Per-project companyName field in project creation and settings
- Display priority: companyName → Primary Recipient → "Client"
- Timezone-aware date/time formatting using Intl.DateTimeFormat
  - Client-side: uses browser timezone for proper user localization
  - Server-side: uses TZ environment variable for emails/logs/workers
  - Format adapts based on region (MM-dd-yyyy, dd-MM-yyyy, yyyy-MM-dd)

### Changed
- Update all pages to show companyName with fallback logic
- Update share API to use companyName in clientName field
- Replace toLocaleString() with formatDateTime() for consistency
- Hide recipient email when companyName is set for cleaner display
- Improve comment name picker UX (starts at "Select a name..." instead of pre-selected)

### Fixed
- Correct product name from "VidTransfer" to "ViTransfer" throughout codebase
- Fix TypeScript build errors related to Buffer type annotations in streams
- Revert incorrect project ownership validation (admins see all projects)

## [0.3.0] - 2025-11-13

**Why v0.3.0?** Originally planned as v0.2.6, this release includes critical security hardening that warrants a minor version bump rather than a patch. The scope of security improvements (SQL injection prevention, XSS protection enhancement, command injection fixes, timing attack mitigation, and path traversal hardening) makes this a significant security-focused upgrade.

### Security
- **CRITICAL**: Fixed SQL injection vulnerability in database context management
  - Added strict CUID format validation (`/^c[a-z0-9]{24}$/`) before executing raw SQL
  - Added UserRole enum validation to prevent arbitrary role injection
  - Prevents malicious user IDs from bypassing Row Level Security (RLS)
  - Location: `src/lib/db.ts:setDatabaseUserContext()`
- **CRITICAL**: Enhanced XSS protection in comment rendering
  - Configured DOMPurify with strict ALLOWED_TAGS whitelist
  - Added ALLOWED_URI_REGEXP to only allow https://, http://, mailto: URLs
  - Enabled FORCE_BODY to prevent context-breaking attacks
  - Added rel="noopener noreferrer" to all links automatically
  - Location: `src/components/MessageBubble.tsx:sanitizeContent()`
- **CRITICAL**: Fixed command injection in FFmpeg watermark processing
  - Created dedicated `validateAndSanitizeWatermarkText()` function
  - Validates character whitelist (alphanumeric, spaces, safe punctuation only)
  - Enforces 100 character limit to prevent resource exhaustion
  - Properly escapes text for FFmpeg drawtext filter
  - Location: `src/lib/ffmpeg.ts`
- **CRITICAL**: Fixed timing attack vulnerability in password verification
  - Implemented constant-time comparison using `crypto.timingSafeEqual()`
  - Prevents password enumeration through timing analysis
  - Maintains constant execution time even when lengths differ
  - Location: `src/app/api/share/[token]/verify/route.ts:constantTimeCompare()`
- **HIGH**: Added robust JSON.parse error handling in video access tokens
  - Gracefully handles corrupted Redis data without crashing
  - Validates required fields (videoId, projectId, sessionId) after parsing
  - Logs security events with sanitized token preview (first 10 chars only)
  - Location: `src/lib/video-access.ts:verifyVideoAccessToken()`
- **HIGH**: Enhanced path traversal protection with 7-layer defense
  - Layer 1: Null byte injection check
  - Layer 2: Double URL decoding (catches `%252e%252e%252f` attacks)
  - Layer 3: Path separator normalization
  - Layer 4: Explicit `..` sequence removal
  - Layer 5: Path normalization
  - Layer 6: Absolute path resolution
  - Layer 7: Boundary validation (ensure path is within STORAGE_ROOT)
  - Location: `src/lib/storage.ts:validatePath()`
- **Code Quality**: Removed 51KB of duplicate component files
  - Deleted: AdminVideoManager 2.tsx, LoginModal 2.tsx, VideoPlayer 2.tsx, VideoUpload 2.tsx
  - Eliminates maintenance burden and potential inconsistencies

### Added
- **Complete Email Notification System** (originally planned for future release, delivered now!)
  - Configurable notification schedules: Immediate, Hourly, Daily, Weekly
  - Email notification summaries to reduce spam (batches updates by schedule)
  - Separate admin and client notification settings per project
  - Per-recipient notification preferences with opt-in/opt-out toggles
  - Notification queue system with automatic retry logic (3 attempts, permanent failure tracking)
  - BullMQ repeatable jobs for scheduled summary delivery (every minute check)
  - Professional email templates with project context and direct share links
  - Unified notification flow for all comment types (client comments, admin replies)
- **Per-Video Revision Tracking**
  - Track revision count per video (not just per project)
  - Better control over individual video approval cycles
  - Maintains project-wide revision limits while tracking per video
- Sort toggle for projects dashboard (status/alphabetical sorting)
- Sort toggle for project videos and versions (status/alphabetical sorting)
- Section dividers in share page sidebar (For Review / Approved sections)
- Green check mark icon for approved videos in sidebar (replaces play icon)
- New `formatDate()` utility for consistent date formatting (11-Nov-2025 format)
- **DEBUG_WORKER environment variable** for optional verbose logging

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
- Duplicate component files (AdminVideoManager 2.tsx, LoginModal 2.tsx, VideoPlayer 2.tsx, VideoUpload 2.tsx)

### Improved
- Comment section approval updates now instant (optimistic UI updates)
- Share page filtering refreshes immediately on approval state changes
- Comment/reply updates appear instantly without page refresh
- Optimistic updates for comment replies (no loading delays)
- Admin comment version filtering on share page more accurate
- Feedback & Discussion section updates immediately on approval changes
- Approved badge spacing in admin panel
- "All Versions" section spacing from content above
- Analytics projects card spacing to prevent overlap
- Version labels padding to prevent hover animation cutoff
- Mobile inline editing no longer overflows with action buttons
- Simplified comment filtering logic (no more null videoId checks)

### Fixed
- **CRITICAL**: Thumbnail generation failing for videos shorter than 10 seconds
  - Previously hardcoded to seek to 10s, causing EOF for short videos
  - Now calculates safe timestamp: 10% of duration (min 0.5s, max 10s)
- Comment section not updating when approval status changes
- Share page filtering not refreshing after approval/unapproval
- Instant comment/reply updates not working correctly
- Optimistic updates for comment replies failing
- Feedback & Discussion section not updating on approval changes
- Admin comment version filtering on share page
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
- Added per-video revision tracking fields
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
