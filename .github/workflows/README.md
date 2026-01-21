# CI/CD Testing Workflows

This directory contains GitHub Actions workflows for automated testing of ViTransfer.

## Overview

**Total Workflows: 4**
- `test-clean-install.yml` (main branch) - **19 tests** - Fresh installation
- `test-upgrade.yml` (main branch) - **22 tests** - Version upgrades with data preservation
- `test-dev-clean-install.yml` (dev branch) - **19 tests** - Dev build fresh installation
- `test-dev-upgrade.yml` (dev branch) - **22 tests** - Production → Dev upgrade

**Test Categories:**
- Infrastructure (PostgreSQL, Redis, health checks)
- Authentication (login, session management)
- API Endpoints (projects, users, settings, analytics)
- Write Operations (create, update, recipient management)
- Database Schema (table existence verification)
- Worker Services (BullMQ initialization)
- Data Integrity (upgrade preservation verification)

**Key Differences:**
- **Clean Install Tests (19):** Test fresh deployments without existing data
- **Upgrade Tests (22):** Test version migrations with data preservation verification, includes 3 additional tests (data integrity check, database comparison, and summary generation)

## Workflows

### Production Testing (main branch)

### 1. Clean Install Test (`test-clean-install.yml`)

Tests a fresh installation of ViTransfer with the latest production compose configuration.

**Total Tests: 19**

**What it tests:**

**Infrastructure Tests (3):**
- [x] PostgreSQL deployment and connectivity (version from docker-compose.yml)
- [x] Redis deployment and connectivity (version from docker-compose.yml)
- [x] API health endpoint (`GET /api/health`)

**Authentication Tests (1):**
- [x] Admin user creation and login (`POST /api/auth/login`)

**API Read Endpoints (4):**
- [x] Session endpoint (`GET /api/auth/session`)
- [x] Projects list endpoint (`GET /api/projects`)
- [x] Users list endpoint (`GET /api/users`)
- [x] Settings endpoint (`GET /api/settings`)

**Analytics Endpoints (2):**
- [x] General analytics (`GET /api/analytics`)
- [x] Project-specific analytics (`GET /api/analytics/[projectId]`)

**Write/Create Operations (5):**
- [x] Project creation (`POST /api/projects` + database verification)
- [x] Recipient management (`POST /api/projects/[id]/recipients` + `GET` verification)
- [x] User creation (`POST /api/users` + database verification)
- [x] Project update (`PATCH /api/projects/[id]` + persistence verification)
- [x] Settings update (`PATCH /api/settings` + persistence verification)

**Database Schema Tests (1):**
- [x] NotificationQueue table exists

**Worker Tests (3):**
- [x] Worker container startup
- [x] Worker logs (BullMQ initialization)
- [x] No worker errors

**Triggers:**
- Push to `main` or `dev` branches
- Pull requests to `main` or `dev`
- Manual dispatch

**Duration:** ~2-3 minutes

---

### 2. Upgrade Test (`test-upgrade.yml`)

Tests upgrading from a previous version to the current version, ensuring data integrity and migration success.

**Total Tests: 22**

**Pre-Upgrade Phase:**
- [x] Deploy old version (auto-detected from VERSION file, or manually specified)
- [x] Seed test data (create project with admin user)
- [x] Capture baseline counts (Projects, Users)
- [x] Create database backup (`pg_dump`)

**Upgrade Phase:**
- [x] Stop old version containers
- [x] Upgrade to new version
- [x] Verify migrations ran successfully

**Data Integrity Verification (1):**
- [x] Verify data integrity (compare before/after counts - no data loss)
  - Projects count must match
  - Users count must match
  - Stores verified counts for summary report

**Post-Upgrade Functionality Tests (21):**

**Infrastructure (2):**
- [x] API health endpoint after upgrade
- [x] Redis connection after upgrade

**Authentication (2):**
- [x] Admin login after upgrade
- [x] Session endpoint after upgrade

**API Read Endpoints (4):**
- [x] Projects API (`GET /api/projects`)
- [x] Seeded project preserved (verify seed data still exists)
- [x] Users API (`GET /api/users`)
- [x] Settings API (`GET /api/settings`)

**Analytics Endpoints (2):**
- [x] General analytics (`GET /api/analytics`)
- [x] Project-specific analytics (`GET /api/analytics/[projectId]`)

**Write/Create Operations (5):**
- [x] Create new project after upgrade (`POST /api/projects`)
- [x] Recipient management (`POST` & `GET` recipients)
- [x] User creation (`POST /api/users`)
- [x] Project update (`PATCH /api/projects/[id]`)
- [x] Settings update (`PATCH /api/settings`)

**Database Schema Tests (1):**
- [x] NotificationQueue table exists

**Worker Tests (3):**
- [x] Worker container running after upgrade
- [x] Worker logs (BullMQ initialization)
- [x] No worker errors

**Database Comparison (1):**
- [x] Compare database schemas (pg_dump before/after, show tables)

**Summary Generation (Always runs):**
Generates a comprehensive GitHub Actions summary showing:
- Upgrade path (from version → to version)
- Data preservation verification (before/after counts must match)
- Post-upgrade new data creation (tests can create additional data)
- All 22 test results with pass/fail status

**Understanding the Summary Output:**

The workflow tracks data in three stages:
1. **BEFORE upgrade**: Baseline counts after seeding (e.g., 1 project, 1 user)
2. **AFTER upgrade**: Verified counts - must match BEFORE (proves no data loss)
3. **FINAL**: Counts after running post-upgrade tests (may be higher due to test data creation)

Example: If BEFORE=1 project, AFTER=1 project ✅ (preserved), FINAL=2 projects ✅ (created +1 in tests)

**Triggers:**
- Push to `main` or `dev` branches
- Pull requests to `main` or `dev`
- Manual dispatch (with version selection)

**Duration:** ~4-5 minutes

**Manual trigger options:**
```yaml
from_version: ''       # Leave empty for auto-detect (previous patch version)
to_version: 'latest'   # Version to upgrade to (or 'dev', specific tag, etc.)
```

---

### 3. Docker Integration Tests (`docker-integration-tests.yml`)

Combined workflow that runs both clean install and upgrade tests.

**What it does:**
- Runs clean install test first
- If successful, runs upgrade test
- Provides summary of all test results

**Triggers:**
- Push/PR with changes to:
  - `docker-compose*.yml`
  - `Dockerfile`
  - `prisma/**`
  - Workflow files
- Manual dispatch

**Duration:** ~5-8 minutes total

---

### Development Testing (dev branch)

### 4. Dev Clean Install Test (`test-dev-clean-install.yml`)

Tests a fresh installation of development builds using `dev-VERSION` Docker tags.

**Total Tests: 19** (same as production clean install)

**What it tests:**
- [x] Dev build deployment (e.g., `dev-0.8.5` from Docker Hub)
- All 19 tests identical to production clean install test
- Infrastructure, Authentication, API endpoints, Analytics, Write operations, Database schema, Worker tests

**Triggers:**
- Push to `dev` branch
- Pull requests to `dev`
- Manual dispatch (with version override)

**Duration:** ~2-3 minutes

**Example:** Tests `crypt010/vitransfer:dev-0.8.5` from Docker Hub
- Push to `dev` branch
- Pull requests to `dev`
- Manual dispatch (with version override)

**Duration:** ~2-3 minutes

**Example:** Tests `crypt010/vitransfer:dev-0.8.5` from Docker Hub

---

### 5. Dev Upgrade Test (`test-dev-upgrade.yml`)

Tests upgrading from latest production to development builds.

**Total Tests: 22** (same as production upgrade test)

**What it tests:**
- [x] Deploy latest production version
- [x] Seed test data
- [x] Create database backup
- [x] Upgrade to dev version (e.g., `dev-0.8.5`)
- All 22 tests identical to production upgrade test
- Data integrity verification, Post-upgrade functionality, Database comparison, Summary generation

**Triggers:**
- Push to `dev` branch
- Pull requests to `dev`
- Manual dispatch (with version override)

**Duration:** ~4-5 minutes

**Example:** Tests upgrade from `latest` → `dev-0.8.5`

**Manual trigger options:**
```yaml
from_version: 'latest'  # Production version to upgrade from
to_version: ''          # Leave empty for auto-detect (dev-VERSION)
```

---

## Running Tests Manually

### Via GitHub UI

1. Go to **Actions** tab in GitHub
2. Select the workflow you want to run
3. Click **Run workflow**
4. Select branch and options (if applicable)
5. Click **Run workflow**

### Via GitHub CLI

```bash
# Run clean install test
gh workflow run test-clean-install.yml

# Run upgrade test with auto-detected versions
gh workflow run test-upgrade.yml

# Run upgrade test with specific versions
gh workflow run test-upgrade.yml \
  -f from_version=0.8.3 \
  -f to_version=latest

# Run full integration test suite
gh workflow run docker-integration-tests.yml
```

---

## Understanding Test Results

### Success Indicators

- All containers start and become healthy
- Database migrations complete without errors
- API endpoints respond correctly
- Authentication works
- Worker processes initialize
- Data integrity maintained across upgrades

### Failure Scenarios

**Clean Install Failures:**
- Container fails to start → Check Dockerfile or compose configuration
- Health check timeout → Check application startup logs
- Migration failure → Check Prisma schema or migration files
- API errors → Check application logs

**Upgrade Failures:**
- Old version won't start → Version may not exist or is incompatible
- Migration errors → Breaking schema changes
- Data loss → Check migration logic
- Functionality broken → Breaking changes in code

### Artifacts

On upgrade test failures, the workflow uploads:
- Database backup before upgrade
- Container logs
- Available for 7 days in workflow run

---

## Adding New Tests

### To add tests to clean install:

Edit `.github/workflows/test-clean-install.yml` and add steps after "Test admin login":

```yaml
- name: Test new feature
  run: |
    echo "Testing new feature..."
    # Your test commands here
```

### To add tests to upgrade:

Edit `.github/workflows/test-upgrade.yml` and add steps in "Test functionality after upgrade":

```yaml
# Test additional feature
echo "Testing feature X..."
# Your test commands
```

---

## Local Testing

You can run the same tests locally using the scripts from the workflows:

```bash
# Clean install test
./scripts/test-clean-install.sh

# Upgrade test
./scripts/test-upgrade.sh 0.8.3 latest
```

(Note: Scripts need to be created based on workflow steps)

---

## Troubleshooting

### Tests fail on PostgreSQL version check
- Verify `docker-compose.yml` uses correct PostgreSQL image
- Check if image exists: `docker pull postgres:18.1-alpine`

### Tests fail on Redis version check
- Verify `docker-compose.yml` uses correct Redis image
- Check if image exists: `docker pull redis:8-alpine`

### Upgrade test can't find old version
- Ensure the Docker image tag exists on Docker Hub
- Check available tags: https://hub.docker.com/r/crypt010/vitransfer/tags

### Health checks timeout
- Increase wait time in workflow
- Check if services have sufficient resources
- Review application startup logs

---

## Workflow Badges

Add these badges to your README.md:

```markdown
[![Clean Install Test](https://github.com/MansiVisuals/ViTransfer/actions/workflows/test-clean-install.yml/badge.svg)](https://github.com/MansiVisuals/ViTransfer/actions/workflows/test-clean-install.yml)

[![Upgrade Test](https://github.com/MansiVisuals/ViTransfer/actions/workflows/test-upgrade.yml/badge.svg)](https://github.com/MansiVisuals/ViTransfer/actions/workflows/test-upgrade.yml)

[![Docker Integration Tests](https://github.com/MansiVisuals/ViTransfer/actions/workflows/docker-integration-tests.yml/badge.svg)](https://github.com/MansiVisuals/ViTransfer/actions/workflows/docker-integration-tests.yml)
```

---

## Best Practices

1. **Run tests before merging PRs** - Ensures changes don't break deployments
2. **Test upgrades from last 2-3 versions** - Covers common upgrade paths
3. **Monitor test duration** - Should complete within 10 minutes
4. **Review failure logs** - GitHub Actions provides detailed logs
5. **Keep workflows updated** - Update default versions as new releases are published

---

## Questions?

- Workflow not triggering? Check the `on:` triggers match your branch/path
- Need to test specific version? Use manual workflow dispatch
- Tests taking too long? Consider parallelizing independent tests
- Need more test coverage? Add additional steps to existing workflows
