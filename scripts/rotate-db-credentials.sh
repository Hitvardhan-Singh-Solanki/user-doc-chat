#!/bin/bash

# Database Credentials Rotation Script
# This script helps rotate database credentials securely in production

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
SECRETS_DIR="$PROJECT_ROOT/secrets"

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
    
    # Check if kubectl is available (for Kubernetes deployments)
    if command -v kubectl &> /dev/null; then
        KUBECTL_AVAILABLE=true
    else
        KUBECTL_AVAILABLE=false
        log_warning "kubectl not found - Kubernetes secret rotation will be skipped"
    fi
    
    # Check if docker is available (for Docker Swarm deployments)
    if command -v docker &> /dev/null; then
        DOCKER_AVAILABLE=true
    else
        DOCKER_AVAILABLE=false
        log_warning "docker not found - Docker secret rotation will be skipped"
    fi
    
    log_success "Prerequisites check completed"
}

# Generate new database credentials
generate_new_credentials() {
    log "Generating new database credentials..."
    
    # Create secrets directory if it doesn't exist
    mkdir -p "$SECRETS_DIR"
    
    # Generate new database password
    NEW_DB_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
    echo "$NEW_DB_PASSWORD" > "$SECRETS_DIR/db-password-new.txt"
    chmod 600 "$SECRETS_DIR/db-password-new.txt"
    
    # Generate new database user (optional - usually keep same user)
    NEW_DB_USER="postgres"
    echo "$NEW_DB_USER" > "$SECRETS_DIR/db-user-new.txt"
    chmod 600 "$SECRETS_DIR/db-user-new.txt"
    
    log_success "Generated new database credentials"
}

# Backup current credentials
backup_current_credentials() {
    log "Backing up current credentials..."
    
    BACKUP_DIR="$SECRETS_DIR/backup-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Backup existing credentials if they exist
    if [ -f "$SECRETS_DIR/db-password.txt" ]; then
        cp "$SECRETS_DIR/db-password.txt" "$BACKUP_DIR/db-password-old.txt"
    fi
    
    if [ -f "$SECRETS_DIR/db-user.txt" ]; then
        cp "$SECRETS_DIR/db-user.txt" "$BACKUP_DIR/db-user-old.txt"
    fi
    
    log_success "Credentials backed up to: $BACKUP_DIR"
}

# Update Docker secrets
update_docker_secrets() {
    if [ "$DOCKER_AVAILABLE" = false ]; then
        log_warning "Skipping Docker secret update - Docker not available"
        return
    fi
    
    log "Updating Docker secrets..."
    
    # Check if we're in a Docker Swarm
    if docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -q "active"; then
        # Update Docker Swarm secrets
        NEW_PASSWORD=$(cat "$SECRETS_DIR/db-password-new.txt")
        
        # Create new secret
        echo "$NEW_PASSWORD" | docker secret create postgres_password_new -
        
        log_success "Created new Docker secret: postgres_password_new"
        log_warning "Manual step required: Update docker-compose.yml to use postgres_password_new"
        log_warning "After verification, remove old secret: docker secret rm postgres_password"
    else
        log_warning "Docker Swarm not active - skipping Docker secret update"
    fi
}

# Update Kubernetes secrets
update_k8s_secrets() {
    if [ "$KUBECTL_AVAILABLE" = false ]; then
        log_warning "Skipping Kubernetes secret update - kubectl not available"
        return
    fi
    
    log "Updating Kubernetes secrets..."
    
    # Check if we can connect to Kubernetes cluster
    if ! kubectl cluster-info &> /dev/null; then
        log_warning "Cannot connect to Kubernetes cluster - skipping K8s secret update"
        return
    fi
    
    NEW_PASSWORD=$(cat "$SECRETS_DIR/db-password-new.txt")
    NEW_USER=$(cat "$SECRETS_DIR/db-user-new.txt")
    
    # Update the secret
    kubectl patch secret app-secrets \
        --type='json' \
        -p='[{"op": "replace", "path": "/data/db-password", "value": "'$(echo -n "$NEW_PASSWORD" | base64)'"}]'
    
    kubectl patch secret app-secrets \
        --type='json' \
        -p='[{"op": "replace", "path": "/data/db-user", "value": "'$(echo -n "$NEW_USER" | base64)'"}]'
    
    log_success "Updated Kubernetes secrets"
}

# Update local secret files
update_local_secrets() {
    log "Updating local secret files..."
    
    # Move new credentials to current
    mv "$SECRETS_DIR/db-password-new.txt" "$SECRETS_DIR/db-password.txt"
    mv "$SECRETS_DIR/db-user-new.txt" "$SECRETS_DIR/db-user.txt"
    
    log_success "Updated local secret files"
}

# Test database connection
test_db_connection() {
    log "Testing database connection with new credentials..."
    
    # This is a placeholder - implement actual database connection test
    # based on your database setup (PostgreSQL, MySQL, etc.)
    
    NEW_PASSWORD=$(cat "$SECRETS_DIR/db-password.txt")
    NEW_USER=$(cat "$SECRETS_DIR/db-user.txt")
    
    log "New credentials:"
    log "  User: $NEW_USER"
    log "  Password: ${NEW_PASSWORD:0:8}..."
    
    log_warning "Manual verification required: Test database connection with new credentials"
    log_warning "Example: psql -h localhost -U $NEW_USER -d your_database"
}

# Rollback function
rollback() {
    log_error "Rolling back credential changes..."
    
    BACKUP_DIR=$(ls -t "$SECRETS_DIR"/backup-* 2>/dev/null | head -1)
    
    if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
        if [ -f "$BACKUP_DIR/db-password-old.txt" ]; then
            cp "$BACKUP_DIR/db-password-old.txt" "$SECRETS_DIR/db-password.txt"
        fi
        
        if [ -f "$BACKUP_DIR/db-user-old.txt" ]; then
            cp "$BACKUP_DIR/db-user-old.txt" "$SECRETS_DIR/db-user.txt"
        fi
        
        log_success "Rolled back to previous credentials"
    else
        log_error "No backup found for rollback"
    fi
}

# Cleanup function
cleanup() {
    log "Cleaning up temporary files..."
    
    # Remove temporary files
    rm -f "$SECRETS_DIR/db-password-new.txt" "$SECRETS_DIR/db-user-new.txt"
    
    log_success "Cleanup completed"
}

# Show usage
show_usage() {
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  rotate     - Rotate database credentials (default)"
    echo "  test       - Test database connection with current credentials"
    echo "  rollback   - Rollback to previous credentials"
    echo "  help       - Show this help message"
    echo
    echo "Examples:"
    echo "  $0 rotate          # Rotate credentials"
    echo "  $0 test            # Test connection"
    echo "  $0 rollback        # Rollback changes"
    echo
}

# Main execution
main() {
    local command="${1:-rotate}"
    
    # Change to project root directory
    cd "$PROJECT_ROOT"
    
    case "$command" in
        "rotate")
            log "Starting database credential rotation..."
            
            check_prerequisites
            backup_current_credentials
            generate_new_credentials
            update_local_secrets
            update_docker_secrets
            update_k8s_secrets
            test_db_connection
            
            log_success "Database credential rotation completed!"
            echo
            log "Next steps:"
            log "1. Verify application functionality with new credentials"
            log "2. Update any external systems that use these credentials"
            log "3. Remove old credentials from secret stores after verification"
            log "4. Update monitoring and alerting systems if needed"
            echo
            log_warning "IMPORTANT: Keep backup files until you're confident the new credentials work!"
            ;;
        "test")
            check_prerequisites
            test_db_connection
            ;;
        "rollback")
            rollback
            ;;
        "help"|*)
            show_usage
            ;;
    esac
}

# Handle script interruption
trap 'log_error "Script interrupted"; cleanup; exit 1' INT TERM

# Run main function
main "$@"
