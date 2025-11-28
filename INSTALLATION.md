# ViTransfer Installation Guide

Step-by-step instructions for installing ViTransfer on various platforms.

## Quick Install (5 Minutes)

```bash
# 1. Download
git clone https://github.com/yourusername/vitransfer.git && cd vitransfer

# 2. Configure
cp .env.example .env
nano .env  # Set ADMIN_EMAIL, ADMIN_PASSWORD, and generate secrets

# 3. Generate secrets
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env
echo "JWT_SECRET=$(openssl rand -base64 64)" >> .env
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 64)" >> .env
echo "SHARE_TOKEN_SECRET=$(openssl rand -base64 64)" >> .env
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)" >> .env
echo "REDIS_PASSWORD=$(openssl rand -base64 32)" >> .env

# 4. Start
docker-compose up -d

# 5. Access
# Open http://localhost:4321
```

## Detailed Installation

### Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- 4GB+ RAM
- 20GB+ disk space
- Linux, Windows (WSL2), or macOS

### Step 1: Get ViTransfer

**Option A: Git Clone**
```bash
git clone https://github.com/yourusername/vitransfer.git
cd vitransfer
```

**Option B: Download ZIP**
1. Download from GitHub releases
2. Extract to your preferred location
3. Navigate to the folder

### Step 2: Configure Environment

Create `.env` from template:
```bash
cp .env.example .env
```

Edit `.env` and set these required values:

```env
# Change these!
ADMIN_EMAIL=your-email@example.com
ADMIN_PASSWORD=YourSecurePassword123!

# Generate these (see next step)
POSTGRES_PASSWORD=
REDIS_PASSWORD=
ENCRYPTION_KEY=
JWT_SECRET=
JWT_REFRESH_SECRET=
SHARE_TOKEN_SECRET=
```

### Step 3: Generate Secrets

**Linux/Mac:**
```bash
# All in one command
cat >> .env << 'EOF'
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)
JWT_REFRESH_SECRET=$(openssl rand -base64 64)
SHARE_TOKEN_SECRET=$(openssl rand -base64 64)
EOF
```

**Windows (PowerShell):**
```powershell
# Generate each value
$bytes = New-Object byte[] 32
[Security.Cryptography.RNGCryptoServiceProvider]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)

# Copy output and paste into .env file
```

**Online Tool (if OpenSSL not available):**
- Use: https://generate-secret.vercel.app/32 (for 32-byte keys)
- Use: https://generate-secret.vercel.app/64 (for 64-byte secrets)

### Step 4: Start Services

```bash
docker-compose up -d
```

First startup takes 2-5 minutes:
- Downloads images (~500MB)
- Initializes database
- Runs migrations
- Starts worker

### Step 5: Verify Installation

Check services are running:
```bash
docker-compose ps
```

You should see all services "Up":
```
NAME                   STATUS
vitransfer-app        Up (healthy)
vitransfer-worker     Up (healthy)
vitransfer-postgres   Up (healthy)
vitransfer-redis      Up (healthy)
```

View logs if needed:
```bash
docker-compose logs -f app
```

### Step 6: Access ViTransfer

1. Open browser to `http://localhost:4321`
2. Login with your `ADMIN_EMAIL` and `ADMIN_PASSWORD`
3. Complete initial setup:
   - Settings > Domain Configuration
   - Settings > Email Configuration (optional)
   - Create your first project!

## Platform-Specific Installation

### Unraid

See `README.md` section "Unraid Installation" or use the provided template.

### TrueNAS SCALE

See `README.md` section "TrueNAS SCALE Installation" or use `truenas-app.yaml`.

### Synology/QNAP

See `README.md` for NAS-specific instructions.

## Post-Installation

### Configure Reverse Proxy (Recommended)

For production use with a custom domain, set up a reverse proxy with HTTPS.

See `README.md` section "Reverse Proxy Setup" for Nginx/Traefik/Caddy examples.

### Configure Email (Optional)

1. Go to Settings > Email Configuration
2. Add your SMTP server details
3. Test the connection
4. Save settings

### Create Projects

1. Projects > New Project
2. Add client information
3. Upload videos
4. Share link with client

## Troubleshooting

### "Service not healthy"
```bash
# Check specific service logs
docker-compose logs postgres
docker-compose logs redis

# Restart services
docker-compose restart
```

### "Can't connect to database"
```bash
# Verify DATABASE_URL in .env is correct
# Should be: postgresql://vitransfer:PASSWORD@postgres:5432/vitransfer?schema=public

# Check PostgreSQL is running
docker-compose ps postgres

# Reset if needed
docker-compose down -v  # WARNING: Deletes all data!
docker-compose up -d
```

### "Uploads fail"
```bash
# Check disk space
df -h

# Check permissions
ls -la ./  # Should show volumes directory

# Check logs
docker-compose logs app | grep upload
```

### "Can't login"
- Verify ADMIN_EMAIL and ADMIN_PASSWORD in `.env`
- Check there are no extra spaces
- Try resetting: edit `.env`, run `docker-compose restart app`

## Updating

```bash
# Backup first!
docker-compose down
cp -r volumes volumes-backup

# Update
docker-compose pull
docker-compose up -d

# Verify
docker-compose logs -f app
```

## Uninstalling

```bash
# Stop and remove containers
docker-compose down

# Remove volumes (WARNING: Deletes all data!)
docker-compose down -v

# Remove images
docker rmi vitransfer/vitransfer:latest postgres:16-alpine redis:7-alpine
```

## Getting Help

- Check logs: `docker-compose logs`
- GitHub Issues: Report bugs and request features
- README.md: Full documentation

---

**Installation complete!** 🎉

Next steps:
1. Create your first project
2. Upload a video
3. Share with a client
4. Collect feedback
