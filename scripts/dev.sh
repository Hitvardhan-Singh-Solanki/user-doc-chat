#!/bin/bash

# Development Scripts
# Consolidated development utilities

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

# Generate secrets
generate_secrets() {
    log "Generating secrets..."
    mkdir -p secrets
    
    # JWT Secret
    openssl rand -base64 32 > secrets/jwt-secret.txt
    chmod 600 secrets/jwt-secret.txt
    
    # DB Password
    openssl rand -base64 32 > secrets/db-password.txt
    chmod 600 secrets/db-password.txt
    
    # Redis Password
    openssl rand -base64 32 > secrets/redis-password.txt
    chmod 600 secrets/redis-password.txt
    
    success "Secrets generated in secrets/ directory"
}

# Generate dev certificates
generate_certs() {
    log "Generating development certificates..."
    
    mkdir -p certs
    openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
    
    success "Development certificates generated in certs/"
}

# Setup development environment
setup_dev() {
    log "Setting up development environment..."
    
    # Install dependencies
    npm install
    
    # Generate secrets if they don't exist
    if [ ! -f "secrets/jwt-secret.txt" ]; then
        generate_secrets
    fi
    
    # Generate certificates if they don't exist
    if [ ! -f "certs/cert.pem" ]; then
        generate_certs
    fi
    
    success "Development environment ready"
}

# Run tests
run_tests() {
    log "Running tests..."
    npm run test:all
    success "All tests passed"
}

# Build application
build() {
    log "Building application..."
    npm run build
    success "Application built"
}

# Show help
show_help() {
    echo "Usage: $0 [command]"
    echo
    echo "Commands:"
    echo "  setup     - Setup development environment"
    echo "  secrets   - Generate secrets"
    echo "  certs     - Generate development certificates"
    echo "  test      - Run tests"
    echo "  build     - Build application"
    echo "  help      - Show this help"
}

# Main
case "${1:-help}" in
    "setup")
        setup_dev
        ;;
    "secrets")
        generate_secrets
        ;;
    "certs")
        generate_certs
        ;;
    "test")
        run_tests
        ;;
    "build")
        build
        ;;
    "help"|*)
        show_help
        ;;
esac
