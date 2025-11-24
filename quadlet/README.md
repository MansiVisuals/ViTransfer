# ViTransfer Quadlet Deployment Guide

This directory contains systemd Quadlet unit files for deploying ViTransfer with Podman on systemd-based Linux systems.

## What is Quadlet?

Quadlet is a systemd generator that allows you to manage Podman containers as native systemd services. This provides:
- Automatic container startup on boot
- Integration with systemd logging (`journalctl`)
- Dependency management between containers
- Automatic container updates
- Better security through systemd features

## Prerequisites

- **Podman 4.4+** (with Quadlet support)
- **systemd** running system
- Root or sudo access (for system-wide deployment)

Check your Podman version:
```bash
podman --version
```

## Quick Start

### 1. Generate Secrets

Generate secure secrets for your deployment:

```bash
# PostgreSQL password
export POSTGRES_PASSWORD=$(openssl rand -base64 32)

# Redis password
export REDIS_PASSWORD=$(openssl rand -base64 32)

# Encryption key (64 characters)
export ENCRYPTION_KEY=$(openssl rand -hex 32)

# JWT secrets
export JWT_SECRET=$(openssl rand -hex 32)
export JWT_REFRESH_SECRET=$(openssl rand -hex 32)
export SHARE_TOKEN_SECRET=$(openssl rand -hex 32)
# Optional: Cloudflare tunnel deployments
# export CLOUDFLARE_TUNNEL=true

# Print them (save these securely!)
echo "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
echo "REDIS_PASSWORD=${REDIS_PASSWORD}"
echo "ENCRYPTION_KEY=${ENCRYPTION_KEY}"
echo "JWT_SECRET=${JWT_SECRET}"
echo "JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}"
echo "SHARE_TOKEN_SECRET=${SHARE_TOKEN_SECRET}"
```

### 2. Configure Container Files

Edit each `.container` file and replace the placeholder values:

**vitransfer-postgres.container:**
- `POSTGRES_PASSWORD=CHANGE_THIS_PASSWORD` → Use your generated password

**vitransfer-redis.container:**
- `REDIS_PASSWORD=CHANGE_THIS_PASSWORD` → Use your generated password (both places)

**vitransfer-app.container:**
- `CHANGE_POSTGRES_PASSWORD` → PostgreSQL password
- `CHANGE_REDIS_PASSWORD` → Redis password
- `CHANGE_THIS_64_CHAR_HEX_KEY_USE_OPENSSL_RAND_HEX_32` → Encryption key
- `CHANGE_THIS_SECRET` → JWT secret
- `CHANGE_THIS_REFRESH_SECRET` → JWT refresh secret
- `CHANGE_THIS_SHARE_SECRET` → Share token secret
- `NEXT_PUBLIC_APP_URL` → Your domain (e.g., https://vitransfer.yourdomain.com)
- `ADMIN_EMAIL` → Your admin email
- `ADMIN_PASSWORD` → Your admin password

**vitransfer-worker.container:**
- Same secrets as vitransfer-app.container (must match exactly!)

### 3. Install Quadlet Files

#### System-wide Installation (recommended):

```bash
# Copy all files to systemd directory
sudo cp quadlet/*.container /etc/containers/systemd/
sudo cp quadlet/*.volume /etc/containers/systemd/
sudo cp quadlet/*.network /etc/containers/systemd/

# Reload systemd to discover new units
sudo systemctl daemon-reload
```

#### User Installation (rootless):

```bash
# Create directory if it doesn't exist
mkdir -p ~/.config/containers/systemd

# Copy files
cp quadlet/*.container ~/.config/containers/systemd/
cp quadlet/*.volume ~/.config/containers/systemd/
cp quadlet/*.network ~/.config/containers/systemd/

# Reload systemd
systemctl --user daemon-reload
```

### 4. Pull the Docker Image

```bash
# Login to Docker Hub (if using private repository)
podman login docker.io
# Username: crypt010
# Password: [your Docker Hub password]

# Pull the image
podman pull docker.io/crypt010/vitransfer:latest
```

### 5. Start Services

#### System-wide:

```bash
# Start all services
sudo systemctl start vitransfer-postgres.service
sudo systemctl start vitransfer-redis.service
sudo systemctl start vitransfer-app.service
sudo systemctl start vitransfer-worker.service

# Enable auto-start on boot
sudo systemctl enable vitransfer-postgres.service
sudo systemctl enable vitransfer-redis.service
sudo systemctl enable vitransfer-app.service
sudo systemctl enable vitransfer-worker.service
```

#### User (rootless):

```bash
# Start all services
systemctl --user start vitransfer-postgres.service
systemctl --user start vitransfer-redis.service
systemctl --user start vitransfer-app.service
systemctl --user start vitransfer-worker.service

# Enable auto-start on boot
systemctl --user enable vitransfer-postgres.service
systemctl --user enable vitransfer-redis.service
systemctl --user enable vitransfer-app.service
systemctl --user enable vitransfer-worker.service

# Enable lingering (allows user services to start on boot)
sudo loginctl enable-linger $USER
```

### 6. Verify Deployment

```bash
# Check service status
sudo systemctl status vitransfer-*.service

# Check logs
sudo journalctl -u vitransfer-app.service -f

# Check if containers are running
podman ps

# Access application
curl http://localhost:4321/api/health
```

## Managing Services

### View Status

```bash
# All ViTransfer services
sudo systemctl status vitransfer-*.service

# Specific service
sudo systemctl status vitransfer-app.service
```

### View Logs

```bash
# Follow logs for app
sudo journalctl -u vitransfer-app.service -f

# Follow logs for worker
sudo journalctl -u vitransfer-worker.service -f

# Show last 100 lines
sudo journalctl -u vitransfer-app.service -n 100

# Show logs since boot
sudo journalctl -u vitransfer-app.service -b
```

### Restart Services

```bash
# Restart app
sudo systemctl restart vitransfer-app.service

# Restart all
sudo systemctl restart vitransfer-*.service
```

### Stop Services

```bash
# Stop all
sudo systemctl stop vitransfer-*.service

# Stop specific service
sudo systemctl stop vitransfer-app.service
```

## Updating the Application

### Automatic Updates (Quadlet Feature)

Quadlet supports automatic image updates:

```bash
# Enable auto-update timer (checks daily)
sudo systemctl enable --now podman-auto-update.timer

# Check status
sudo systemctl status podman-auto-update.timer

# Manually trigger update check
sudo podman auto-update
```

### Manual Update

```bash
# Pull latest image
podman pull docker.io/crypt010/vitransfer:latest

# Restart services
sudo systemctl restart vitransfer-app.service
sudo systemctl restart vitransfer-worker.service
```

## Backup and Restore

### Backup

```bash
# Backup database
podman exec vitransfer-postgres pg_dump -U vitransfer vitransfer > vitransfer-backup-$(date +%Y%m%d).sql

# Backup uploads volume
sudo tar czf vitransfer-uploads-$(date +%Y%m%d).tar.gz -C /var/lib/containers/storage/volumes/vitransfer-uploads/_data .
```

### Restore

```bash
# Restore database
cat vitransfer-backup-20250127.sql | podman exec -i vitransfer-postgres psql -U vitransfer vitransfer

# Restore uploads
sudo tar xzf vitransfer-uploads-20250127.tar.gz -C /var/lib/containers/storage/volumes/vitransfer-uploads/_data
```

## Troubleshooting

### Services Won't Start

```bash
# Check systemd status
sudo systemctl status vitransfer-app.service

# Check detailed logs
sudo journalctl -u vitransfer-app.service -n 200

# Check Podman directly
podman ps -a
podman logs vitransfer-app
```

### Regenerate Quadlet Units

If you modify the `.container` files:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Restart services
sudo systemctl restart vitransfer-*.service
```

### Port Already in Use

```bash
# Check what's using port 4321
sudo ss -tlnp | grep 4321

# Change port in vitransfer-app.container:
# PublishPort=5000:4321
# Environment=APP_PORT=4321  (container internal port stays 4321)
```

### Database Connection Issues

```bash
# Check if postgres is running
sudo systemctl status vitransfer-postgres.service

# Check postgres logs
sudo journalctl -u vitransfer-postgres.service -n 50

# Verify network
podman network inspect vitransfer-internal
```

### Reset Everything (WARNING: Destroys Data)

```bash
# Stop all services
sudo systemctl stop vitransfer-*.service

# Remove containers
podman rm -f vitransfer-postgres vitransfer-redis vitransfer-app vitransfer-worker

# Remove volumes (WARNING: deletes all data!)
podman volume rm vitransfer-postgres-data vitransfer-redis-data vitransfer-uploads

# Remove network
podman network rm vitransfer-internal

# Reload systemd
sudo systemctl daemon-reload

# Start fresh
sudo systemctl start vitransfer-*.service
```

## File Structure

```
quadlet/
├── README.md                           # This file
├── vitransfer-network.network          # Network definition
├── vitransfer-postgres-data.volume     # PostgreSQL data volume
├── vitransfer-redis-data.volume        # Redis data volume
├── vitransfer-uploads.volume           # Uploads volume
├── vitransfer-postgres.container       # PostgreSQL container
├── vitransfer-redis.container          # Redis container
├── vitransfer-app.container            # Application container
└── vitransfer-worker.container         # Worker container
```

## Systemd Service Names

After installation, these systemd services are created:

- `vitransfer-postgres.service` - PostgreSQL database
- `vitransfer-redis.service` - Redis cache
- `vitransfer-app.service` - Main application
- `vitransfer-worker.service` - Video processing worker

## Security Considerations

1. **File Permissions**: Quadlet files should only be readable by root/owner
   ```bash
   sudo chmod 600 /etc/containers/systemd/vitransfer-*.container
   ```

2. **Secrets Management**: Consider using systemd credentials or external secret management instead of embedding secrets in files

3. **Firewall**: Only expose necessary ports
   ```bash
   sudo firewall-cmd --permanent --add-port=4321/tcp
   sudo firewall-cmd --reload
   ```

4. **SELinux**: If using SELinux, you may need to adjust policies
   ```bash
   sudo setsebool -P container_manage_cgroup on
   ```

## Resources

- [Podman Quadlet Documentation](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html)
- [systemd Unit Files](https://www.freedesktop.org/software/systemd/man/systemd.unit.html)
- [ViTransfer Docker Hub](https://hub.docker.com/r/crypt010/vitransfer)

## Support

For issues:
- Check logs: `sudo journalctl -u vitransfer-app.service -f`
- Verify configuration in `.container` files
- Ensure all secrets match between app and worker
- Check Podman status: `podman ps -a`
