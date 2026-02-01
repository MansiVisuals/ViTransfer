# Platform Guides

## Unraid (tested on 7.1.4)

1. Install Docker Compose Manager plugin (Apps → search "Compose Manager").
2. Download config files:
```bash
curl -O https://raw.githubusercontent.com/MansiVisuals/ViTransfer/main/docker-compose.unraid.yml
curl -O https://raw.githubusercontent.com/MansiVisuals/ViTransfer/main/.env.example
```
3. Generate secrets (see Installation).
4. Configure `.env` and update volume paths in `docker-compose.unraid.yml`.
5. Create a new stack in Compose Manager and deploy.
6. Access: `http://UNRAID-IP:4321`.

## TrueNAS Scale (tested on 25.10)

**Quick install:** Use the TrueNAS Apps catalog (Apps → Discover Apps → ViTransfer).

**Manual install:**
1. Create datasets: `postgres`, `redis`, `uploads`.
2. Download config:
```bash
curl -O https://raw.githubusercontent.com/MansiVisuals/ViTransfer/main/docker-compose.truenas.yml
```
3. Generate secrets (see Installation).
4. Edit `docker-compose.truenas.yml` with secrets and dataset paths.
5. Deploy via TrueNAS UI (Apps → Discover → Custom App → Install via YAML).
6. Access: `http://TRUENAS-IP:4321`.

Note: Set **App Domain** in Admin Settings after login (required for email links and passkeys).

## Other platforms
- Rootless Podman quadlets are available in `quadlet/`.
- Community guides welcome.

---
Navigation: [Home](Home) | [Features](Features) | [Installation](Installation) | [Platform Guides](Platform-Guides) | [Configuration](Configuration) | [Admin Settings](Admin-Settings) | [Usage Guide](Usage-Guide) | [Security](Security) | [Maintenance](Maintenance) | [Troubleshooting](Troubleshooting) | [Screenshots](Screenshots) | [Contributing](Contributing) | [License](License)
