# ViTransfer - Multi-Architecture Docker Image
# Supports: amd64, arm64 | Security: non-root user via PUID/PGID

FROM node:24-alpine3.23 AS base

ARG TARGETPLATFORM
ARG TARGETARCH
ARG BUILDPLATFORM

# Install system dependencies
RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache \
        openssl openssl-dev \
        ffmpeg ffmpeg-libs fontconfig ttf-dejavu \
        bash curl ca-certificates shadow su-exec \
    && apk add --no-cache --upgrade cjson libsndfile giflib orc \
    && ffmpeg -version

# === Dependencies ===
FROM base AS deps
WORKDIR /app

COPY --link package.json package-lock.json* ./
COPY --link prisma ./prisma

RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps

RUN cp -R node_modules /tmp/prod_node_modules

RUN npm audit --audit-level=high || \
    (echo "SECURITY: High/critical vulnerabilities found!" && exit 1)

# === Builder ===
FROM base AS builder
WORKDIR /app

COPY --from=deps --link /app/node_modules ./node_modules
COPY --link . .

RUN npx prisma generate

ARG APP_VERSION
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}
ENV SKIP_ENV_VALIDATION=1
ENV NEXT_PHASE=phase-production-build
RUN npm run build

# === Production ===
FROM base AS runner
WORKDIR /app

ARG APP_VERSION
LABEL org.opencontainers.image.title="ViTransfer"
LABEL org.opencontainers.image.description="Video review and approval platform"
LABEL org.opencontainers.image.source="https://github.com/MansiVisuals/ViTransfer"
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production

# Python for Apprise notifications (with security updates)
RUN apk add --no-cache python3 py3-pip py3-virtualenv \
    && python3 -m venv /opt/apprise-venv \
    && /opt/apprise-venv/bin/pip install --no-cache-dir --upgrade pip==25.3 wheel==0.46.2 \
    && /opt/apprise-venv/bin/pip install --no-cache-dir apprise==1.9.6

ENV APPRISE_PYTHON=/opt/apprise-venv/bin/python3

ARG TARGETPLATFORM
ARG TARGETARCH
RUN echo "Building for: $TARGETPLATFORM ($TARGETARCH)" && uname -a

# App user (UID 911, remappable via PUID/PGID)
RUN addgroup -g 911 app && adduser -D -u 911 -G app -h /app app

# Copy production files
COPY --from=deps --link /tmp/prod_node_modules ./node_modules
COPY --from=builder --link /app/public ./public
COPY --from=builder --link /app/.next ./.next
COPY --from=builder --link /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --link /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --link /app/prisma ./prisma
COPY --from=builder --link /app/src ./src
COPY --from=builder --link /app/package.json ./package.json
COPY --from=builder --link /app/tsconfig.json ./tsconfig.json
COPY --from=builder --link /app/next.config.js ./next.config.js
COPY --from=builder --link /app/worker.mjs ./worker.mjs
COPY --link docker-entrypoint.sh /usr/local/bin/

RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    chown -R app:app /app && \
    chmod -R a+rX /app/src /app/.next /app/node_modules /app/public /app/prisma

ENV PUID=1000 PGID=1000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4321/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

EXPOSE 4321
ENV PORT=4321 HOSTNAME="0.0.0.0"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]
