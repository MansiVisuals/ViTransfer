# ViTransfer

**Professional Video Review & Approval Platform for Filmmakers**

ViTransfer is a self-hosted web application designed for video professionals to share work with clients, collect feedback, and manage approval workflows. Built with modern technologies and designed for easy self-hosting.

NOTE: Code-assisted development with Claude AI, built with focus on security and best practices.

[![Docker Pulls](https://img.shields.io/docker/pulls/crypt010/vitransfer)](https://hub.docker.com/r/crypt010/vitransfer)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![GitHub](https://img.shields.io/badge/github-MansiVisuals%2FViTransfer-blue)](https://github.com/MansiVisuals/ViTransfer)
[![Ko-fi](https://img.shields.io/badge/Support%20on-Ko--fi-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/E1E215DBM4)

⚠️ **ACTIVE DEVELOPMENT:** ViTransfer is under active development with frequent updates. While fully functional and used in production, features may be replaced, modified, or removed as we work towards v1.0. Always maintain backups following the 3-2-1 principle (3 copies, 2 different media, 1 offsite) and check release notes before updating. Contributions and feedback are welcome.

💖 **Support Development:** If you find ViTransfer useful, consider [supporting on Ko-fi](https://ko-fi.com/E1E215DBM4) to help fund continued development.

## Features

### Core Functionality
- **Video Upload & Processing** - Automatic FFmpeg transcoding to 720p, 1080p, or 4K with resumable uploads via TUS protocol
- **Smart Watermarking** - Customizable watermarks with center and corner placements, configurable per project or globally
- **Timestamped Comments** - Timestamped feedback with threaded replies that track video versions (up to 10,000 characters)
- **Approval Workflow** - Per video approval system with automatic project approval when all videos are approved
- **Flexible Authentication** - Share links support password protection, email OTP codes, both methods, or no authentication with optional guest mode
- **Smart Notifications** - Email notifications with scheduling options: immediate, hourly, daily, or weekly digests
- **Dark Mode** - Native light and dark themes for consistent experience across devices
- **Responsive Design** - Optimized for desktop, tablet, and mobile devices

### Admin Features
- **Multi-User Support** - Multiple admin accounts with JWT authentication and optional WebAuthn passkey support
- **Analytics Dashboard** - Track page visits and download events per project and video with engagement metrics
- **Security Features** - Rate limiting, hotlink protection, security event logging, encrypted credentials, and token based authentication with IP binding
- **Version Control** - Multiple video versions per project with revision tracking and optional max revision limits
- **Guest Controls** - View only guest access with optional restriction to latest version only
- **Asset Management** - Attach images, audio, subtitles, project files (Premiere, DaVinci Resolve, Final Cut), and documents with magic byte validation
- **Custom Thumbnails** - Set per version thumbnails from uploaded image assets
- **Flexible Settings** - Per project and global configuration with override capabilities

### Technical Features
- **Docker First** - Easy deployment with Docker Compose, Unraid, TrueNAS, and Podman/Quadlet support
- **High Performance** - Built with Next.js 16 and React 19 with CPU aware FFmpeg presets
- **Background Processing** - Redis queue with BullMQ for video transcoding and notifications
- **Professional Video** - FFmpeg powered transcoding supporting MP4, MOV, AVI, MKV, MXF, and ProRes formats
- **Reliable Database** - PostgreSQL with Prisma 6 ORM for type safe data access
- **Secure Authentication** - JWT tokens with refresh rotation, WebAuthn passkeys, and bearer only auth (v0.6.0+)
- **Resumable Uploads** - TUS protocol for large file uploads with progress tracking
- **Flexible Auth Modes** - Password, email OTP, both methods, or no authentication with guest access

---

## Screenshots

### Login
<img src="docs/screenshots/Login Page.png" alt="Login Page" width="600">

### Admin Dashboard
<img src="docs/screenshots/Project View.png" alt="Project View" width="600">

### Project Creation
<img src="docs/screenshots/Create New Project.png" alt="Create New Project" width="600">

### Project Settings
<img src="docs/screenshots/Project Settings - 1.png" alt="Project Settings - General" width="600">
<img src="docs/screenshots/Project Settings - 2.png" alt="Project Settings - Advanced" width="600">

### Client Share Page
<img src="docs/screenshots/Share Page - Unapproved.png" alt="Share Page - Unapproved" width="600">
<img src="docs/screenshots/Share Page - Approved.png" alt="Share Page - Approved" width="600">

---

## 🚀 Quick Start

### Authentication Model (>=0.6.0)
- Admin and client share flows use bearer tokens in the `Authorization` header only (no cookies, no CSRF).
- Admin login/refresh return `{ tokens: { accessToken, refreshToken } }`; store refresh in sessionStorage and keep access token in memory.
- Share links issue short-lived share tokens after password/OTP/guest entry; send them in headers for all share API calls.
- If you were previously logged in, re-login is required after upgrading (legacy sessions are invalidated).

### Prerequisites
- Docker and Docker Compose installed
- At least 4GB RAM
- 20GB+ free disk space (more for video storage)

### Installation Method 1: Docker Hub (Recommended - 3 Minutes)

**Pull pre-built images and run immediately:**

1. **Download the configuration files**
```bash
# Create directory
mkdir vitransfer && cd vitransfer

# Download docker-compose.yml and .env.example
curl -O https://raw.githubusercontent.com/MansiVisuals/ViTransfer/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/MansiVisuals/ViTransfer/main/.env.example
```

2. **Create and configure environment file**
```bash
# Copy and edit the file
cp .env.example .env
nano .env
```

Generate **6 unique** secure values:
```bash
openssl rand -hex 32      # POSTGRES_PASSWORD (hex/URL-safe)
openssl rand -hex 32      # REDIS_PASSWORD (hex/URL-safe)
openssl rand -base64 32   # ENCRYPTION_KEY
openssl rand -base64 64   # JWT_SECRET
openssl rand -base64 64   # JWT_REFRESH_SECRET
openssl rand -base64 64   # SHARE_TOKEN_SECRET
```

Replace each placeholder in `.env`:
- `POSTGRES_PASSWORD=<<REPLACE_WITH_openssl_rand_hex_32>>`
- `REDIS_PASSWORD=<<REPLACE_WITH_openssl_rand_hex_32>>`
- `ENCRYPTION_KEY=<<REPLACE_WITH_openssl_rand_base64_32>>`
- `JWT_SECRET=<<REPLACE_WITH_openssl_rand_base64_64>>`
- `JWT_REFRESH_SECRET=<<REPLACE_WITH_openssl_rand_base64_64>>`
- `SHARE_TOKEN_SECRET=<<REPLACE_WITH_openssl_rand_base64_64>>`

**Default admin credentials** (change in production):
- `ADMIN_EMAIL=admin@example.com`
- `ADMIN_PASSWORD=Admin1234`

3. **Start the application**
```bash
docker-compose up -d
```

4. **Access ViTransfer**
- Open http://localhost:4321 (or your configured port)
- Login with your admin credentials
- Complete setup in admin settings

---

### Installation Method 2: Build from Source (Advanced)

**For developers or contributors who want to build from source:**

1. **Clone the repository**
```bash
git clone https://github.com/MansiVisuals/ViTransfer.git
cd ViTransfer
```

2. **Follow steps 2-3 from Method 1 above** to configure your `.env` file

3. **Build and start**
```bash
docker-compose up -d --build
```

4. **Access ViTransfer** at http://localhost:4321 and login with your admin credentials

The source code will be built into Docker images locally instead of pulling from Docker Hub.

---

## Platform Support

ViTransfer uses standard Docker Compose and should work on most platforms. Below are tested deployment guides for specific platforms.

### Unraid

**Tested and verified on Unraid 7.1.4**

1. **Install Docker Compose Manager Plugin**
   - Go to Unraid WebUI → Apps → Search "Compose Manager"
   - Install "Docker Compose Manager" by dcflachs

2. **Download Configuration Files**
   ```bash
   curl -O https://raw.githubusercontent.com/MansiVisuals/ViTransfer/main/docker-compose.unraid.yml
   curl -O https://raw.githubusercontent.com/MansiVisuals/ViTransfer/main/.env.example
   ```

3. **Generate Secure Values**
   ```bash
   openssl rand -hex 32      # For POSTGRES_PASSWORD
   openssl rand -hex 32      # For REDIS_PASSWORD
   openssl rand -base64 32   # For ENCRYPTION_KEY
   openssl rand -base64 64   # For JWT_SECRET
   openssl rand -base64 64   # For JWT_REFRESH_SECRET
   ```

4. **Configure Environment File**
   - Copy `.env.example` to `.env`
   - Replace all `<<REPLACE_WITH_...>>` values with your generated secrets
   - Set `ADMIN_EMAIL` and `ADMIN_PASSWORD`
   - Change `APP_PORT` if 4321 is already in use

5. **Check Volume Paths**
   - Open `docker-compose.unraid.yml`
   - Verify volume paths match your Unraid setup (default: `/mnt/user/appdata/vitransfer/`)
   - Update paths if using different locations

6. **Create Stack in Compose Manager**
   - Open Docker Compose Manager
   - Click "Add New Stack" → Name it "vitransfer"
   - In the stack editor, paste contents of `docker-compose.unraid.yml`
   - Click the `.env` tab and paste your configured `.env` file

7. **Deploy**
   - Click "Compose Up" to start all services
   - Wait for database initialization (first start takes 2-3 minutes)

8. **Access ViTransfer**
   - Navigate to `http://UNRAID-IP:4321`
   - Login with your admin credentials

---

### TrueNAS Scale

**Tested and verified on TrueNAS Scale 25.10**

**Quick Install:** ViTransfer is available in the TrueNAS Apps catalog. Search for "ViTransfer" in **Apps > Discover Apps** for easy installation.

**Manual Installation:**

1. **Create Datasets**
   - Create three datasets using TrueNAS GUI or your preferred method:
     - `postgres`
     - `redis`
     - `uploads`

   **Note:** The postgres dataset must be owned by the user `netdata` (UID 999) for Postgres to start. Uploads and redis can be owned by root with ACLs for the apps user (UID 568).

2. **Download Configuration**
   ```bash
   curl -O https://raw.githubusercontent.com/MansiVisuals/ViTransfer/main/docker-compose.truenas.yml
   ```

3. **Generate Secure Values**
   ```bash
   openssl rand -hex 32      # For POSTGRES_PASSWORD
   openssl rand -hex 32      # For REDIS_PASSWORD
   openssl rand -base64 32   # For ENCRYPTION_KEY
   openssl rand -base64 64   # For JWT_SECRET
   openssl rand -base64 64   # For JWT_REFRESH_SECRET
   ```

4. **Edit Configuration**
   - Open `docker-compose.truenas.yml`
   - Replace all `${VARIABLE}` values with your generated secrets
   - Update volume paths to match your dataset paths
   - Set `NEXT_PUBLIC_APP_URL` to your TrueNAS IP
   - Set `ADMIN_EMAIL` and `ADMIN_PASSWORD`

5. **Deploy via TrueNAS UI**
   - Navigate to: **Apps > Discover > 3 dots next to Custom App > Install via YAML**
   - Paste the contents of your edited `docker-compose.truenas.yml`
   - Click Deploy

6. **Access ViTransfer**
   - Navigate to `http://TRUENAS-IP:4321`
   - Login with your admin credentials

---

### Other Platforms

**Planned Platform Guides:**

Rootless Podman Quadlets are available in the folder quadlet.

**Community contributions welcome!** If you've successfully deployed on a specific platform, consider contributing installation guides.

---

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Description | Default | Example |
|----------|----------|-------------|---------|---------|
| `APP_PORT` | No | Port to expose on host | `4321` | `8080` |
| `PUID` | No | User ID for file permissions (Linux) | `1000` | `1000` |
| `PGID` | No | Group ID for file permissions (Linux) | `1000` | `1000` |
| `TZ` | No | Timezone for notification schedules | `UTC` | `Europe/Amsterdam` |
| `POSTGRES_USER` | Yes | PostgreSQL username | `vitransfer` | `vitransfer` |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password (hex only) | - | Generated with `openssl rand -hex 32` |
| `POSTGRES_DB` | Yes | PostgreSQL database name | `vitransfer` | `vitransfer` |
| `REDIS_PASSWORD` | Yes | Redis password (hex only) | - | Generated with `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Yes | Data encryption key (base64) | - | Generated with `openssl rand -base64 32` |
| `JWT_SECRET` | Yes | JWT signing secret (base64) | - | Generated with `openssl rand -base64 64` |
| `JWT_REFRESH_SECRET` | Yes | JWT refresh secret (base64) | - | Generated with `openssl rand -base64 64` |
| `ADMIN_EMAIL` | Yes | Initial admin email | - | `admin@example.com` |
| `ADMIN_PASSWORD` | Yes | Initial admin password | - | `Admin1234` (change in production) |
| `NEXT_PUBLIC_APP_URL` | No | Public URL for emails and links | `http://localhost:4321` | `https://videos.example.com` |
| `HTTPS_ENABLED` | No | Enable HTTPS enforcement (HSTS) | `true` | `false` for localhost |
| `SHARE_TOKEN_SECRET` | Yes | Secret for signing share tokens | _none_ | |
| `CLOUDFLARE_TUNNEL` | No | Enable Cloudflare script/connect CSP allowances | `false` | |
| `NEXT_PUBLIC_TUS_ENDPOINT` | No | If TUS is on another origin, add it to connect-src | _none_ | |

**Important Notes:**
- Use `openssl rand -hex 32` for database passwords (no special characters that break URLs)
- Use `openssl rand -base64 32/64` for encryption keys and JWT secrets
- Avoid special characters in `ADMIN_PASSWORD` due to JSON parsing
- `HTTPS_ENABLED` environment variable always takes precedence over database settings
- Set `TZ` correctly for scheduled notifications to work as expected

### Application Settings (Admin Panel)

Configure these in the admin panel under Settings:

**Company Branding:**
- Company Name - Displayed in emails and comments (default: "Studio")
- App Domain - Required for PassKey authentication (e.g., `https://yourdomain.com`)

**Email Notifications (SMTP):**
- SMTP Server - Mail server hostname
- SMTP Port - Mail server port (default: 587)
- SMTP Username - Authentication username
- SMTP Password - Authentication password
- From Address - Sender email address
- Security Mode - STARTTLS (default), TLS, or NONE
- Admin Notification Schedule - IMMEDIATE, HOURLY, DAILY, WEEKLY

**Video Processing Defaults:**
- Preview Resolution - 720p (default) or 1080p
- Watermark Enabled - Apply watermark to preview videos (default: true)
- Watermark Text - Custom watermark text for previews

**Project Behavior:**
- Auto-approve Project - Automatically approve project when all videos are approved (default: true)

### Security Settings (Admin Panel)

Configure these in the admin panel under Settings > Security:

**Access Protection:**
- Hotlink Protection - DISABLED, LOG_ONLY (default), or BLOCK_STRICT
- Session Timeout - Configurable value and unit (MINUTES, HOURS, DAYS, WEEKS)
- Password Attempts - Max failed attempts before lockout (default: 5)

**Rate Limiting:**
- IP Rate Limit - Requests per minute per IP (default: 1000)
- Session Rate Limit - Requests per minute per session (default: 600)

**HTTPS Enforcement:**
- HTTPS Enabled - Enable HSTS header (default: true)
- Note: `HTTPS_ENABLED` environment variable always overrides this setting

**Logging:**
- Track Analytics - Enable page visit and download tracking (default: true)
- Track Security Logs - Log security events and suspicious activity (default: true)
- View Security Events - Show security dashboard in admin navigation (default: false)

### Per-Project Settings

Each project can override global defaults:

**Video Processing:**
- Preview Resolution - Override global setting (720p/1080p/2160p)
- Watermark Text - Custom watermark for this project
- Watermark Enabled - Enable/disable watermark for this project

**Client Access:**
- Authentication Mode - PASSWORD (default) or GUEST (view-only, no password)
- Guest Mode - Allow view-only access without password or editing capabilities
- Password - Client access password (AES-256 encrypted)
- Custom URL - Memorable share link slug

**Workflow:**
- Revision Limit - Maximum number of revision rounds
- Allow Comments - Enable client feedback
- Allow Downloads - Let clients download approved videos
- Require Approval - Client must approve before download

**Notifications:**
- Client Notification Schedule - Override global schedule (IMMEDIATE/HOURLY/DAILY/WEEKLY)
- Recipients - Email addresses to notify on project updates

### Reverse Proxy Setup

Tested with Cloudflare Tunnels.

---

## Usage Guide

### Creating Your First Project

1. **Login** to the admin panel
2. **Create Project** with:
   - Project title and description
   - Client name and email
   - Password protection (recommended)
3. **Upload Videos** to the project
4. **Share Link** with your client
5. **Collect Feedback** via timestamped comments
6. **Approve** when client accepts the final version

### Client Workflow

1. Receive share link from filmmaker
2. Enter password (if protected)
3. Watch videos and leave timestamped feedback
4. Submit approval when satisfied
5. Download approved videos (if enabled)

### Admin Tips

- Use **Custom URLs** for memorable share links
- Enable **Revision Tracking** for complex projects
- Configure **Watermarks** globally or per-project
- Monitor **Analytics** to see client engagement
- Use **Security Logs** to track access attempts

---

## 🔒 Security Features

- **Password-Protected Projects** - Optional client passwords
- **JWT Authentication** - Secure admin sessions
- **Rate Limiting** - Protection against brute force
- **Security Logging** - Track all access attempts
- **Hotlink Protection** - Prevent unauthorized embedding
- **Encrypted Passwords** - AES-256 encryption at rest
- **HTTPS Support** - SSL/TLS for secure connections
- **Session Monitoring** - 15-minute inactivity timeout with warnings

### Security Notice

ViTransfer uses Alpine Linux and FFmpeg which may show CVEs in vulnerability scanners. **These are indirect dependencies with minimal risk**. See [SECURITY.md](SECURITY.md) for detailed CVE analysis and risk assessment. All packages are kept at their latest available versions.

---

## 🛠️ Maintenance

### Backup

Important data to backup:
```bash
# Docker volumes
docker-compose down
tar -czf vitransfer-backup.tar.gz \
  /var/lib/docker/volumes/vitransfer_postgres-data \
  /var/lib/docker/volumes/vitransfer_uploads

# Or use your host paths if using bind mounts
```

### Updates

```bash
# Pull latest images from Docker Hub
docker-compose pull

# Or pull specific version tag
docker pull crypt010/vitransfer:latest

# Restart with new images
docker-compose up -d

# Database migrations run automatically
```

### Logs

```bash
# View application logs
docker-compose logs app

# View worker logs
docker-compose logs worker

# Follow logs in real-time
docker-compose logs -f
```

### Database Management

```bash
# Access PostgreSQL
docker exec -it vitransfer-postgres psql -U vitransfer -d vitransfer

# Backup database
docker exec vitransfer-postgres pg_dump -U vitransfer vitransfer > backup.sql

# Restore database
docker exec -i vitransfer-postgres psql -U vitransfer vitransfer < backup.sql
```

---

## 🐛 Troubleshooting

### Quick checks
- Review logs: `docker-compose logs` (use `-f app` or `-f worker` for specific services)
- Verify `.env` matches your compose file
- Ensure disk space is available: `df -h`
- If uploads fail, confirm proxy/body size limits and retry with a small file

---

## 🤝 Contributing

We welcome contributions! ViTransfer is actively developed and we're looking for help to reach v1.0.

### How to Contribute

1. **Fork the repository** - https://github.com/MansiVisuals/ViTransfer
2. **Create a feature branch** - `git checkout -b feature/amazing-feature`
3. **Make your changes** - Follow the existing code style
4. **Test thoroughly** - Ensure everything works
5. **Submit a pull request** - We'll review it as soon as possible

### Areas We Need Help

- **Bug fixes** - Report or fix issues
- **Documentation** - Improve guides and examples
- **Translations** - Help make ViTransfer multilingual
- **Features** - Propose and implement new features
- **Testing** - Help test on different platforms

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## 📄 License

This project is licensed under the **GNU AFFERO GENERAL PUBLIC LICENSE Version 3 (AGPL-3.0)**.

**This means:**
- You can use ViTransfer for free
- You can modify the source code
- You can distribute your modifications
- Any derivative work must be open-source under AGPL-3.0
- You must include the original license and copyright notice

See the [LICENSE](LICENSE) file for full details.

**Why AGPL-3.0?** We believe in keeping video tools accessible to all creators while preventing commercial exploitation. If you use or modify ViTransfer, your version must remain free and open-source.

---

## 💬 Support

- **Issues:** [GitHub Issues](https://github.com/MansiVisuals/ViTransfer/issues)
- **Documentation:** This README and inline code comments
- **Discussions:** [GitHub Discussions](https://github.com/MansiVisuals/ViTransfer/discussions)
- **Docker Hub:** [crypt010/vitransfer](https://hub.docker.com/r/crypt010/vitransfer)

---

## Acknowledgments

Built with:
- [Next.js](https://nextjs.org/) - React framework
- [Prisma](https://www.prisma.io/) - Database ORM
- [BullMQ](https://docs.bullmq.io/) - Job queue
- [FFmpeg](https://ffmpeg.org/) - Video processing
- [PostgreSQL](https://www.postgresql.org/) - Database
- [Redis](https://redis.io/) - Queue and cache
- [Tailwind CSS](https://tailwindcss.com/) - Styling

---

Made for filmmakers and video professionals
