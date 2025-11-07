#!/bin/bash

# ViTransfer Docker Entrypoint Script
# Universal compatibility: Works on Unraid, TrueNAS, Docker Desktop, Ubuntu, Podman
# Handles PUID/PGID remapping AND docker-compose user: directive
# This script runs automatically on container start - no manual intervention required

set -e

echo "ViTransfer starting..."
echo ""

# ========================================
# SMART USER DETECTION
# ========================================
# Detects how the container is running and adapts automatically:
# - Via docker-compose user: directive → Already correct user
# - Via PUID/PGID env vars → Remap user
# - Default → Use default UID 911

RUNNING_UID=$(id -u)
RUNNING_GID=$(id -g)
PUID=${PUID:-911}
PGID=${PGID:-911}

echo "[INFO] User Configuration:"
echo "  Container running as: UID=$RUNNING_UID GID=$RUNNING_GID"
echo "  Target (PUID/PGID): UID=$PUID GID=$PGID"
echo ""

# ========================================
# CASE 1: Already running as target user
# ========================================
if [ "$RUNNING_UID" = "$PUID" ] && [ "$RUNNING_GID" = "$PGID" ]; then
    echo "[OK] Already running as target user UID:$PUID GID:$PGID"
    echo "     (Detected docker-compose 'user:' directive or matching PUID/PGID)"
    echo ""

    # Fix ownership of app files if needed (from build-time UID 911)
    if [ "$RUNNING_UID" != "911" ]; then
        echo "[SETUP] Fixing ownership of app files..."
        # Only fix files still owned by build-time user (911)
        # Don't touch mounted volumes!
        find /app -maxdepth 2 \( -name '.next' -o -name 'public' -o -name 'node_modules' -o -name 'src' \) -user 911 \
            -exec chown -R $RUNNING_UID:$RUNNING_GID {} + 2>/dev/null || true
        echo "[OK] File ownership updated"
        echo ""
    fi

    SKIP_SU_EXEC=true

# ========================================
# CASE 2: Running as non-root, but different UID
# ========================================
elif [ "$RUNNING_UID" != "0" ]; then
    echo "[OK] Running as non-root user UID:$RUNNING_UID GID:$RUNNING_GID"
    echo "     (Container already secured, using current user)"
    echo ""

    # Fix ownership if possible (may fail without root, that's ok)
    echo "[SETUP] Attempting to fix app file ownership..."
    find /app -maxdepth 2 \( -name '.next' -o -name 'public' -o -name 'src' \) -user 911 \
        -exec chown -R $RUNNING_UID:$RUNNING_GID {} + 2>/dev/null || true
    echo "[OK] Ownership fix attempted (errors ignored)"
    echo ""

    SKIP_SU_EXEC=true

# ========================================
# CASE 3: Running as root - need to remap
# ========================================
else
    echo "[SETUP] Running as root, remapping to UID:$PUID GID:$PGID..."
    echo ""

    # Get current app user IDs
    CURRENT_UID=$(id -u app 2>/dev/null || echo "911")
    CURRENT_GID=$(id -g app 2>/dev/null || echo "911")

    # Only remap if needed
    if [ "$CURRENT_UID" != "$PUID" ] || [ "$CURRENT_GID" != "$PGID" ]; then
        echo "  Updating user IDs..."

        # Update group ID if needed
        if [ "$CURRENT_GID" != "$PGID" ]; then
            echo "    Changing GID from $CURRENT_GID to $PGID"
            groupmod -o -g "$PGID" app 2>/dev/null || true
        fi

        # Update user ID if needed (with 60 second timeout to prevent hanging)
        if [ "$CURRENT_UID" != "$PUID" ]; then
            echo "    Changing UID from $CURRENT_UID to $PUID (max 60s timeout)"
            timeout 60 usermod -o -u "$PUID" app 2>/dev/null || {
                echo "    [WARN] usermod timed out or failed - continuing anyway"
                echo "    This is a known issue on some platforms (TrueNAS Scale 25.10 + Docker 28.x)"
            }
        fi

        # Fix ownership of internal app files only (not mounted volumes!)
        echo "    Updating file ownership..."
        chown -R app:app /app/.next /app/public /app/node_modules /app/src 2>/dev/null || true

        echo "[OK] User permissions updated"
    else
        echo "[OK] User permissions already correct"
    fi
    echo ""

    SKIP_SU_EXEC=false
fi

# ========================================
# SERVICE READINESS CHECKS
# ========================================

# Function to wait for postgres to be ready
wait_for_postgres() {
    echo "[WAIT] Waiting for PostgreSQL to be ready..."

    max_attempts=30
    attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if node -e "
            const { PrismaClient } = require('@prisma/client');
            const prisma = new PrismaClient();
            prisma.\$connect()
                .then(() => { console.log('Connected'); process.exit(0); })
                .catch(() => { process.exit(1); });
        " 2>/dev/null; then
            echo "[OK] PostgreSQL is ready!"
            return 0
        fi

        attempt=$((attempt + 1))
        echo "  Attempt $attempt/$max_attempts - waiting..."
        sleep 2
    done

    echo "[ERROR] PostgreSQL is not ready after $max_attempts attempts"
    return 1
}

# Function to wait for Redis to be ready
wait_for_redis() {
    echo "[WAIT] Waiting for Redis to be ready..."

    max_attempts=30
    attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if node -e "
            const Redis = require('ioredis');
            const redis = new Redis({
                host: process.env.REDIS_HOST || 'redis',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD || undefined,
                maxRetriesPerRequest: 1,
                retryStrategy: () => null
            });
            redis.ping()
                .then(() => { redis.disconnect(); process.exit(0); })
                .catch(() => { redis.disconnect(); process.exit(1); });
        " 2>/dev/null; then
            echo "[OK] Redis is ready!"
            return 0
        fi

        attempt=$((attempt + 1))
        echo "  Attempt $attempt/$max_attempts - waiting..."
        sleep 2
    done

    echo "[ERROR] Redis is not ready after $max_attempts attempts"
    return 1
}

# Function to wait for app to be fully ready
wait_for_app() {
    echo "[WAIT] Waiting for application to be fully ready..."

    # Configurable hostname and port for different deployment scenarios
    # APP_HOST: Container/service name (default: vitransfer-app)
    # APP_PORT: Application port (default: 4321)
    APP_HOST=${APP_HOST:-vitransfer-app}
    APP_PORT=${APP_PORT:-4321}
    max_attempts=150  # 5 minutes (150 attempts * 2 seconds)
    attempt=0

    echo "  Checking: http://${APP_HOST}:${APP_PORT}/api/settings/public"

    while [ $attempt -lt $max_attempts ]; do
        if curl -s -f http://${APP_HOST}:${APP_PORT}/api/settings/public > /dev/null 2>&1; then
            echo "[OK] Application is ready!"
            return 0
        fi

        attempt=$((attempt + 1))
        echo "  Attempt $attempt/$max_attempts - waiting..."
        sleep 2
    done

    echo "[ERROR] Application is not ready after $max_attempts attempts"
    echo "        Tried: http://${APP_HOST}:${APP_PORT}"
    return 1
}

# ========================================
# DATABASE SETUP (MAIN APP ONLY)
# ========================================

# Only run migrations and initialization for the main app, not the worker
if [ "$1" = "npm" ] && [ "$2" = "start" ]; then
    echo "[SETUP] Running database setup..."
    echo ""

    # Wait for services to be ready
    wait_for_postgres
    wait_for_redis

    echo ""
    echo "[DB]  Running Prisma migrations..."

    # Run migrations automatically
    # - On first run: Creates all tables from scratch (initial_schema migration)
    # - On updates: Applies only new migrations (e.g., when upgrading to v1.1, v1.2, etc.)
    # - Idempotent: Safe to run multiple times, only applies pending migrations
    if npx prisma migrate deploy; then
        echo "[OK] Database migrations completed"
    else
        echo "[ERROR] Database migration failed"
        exit 1
    fi

    echo ""
    echo "[INIT] Database setup complete"
    echo "      Admin initialization will run automatically via instrumentation.ts"
    echo ""
elif [[ "$@" == *"npm run worker"* ]] || [[ "$@" == *"worker"* ]]; then
    echo "[SETUP] Worker initialization..."
    echo ""

    # Workers need to wait for database, Redis, AND the main app to be ready
    wait_for_postgres
    wait_for_redis
    wait_for_app

    echo ""
    echo "[OK] All services ready for worker"
    echo ""
fi

# ========================================
# START APPLICATION
# ========================================

echo "[START] Starting application..."
if [ "$SKIP_SU_EXEC" = "true" ]; then
    echo "         Running as: UID:$RUNNING_UID GID:$RUNNING_GID (direct)"
else
    echo "         Running as: UID:$PUID GID:$PGID (via su-exec app)"
fi
echo ""

# Execute the main command
if [ "$SKIP_SU_EXEC" = "true" ]; then
    # Already running as correct user, no need for su-exec
    exec "$@"
else
    # Running as root, switch to app user
    exec su-exec app "$@"
fi
