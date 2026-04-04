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
- **Local storage**: ViTransfer uses TUS resumable uploads — the upload should resume after a network interruption. Check available disk space and directory permissions.
- **S3 storage**: uploads use browser-direct multipart presigned URLs. Check your bucket CORS policy and see the [S3 storage](#s3-storage) section above.

**Upload progress stalls**
- Check network connectivity between client and server.
- Resumable uploads will continue from where they stopped — refresh and retry.

## S3 storage

**Uploads fail with "Part returned no ETag"**
- Your bucket CORS policy must expose the `ETag` header. Add `"ExposeHeaders": ["ETag"]` to the CORS configuration. See [Configuration — CORS](Configuration#cors-configuration).

**Uploads fail with CORS errors**
- The bucket must allow `PUT` requests from your app origin. Check your CORS `AllowedOrigins` matches the URL you use to access ViTransfer (including protocol and port).

**Presigned upload URLs expire before upload completes**
- Presigned part URLs are valid for 1 hour. Very large files on slow connections may hit this limit. Consider increasing your upload speed or breaking the file into smaller parts (handled automatically by the client).

**Downloads return 404 in S3 mode**
- Verify the file exists in the bucket at the expected path (e.g. `projects/<id>/videos/...`).
- Check that the S3 credentials have `GetObject` permission on the bucket.

**Worker fails to process videos**
- Ensure the S3 credentials have both `GetObject` and `PutObject` permissions.
- Check worker logs for SDK errors: `docker compose logs worker`.
- Verify `S3_ENDPOINT`, `S3_BUCKET`, and `S3_REGION` are correct.

**ZIP downloads are slow in S3 mode**
- ZIP downloads (Download All, single-video-with-assets) stream through the server since the archive must be assembled. Download speed depends on the connection between your server and the S3 store. Co-locating the server and bucket in the same region helps.

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

## Photos

**Photo upload fails**
- Ensure the file is a supported format: JPEG, PNG, WebP, TIFF, AVIF, HEIF/HEIC, BMP, GIF, or RAW (CR2, CR3, NEF, ARW, RAF, ORF, RW2, DNG, PEF, SRW, ERF, MOS, IIQ, 3FR, FFF, GPR).
- Check that the file is not corrupted and is within the max upload size limit.
- For S3 storage, the same CORS and permission requirements apply as for video uploads.

**Pin comments not appearing on photo**
- Pin comments require a photoId. If the comment was created without a photo context, it will not display a pin.
- Ensure the photo has not been deleted since the comment was posted.

**"Download All Photos" returns an empty ZIP**
- Only approved photos are included in the bulk download. Ensure at least one photo has been approved.
- Check that the photo files exist in storage (local or S3).

**Photo gallery shows no photos**
- Verify the project type is PHOTO. Video projects do not show the photo gallery.
- Check that photos have been uploaded to the project.

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
