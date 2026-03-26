# Installation

## Requirements

### System

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | Depends on video library size |
| Storage type | HDD | SSD strongly recommended |
| Architecture | x86_64 (amd64) or ARM64 | — |
| OS | Any Linux with Docker, macOS, or Windows (WSL2) | Linux |

**Why SSD?** ViTransfer is I/O intensive across the stack. PostgreSQL and Redis perform frequent small reads/writes for sessions, job queues, and metadata. FFmpeg reads large source files and writes transcoded output simultaneously. During upload, TUS writes chunks to disk in real-time. On a spinning disk these operations compete for the same read/write head, creating bottlenecks that slow down transcoding, increase upload latency, and can cause BullMQ job timeouts. An SSD eliminates this bottleneck with parallel random I/O.

### Software

| Dependency | Version | Notes |
|------------|---------|-------|
| Docker | 20.10+ | Required |
| Docker Compose | v2+ | Included with Docker Desktop |

No other software is needed. The Docker image bundles everything internally: Node.js, FFmpeg, PostgreSQL client, Redis client, and all application dependencies.

### Network

- **Port 4321** (default, configurable via `APP_PORT`) must be available on the host.
- All internal services (PostgreSQL, Redis) communicate over an isolated Docker network and are not exposed to the host.
- For production use behind a reverse proxy, see the [Security](Security) page for HTTPS and header configuration.

## Method 1: Docker Hub (recommended)

1. Download configuration files:
```bash
mkdir vitransfer && cd vitransfer
curl -O https://raw.githubusercontent.com/MansiVisuals/ViTransfer/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/MansiVisuals/ViTransfer/main/.env.example
```

2. Create and edit `.env`:
```bash
cp .env.example .env
nano .env
```

3. Generate secrets:
```bash
openssl rand -hex 32      # POSTGRES_PASSWORD (hex/URL-safe)
openssl rand -hex 32      # REDIS_PASSWORD (hex/URL-safe)
openssl rand -base64 32   # ENCRYPTION_KEY
openssl rand -base64 64   # JWT_SECRET
openssl rand -base64 64   # JWT_REFRESH_SECRET
openssl rand -base64 64   # SHARE_TOKEN_SECRET
```

4. Start:
```bash
docker-compose up -d
```

5. Access: `http://localhost:4321` and login with your admin credentials.

## Method 2: Build from source

1. Clone the repo:
```bash
git clone https://github.com/MansiVisuals/ViTransfer.git
cd ViTransfer
```

2. Configure `.env` as above.

3. Build and start:
```bash
docker-compose up -d --build
```

4. Access: `http://localhost:4321`.

## Authentication model (>=0.6.0)
- Admin and client share flows use bearer tokens in the `Authorization` header only.
- Admin login/refresh returns `{ tokens: { accessToken, refreshToken } }`.
- Share links issue short-lived share tokens after password/OTP/guest entry.
- Legacy sessions are invalidated on upgrade; users must re-login.

---
Navigation: [Home](Home) | [Features](Features) | [Installation](Installation) | [Platform Guides](Platform-Guides) | [Configuration](Configuration) | [Admin Settings](Admin-Settings) | [Usage Guide](Usage-Guide) | [Client Guide](Client-Guide) | [Security](Security) | [Maintenance](Maintenance) | [Troubleshooting](Troubleshooting) | [Screenshots](Screenshots) | [Contributing](Contributing) | [License](License)
