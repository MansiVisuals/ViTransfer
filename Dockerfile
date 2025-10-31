# ViTransfer - Production-Ready Multi-Architecture Docker Image
# Supports: amd64 (Intel/AMD x86_64), arm64 (Apple Silicon, ARM servers)
# Uses CPU-based encoding for maximum compatibility
# Security: Runs as configurable non-root user via PUID/PGID
# Database: Automatic migrations on startup, no manual intervention required

FROM node:20-alpine AS base

# Build arguments for architecture detection
ARG TARGETPLATFORM
ARG TARGETARCH
ARG BUILDPLATFORM

# Update npm to latest version
RUN npm install -g npm@latest

# Security: Update Alpine to latest packages and apply security patches
# This ensures all packages are at their latest available versions
# Note: Some CVEs remain in Alpine packages (libsndfile, giflib, orc) awaiting upstream fixes
# See SECURITY.md for full CVE risk assessment
RUN apk update && apk upgrade --no-cache

# Install OpenSSL 3.x compatibility for Prisma
RUN apk add --no-cache \
    openssl \
    openssl-dev

# Install FFmpeg for CPU-based video processing with latest security patches
# Note: Some CVEs exist in FFmpeg's dependencies (libsndfile, giflib, orc, crossbeam-channel)
# All packages are at their latest Alpine versions - awaiting upstream security fixes
# Risk is minimal as these are internal FFmpeg dependencies, not directly exposed
# See SECURITY.md for detailed CVE risk assessment
RUN apk add --no-cache \
    ffmpeg \
    ffmpeg-libs \
    fontconfig \
    ttf-dejavu \
    && apk add --no-cache --upgrade \
        cjson \
        libsndfile \
        giflib \
        orc \
    && echo "FFmpeg version:" && ffmpeg -version

# Install common utilities and gosu for user switching
RUN apk add --no-cache \
    bash \
    curl \
    ca-certificates \
    shadow \
    gosu

# ========================================
# Dependencies stage
# ========================================
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Copy Prisma schema before npm ci (needed for postinstall script)
COPY prisma ./prisma

# Install all dependencies
RUN npm install --legacy-peer-deps

# Copy node_modules for production (we'll use all deps for now to avoid prisma issues)
RUN cp -R node_modules /tmp/prod_node_modules

# Run security audit - fail build if HIGH or CRITICAL vulnerabilities found
# This ensures we never deploy with known security issues
RUN echo "Running npm security audit..." && \
    npm audit --audit-level=high || \
    (echo "SECURITY ALERT: High or critical vulnerabilities found!" && \
     echo "Run 'npm audit' locally to see details and 'npm audit fix' to resolve." && \
     exit 1)

# ========================================
# Builder stage
# ========================================
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js (skip static optimization for pages that need runtime data)
ENV SKIP_ENV_VALIDATION=1
ENV NEXT_PHASE=phase-production-build
RUN npm run build

# ========================================
# Runner stage (production)
# ========================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Build arguments for runtime info
ARG TARGETPLATFORM
ARG TARGETARCH

# Display architecture info at build time
RUN echo "Building for platform: $TARGETPLATFORM (arch: $TARGETARCH)" && \
    echo "System info:" && \
    uname -a

# Create application user with UID 911 (non-standard to avoid host user conflicts)
# Can be remapped at runtime via PUID/PGID environment variables
RUN addgroup -g 911 app && \
    adduser -D -u 911 -G app -h /app app

# Copy only production dependencies
COPY --from=deps /tmp/prod_node_modules ./node_modules

# Copy built application from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next

# Copy Prisma files for migrations
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# Copy necessary runtime files
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.js ./next.config.js

# Copy worker script
COPY --from=builder /app/worker.mjs ./worker.mjs

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set proper ownership for app user
RUN chown -R app:app /app

# This allows containers starting as any UID to read app code built as UID 911
# Only affects app code, NOT user uploads (handled by volume mount permissions)
# Safe: These directories contain application code and public packages, not secrets
RUN chmod -R a+rX /app/src \
                  /app/.next \
                  /app/node_modules \
                  /app/public

# Environment variables for PUID/PGID (can be overridden at runtime)
ENV PUID=1000 \
    PGID=1000

# Container starts as root to handle PUID/PGID remapping
# Entrypoint script switches to app user after remapping

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4321/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

EXPOSE 4321

ENV PORT=4321
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]
