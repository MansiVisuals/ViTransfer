#!/bin/bash
# ViTransfer Multi-Architecture Build Script
# Usage: ./build-multiarch.sh [version] [--no-cache]
# Examples:
#   ./build-multiarch.sh 0.8.5        # Tags: 0.8.5, latest (release — always --no-cache)
#   ./build-multiarch.sh --dev        # Tags: dev
#   ./build-multiarch.sh -dev0.8.5    # Tags: dev-0.8.5
#   ./build-multiarch.sh              # Tags: latest (release — always --no-cache)
# Release builds (any non-dev version) always build with --no-cache.

set -e

DOCKER_USER="mansivisuals"
IMAGE="vitransfer"
VERSION="${1:-latest}"
NO_CACHE=""
PLATFORMS="linux/amd64,linux/arm64"
BUILDER="multiarch-builder"

# Parse arguments
[[ "$1" == "--no-cache" || "$2" == "--no-cache" ]] && NO_CACHE="--no-cache"
[[ "$VERSION" == "--no-cache" ]] && VERSION="latest"

# Determine tags based on version. Release builds (non-dev) always use
# --no-cache so published images never carry stale cached layers.
case "$VERSION" in
    -dev*)    VERSION="${VERSION:1}"; TAGS="$DOCKER_USER/$IMAGE:$VERSION" ;;
    --dev-*)  VERSION="${VERSION:2}"; TAGS="$DOCKER_USER/$IMAGE:$VERSION" ;;
    --dev|dev) VERSION="dev"; TAGS="$DOCKER_USER/$IMAGE:dev" ;;
    latest)   TAGS="$DOCKER_USER/$IMAGE:latest"; NO_CACHE="--no-cache" ;;
    *)        TAGS="$DOCKER_USER/$IMAGE:$VERSION $DOCKER_USER/$IMAGE:latest"; NO_CACHE="--no-cache" ;;
esac

echo "ViTransfer Multi-Architecture Build"
echo "===================================="
echo "Version:   $VERSION"
echo "Platforms: $PLATFORMS"
echo "Tags:      $TAGS"
[[ -n "$NO_CACHE" ]] && echo "Cache:     disabled"
echo ""

# Check Docker Hub login
if ! docker info 2>/dev/null | grep -q "Username: $DOCKER_USER"; then
    echo "Docker Hub login required..."
    docker login
fi

# Setup buildx
if ! docker buildx ls | grep -q "$BUILDER"; then
    echo "Creating builder: $BUILDER"
    docker buildx create --name $BUILDER --driver docker-container --use
else
    docker buildx use $BUILDER
fi
docker buildx inspect --bootstrap > /dev/null

# Build tag arguments
TAG_ARGS=""
for tag in $TAGS; do TAG_ARGS="$TAG_ARGS --tag $tag"; done

# Build and push
echo "Building..."
START=$(date +%s)

docker buildx build \
    --platform $PLATFORMS \
    --build-arg APP_VERSION="$VERSION" \
    $TAG_ARGS \
    $NO_CACHE \
    --push \
    .

END=$(date +%s)
DURATION=$((END - START))

echo ""
echo "Build complete in ${DURATION}s"
echo "Pushed: $TAGS"
echo ""
echo "Pull: docker pull $DOCKER_USER/$IMAGE:$VERSION"
