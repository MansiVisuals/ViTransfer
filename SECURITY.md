# Security Policy

## Supported Versions

Currently supported versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

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

### Password Protection
- **AES-256-GCM encryption** for share passwords
- **Bcrypt hashing** for admin passwords
- **Rate limiting** on password attempts (5 attempts per 15 minutes)
- **Automatic lockout** after failed password attempts

### Video Access Control
- **Token-based video streaming** with session validation
- **Hotlink protection** to prevent unauthorized embedding
- **Watermarking** on preview videos
- **Time-limited access tokens** (15 minutes)

### Data Protection
- **Encrypted passwords** stored in database
- **Secure cookie flags** (HttpOnly, Secure, SameSite)
- **Database context isolation** for multi-tenancy
- **Input validation** using Zod schemas

### Security Logging
- **Failed login attempts** tracking
- **Suspicious activity** monitoring
- **Rate limit violations** logging
- **Video access** audit trail

## Known CVEs and Risk Assessment

The following CVEs are present in Alpine Linux packages (latest available versions). These are **transitive dependencies** from FFmpeg and are **NOT directly exploitable** in ViTransfer's use case.

### High Severity (Limited Impact in ViTransfer Context)

#### CVE-2025-52194 - libsndfile 1.2.2-r2 (Severity: 7.5 High)
- **Status**: ⏳ Awaiting upstream Alpine/libsndfile fix
- **Impact**: Limited - Audio processing in FFmpeg (not directly exposed)
- **Exploitability**: Low - Requires malicious audio file upload
- **Mitigation**: ViTransfer validates video files; FFmpeg handles audio internally
- **Risk**: Low - Not a primary attack vector

#### CVE-2024-50613 - libsndfile 1.2.2-r2 (Severity: 6.5 Medium)
- **Status**: ⏳ Awaiting upstream fix
- **Impact**: Limited - Audio parsing vulnerability
- **Mitigation**: Same as CVE-2025-52194
- **Risk**: Low

### Medium Severity (Minimal Impact)

#### CVE-2024-45993 - giflib 5.2.2-r1 (Severity: 6.5 Medium)
- **Status**: ⏳ Awaiting upstream fix
- **Impact**: Minimal - GIF processing (ViTransfer processes videos only)
- **Exploitability**: Very Low - GIF files not accepted by ViTransfer
- **Risk**: Very Low

#### CVE-2025-4574 - crossbeam-channel 0.5.14 (Severity: 6.3 Medium)
- **Status**: ⏳ Awaiting Alpine FFmpeg update
- **Impact**: Minimal - Internal FFmpeg Rust dependency
- **Exploitability**: Very Low - Not directly accessible
- **Risk**: Very Low

#### CVE-2025-47436 - orc 0.4.40-r1 (Severity: 6.0 Medium)
- **Status**: ⏳ Awaiting upstream fix
- **Impact**: Minimal - Code optimization library
- **Exploitability**: Low - Internal FFmpeg dependency
- **Risk**: Low

### Low Severity (Negligible Impact)

#### CVE-2025-46394 - busybox 1.37.0-r19 (Severity: 3.2 Low)
- **Status**: ⏳ Awaiting upstream fix
- **Impact**: Negligible - BusyBox utility (not used in runtime)
- **Risk**: Very Low

#### CVE-2024-58251 - busybox 1.37.0-r19 (Severity: 2.5 Low)
- **Status**: ⏳ Awaiting upstream fix
- **Impact**: Negligible
- **Risk**: Very Low

### Unscored / Advisories

#### GHSA-pg9f-39pc-qf8g - crossbeam-channel 0.5.14
- **Status**: ⏳ Awaiting Alpine FFmpeg update
- **Impact**: Unknown - GitHub Security Advisory
- **Risk**: Low - Transitive FFmpeg dependency

#### RUSTSEC-2024-0436 - paste 1.0.14
- **Status**: ⏳ Awaiting Alpine FFmpeg update
- **Impact**: Minimal - Macro helper library
- **Risk**: Very Low

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
- Enable email notifications for suspicious activity
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
