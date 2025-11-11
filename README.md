# ViTransfer

**Professional Video Review & Approval Platform for Filmmakers**

ViTransfer is a self-hosted web application designed for video professionals to share work with clients, collect feedback, and manage approval workflows. Built with modern technologies and designed for easy self-hosting.

*NOTE: Coded with Claude AI, built to achieve security and best practices.*

[![Docker Pulls](https://img.shields.io/docker/pulls/crypt010/vitransfer)](https://hub.docker.com/r/crypt010/vitransfer)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![GitHub](https://img.shields.io/badge/github-MansiVisuals%2FViTransfer-blue)](https://github.com/MansiVisuals/ViTransfer)
[![Ko-fi](https://img.shields.io/badge/Support%20on-Ko--fi-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/E1E215DBM4)

> **⚠️ ACTIVE DEVELOPMENT:** ViTransfer is under active development with frequent updates and changes. While fully functional and used in production, features may be replaced, modified, or removed as we work towards v1.0. We strive to avoid breaking changes, but **always maintain backups following the 3-2-1 principle** (3 copies, 2 different media, 1 offsite) and check release notes before updating. Contributions and feedback are welcome!
>
> **💖 Support Development:** If you find ViTransfer useful, consider [supporting on Ko-fi](https://ko-fi.com/E1E215DBM4) to help fund continued development!

## ✨ Features

### Core Functionality
- 📹 **Video Upload & Processing** - Automatic transcoding to multiple resolutions (720p/1080p)
- 💧 **Watermarking** - Customizable watermarks for preview videos
- 💬 **Timestamped Comments** - Collect feedback with precise video timestamps
- ✅ **Approval Workflow** - Client approval system with revision tracking
- 🔒 **Password Protection** - Secure projects with client passwords
- 📧 **Email Notifications** - Automated notifications for new videos and replies
- 🎨 **Dark Mode** - Beautiful dark/light theme support
- 📱 **Fully Responsive** - Works perfectly on all devices

### Admin Features
- 👥 **Multi-User Support** - Create multiple admin accounts
- 📊 **Analytics Dashboard** - Track page visits, downloads, and engagement
- 🔐 **Security Logging** - Monitor access attempts and suspicious activity
- 🎯 **Version Management** - Hide/show specific video versions
- 🔄 **Revision Tracking** - Limit and track project revisions
- ⚙️ **Flexible Settings** - Per-project and global configuration options

### Technical Features
- 🐳 **Docker-First** - Easy deployment with Docker Compose
- 🚀 **High Performance** - Built with Next.js 16 and React 19
- 📦 **Redis Queue** - Background video processing with BullMQ
- 🎬 **FFmpeg Processing** - Industry-standard video transcoding
- 🗄️ **PostgreSQL Database** - Reliable data storage with Prisma 6
- 🔐 **JWT Authentication** - Secure session management
- 🌐 **TUS Protocol** - Resumable uploads for large files

---

## 📸 Screenshots

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

Generate **5 unique** secure values:
```bash
# Generate these 5 values (each must be different):
openssl rand -hex 32      # 1. For POSTGRES_PASSWORD
openssl rand -hex 32      # 2. For REDIS_PASSWORD
openssl rand -base64 32   # 3. For ENCRYPTION_KEY
openssl rand -base64 64   # 4. For JWT_SECRET
openssl rand -base64 64   # 5. For JWT_REFRESH_SECRET
```

Replace each placeholder in `.env`:
- `POSTGRES_PASSWORD=<<REPLACE_WITH_openssl_rand_hex_32>>`
- `REDIS_PASSWORD=<<REPLACE_WITH_openssl_rand_hex_32>>`
- `ENCRYPTION_KEY=<<REPLACE_WITH_openssl_rand_base64_32>>`
- `JWT_SECRET=<<REPLACE_WITH_openssl_rand_base64_64>>`
- `JWT_REFRESH_SECRET=<<REPLACE_WITH_openssl_rand_base64_64>>`

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

That's it! 🎉

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

## 🌐 Platform Support

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

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `APP_PORT` | No | Port to expose | `4321` |
| `PUID` | No | User ID for file permissions | `1000` |
| `PGID` | No | Group ID for file permissions | `1000` |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password | Generated |
| `REDIS_PASSWORD` | Yes | Redis password | Generated |
| `ENCRYPTION_KEY` | Yes | Data encryption key | Generated |
| `JWT_SECRET` | Yes | JWT signing secret | Generated |
| `JWT_REFRESH_SECRET` | Yes | JWT refresh secret | Generated |
| `ADMIN_EMAIL` | Yes | Initial admin email | `admin@example.com` |
| `ADMIN_PASSWORD` | Yes | Initial admin password | Secure password |
| `NEXT_PUBLIC_APP_URL` | No | Public URL for emails | `https://videos.example.com` |

### SMTP Configuration (Optional)

Configure email notifications in the admin panel:
- Settings > Email Configuration
- Add your SMTP server details
- Test the connection before saving
- Supports Gmail, Outlook, custom SMTP servers

### Reverse Proxy Setup

Tested with Cloudflare Tunnels.

---

## 📖 Usage Guide

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

- 🔐 **Password-Protected Projects** - Optional client passwords
- 🔑 **JWT Authentication** - Secure admin sessions
- 🛡️ **Rate Limiting** - Protection against brute force
- 📝 **Security Logging** - Track all access attempts
- 🚫 **Hotlink Protection** - Prevent unauthorized embedding
- 🔒 **Encrypted Passwords** - AES-256 encryption at rest
- 🌐 **HTTPS Support** - SSL/TLS for secure connections
- ⏱️ **Session Monitoring** - 15-minute inactivity timeout with warnings

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

### Container won't start
```bash
# Check logs
docker-compose logs app

# Verify environment variables
docker-compose config

# Restart all services
docker-compose restart
```

### Videos not processing
```bash
# Check worker logs
docker-compose logs worker

# Verify FFmpeg is installed
docker exec vitransfer-worker ffmpeg -version

# Check disk space
df -h
```

### Can't login
- Verify `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`
- Check database connection: `docker-compose logs postgres`
- Reset password in database if needed

### Upload fails
- Check `client_max_body_size` in reverse proxy
- Verify disk space available
- Check upload permissions on volumes

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

- 🐛 **Bug fixes** - Report or fix issues
- 📖 **Documentation** - Improve guides and examples
- 🌍 **Translations** - Help make ViTransfer multilingual
- ✨ **Features** - Propose and implement new features
- 🧪 **Testing** - Help test on different platforms

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## 📄 License

This project is licensed under the **GNU AFFERO GENERAL PUBLIC LICENSE Version 3 (AGPL-3.0 license)**.

**This means:**
- ✅ You can use ViTransfer for free
- ✅ You can modify the source code
- ✅ You can distribute your modifications
- ⚠️ Any derivative work **must** be open-source under AGPL-3.0 license
- ⚠️ You must include the original license and copyright notice

See the [LICENSE](LICENSE) file for full details.

**Why AGPL-3.0 license?** We believe in keeping video tools accessible to all creators while preventing commercial exploitation. If you use or modify ViTransfer, your version must remain free and open-source.

---

## 💬 Support

- 🐛 **Issues:** [GitHub Issues](https://github.com/MansiVisuals/ViTransfer/issues)
- 📖 **Documentation:** This README and inline code comments
- 💬 **Discussions:** [GitHub Discussions](https://github.com/MansiVisuals/ViTransfer/discussions)
- 🐳 **Docker Hub:** [crypt010/vitransfer](https://hub.docker.com/r/crypt010/vitransfer)

---

## 💖 Support Development

If ViTransfer helps you in your work, consider supporting its development:

<a href='https://ko-fi.com/E1E215DBM4' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi3.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

Your support helps fund:
- 🚀 New features and improvements
- 🐛 Bug fixes and maintenance
- 📖 Better documentation
- 🎯 Faster development towards v1.0

---

## 🙏 Acknowledgments

Built with:
- [Next.js](https://nextjs.org/) - React framework
- [Prisma](https://www.prisma.io/) - Database ORM
- [BullMQ](https://docs.bullmq.io/) - Job queue
- [FFmpeg](https://ffmpeg.org/) - Video processing
- [PostgreSQL](https://www.postgresql.org/) - Database
- [Redis](https://redis.io/) - Queue and cache
- [Tailwind CSS](https://tailwindcss.com/) - Styling

---

**Made with ❤️ for filmmakers and video professionals**
