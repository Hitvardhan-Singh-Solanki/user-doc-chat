#!/bin/bash

# Setup script for development environment UID/GID
# This script helps configure the correct UID/GID for Docker development
# to avoid permission issues with bind-mounted volumes.

set -e

echo "🔧 Setting up development environment UID/GID..."

# Get current user's UID and GID
CURRENT_UID=$(id -u)
CURRENT_GID=$(id -g)

echo "📋 Current user info:"
echo "   UID: $CURRENT_UID"
echo "   GID: $CURRENT_GID"
echo "   User: $(whoami)"
echo ""

# Check if .env.dev exists
ENV_FILE=".env.dev"
if [ ! -f "$ENV_FILE" ]; then
    echo "⚠️  $ENV_FILE not found. Creating from env.example..."
    cp env.example "$ENV_FILE"
    echo "✅ Created $ENV_FILE from env.example"
fi

# Update UID/GID in .env.dev
echo "🔨 Updating UID/GID in $ENV_FILE..."

# Use sed to update UID and GID in the env file
if grep -q "^UID=" "$ENV_FILE"; then
    sed -i.bak "s/^UID=.*/UID=$CURRENT_UID/" "$ENV_FILE"
else
    echo "UID=$CURRENT_UID" >> "$ENV_FILE"
fi

if grep -q "^GID=" "$ENV_FILE"; then
    sed -i.bak "s/^GID=.*/GID=$CURRENT_GID/" "$ENV_FILE"
else
    echo "GID=$CURRENT_GID" >> "$ENV_FILE"
fi

# Clean up backup files
rm -f "$ENV_FILE.bak"

echo "✅ Updated $ENV_FILE with your UID/GID"
echo ""
echo "🚀 You can now run:"
echo "   docker-compose -f docker-compose.dev.yml up --build"
echo ""
echo "💡 This ensures the container user matches your host user ownership"
echo "   for bind-mounted volumes, preventing permission issues."
