#!/bin/bash

# Generate Secure Secrets Script
# This script generates cryptographically secure secrets for the application

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SECRETS_DIR="./secrets"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if openssl is available
    if ! command -v openssl &> /dev/null; then
        log_error "openssl is required but not installed"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Generate all secrets
generate_secrets() {
    log "Generating secure secrets..."
    
    # Create secrets directory if it doesn't exist
    mkdir -p "$SECRETS_DIR"
    
    # Generate JWT secret
    JWT_SECRET=$(openssl rand -base64 32 | tr -d '\n')
    echo "$JWT_SECRET" > "$SECRETS_DIR/jwt-secret.txt"
    chmod 600 "$SECRETS_DIR/jwt-secret.txt"
    
    # Generate database password
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
    echo "$DB_PASSWORD" > "$SECRETS_DIR/db-password.txt"
    chmod 600 "$SECRETS_DIR/db-password.txt"
    
    # Generate Redis password
    REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
    echo "$REDIS_PASSWORD" > "$SECRETS_DIR/redis-password.txt"
    chmod 600 "$SECRETS_DIR/redis-password.txt"
    
    # Generate MinIO credentials
    MINIO_ACCESS_KEY=$(openssl rand -base64 32 | tr -d '\n')
    echo "$MINIO_ACCESS_KEY" > "$SECRETS_DIR/minio-access-key.txt"
    chmod 600 "$SECRETS_DIR/minio-access-key.txt"
    
    MINIO_SECRET_KEY=$(openssl rand -base64 32 | tr -d '\n')
    echo "$MINIO_SECRET_KEY" > "$SECRETS_DIR/minio-secret-key.txt"
    chmod 600 "$SECRETS_DIR/minio-secret-key.txt"
    
    # Generate Grafana admin password
    GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
    echo "$GRAFANA_ADMIN_PASSWORD" > "$SECRETS_DIR/grafana-admin-password.txt"
    chmod 600 "$SECRETS_DIR/grafana-admin-password.txt"
    
    log_success "Generated all secrets"
}

# Display secrets summary
display_summary() {
    log "Secrets generated successfully!"
    echo
    log "Generated secrets (first 8 characters shown for verification):"
    echo "  JWT Secret: $(head -c 8 "$SECRETS_DIR/jwt-secret.txt")..."
    echo "  DB Password: $(head -c 8 "$SECRETS_DIR/db-password.txt")..."
    echo "  Redis Password: $(head -c 8 "$SECRETS_DIR/redis-password.txt")..."
    echo "  MinIO Access Key: $(head -c 8 "$SECRETS_DIR/minio-access-key.txt")..."
    echo "  MinIO Secret Key: $(head -c 8 "$SECRETS_DIR/minio-secret-key.txt")..."
    echo "  Grafana Admin Password: $(head -c 8 "$SECRETS_DIR/grafana-admin-password.txt")..."
    echo
    log "Files created:"
    ls -la "$SECRETS_DIR"/*.txt
    echo
    log_warning "IMPORTANT: Store these secrets securely and never commit them to version control!"
    log "The secrets/ directory is already in .gitignore"
}

# Generate environment file template
generate_env_template() {
    log "Generating environment file template..."
    
    cat > "$PROJECT_ROOT/.env.production.template" << EOF
# Production Environment Configuration
# Generated on $(date)
# DO NOT commit this file to version control!

# Application configuration
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database configuration
DATABASE_URL=postgresql://postgres:\$(cat secrets/db-password.txt)@postgres:5432/user_doc_chat_prod?sslmode=require
DB_HOST=postgres
DB_PORT=5432
DB_NAME=user_doc_chat_prod
DB_USER=postgres
DB_PASSWORD=\$(cat secrets/db-password.txt)

# Redis configuration
REDIS_URL=redis://:\$(cat secrets/redis-password.txt)@redis:6379
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=\$(cat secrets/redis-password.txt)

# JWT configuration
JWT_SECRET=\$(cat secrets/jwt-secret.txt)
JWT_EXPIRES_IN=3600

# Storage configuration
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=\$(cat secrets/minio-access-key.txt)
MINIO_SECRET_KEY=\$(cat secrets/minio-secret-key.txt)
MINIO_USE_SSL=false
S3_BUCKET=user-doc-chat-prod

# External API keys (replace with your actual keys)
OPENAI_API_KEY=your-openai-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
SERP_API_KEY=your-serp-api-key-here
BING_SEARCH_API_KEY=your-bing-search-api-key-here
BING_SEARCH_ENDPOINT=https://api.bing.microsoft.com/v7.0/search

# Security configuration
CORS_ORIGIN=https://your-production-domain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Monitoring
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001
GRAFANA_ADMIN_PASSWORD=\$(cat secrets/grafana-admin-password.txt)
EOF
    
    log_success "Generated .env.production.template"
}

# Main execution
main() {
    log "Starting secure secrets generation..."
    
    # Change to project root directory
    cd "$PROJECT_ROOT"
    
    check_prerequisites
    generate_secrets
    display_summary
    generate_env_template
    
    echo
    log_success "Secrets generation completed successfully!"
    echo
    log "Next steps:"
    log "1. Update API keys in .env.production.template with your actual values"
    log "2. Copy .env.production.template to .env.production"
    log "3. Deploy with: docker-compose -f docker-compose.production-secure.yml --env-file .env.production up -d"
    echo
    log_warning "Remember to store these secrets securely and rotate them regularly!"
}

# Handle script interruption
trap 'log_error "Script interrupted"; exit 1' INT TERM

# Run main function
main "$@"
