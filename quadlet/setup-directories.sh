#!/bin/bash

# ViTransfer Directory Setup Script
# Creates the required directory structure for ViTransfer

set -e

echo "📁 ViTransfer Directory Setup"
echo "=============================="
echo ""

BASE_DIR="/podman/vitransfer"
CONTAINER_DIR="/home/hsadmin/.config/containers/systemd"

# Check if running as hsadmin or root
CURRENT_USER=$(whoami)
if [[ "$CURRENT_USER" != "hsadmin" ]] && [[ $EUID -ne 0 ]]; then
    echo "⚠️  Warning: This script should be run as hsadmin or root"
    echo "   Current user: $CURRENT_USER"
    read -p "Continue anyway? (yes/no) [no]: " CONTINUE
    if [[ "$CONTINUE" != "yes" ]]; then
        exit 1
    fi
fi

echo "Creating directory structure..."
echo ""

# Create base directory
if [[ ! -d "$BASE_DIR" ]]; then
    echo "  Creating: $BASE_DIR"
    sudo mkdir -p "$BASE_DIR"
else
    echo "  ✅ Exists: $BASE_DIR"
fi

# Create subdirectories
echo "  Creating: $BASE_DIR/postgres-data"
sudo mkdir -p "$BASE_DIR/postgres-data"

echo "  Creating: $BASE_DIR/redis-data"
sudo mkdir -p "$BASE_DIR/redis-data"

echo "  Creating: $BASE_DIR/uploads"
sudo mkdir -p "$BASE_DIR/uploads"

echo ""
echo "Setting ownership to hsadmin (1000:1000)..."
sudo chown -R 1000:1000 "$BASE_DIR"

echo ""
echo "Setting permissions..."
sudo chmod -R 755 "$BASE_DIR"

# PostgreSQL data needs specific permissions
sudo chmod 700 "$BASE_DIR/postgres-data"

echo ""
echo "Creating container config directory..."
if [[ ! -d "$CONTAINER_DIR" ]]; then
    echo "  Creating: $CONTAINER_DIR"
    mkdir -p "$CONTAINER_DIR"
else
    echo "  ✅ Exists: $CONTAINER_DIR"
fi

echo ""
echo "✅ Directory structure created!"
echo ""
echo "📋 Directory tree:"
tree -L 2 "$BASE_DIR" 2>/dev/null || find "$BASE_DIR" -maxdepth 2 -print
echo ""
echo "Container config: $CONTAINER_DIR"
echo ""
echo "🔑 Ownership:"
ls -la "$BASE_DIR"
echo ""
echo "🎯 Next steps:"
echo "  1. Configure secrets: ./configure.sh"
echo "  2. Install to systemd: ./install.sh"
echo ""
echo "🎉 Setup complete!"
