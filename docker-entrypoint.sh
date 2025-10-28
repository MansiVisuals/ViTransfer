#!/bin/bash

# ViTransfer Docker Entrypoint Script
# Handles PUID/PGID remapping, database migrations and initialization before starting the app
# This script runs automatically on container start - no manual intervention required

set -e

echo "ViTransfer starting..."
echo ""

# Handle PUID/PGID (LinuxServer.io style)
# This allows the container to run with the same UID/GID as the host user
PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "[INFO] User Configuration:"
echo "  PUID: $PUID"
echo "  PGID: $PGID"
echo ""

# Check if we need to update the user/group IDs
CURRENT_UID=$(id -u abc 2>/dev/null || echo "911")
CURRENT_GID=$(id -g abc 2>/dev/null || echo "911")

if [ "$CURRENT_UID" != "$PUID" ] || [ "$CURRENT_GID" != "$PGID" ]; then
    echo "[SETUP] Updating user permissions..."

    # Update group ID if needed
    if [ "$CURRENT_GID" != "$PGID" ]; then
        echo "  Changing GID from $CURRENT_GID to $PGID"
        groupmod -o -g "$PGID" abc 2>/dev/null || true
    fi

    # Update user ID if needed
    if [ "$CURRENT_UID" != "$PUID" ]; then
        echo "  Changing UID from $CURRENT_UID to $PUID"
        usermod -o -u "$PUID" abc 2>/dev/null || true
    fi

    # Fix ownership of app files
    echo "  Updating file ownership..."
    chown -R abc:abc /app 2>/dev/null || true

    echo "[OK] User permissions updated"
else
    echo "[OK] User permissions already correct"
fi

echo ""

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

    # Respect APP_PORT env var so worker checks the correct container port
    APP_PORT=${APP_PORT:-4321}
    max_attempts=150  # 5 minutes (150 attempts * 2 seconds)
    attempt=0

    while [ $attempt -lt $max_attempts ]; do
        # Try both 'app' and 'vitransfer-app' hostnames for compatibility
        if curl -s -f http://vitransfer-app:${APP_PORT}/api/settings/public > /dev/null 2>&1 || \
           curl -s -f http://app:${APP_PORT}/api/settings/public > /dev/null 2>&1; then
            echo "[OK] Application is ready!"
            return 0
        fi

        attempt=$((attempt + 1))
        echo "  Attempt $attempt/$max_attempts - waiting..."
        sleep 2
    done

    echo "[ERROR] Application is not ready after $max_attempts attempts"
    return 1
}

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
    echo "[INIT] Initializing default admin and settings..."

    # Call the initialization API endpoint to create admin user
    # We do this async in the background and don't wait for it
    # The app will handle this on first request if needed
    (
        sleep 5
        curl -s http://localhost:4321/api/init > /dev/null 2>&1 || true
    ) &

    echo "[OK] Initialization triggered"
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

echo "[START] Starting application as user abc (UID:$PUID, GID:$PGID)..."
echo ""

# Execute the main command as the abc user
exec gosu abc "$@"
