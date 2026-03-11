# Troubleshooting

## Logs

Always start by checking logs:
```bash
docker compose logs app        # Application logs
docker compose logs worker     # Video processing and notification logs
docker compose logs -f         # Follow all logs in real-time
```

## Installation and startup

**Container fails to start**
- Verify `.env` file exists and matches your compose file.
- Ensure all required environment variables are set (see [Configuration](Configuration)).
- Check that ports are not already in use: `lsof -i :4321`.

**Database connection errors**
- Ensure the PostgreSQL container is running: `docker compose ps`.
- Verify `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` match between app and database.
- Check that passwords use hex characters only (generated with `openssl rand -hex 32`).

**Redis connection errors**
- Ensure the Redis container is running.
- Verify `REDIS_PASSWORD` matches between app/worker and Redis.

**Migrations fail on startup**
- Migrations run automatically. If they fail, check the app logs for the specific error.
- Ensure the database is accessible and the user has sufficient permissions.

## Video processing

**Videos stuck in "Processing" state**
- Check worker logs: `docker compose logs worker`.
- Ensure the worker container is running: `docker compose ps`.
- Verify the worker can access the uploads volume (same mount path as the app).
- Check available disk space: `df -h`.

**FFmpeg errors**
- Check worker logs for the specific FFmpeg error message.
- Ensure the input file is a valid video format.
- For large files, ensure sufficient memory is available (4GB minimum recommended).
- Try reprocessing the video from project settings.

**Slow transcoding**
- Check CPU usage: `docker stats`.
- The `CPU_THREADS` environment variable can be set to control FFmpeg thread count.
- 720p transcoding is faster than 1080p — consider using 720p for preview resolution.

## Uploads

**Upload fails or times out**
- Check your reverse proxy body size limit (nginx: `client_max_body_size`, Traefik: `maxRequestBodyBytes`).
- ViTransfer uses TUS resumable uploads — the upload should resume after a network interruption.
- Check available disk space on the uploads volume.
- Verify the uploads directory has correct permissions (writable by the container user).

**Upload progress stalls**
- Check network connectivity between client and server.
- Resumable uploads will continue from where they stopped — refresh and retry.

## Email and notifications

**Emails not sending**
- Verify SMTP settings in admin Settings (host, port, username, password, from address).
- Check that the SMTP security mode matches your provider (STARTTLS, TLS, or NONE).
- Test with the "Send Test Email" button in Settings.
- Check worker logs for SMTP errors: `docker compose logs worker`.

**OTP codes not arriving**
- Verify SMTP is configured correctly (same as above).
- Check spam/junk folders.
- Ensure the recipient email address is correct.

**Push notifications not working**
- For browser push: ensure the browser granted notification permission.
- For external providers (Gotify, ntfy, etc.): check provider credentials in Settings.
- Check worker logs: `docker compose logs worker | grep NOTIFICATION`.

**Due date reminders not sending**
- Ensure the project has a due date and reminder set (Day Before or Week Before).
- Reminders are processed daily by the worker using the `TZ` timezone.
- Check worker logs for reminder processing.

## Share links

**"Project not found" on share link**
- Verify the project is not archived.
- Check that the share URL slug matches the project's custom URL (if set).
- Ensure the project exists and has not been deleted.

**Password not accepted**
- Passwords are case-sensitive.
- If the password was changed, the client needs the new one.
- Check if the account is locked out due to too many failed attempts (configurable in security settings).

## Passkeys

**Passkey registration fails**
- Ensure `APP_DOMAIN` is set correctly in admin Settings (must match the URL origin).
- Passkeys require HTTPS in production (localhost is exempt).
- Try a different browser — not all browsers support WebAuthn equally.

**Passkey login fails**
- Ensure you are using the same device/browser where the passkey was registered.
- Hardware keys (YubiKey, etc.) must be plugged in during authentication.

## Calendar and iCal

**Events not appearing in calendar app**
- Calendar apps refresh subscriptions on their own schedule (15 min to 24 hours).
- Remove and re-add the subscription to force a refresh.
- Open the feed URL directly in a browser to verify it returns events.

**Feed URL stopped working**
- Someone may have regenerated the calendar token. Get the new URL from the Calendar page.

## Performance

**Slow page loads**
- Check server resources: `docker stats`.
- Ensure PostgreSQL and Redis containers have sufficient memory.
- Large numbers of projects/videos may benefit from more RAM.

**High memory usage**
- Video processing is memory-intensive. Ensure at least 4GB RAM is available.
- Processing multiple videos simultaneously increases memory usage.

## Reverse proxy

**502 Bad Gateway**
- Ensure the ViTransfer container is running and healthy.
- Verify the proxy is pointing to the correct port (default: 4321).

**WebSocket errors**
- Ensure your reverse proxy passes WebSocket upgrade headers.
- nginx: add `proxy_set_header Upgrade $http_upgrade` and `proxy_set_header Connection "upgrade"`.

**Upload size limited by proxy**
- nginx: set `client_max_body_size 0` (unlimited) or a high value.
- Traefik: configure `maxRequestBodyBytes` in middleware.
- Caddy: no default body size limit.

---
Navigation: [Home](Home) | [Features](Features) | [Installation](Installation) | [Platform Guides](Platform-Guides) | [Configuration](Configuration) | [Admin Settings](Admin-Settings) | [Usage Guide](Usage-Guide) | [Client Guide](Client-Guide) | [Security](Security) | [Maintenance](Maintenance) | [Troubleshooting](Troubleshooting) | [Screenshots](Screenshots) | [Contributing](Contributing) | [License](License)
