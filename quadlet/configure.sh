#!/bin/bash

# ViTransfer Quadlet Configuration Script
# This script helps you configure the Quadlet files with your secrets

set -e

echo "🔧 ViTransfer Quadlet Configuration"
echo "===================================="
echo ""

# Check if openssl is available
if ! command -v openssl &> /dev/null; then
    echo "❌ Error: openssl is required but not installed."
    exit 1
fi

# Generate secrets
echo "🔑 Generating secure secrets..."
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
SHARE_TOKEN_SECRET=$(openssl rand -hex 32)
echo "✅ Secrets generated"
echo ""

# Ask for domain
read -p "🌐 Enter your domain (e.g., https://vitransfer.example.com) [http://localhost:4321]: " DOMAIN
DOMAIN=${DOMAIN:-http://localhost:4321}

# Ask for admin credentials (REQUIRED)
echo "Admin credentials are REQUIRED for initial setup:"
while true; do
    read -p "Enter admin email: " ADMIN_EMAIL
    if [[ -n "$ADMIN_EMAIL" && "$ADMIN_EMAIL" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; then
        break
    else
        echo "Invalid email format. Please try again."
    fi
done

while true; do
    read -sp "Enter admin password (min 8 characters): " ADMIN_PASSWORD
    echo ""
    if [[ ${#ADMIN_PASSWORD} -ge 8 ]]; then
        break
    else
        echo "Password must be at least 8 characters. Please try again."
    fi
done

read -p "Enter admin display name [Admin]: " ADMIN_NAME
ADMIN_NAME=${ADMIN_NAME:-Admin}

# Ask for port
read -p "🔌 Enter port to expose [4321]: " APP_PORT
APP_PORT=${APP_PORT:-4321}

echo ""
echo "📝 Configuration Summary:"
echo "  Domain: ${DOMAIN}"
echo "  Admin Email: ${ADMIN_EMAIL}"
echo "  Admin Name: ${ADMIN_NAME}"
echo "  Port: ${APP_PORT}"
echo ""

read -p "Continue with configuration? (yes/no) [yes]: " CONFIRM
CONFIRM=${CONFIRM:-yes}

if [[ "$CONFIRM" != "yes" && "$CONFIRM" != "y" ]]; then
    echo "❌ Configuration cancelled"
    exit 0
fi

echo ""
echo "🔧 Configuring Quadlet files..."

# Configure postgres
sed -i.bak "s#CHANGE_THIS_PASSWORD#${POSTGRES_PASSWORD}#g" vitransfer-postgres.container
echo "✅ Configured vitransfer-postgres.container"

# Configure redis
sed -i.bak "s#CHANGE_THIS_PASSWORD#${REDIS_PASSWORD}#g" vitransfer-redis.container
echo "✅ Configured vitransfer-redis.container"

# Configure app
sed -i.bak \
    -e "s#CHANGE_POSTGRES_PASSWORD#${POSTGRES_PASSWORD}#g" \
    -e "s#CHANGE_REDIS_PASSWORD#${REDIS_PASSWORD}#g" \
    -e "s#CHANGE_THIS_64_CHAR_HEX_KEY_USE_OPENSSL_RAND_HEX_32#${ENCRYPTION_KEY}#g" \
    -e "s#CHANGE_THIS_SECRET#${JWT_SECRET}#g" \
    -e "s#CHANGE_THIS_SHARE_SECRET#${SHARE_TOKEN_SECRET}#g" \
    -e "s#CHANGE_THIS_REFRESH_SECRET#${JWT_REFRESH_SECRET}#g" \
    -e "s#http://localhost:4321#${DOMAIN}#g" \
    -e "s#CHANGE_THIS_ADMIN_EMAIL#${ADMIN_EMAIL}#g" \
    -e "s#CHANGE_THIS_ADMIN_PASSWORD#${ADMIN_PASSWORD}#g" \
    -e "s#Environment=ADMIN_NAME=Admin#Environment=ADMIN_NAME=${ADMIN_NAME}#g" \
    -e "s#4321:4321#${APP_PORT}:4321#g" \
    vitransfer-app.container
echo "✅ Configured vitransfer-app.container"

# Configure worker
sed -i.bak \
    -e "s#CHANGE_POSTGRES_PASSWORD#${POSTGRES_PASSWORD}#g" \
    -e "s#CHANGE_REDIS_PASSWORD#${REDIS_PASSWORD}#g" \
    -e "s#CHANGE_THIS_64_CHAR_HEX_KEY_USE_OPENSSL_RAND_HEX_32#${ENCRYPTION_KEY}#g" \
    -e "s#CHANGE_THIS_SECRET#${JWT_SECRET}#g" \
    -e "s#CHANGE_THIS_SHARE_SECRET#${SHARE_TOKEN_SECRET}#g" \
    -e "s#CHANGE_THIS_REFRESH_SECRET#${JWT_REFRESH_SECRET}#g" \
    vitransfer-worker.container
echo "✅ Configured vitransfer-worker.container"

# Save secrets to file
cat > .secrets << EOF
# ViTransfer Secrets - KEEP THIS FILE SECURE!
# Generated: $(date)

POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
SHARE_TOKEN_SECRET=${SHARE_TOKEN_SECRET}

DOMAIN=${DOMAIN}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_NAME=${ADMIN_NAME}
APP_PORT=${APP_PORT}
EOF

chmod 600 .secrets
echo ""
echo "✅ Configuration complete!"
echo ""
echo "📄 Secrets saved to: .secrets"
echo "⚠️  IMPORTANT: Keep this file secure! It contains all your passwords."
echo ""
echo "📦 Next steps:"
echo "  1. Review the configured *.container files"
echo "  2. Copy files to systemd directory:"
echo "     sudo cp *.container *.volume *.network /etc/containers/systemd/"
echo "  3. Reload systemd:"
echo "     sudo systemctl daemon-reload"
echo "  4. Pull the image:"
echo "     podman pull docker.io/crypt010/vitransfer:latest"
echo "  5. Start services:"
echo "     sudo systemctl start vitransfer-postgres.service"
echo "     sudo systemctl start vitransfer-redis.service"
echo "     sudo systemctl start vitransfer-app.service"
echo "     sudo systemctl start vitransfer-worker.service"
echo ""
echo "🎉 Done!"
