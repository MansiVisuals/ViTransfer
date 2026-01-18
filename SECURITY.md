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

## Vulnerability Assessment

### Docker Scout Scan Results (As of 2026-01-18)

**Scan Summary:**
- **Base Image**: node:24.13.0-alpine3.23
- **Vulnerabilities**: 0 Critical | 3 High | 3 Medium | 1 Low

**Known Vulnerabilities (Awaiting Upstream Fixes):**

| CVE ID | Severity | Package | Type | Status |
|--------|----------|---------|------|--------|
| CVE-2026-23745 | High | tar@7.5.1 | npm | Path Traversal - awaiting npm fix |
| CVE-2025-64756 | High | glob@10.x/11.x | npm | OS Command Injection - awaiting npm fix |
| CVE-2025-64118 | Medium | tar@7.5.1 | npm | Race Condition - awaiting npm fix |
| CVE-2026-22184 | Medium | zlib@1.3.1-r2 | apk | Awaiting Alpine fix |
| CVE-2025-60876 | Medium | busybox@1.37.0-r30 | apk | Awaiting Alpine fix |
| GHSA-73rr-hh4g-fpgx | Low | diff | npm | ReDoS - low severity |

### Risk Assessment

**npm packages (tar, glob, diff):**
- These are bundled with npm itself in the Node.js base image
- Not directly used by ViTransfer application code
- Awaiting upstream fixes from the npm team
- Risk is limited to npm operations during build time

**Alpine packages (zlib, busybox):**
- Core Alpine system packages awaiting upstream fixes
- Standard packages present in all Alpine-based containers
- Image uses `apk upgrade` to pull latest available patches

## Security Hardening

### Container Security
- Base image: node:24.13.0-alpine3.23 with latest security patches
- Non-root user execution (PUID/PGID support)
- no-new-privileges security option enabled
- Regular image rebuilds with security updates

### Defense in Depth
- Container isolation
- Input validation on all uploads
- Rate limiting on all endpoints
- File type restrictions
- Health checks and monitoring

## Recommended Actions

### For Production Deployments

**1. Keep images updated:**
```bash
docker pull crypt010/vitransfer:latest
docker-compose up -d
```

**2. Run security scans:**
```bash
docker scout cves crypt010/vitransfer:latest
```

**3. Enable HTTPS:**
- Always use a reverse proxy with TLS/SSL

**4. Regular backups:**
- Backup database and uploads directory

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
