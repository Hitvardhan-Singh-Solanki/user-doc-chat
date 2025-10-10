#!/bin/bash

# Create non-root user for security with dynamic UID/GID
# Handle existing group and user with same UID/GID

set -e

UID=${1:-1000}
GID=${2:-1000}

# Handle existing group with same GID
if getent group $GID >/dev/null 2>&1; then
    GROUP_NAME=$(getent group $GID | cut -d: -f1)
    if [ "$GROUP_NAME" != "appuser" ]; then
        groupmod -n appuser $GROUP_NAME
    fi
else
    groupadd -g $GID appuser
fi

# Handle existing user with same UID
if getent passwd $UID >/dev/null 2>&1; then
    EXISTING_USER=$(getent passwd $UID | cut -d: -f1)
    if [ "$EXISTING_USER" != "appuser" ]; then
        usermod -l appuser $EXISTING_USER
    fi
else
    useradd -u $UID -g appuser appuser
fi

echo "User setup completed successfully"
