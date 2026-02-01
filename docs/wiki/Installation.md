# Installation

## Prerequisites
- Docker and Docker Compose
- At least 4GB RAM
- 20GB+ free disk space (more for video storage)

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
