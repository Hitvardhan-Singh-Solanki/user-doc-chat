#!/bin/bash

# Security Scripts
# Consolidated security utilities

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Rotate credentials
rotate_credentials() {
    log "Rotating credentials..."
    
    # Backup current credentials
    mkdir -p secrets/backup-$(date +%Y%m%d_%H%M%S)
    
    # Generate new credentials
    openssl rand -base64 32 > secrets/db-password-new.txt
    openssl rand -base64 32 > secrets/redis-password-new.txt
    
    # Update Kubernetes secrets if available
    if command -v kubectl >/dev/null && kubectl cluster-info >/dev/null 2>&1; then
        kubectl patch secret app-secrets --type='json' -p='[{"op": "replace", "path": "/data/db-password", "value": "'$(cat secrets/db-password-new.txt | base64)'"}]'
        success "Kubernetes secrets updated"
    fi
    
    # Move new credentials to current
    mv secrets/db-password-new.txt secrets/db-password.txt
    mv secrets/redis-password-new.txt secrets/redis-password.txt
    
    success "Credentials rotated"
}

# Setup Kubernetes secrets
setup_k8s_secrets() {
    log "Setting up Kubernetes secrets..."
    
    if ! command -v kubectl >/dev/null; then
        error "kubectl not found"
        exit 1
    fi
    
    # Create namespace
    kubectl create namespace user-doc-chat-production --dry-run=client -o yaml | kubectl apply -f -
    
    # Create secrets
    kubectl create secret generic app-secrets \
        --from-literal=db-password=$(cat secrets/db-password.txt) \
        --from-literal=redis-password=$(cat secrets/redis-password.txt) \
        --from-literal=jwt-secret=$(cat secrets/jwt-secret.txt) \
        --namespace=user-doc-chat-production \
        --dry-run=client -o yaml | kubectl apply -f -
    
    success "Kubernetes secrets configured"
}

# Secure production environment
secure_prod() {
    log "Securing production environment..."
    
    # Set secure file permissions
    chmod 600 secrets/*.txt
    chmod 700 secrets/
    
    # Remove development files
    rm -f .env.local
    rm -f .env.development
    
    success "Production environment secured"
}

# Audit security
audit() {
    log "Running security audit..."
    
    # Check for hardcoded secrets
    if grep -r "password.*=" src/ --exclude-dir=node_modules; then
        warning "Potential hardcoded passwords found"
    fi
    
    # Check file permissions
    if [ -d "secrets" ]; then
        if [ "$(stat -c %a secrets)" != "700" ]; then
            warning "Secrets directory permissions are not secure"
        fi
    fi
    
    success "Security audit completed"
}

# Show help
show_help() {
    echo "Usage: $0 [command]"
    echo
    echo "Commands:"
    echo "  rotate     - Rotate credentials"
    echo "  k8s        - Setup Kubernetes secrets"
    echo "  secure     - Secure production environment"
    echo "  audit      - Run security audit"
    echo "  help       - Show this help"
}

# Main
case "${1:-help}" in
    "rotate")
        rotate_credentials
        ;;
    "k8s")
        setup_k8s_secrets
        ;;
    "secure")
        secure_prod
        ;;
    "audit")
        audit
        ;;
    "help"|*)
        show_help
        ;;
esac
