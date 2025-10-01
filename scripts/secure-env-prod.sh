#!/bin/bash

# Secure .env.prod Script
# This script helps secure the current .env.prod file by replacing hardcoded credentials

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_PROD_FILE="$PROJECT_ROOT/.env.prod"
ENV_PROD_BACKUP="$PROJECT_ROOT/.env.prod.backup.$(date +%Y%m%d_%H%M%S)"

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

# Check if .env.prod exists
check_env_file() {
    if [ ! -f "$ENV_PROD_FILE" ]; then
        log_error ".env.prod file not found at $ENV_PROD_FILE"
        exit 1
    fi
    
    log_success "Found .env.prod file"
}

# Backup current .env.prod
backup_env_file() {
    log "Creating backup of current .env.prod..."
    
    cp "$ENV_PROD_FILE" "$ENV_PROD_BACKUP"
    chmod 600 "$ENV_PROD_BACKUP"
    
    log_success "Backup created: $ENV_PROD_BACKUP"
}

# Check for hardcoded credentials
check_hardcoded_creds() {
    log "Checking for hardcoded credentials..."
    
    local issues_found=false
    
    # Check for hardcoded database credentials
    if grep -q "user:password" "$ENV_PROD_FILE"; then
        log_error "Found hardcoded database credentials (user:password)"
        issues_found=true
    fi
    
    if grep -q "POSTGRES_USER=user" "$ENV_PROD_FILE"; then
        log_error "Found hardcoded POSTGRES_USER=user"
        issues_found=true
    fi
    
    if grep -q "POSTGRES_PASSWORD=password" "$ENV_PROD_FILE"; then
        log_error "Found hardcoded POSTGRES_PASSWORD=password"
        issues_found=true
    fi
    
    # Check for default JWT secret
    if grep -q "CHANGE-THIS-TO-A-SECURE-RANDOM-STRING-IN-PRODUCTION" "$ENV_PROD_FILE"; then
        log_error "Found default JWT secret"
        issues_found=true
    fi
    
    # Check for default MinIO credentials
    if grep -q "MINIO_ACCESS_KEY=minioadmin" "$ENV_PROD_FILE"; then
        log_error "Found default MinIO credentials"
        issues_found=true
    fi
    
    if [ "$issues_found" = true ]; then
        log_warning "Hardcoded credentials found - these need to be secured"
        return 1
    else
        log_success "No hardcoded credentials found"
        return 0
    fi
}

# Generate secure credentials
generate_secure_creds() {
    log "Generating secure credentials..."
    
    # Generate secure database password
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
    
    # Generate secure JWT secret
    JWT_SECRET=$(openssl rand -base64 32 | tr -d '\n')
    
    # Generate secure MinIO credentials
    MINIO_ACCESS_KEY=$(openssl rand -base64 32 | tr -d '\n')
    MINIO_SECRET_KEY=$(openssl rand -base64 32 | tr -d '\n')
    
    log_success "Generated secure credentials"
}

# Update .env.prod with secure references
update_env_file() {
    log "Updating .env.prod with secure references..."
    
    # Create temporary file
    local temp_file=$(mktemp)
    
    # Process the file line by line
    while IFS= read -r line; do
        case "$line" in
            "DATABASE_URL=postgresql://user:password@db:5432/ai_chat")
                echo "DATABASE_URL=postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@db:5432/\${POSTGRES_DB}?sslmode=require"
                ;;
            "POSTGRES_USER=user")
                echo "POSTGRES_USER=\${POSTGRES_USER}"
                ;;
            "POSTGRES_PASSWORD=password")
                echo "POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}"
                ;;
            "POSTGRES_DB=ai_chat")
                echo "POSTGRES_DB=\${POSTGRES_DB}"
                ;;
            "JWT_SECRET=CHANGE-THIS-TO-A-SECURE-RANDOM-STRING-IN-PRODUCTION")
                echo "JWT_SECRET=\${JWT_SECRET}"
                ;;
            "MINIO_ACCESS_KEY=minioadmin")
                echo "MINIO_ACCESS_KEY=\${MINIO_ACCESS_KEY}"
                ;;
            "MINIO_SECRET_KEY=minioadmin")
                echo "MINIO_SECRET_KEY=\${MINIO_SECRET_KEY}"
                ;;
            *)
                echo "$line"
                ;;
        esac
    done < "$ENV_PROD_FILE" > "$temp_file"
    
    # Replace original file
    mv "$temp_file" "$ENV_PROD_FILE"
    
    log_success "Updated .env.prod with secure references"
}

# Create secrets file
create_secrets_file() {
    log "Creating secrets file..."
    
    local secrets_file="$PROJECT_ROOT/secrets/production-secrets.txt"
    mkdir -p "$(dirname "$secrets_file")"
    
    cat > "$secrets_file" << EOF
# Production Secrets - Generated on $(date)
# DO NOT commit this file to version control!

# Database credentials
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$DB_PASSWORD
POSTGRES_DB=ai_chat

# JWT secret
JWT_SECRET=$JWT_SECRET

# MinIO credentials
MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY
MINIO_SECRET_KEY=$MINIO_SECRET_KEY

# Redis password (generate if needed)
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')

# External API keys (replace with your actual keys)
OPENAI_API_KEY=your-openai-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
SERP_API_KEY=your-serp-api-key-here
BING_SEARCH_API_KEY=your-bing-search-api-key-here
PINECONE_API_KEY=your-pinecone-api-key-here
HUGGINGFACE_API_KEY=your-huggingface-api-key-here
EOF
    
    chmod 600 "$secrets_file"
    
    log_success "Created secrets file: $secrets_file"
}

# Display next steps
show_next_steps() {
    log "Security update completed!"
    echo
    log "Next steps:"
    echo "1. Review the updated .env.prod file"
    echo "2. Update the secrets file with your actual API keys:"
    echo "   $PROJECT_ROOT/secrets/production-secrets.txt"
    echo "3. Store these secrets in your secure secret store:"
    echo "   - Docker secrets: docker secret create postgres_password - < secrets/production-secrets.txt"
    echo "   - Kubernetes: kubectl create secret generic app-secrets --from-env-file=secrets/production-secrets.txt"
    echo "   - Cloud secrets manager (AWS/Azure/GCP)"
    echo "4. Deploy with secure configuration:"
    echo "   docker-compose -f docker-compose.production-secure.yml --env-file .env.prod up -d"
    echo
    log_warning "IMPORTANT:"
    echo "- Never commit the secrets file to version control"
    echo "- Store secrets in a secure secret store for production"
    echo "- Rotate secrets regularly (every 90 days)"
    echo "- Use different secrets for each environment"
    echo
    log "Files created/modified:"
    echo "- $ENV_PROD_FILE (updated with secure references)"
    echo "- $ENV_PROD_BACKUP (backup of original)"
    echo "- $PROJECT_ROOT/secrets/production-secrets.txt (generated secrets)"
}

# Main execution
main() {
    log "Starting .env.prod security update..."
    
    # Change to project root directory
    cd "$PROJECT_ROOT"
    
    check_env_file
    backup_env_file
    
    if check_hardcoded_creds; then
        log "No hardcoded credentials found - no changes needed"
        exit 0
    fi
    
    generate_secure_creds
    update_env_file
    create_secrets_file
    show_next_steps
    
    log_success "Security update completed successfully!"
}

# Handle script interruption
trap 'log_error "Script interrupted"; exit 1' INT TERM

# Run main function
main "$@"
