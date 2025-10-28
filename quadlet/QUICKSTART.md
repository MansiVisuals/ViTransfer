# ViTransfer Quadlet - Quick Start (hsadmin Setup)

## Overview

This setup deploys ViTransfer using:
- **User:** hsadmin (UID 1000, GID 1000)
- **Data directory:** `/podman/vitransfer`
- **Container configs:** `/home/hsadmin/.config/containers/systemd`
- **Rootless Podman** with systemd user services

## Directory Structure

```
/podman/vitransfer/
├── postgres-data/       # PostgreSQL database
├── redis-data/          # Redis cache
└── uploads/             # Video uploads and processed files

/home/hsadmin/.config/containers/systemd/
├── vitransfer-postgres.container
├── vitransfer-redis.container
├── vitransfer-app.container
├── vitransfer-worker.container
└── vitransfer-network.network
```

## Automated Installation (Recommended)

```bash
# 1. Copy quadlet directory to server (as hsadmin user)
scp -r quadlet/ hsadmin@server:/tmp/

# 2. SSH as hsadmin
ssh hsadmin@server

# 3. Move to permanent location
cd /tmp/quadlet

# 4. Run setup scripts
./setup-directories.sh     # Creates /podman/vitransfer structure
./configure.sh            # Generate secrets & configure
./install.sh              # Install to systemd

# 5. Enable lingering (allows services to start on boot without login)
sudo loginctl enable-linger hsadmin

# 6. Start services
systemctl --user start vitransfer-postgres.service
systemctl --user start vitransfer-redis.service
systemctl --user start vitransfer-app.service
systemctl --user start vitransfer-worker.service

# 7. Enable auto-start
systemctl --user enable vitransfer-postgres.service
systemctl --user enable vitransfer-redis.service
systemctl --user enable vitransfer-app.service
systemctl --user enable vitransfer-worker.service
```

## Manual Installation

```bash
# 1. Create directory structure
sudo mkdir -p /podman/vitransfer/{postgres-data,redis-data,uploads}
sudo chown -R 1000:1000 /podman/vitransfer
sudo chmod 700 /podman/vitransfer/postgres-data

# 2. Generate secrets
export POSTGRES_PASSWORD=$(openssl rand -base64 32)
export REDIS_PASSWORD=$(openssl rand -base64 32)
export ENCRYPTION_KEY=$(openssl rand -hex 32)
export JWT_SECRET=$(openssl rand -hex 32)
export JWT_REFRESH_SECRET=$(openssl rand -hex 32)

# Save these somewhere safe!
echo "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}" > ~/.vitransfer-secrets
echo "REDIS_PASSWORD=${REDIS_PASSWORD}" >> ~/.vitransfer-secrets
echo "ENCRYPTION_KEY=${ENCRYPTION_KEY}" >> ~/.vitransfer-secrets
echo "JWT_SECRET=${JWT_SECRET}" >> ~/.vitransfer-secrets
echo "JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}" >> ~/.vitransfer-secrets
chmod 600 ~/.vitransfer-secrets

# 3. Edit *.container files - replace all CHANGE_* placeholders

# 4. Install to systemd
mkdir -p ~/.config/containers/systemd
cp *.container *.network ~/.config/containers/systemd/
chmod 600 ~/.config/containers/systemd/*.container

# 5. Reload systemd
systemctl --user daemon-reload

# 6. Pull image
podman pull docker.io/crypt010/vitransfer:latest

# 7. Enable lingering
sudo loginctl enable-linger hsadmin

# 8. Start services (see above)
```

## Verify Installation

```bash
# Check service status
systemctl --user status vitransfer-*.service

# View logs
journalctl --user -u vitransfer-app.service -f

# Check containers
podman ps

# Test application
curl http://localhost:4321/api/settings/public

# Check data directories
ls -la /podman/vitransfer/
```

## Common Commands

### Service Management

```bash
# Start all services
systemctl --user start vitransfer-{postgres,redis,app,worker}.service

# Stop all services
systemctl --user stop vitransfer-*.service

# Restart app only
systemctl --user restart vitransfer-app.service

# Check status
systemctl --user status vitransfer-*.service
```

### Logs

```bash
# Follow app logs
journalctl --user -u vitransfer-app.service -f

# Follow worker logs
journalctl --user -u vitransfer-worker.service -f

# Show last 100 lines
journalctl --user -u vitransfer-app.service -n 100

# Show all service logs
journalctl --user -u vitransfer-*.service -f
```

### Container Management

```bash
# List containers
podman ps

# Exec into container
podman exec -it vitransfer-app /bin/sh

# View container logs directly
podman logs vitransfer-app
```

## Backup

```bash
# Backup database
podman exec vitransfer-postgres pg_dump -U vitransfer vitransfer > ~/backup-$(date +%Y%m%d).sql

# Backup uploads
tar czf ~/uploads-backup-$(date +%Y%m%d).tar.gz -C /podman/vitransfer/uploads .

# Backup all data
sudo tar czf ~/vitransfer-full-backup-$(date +%Y%m%d).tar.gz -C /podman vitransfer/
```

## Restore

```bash
# Restore database
cat ~/backup-20250127.sql | podman exec -i vitransfer-postgres psql -U vitransfer vitransfer

# Restore uploads
tar xzf ~/uploads-backup-20250127.tar.gz -C /podman/vitransfer/uploads/
```

## Update Application

```bash
# Pull latest image
podman pull docker.io/crypt010/vitransfer:latest

# Restart services
systemctl --user restart vitransfer-app.service
systemctl --user restart vitransfer-worker.service

# Check logs
journalctl --user -u vitransfer-app.service -f
```

## Troubleshooting

### Services Won't Start

```bash
# Check systemd status
systemctl --user status vitransfer-app.service

# Check detailed logs
journalctl --user -u vitransfer-app.service -n 200

# Check if directories exist
ls -la /podman/vitransfer/

# Check permissions
stat /podman/vitransfer/postgres-data
# Should be owned by 1000:1000, mode 700
```

### Permission Denied Errors

```bash
# Fix ownership
sudo chown -R 1000:1000 /podman/vitransfer

# Fix postgres permissions
sudo chmod 700 /podman/vitransfer/postgres-data

# Verify
ls -la /podman/vitransfer/
```

### Port Already in Use

```bash
# Check what's using the port
ss -tlnp | grep 4321

# Edit vitransfer-app.container:
# PublishPort=5000:4321
```

### Database Connection Issues

```bash
# Check postgres service
systemctl --user status vitransfer-postgres.service

# Check postgres logs
journalctl --user -u vitransfer-postgres.service -n 50

# Check network
podman network inspect vitransfer-internal
```

### Lingering Not Enabled

If services don't start on boot:

```bash
# Enable lingering
sudo loginctl enable-linger hsadmin

# Verify
loginctl show-user hsadmin | grep Linger
# Should show: Linger=yes
```

### Reset Everything (WARNING: Destroys Data!)

```bash
# Stop services
systemctl --user stop vitransfer-*.service

# Remove containers
podman rm -f vitransfer-postgres vitransfer-redis vitransfer-app vitransfer-worker

# Backup data first!
sudo mv /podman/vitransfer /podman/vitransfer.old

# Remove data (CAREFUL!)
sudo rm -rf /podman/vitransfer

# Recreate structure
./setup-directories.sh

# Reinstall
./install.sh

# Start services
systemctl --user start vitransfer-*.service
```

## Key Differences from Docker Compose

| Feature | Docker Compose | Quadlet |
|---------|---------------|---------|
| Management | `docker compose up` | `systemctl --user start` |
| Logs | `docker logs` | `journalctl --user` |
| Auto-start | `restart: always` | `systemctl enable` + lingering |
| Updates | Manual pull | `podman auto-update` |
| Root required | Optional | No (rootless) |

## Important Notes

1. **Lingering must be enabled** for services to auto-start on boot:
   ```bash
   sudo loginctl enable-linger hsadmin
   ```

2. **All data is in `/podman/vitransfer`** - backup this directory!

3. **Secrets are in `.container` files** - protect them:
   ```bash
   chmod 600 ~/.config/containers/systemd/*.container
   ```

4. **Container configs are user-specific** - installed in `~/.config/`

5. **Services run as hsadmin (1000:1000)** - no root needed

## Resources

- Full documentation: `README.md`
- Container definitions: `~/.config/containers/systemd/*.container`
- Data directories: `/podman/vitransfer/*`
- Secrets file: `.secrets` (created by configure.sh)

## Support

For issues:
- Check logs: `journalctl --user -u vitransfer-app.service -f`
- Verify permissions: `ls -la /podman/vitransfer/`
- Check lingering: `loginctl show-user hsadmin | grep Linger`
- Ensure directories exist: `ls -la /podman/vitransfer/`
