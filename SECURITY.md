# Security Policy

## Supported Versions

Currently supported versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.5.x   | :white_check_mark: |
| < 0.5.0 | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in ViTransfer, please report it by creating a private security advisory on GitHub or by emailing the maintainers directly.

**Please do not open public issues for security vulnerabilities.**

We will respond to your report within 48 hours and provide a timeline for a fix.

## Security Features

### Authentication & Sessions
- **JWT-based authentication** with secure HttpOnly cookies
- **15-minute inactivity timeout** with automatic logout
- **Session monitoring** with warning notifications before logout
- **Token rotation** on each refresh to prevent replay attacks
- **Token revocation** support for forced logouts
- **CSRF protection** on all state-changing endpoints (POST/PATCH/DELETE)
- **CSRF token refresh** synchronized with session refresh

### Password Protection
- **AES-256-GCM encryption** for share passwords
- **Bcrypt hashing** for admin passwords
- **Rate limiting** on password attempts (5 attempts per 15 minutes)
- **Automatic lockout** after failed password attempts
- **Real-time password validation** with inline feedback

### Video Access Control
- **Token-based video streaming** with session validation
- **Hotlink protection** to prevent unauthorized embedding
- **Watermarking** on preview videos
- **Time-limited access tokens** (15 minutes)
- **Session binding** for video access tokens

### Data Protection
- **Encrypted passwords** stored in database
- **Secure cookie flags** (HttpOnly, Secure, SameSite)
- **Database context isolation** for multi-tenancy
- **Input validation** using Zod schemas
- **Comment sanitization** to prevent XSS attacks
- **Content Security Policy** headers

### Rate Limiting
- **API endpoint rate limiting** (60 requests/minute for most endpoints)
- **Auth refresh rate limiting** (8 requests/minute per token)
- **Asset download rate limiting** (30 requests/minute)
- **Video deletion rate limiting** (30 requests/minute)
- **Redis-backed rate limiting** with IP + User-Agent hashing

### Security Logging
- **Failed login attempts** tracking
- **Suspicious activity** monitoring
- **Rate limit violations** logging
- **Video access** audit trail
- **Security events dashboard** for admins

## Known CVEs and Risk Assessment

The following CVEs are present in Alpine Linux packages and dependencies (latest available versions). These are **transitive dependencies** from FFmpeg, Node.js, and Alpine system packages, and are **NOT directly exploitable** in ViTransfer's use case.

### CVE Summary (As of 2025-11-21)

| CVE ID | Severity | Package | Status | Real Risk |
|--------|----------|---------|--------|-----------|
| CVE-2025-64756 | 7.5 H | npm/glob | ✅ Fixed in 0.5.3 | N/A |
| CVE-2025-52194 | 7.5 H | alpine/libsndfile | ⏳ Awaiting Fix | Low |
| CVE-2023-49502 | 7.5 H | alpine/ffmpeg | ⏳ Awaiting Fix | Low |
| CVE-2025-59734 | 7.5 H | alpine/ffmpeg | ⏳ Awaiting Fix | Low |
| CVE-2023-50009 | 7.5 H | alpine/ffmpeg | ⏳ Awaiting Fix | Low |
| CVE-2024-31582 | 7.5 H | alpine/ffmpeg | ⏳ Awaiting Fix | Low |
| CVE-2023-50010 | 7.5 H | alpine/ffmpeg | ⏳ Awaiting Fix | Low |
| CVE-2023-50008 | 7.5 H | alpine/ffmpeg | ⏳ Awaiting Fix | Low |
| CVE-2024-31578 | 7.5 H | alpine/ffmpeg | ⏳ Awaiting Fix | Low |
| CVE-2025-48071 | 7.5 H | alpine/openexr | ⏳ Awaiting Fix | Very Low |
| CVE-2024-11403 | 6.9 M | alpine/libjxl | ⏳ Awaiting Fix | Very Low |
| CVE-2024-11498 | 6.9 M | alpine/libjxl | ⏳ Awaiting Fix | Very Low |
| CVE-2025-48072 | 6.8 M | alpine/openexr | ⏳ Awaiting Fix | Very Low |
| CVE-2024-50613 | 6.5 M | alpine/libsndfile | ⏳ Awaiting Fix | Low |
| CVE-2024-45993 | 6.5 M | alpine/giflib | ⏳ Awaiting Fix | Very Low |
| CVE-2025-4574 | 6.3 M | cargo/crossbeam-channel | ⏳ Awaiting Upstream | Very Low |
| CVE-2025-47436 | 6.0 M | alpine/orc | ⏳ Awaiting Fix | Low |
| CVE-2025-59729 | 5.7 M | alpine/ffmpeg | ⏳ Awaiting Fix | Low |
| CVE-2025-64183 | 5.5 M | alpine/openexr | ⏳ Awaiting Fix | Very Low |
| CVE-2025-64182 | 5.5 M | alpine/openexr | ⏳ Awaiting Fix | Very Low |
| CVE-2025-1594 | 5.3 M | alpine/ffmpeg | ⏳ Awaiting Fix | Low |
| CVE-2024-31585 | 5.3 M | alpine/ffmpeg | ⏳ Awaiting Fix | Low |
| CVE-2025-1373 | 4.8 M | alpine/ffmpeg | ⏳ Awaiting Fix | Low |
| CVE-2025-8114 | 4.7 M | alpine/libssh | ⏳ Awaiting Fix | Low |
| CVE-2025-48074 | 4.6 M | alpine/openexr | ⏳ Awaiting Fix | Very Low |
| CVE-2025-48073 | 4.6 M | alpine/openexr | ⏳ Awaiting Fix | Very Low |
| CVE-2022-3964 | 4.3 M | alpine/ffmpeg | ⏳ Awaiting Fix | Low |
| CVE-2025-10966 | 4.3 M | alpine/curl | ⏳ Awaiting Fix | Low |
| CVE-2023-50007 | 4.0 M | alpine/ffmpeg | ⏳ Awaiting Fix | Low |
| CVE-2025-46394 | 3.2 L | alpine/busybox | ⏳ Awaiting Fix | Very Low |
| CVE-2024-58251 | 2.5 L | alpine/busybox | ⏳ Awaiting Fix | Very Low |
| CVE-2025-64181 | 2.0 L | alpine/openexr | ⏳ Awaiting Fix | Very Low |
| GHSA-pg9f-39pc-qf8g | N/A U | cargo/crossbeam-channel | ⏳ Awaiting Upstream | Very Low |
| RUSTSEC-2024-0436 | N/A U | cargo/paste | ⏳ Awaiting Upstream | Very Low |

**Key Points:**
- ⏳ **33 total CVEs** - 1 fixed in 0.5.3, 32 awaiting upstream fixes
- ✅ **npm glob CVE-2025-64756 FIXED** - Updated to glob 11.1.0 in version 0.5.3 (will be in next Docker build)
- 🔒 **All remaining CVEs have low real-world exploitability** in ViTransfer's containerized environment
- 🔧 **Cargo CVEs require upstream Alpine FFmpeg updates** - Cannot be fixed in package.json
- 📦 **Alpine package CVEs** - All using latest available Alpine 3.22 versions

### Medium Severity (Minimal Impact)

#### Alpine Package CVEs (FFmpeg Dependencies)
The following CVEs are in Alpine Linux system packages used by FFmpeg for video processing:

**libjxl (JPEG XL codec)**
- CVE-2024-11403, CVE-2024-11498 (6.9 M) - Image format not used by ViTransfer

**openexr (EXR image format)**
- CVE-2025-48072 (6.8 M), CVE-2025-64183, CVE-2025-64182 (5.5 M), CVE-2025-48074, CVE-2025-48073 (4.6 M), CVE-2025-64181 (2.0 L)
- Impact: Minimal - EXR format not used by ViTransfer

**libsndfile (Audio file library)**
- CVE-2024-50613 (6.5 M) - Audio parsing vulnerability
- Impact: Limited - ViTransfer validates video files; FFmpeg handles audio internally

**giflib (GIF image library)**
- CVE-2024-45993 (6.5 M) - GIF processing vulnerability
- Impact: Minimal - GIF files not accepted by ViTransfer

**orc (Code optimization library)**
- CVE-2025-47436 (6.0 M) - Internal FFmpeg dependency
- Impact: Minimal - Code optimization library, not directly exposed

**FFmpeg**
- CVE-2025-59729 (5.7 M), CVE-2025-1594 (5.3 M), CVE-2024-31585 (5.3 M), CVE-2025-1373 (4.8 M), CVE-2022-3964 (4.3 M), CVE-2023-50007 (4.0 M)
- Impact: Low - All require specially crafted video files; containerized execution limits exposure

**libssh (SSH library)**
- CVE-2025-8114 (4.7 M) - SSH library not used for video processing
- Impact: Minimal

**curl**
- CVE-2025-10966 (4.3 M) - Used for health checks and external requests
- Impact: Low - Limited exposure in containerized environment

**busybox**
- CVE-2025-46394 (3.2 L), CVE-2024-58251 (2.5 L)
- Impact: Negligible - BusyBox utilities not used in runtime

#### Cargo/Rust CVEs (FFmpeg Rust Dependencies)

**crossbeam-channel**
- CVE-2025-4574 (6.3 M), GHSA-pg9f-39pc-qf8g (Unscored)
- Status: ⏳ Awaiting upstream Alpine FFmpeg update
- Impact: Minimal - Internal FFmpeg Rust dependency (rav1e encoder)
- Exploitability: Very Low - Not directly accessible
- Risk: Very Low

**paste**
- RUSTSEC-2024-0436 (Unscored)
- Status: ⏳ Awaiting upstream Alpine FFmpeg update
- Impact: Minimal - Macro helper library
- Risk: Very Low

### Why These CVEs Have Low/Minimal Risk for ViTransfer

1. **Indirect Dependencies**: All CVEs are in FFmpeg's dependencies, not ViTransfer code
2. **Limited Attack Surface**: ViTransfer only processes video files, not audio/GIF directly
3. **Input Validation**: TUS upload protocol validates file types before processing
4. **Sandboxed Processing**: FFmpeg runs in a containerized environment
5. **No Direct Exposure**: Libraries are used internally by FFmpeg, not exposed via API
6. **Protected Runtime**: Container runs as non-root user with limited permissions

### Real-World Exploitability

For these CVEs to be exploited in ViTransfer:
1. Attacker would need to upload a specially crafted video file
2. The video would need to contain malicious audio/image data
3. FFmpeg would need to process it in a vulnerable way
4. The exploit would need to escape FFmpeg's process
5. The exploit would need to escalate beyond container boundaries

**This attack chain is highly unlikely and requires multiple layers of compromise.**

### Mitigation Strategy

1. **Latest Packages**: Dockerfile includes `apk upgrade` for all security patches
2. **Explicit Upgrades**: Vulnerable packages explicitly upgraded to latest versions
3. **Regular Rebuilds**: Images should be rebuilt weekly for new patches
4. **Monitoring**: Subscribe to Alpine and FFmpeg security advisories
5. **Defense in Depth**:
   - Container isolation
   - Non-root user execution
   - Input validation
   - Rate limiting
   - File type restrictions

### User Action Required

**For production deployments:**

1. **Keep Docker images updated**: Regularly pull the latest image
   ```bash
   docker pull crypt010/vitransfer:latest
   docker-compose up -d
   ```

2. **Monitor security advisories**: Subscribe to Alpine and FFmpeg security lists

3. **Run vulnerability scans**: Use tools like Trivy or Grype
   ```bash
   docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
     aquasec/trivy image crypt010/vitransfer:latest
   ```

4. **Enable HTTPS**: Always use a reverse proxy with TLS/SSL in production

5. **Regular backups**: Backup database and uploads directory

## Security Best Practices

### Deployment
- Always use HTTPS with valid SSL certificates
- Set secure `ENCRYPTION_KEY` and `JWT_SECRET` values
- Use strong admin passwords (12+ characters)
- Run behind a reverse proxy (Nginx, Traefik, Caddy)
- Enable rate limiting at the reverse proxy level
- Keep Docker images updated

### Configuration
- Change default admin password immediately
- Use unique passwords for each project
- Review security logs regularly
- Limit admin user accounts to necessary personnel

### Network Security
- Use firewall rules to restrict access
- Consider VPN for admin access
- Enable fail2ban or similar intrusion prevention
- Monitor access logs for suspicious patterns

## Security Updates

Security updates are released as needed. Subscribe to GitHub releases to stay informed:
- Watch the repository for security advisories
- Enable GitHub Dependabot alerts
- Check the CHANGELOG for security-related updates

## Compliance

ViTransfer follows security best practices for:
- OWASP Top 10 protection
- Secure session management
- Input validation and sanitization
- SQL injection prevention (via Prisma ORM)
- XSS protection (via React and Content-Security-Policy)

## Contact

For security concerns, please contact the maintainers through [GitHub Security Advisories](https://github.com/MansiVisuals/ViTransfer/security/advisories).
