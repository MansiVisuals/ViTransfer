# ViTransfer

**Professional Video Review & Approval Platform for Filmmakers**

ViTransfer is a self-hosted web app for video teams to share work with clients, collect feedback, and manage approvals.

[![Docker Pulls](https://img.shields.io/docker/pulls/crypt010/vitransfer)](https://hub.docker.com/r/crypt010/vitransfer)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![GitHub](https://img.shields.io/badge/github-MansiVisuals%2FViTransfer-blue)](https://github.com/MansiVisuals/ViTransfer)
[![Ko-fi](https://img.shields.io/badge/Support%20on-Ko--fi-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/E1E215DBM4)

[![Clean Install Test](https://github.com/MansiVisuals/ViTransfer/actions/workflows/test-clean-install.yml/badge.svg)](https://github.com/MansiVisuals/ViTransfer/actions/workflows/test-clean-install.yml)
[![Upgrade Test](https://github.com/MansiVisuals/ViTransfer/actions/workflows/test-upgrade.yml/badge.svg)](https://github.com/MansiVisuals/ViTransfer/actions/workflows/test-upgrade.yml)

⚠️ **ACTIVE DEVELOPMENT:** ViTransfer is under active development with frequent updates. While fully functional and used in production, features may be replaced, modified, or removed as we work towards v1.0. Always maintain backups following the 3-2-1 principle (3 copies, 2 different media, 1 offsite) and check release notes before updating. Contributions and feedback are welcome.

💖 **Support Development:** If you find ViTransfer useful, consider [supporting on Ko-fi](https://ko-fi.com/E1E215DBM4) to help fund continued development.

## Quick start (Docker)
1. Download [docker-compose.yml](docker-compose.yml) and [.env.example](.env.example).
2. Create `.env` and generate the required secrets.
3. Start with `docker-compose up -d`.
4. Open `http://localhost:4321` and login.

## Documentation (Wiki)
Full docs live in the GitHub Wiki and are mirrored in `docs/wiki` (v0.8.9).

- GitHub Wiki: https://github.com/MansiVisuals/ViTransfer/wiki
- Start here: [docs/wiki/Home.md](docs/wiki/Home.md)
- Installation: [docs/wiki/Installation.md](docs/wiki/Installation.md)
- Features: [docs/wiki/Features.md](docs/wiki/Features.md)
- Configuration: [docs/wiki/Configuration.md](docs/wiki/Configuration.md)
- Admin settings: [docs/wiki/Admin-Settings.md](docs/wiki/Admin-Settings.md)

## Screenshots

### Login
<img src="docs/screenshots/Login Page.png" alt="Login Page" width="600">

### Admin Dashboard
<img src="docs/screenshots/Project View.png" alt="Project View" width="600">

### Client Share Page
<img src="docs/screenshots/Share Page - Approved.png" alt="Share Page - Approved" width="600">

## Contributing
We’re community-driven — feedback, issues, and PRs are more than welcome.
See [CONTRIBUTING.md](CONTRIBUTING.md) and https://github.com/MansiVisuals/ViTransfer/discussions.

## Support
- Issues: https://github.com/MansiVisuals/ViTransfer/issues
- Discussions: https://github.com/MansiVisuals/ViTransfer/discussions
- Docker Hub: https://hub.docker.com/r/crypt010/vitransfer

Made for filmmakers and video professionals.
