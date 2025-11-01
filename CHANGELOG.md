# Changelog

All notable changes to ViTransfer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
