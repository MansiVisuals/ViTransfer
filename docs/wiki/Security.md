# Security

## Overview

ViTransfer is designed with security as a core principle. All data is encrypted, all access is authenticated, and all activity is logged.

## Authentication

- **Admin accounts**: Secure token-based authentication with automatic session rotation.
- **Passkeys (WebAuthn)**: Optional hardware-backed login for admin accounts. Once enabled, passkey is required.
- **Share links**: Projects support multiple authentication modes — password, email verification (OTP), both, or guest access.
- **Session management**: Configurable client session timeout (minutes/hours/days/weeks) and separate admin inactivity timeout (max 24 hours). Sessions are invalidated on security-sensitive changes.
- **Share token TTL**: Optional override for share JWT expiry (60-86400 seconds) for fine-grained session control.
- **Password lockout**: Configurable max password attempts before lockout (default: 5).

## Encryption

- Sensitive data is encrypted at rest using AES-256-GCM encryption.
- All credentials and tokens stored in the database are encrypted.
- Passwords are hashed with bcrypt.
- HTTPS enforcement is supported and recommended for all deployments.

## Access control

- **Rate limiting**: Configurable per-IP and per-share-session request throttling to prevent abuse.
- **Hotlink protection**: Prevents unauthorized direct access to video files (configurable: disabled, log-only, or strict blocking).
- **IP and domain blocking**: Block specific IPs or email domains from accessing the platform.
- **File validation**: All uploads are validated against expected file types using content inspection (not just file extension).
- **Guest restrictions**: Guest users cannot download, comment, or approve. Optional restriction to latest version only.

## Privacy & GDPR

- **Privacy disclosure**: Configurable privacy banner on client share pages with custom text.
- **Analytics consent**: Clients can accept or decline analytics tracking per session.
- **IP anonymization**: Analytics data supports GDPR-compliant IP anonymization.
- **Share page access tracking**: Authentication method, email, IP, and user-agent are logged per session.

## Monitoring

- **Security event logging**: All access attempts, authentication events, and blocked requests are logged with detailed JSON context.
- **Security Events dashboard**: View and filter security events in the admin panel.
- **Analytics**: Track page visits and download activity per project.

## Network isolation

- Docker deployment isolates all internal services (database, cache, worker) on a private network.
- Only the application container is exposed to the host network.
- Containers run as non-root users.

## Reporting vulnerabilities

If you discover a security issue, please report it responsibly. See [SECURITY.md](https://github.com/MansiVisuals/ViTransfer/blob/main/SECURITY.md) for our security policy and reporting guidelines.

---
Navigation: [Home](Home) | [Features](Features) | [Installation](Installation) | [Platform Guides](Platform-Guides) | [Configuration](Configuration) | [Admin Settings](Admin-Settings) | [Usage Guide](Usage-Guide) | [Client Guide](Client-Guide) | [Security](Security) | [Maintenance](Maintenance) | [Troubleshooting](Troubleshooting) | [Screenshots](Screenshots) | [Contributing](Contributing) | [License](License)
