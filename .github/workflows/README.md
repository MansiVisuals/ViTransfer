# CI/CD Testing Workflows

This directory contains GitHub Actions workflows for automated testing of ViTransfer.

## Workflows

### 1. Clean Install Test (`test-clean-install.yml`)

Tests a fresh installation of ViTransfer with the latest compose configuration.

**What it tests:**
- [x] PostgreSQL deployment (version from docker-compose.yml)
- [x] Redis deployment (version from docker-compose.yml)
- [x] Container health checks
- [x] Database migrations
- [x] Database connectivity
- [x] Redis connectivity
- [x] API health endpoint
- [x] Admin user creation
- [x] Admin login functionality
- [x] Worker initialization

**Triggers:**
- Push to `main` or `dev` branches
- Pull requests to `main` or `dev`
- Manual dispatch

**Duration:** ~2-3 minutes

---

### 2. Upgrade Test (`test-upgrade.yml`)

Tests upgrading from a previous version to the current version, ensuring data integrity and migration success.

**What it tests:**
- [x] Deploy old version (auto-detected from VERSION file, or manually specified)
- [x] Seed test data
- [x] Create database backup
- [x] Upgrade to new version
- [x] Verify migrations ran successfully
- [x] Verify data integrity (no data loss)
- [x] Test functionality after upgrade
- [x] Verify admin login still works
- [x] Verify worker still functions

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
