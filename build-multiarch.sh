#!/bin/bash

# ViTransfer Multi-Architecture Build Script
# Builds for both amd64 and arm64 platforms
# Usage: ./build-multiarch.sh [version|--dev|-dev<version>] [--no-cache]
# Examples:
#   ./build-multiarch.sh 0.1.0         # Tag as 0.1.0 and latest
#   ./build-multiarch.sh --dev         # Tag as dev only
#   ./build-multiarch.sh -dev0.6.0     # Tag as dev-0.6.0 only (no latest)
#   ./build-multiarch.sh --dev --no-cache    # Tag as dev with no cache
#   ./build-multiarch.sh               # Tag as latest

set -e

DOCKERHUB_USERNAME="crypt010"
IMAGE_NAME="vitransfer"
VERSION="${1:-latest}"
NO_CACHE_FLAG=""

# Check for --no-cache flag
if [ "$2" = "--no-cache" ] || [ "$1" = "--no-cache" ]; then
    NO_CACHE_FLAG="--no-cache"
    echo "🔨 Building with --no-cache flag"
fi

# Check if we're building dev version with -dev prefix
if [[ "$VERSION" == -dev* ]]; then
    # Dev version format (-dev0.6.0) - tag as dev-<version> only, no latest
    VERSION="${VERSION:1}"  # Remove leading -
    TAGS="${DOCKERHUB_USERNAME}/${IMAGE_NAME}:${VERSION}"
# Check if we're building dev
elif [ "$VERSION" = "--dev" ] || [ "$VERSION" = "dev" ]; then
    TAGS="${DOCKERHUB_USERNAME}/${IMAGE_NAME}:dev"
    VERSION="dev"
# If version is provided, tag as both version and latest
elif [ "$VERSION" != "latest" ]; then
    TAGS="${DOCKERHUB_USERNAME}/${IMAGE_NAME}:${VERSION} ${DOCKERHUB_USERNAME}/${IMAGE_NAME}:latest"
else
    TAGS="${DOCKERHUB_USERNAME}/${IMAGE_NAME}:latest"
fi

echo "🏗️  ViTransfer Multi-Architecture Build"
echo "========================================"
echo ""

# Check if logged in to Docker Hub
echo "🔑 Checking Docker Hub login..."
if ! docker info | grep -q "Username: ${DOCKERHUB_USERNAME}"; then
    echo "⚠️  Not logged in to Docker Hub"
    echo "Please login:"
    docker login
else
    echo "✅ Logged in to Docker Hub as ${DOCKERHUB_USERNAME}"
fi

echo ""

# Check if buildx is available
echo "🔧 Checking Docker buildx..."
if ! docker buildx version &> /dev/null; then
    echo "❌ Error: Docker buildx is not available"
    echo "   Install with: docker buildx install"
    exit 1
fi
echo "✅ Docker buildx available"

echo ""

# Create or use existing buildx builder
echo "🛠️  Setting up multi-arch builder..."
if ! docker buildx ls | grep -q "multiarch-builder"; then
    echo "Creating new builder: multiarch-builder"
    docker buildx create --name multiarch-builder --driver docker-container --use
else
    echo "Using existing builder: multiarch-builder"
    docker buildx use multiarch-builder
fi

# Inspect builder
docker buildx inspect --bootstrap

echo ""
echo "🏗️  Building multi-architecture image..."
echo "   Version: ${VERSION}"
echo "   Platforms: linux/amd64, linux/arm64"
if [[ "$VERSION" == dev* ]]; then
    echo "   Tags: ${VERSION} (testing only, will NOT update latest)"
elif [ "$VERSION" != "latest" ]; then
    echo "   Tags: ${VERSION}, latest"
else
    echo "   Tags: latest"
fi
echo ""

# Build tag arguments
TAG_ARGS=""
for tag in $TAGS; do
    TAG_ARGS="$TAG_ARGS --tag $tag"
done

# Build and push for both architectures
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --build-arg APP_VERSION="${VERSION}" \
    $TAG_ARGS \
    $NO_CACHE_FLAG \
    --push \
    .

echo ""
echo "✅ Multi-architecture build complete!"
echo ""
echo "📦 Image(s) pushed to Docker Hub:"
for tag in $TAGS; do
    echo "   $tag"
done
echo ""
echo "🔍 Supported architectures:"
echo "   - linux/amd64 (x86_64)"
echo "   - linux/arm64 (aarch64)"
echo ""
if [ "$VERSION" != "latest" ]; then
    echo "📥 Pull specific version:"
    echo "   docker pull ${DOCKERHUB_USERNAME}/${IMAGE_NAME}:${VERSION}"
    echo ""
    echo "📥 Or pull latest:"
fi
echo "   docker pull ${DOCKERHUB_USERNAME}/${IMAGE_NAME}:latest"
echo "   (will automatically select the correct architecture)"
echo ""
echo "🎉 Done!"
