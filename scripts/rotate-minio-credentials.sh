#!/bin/bash

# MinIO Credential Rotation Script
# This script generates new secure MinIO credentials and updates the deployment
# Use this script if default credentials (minioadmin/minioadmin) were used in production

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SECRETS_DIR="./secrets"
BACKUP_DIR="./secrets/backup"
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

# Check if running as root (not recommended)
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_warning "Running as root is not recommended for security reasons"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if openssl is available
    if ! command -v openssl &> /dev/null; then
        log_error "openssl is required but not installed"
        exit 1
    fi
    
    # Check if docker is available
    if ! command -v docker &> /dev/null; then
        log_error "docker is required but not installed"
        exit 1
    fi
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null; then
        log_error "docker-compose is required but not installed"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Create backup of existing credentials
backup_existing_credentials() {
    log "Creating backup of existing credentials..."
    
    mkdir -p "$BACKUP_DIR"
    
    if [[ -f "$SECRETS_DIR/minio-access-key.txt" ]]; then
        cp "$SECRETS_DIR/minio-access-key.txt" "$BACKUP_DIR/minio-access-key.txt.$(date +%Y%m%d_%H%M%S)"
        log_success "Backed up existing access key"
    fi
    
    if [[ -f "$SECRETS_DIR/minio-secret-key.txt" ]]; then
        cp "$SECRETS_DIR/minio-secret-key.txt" "$BACKUP_DIR/minio-secret-key.txt.$(date +%Y%m%d_%H%M%S)"
        log_success "Backed up existing secret key"
    fi
}

# Generate new secure credentials
generate_new_credentials() {
    log "Generating new secure MinIO credentials..."
    
    # Create secrets directory if it doesn't exist
    mkdir -p "$SECRETS_DIR"
    
    # Generate new access key (32 bytes base64 encoded)
    NEW_ACCESS_KEY=$(openssl rand -base64 32 | tr -d '\n')
    echo "$NEW_ACCESS_KEY" > "$SECRETS_DIR/minio-access-key.txt"
    chmod 600 "$SECRETS_DIR/minio-access-key.txt"
    
    # Generate new secret key (32 bytes base64 encoded)
    NEW_SECRET_KEY=$(openssl rand -base64 32 | tr -d '\n')
    echo "$NEW_SECRET_KEY" > "$SECRETS_DIR/minio-secret-key.txt"
    chmod 600 "$SECRETS_DIR/minio-secret-key.txt"
    
    log_success "Generated new MinIO credentials"
    log "New Access Key: ${NEW_ACCESS_KEY:0:8}... (truncated for security)"
    log "New Secret Key: ${NEW_SECRET_KEY:0:8}... (truncated for security)"
}

# Update MinIO configuration in running containers
update_minio_config() {
    log "Updating MinIO configuration..."
    
    # Check if MinIO container is running
    if docker ps --format "table {{.Names}}" | grep -q "minio"; then
        log_warning "MinIO container is running. You may need to restart it manually."
        log "To restart MinIO with new credentials:"
        log "  docker-compose -f docker-compose.production-secure.yml restart minio"
    fi
    
    # Check if using Docker Swarm
    if docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -q "active"; then
        log "Docker Swarm detected. Updating secrets..."
        
        # Remove old secrets
        docker secret rm minio_access_key 2>/dev/null || true
        docker secret rm minio_secret_key 2>/dev/null || true
        
        # Create new secrets
        cat "$SECRETS_DIR/minio-access-key.txt" | docker secret create minio_access_key -
        cat "$SECRETS_DIR/minio-secret-key.txt" | docker secret create minio_secret_key -
        
        log_success "Updated Docker Swarm secrets"
    fi
}

# Verify new credentials
verify_credentials() {
    log "Verifying new credentials..."
    
    if [[ ! -f "$SECRETS_DIR/minio-access-key.txt" ]] || [[ ! -f "$SECRETS_DIR/minio-secret-key.txt" ]]; then
        log_error "Credential files not found"
        exit 1
    fi
    
    ACCESS_KEY=$(cat "$SECRETS_DIR/minio-access-key.txt")
    SECRET_KEY=$(cat "$SECRETS_DIR/minio-secret-key.txt")
    
    # Check if credentials are not empty
    if [[ -z "$ACCESS_KEY" ]] || [[ -z "$SECRET_KEY" ]]; then
        log_error "Generated credentials are empty"
        exit 1
    fi
    
    # Check if credentials are not the default values
    if [[ "$ACCESS_KEY" == "minioadmin" ]] || [[ "$SECRET_KEY" == "minioadmin" ]]; then
        log_error "Generated credentials are still using default values"
        exit 1
    fi
    
    log_success "Credential verification passed"
}

# Clean up old data (optional)
cleanup_old_data() {
    log_warning "This will remove all MinIO data. Only use this if you want to start fresh."
    read -p "Do you want to remove existing MinIO data? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log "Removing MinIO data volume..."
        docker volume rm user-doc-chat_minio_data 2>/dev/null || true
        log_success "MinIO data volume removed"
    else
        log "Skipping data cleanup"
    fi
}

# Main execution
main() {
    log "Starting MinIO credential rotation..."
    
    # Change to project root directory
    cd "$PROJECT_ROOT"
    
    check_root
    check_prerequisites
    backup_existing_credentials
    generate_new_credentials
    verify_credentials
    update_minio_config
    
    log_success "MinIO credential rotation completed successfully!"
    
    echo
    log "Next steps:"
    log "1. Restart MinIO container: docker-compose -f docker-compose.production-secure.yml restart minio"
    log "2. Restart application container: docker-compose -f docker-compose.production-secure.yml restart app"
    log "3. Test MinIO connectivity with new credentials"
    log "4. Update any external systems that use MinIO credentials"
    log "5. Consider rotating other secrets (JWT, database passwords, etc.)"
    
    echo
    log_warning "IMPORTANT: Store the new credentials securely and update your deployment documentation!"
    log "Backup location: $BACKUP_DIR"
}

# Handle script interruption
trap 'log_error "Script interrupted"; exit 1' INT TERM

# Run main function
main "$@"
