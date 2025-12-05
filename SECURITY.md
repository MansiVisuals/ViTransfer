# Security Policy

## Supported Versions

Currently supported versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.6.x   | :white_check_mark: |
| 0.5.x   | :white_check_mark: |
| < 0.5.0 | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in ViTransfer, please report it by creating a private security advisory on GitHub or by emailing the maintainers directly.

**Please do not open public issues for security vulnerabilities.**

We will respond to your report within 48 hours and provide a timeline for a fix.

## Security Features

### Authentication & Sessions
- **Bearer-only authentication** (v0.6.0+): admin and share flows use Authorization headers only; browser-managed credentials are not trusted.
- **Access/refresh tokens** returned in JSON; refresh stored in sessionStorage, access kept in memory.
- **15-minute inactivity timeout** with automatic logout
- **Session monitoring** with warning notifications before logout
- **Token rotation** on each refresh to prevent replay attacks
- **Token revocation** support for forced logouts
- **No implicit cross-site tokens**: all state-changing endpoints rely on explicit bearer tokens

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
- **Database context isolation** for multi-tenancy
- **Input validation** using Zod schemas
- **Comment sanitization** to prevent XSS attacks
- **Content Security Policy** headers (nonce-based, no unsafe-inline/eval)

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

### CVE Summary (As of 2025-12-05 - Version 0.6.4)

| CVE ID | Severity | Package | Status | Real Risk |
|--------|----------|---------|--------|-----------|
| RUSTSEC-2024-0436 | N/A U | cargo/paste@1.0.15 | ⏳ No Fix Available | Very Low |

**Docker Scout Results (v0.6.4):**
- Image: crypt010/vitransfer:0.6.4
- Platform: linux/arm64
- Base: node:24.11.1-alpine3.23
- Size: 774 MB
- Packages: 1308
- Vulnerabilities: 0C | 0H | 0M | 0L | 1U

### RUSTSEC-2024-0436 - cargo/paste@1.0.15

**Description:**
- Unspecified vulnerability in the `paste` Rust crate
- Transitive dependency via FFmpeg's Rust components (rav1e encoder)
- No CVE score assigned (Unspecified severity)

**Impact:**
- Minimal - Macro helper library used internally by FFmpeg
- Not directly accessible through ViTransfer's API
- Requires Alpine FFmpeg package update

**Mitigation:**
- Dependency is sandboxed within FFmpeg's video processing
- Container runs with limited permissions
- No known exploits targeting this vulnerability

### Why This Has Very Low Risk for ViTransfer

1. **Indirect Dependency**: Transitive dependency via FFmpeg, not ViTransfer code
2. **Sandboxed Processing**: FFmpeg runs in containerized environment
3. **No Direct Exposure**: Not accessible via API
4. **Protected Runtime**: Container runs as non-root user with limited permissions
5. **No Known Exploits**: No active exploitation in the wild

### Mitigation Strategy

1. **Latest Base Image**: Using node:24.11.1-alpine3.23 with latest security patches
2. **Regular Updates**: Docker images rebuilt with each release
3. **Defense in Depth**:
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

2. **Run vulnerability scans**: Use Docker Scout
   ```bash
   docker scout cves crypt010/vitransfer:latest
   ```

3. **Enable HTTPS**: Always use a reverse proxy with TLS/SSL in production

4. **Regular backups**: Backup database and uploads directory

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
