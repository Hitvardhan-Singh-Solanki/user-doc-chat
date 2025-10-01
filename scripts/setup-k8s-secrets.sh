#!/bin/bash

# Kubernetes Secrets Setup Script
# This script helps create and manage Kubernetes secrets for the application

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="user-doc-chat"
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
    
    # Check if kubectl is available
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is required but not installed"
        exit 1
    fi
    
    # Check if openssl is available
    if ! command -v openssl &> /dev/null; then
        log_error "openssl is required but not installed"
        exit 1
    fi
    
    # Check kubectl connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Create namespace
create_namespace() {
    log "Creating namespace: $NAMESPACE"
    
    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_warning "Namespace $NAMESPACE already exists"
    else
        kubectl create namespace "$NAMESPACE"
        log_success "Created namespace: $NAMESPACE"
    fi
}

# Generate secure credentials
generate_credentials() {
    log "Generating secure credentials..."
    
    # Generate all required secrets
    JWT_SECRET=$(openssl rand -base64 32)
    DB_PASSWORD=$(openssl rand -base64 32)
    REDIS_PASSWORD=$(openssl rand -base64 32)
    MINIO_ACCESS_KEY=$(openssl rand -base64 32)
    MINIO_SECRET_KEY=$(openssl rand -base64 32)
    GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 32)
    
    # Store in environment for later use
    export JWT_SECRET DB_PASSWORD REDIS_PASSWORD MINIO_ACCESS_KEY MINIO_SECRET_KEY GRAFANA_ADMIN_PASSWORD
    
    log_success "Generated secure credentials"
}

# Create application secrets
create_app_secrets() {
    log "Creating application secrets..."
    
    # Create app-secrets
    kubectl create secret generic app-secrets \
        --namespace="$NAMESPACE" \
        --from-literal=jwt-secret="$JWT_SECRET" \
        --from-literal=db-password="$DB_PASSWORD" \
        --from-literal=redis-password="$REDIS_PASSWORD" \
        --from-literal=minio-access-key="$MINIO_ACCESS_KEY" \
        --from-literal=minio-secret-key="$MINIO_SECRET_KEY" \
        --from-literal=grafana-admin-password="$GRAFANA_ADMIN_PASSWORD" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    log_success "Created app-secrets"
}

# Create API keys secrets (with placeholders)
create_api_secrets() {
    log "Creating API keys secrets..."
    
    # Create placeholder API keys (user must update these)
    kubectl create secret generic api-keys \
        --namespace="$NAMESPACE" \
        --from-literal=openai-api-key="your-openai-api-key-here" \
        --from-literal=anthropic-api-key="your-anthropic-api-key-here" \
        --from-literal=serp-api-key="your-serp-api-key-here" \
        --from-literal=bing-search-api-key="your-bing-search-api-key-here" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    log_success "Created api-keys (with placeholders)"
    log_warning "IMPORTANT: Update API keys with actual values!"
}

# Update API keys
update_api_keys() {
    log "Updating API keys..."
    
    read -p "Enter OpenAI API Key: " -s OPENAI_KEY
    echo
    read -p "Enter Anthropic API Key: " -s ANTHROPIC_KEY
    echo
    read -p "Enter SERP API Key: " -s SERP_KEY
    echo
    read -p "Enter Bing Search API Key: " -s BING_KEY
    echo
    
    # Update secrets
    kubectl patch secret api-keys \
        --namespace="$NAMESPACE" \
        --type='json' \
        -p='[{"op": "replace", "path": "/data/openai-api-key", "value": "'$(echo -n "$OPENAI_KEY" | base64)'"}]'
    
    kubectl patch secret api-keys \
        --namespace="$NAMESPACE" \
        --type='json' \
        -p='[{"op": "replace", "path": "/data/anthropic-api-key", "value": "'$(echo -n "$ANTHROPIC_KEY" | base64)'"}]'
    
    kubectl patch secret api-keys \
        --namespace="$NAMESPACE" \
        --type='json' \
        -p='[{"op": "replace", "path": "/data/serp-api-key", "value": "'$(echo -n "$SERP_KEY" | base64)'"}]'
    
    kubectl patch secret api-keys \
        --namespace="$NAMESPACE" \
        --type='json' \
        -p='[{"op": "replace", "path": "/data/bing-search-api-key", "value": "'$(echo -n "$BING_KEY" | base64)'"}]'
    
    log_success "Updated API keys"
}

# List secrets
list_secrets() {
    log "Listing secrets in namespace: $NAMESPACE"
    
    kubectl get secrets --namespace="$NAMESPACE"
}

# Delete secrets
delete_secrets() {
    log_warning "This will delete all secrets in namespace: $NAMESPACE"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kubectl delete secret app-secrets --namespace="$NAMESPACE" || true
        kubectl delete secret api-keys --namespace="$NAMESPACE" || true
        log_success "Deleted secrets"
    else
        log "Cancelled"
    fi
}

# Backup secrets
backup_secrets() {
    log "Backing up secrets..."
    
    BACKUP_DIR="$PROJECT_ROOT/secrets/k8s-backup-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    kubectl get secret app-secrets --namespace="$NAMESPACE" -o yaml > "$BACKUP_DIR/app-secrets.yaml"
    kubectl get secret api-keys --namespace="$NAMESPACE" -o yaml > "$BACKUP_DIR/api-keys.yaml"
    
    log_success "Secrets backed up to: $BACKUP_DIR"
}

# Show usage
show_usage() {
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  setup     - Create namespace and all secrets"
    echo "  update    - Update API keys"
    echo "  list      - List all secrets"
    echo "  backup    - Backup secrets to files"
    echo "  delete    - Delete all secrets"
    echo "  help      - Show this help message"
    echo
}

# Main execution
main() {
    local command="${1:-help}"
    
    # Change to project root directory
    cd "$PROJECT_ROOT"
    
    case "$command" in
        "setup")
            check_prerequisites
            create_namespace
            generate_credentials
            create_app_secrets
            create_api_secrets
            log_success "Kubernetes secrets setup completed!"
            log "Next steps:"
            log "1. Update API keys: $0 update"
            log "2. Deploy application: kubectl apply -f k8s/"
            ;;
        "update")
            check_prerequisites
            update_api_keys
            ;;
        "list")
            check_prerequisites
            list_secrets
            ;;
        "backup")
            check_prerequisites
            backup_secrets
            ;;
        "delete")
            check_prerequisites
            delete_secrets
            ;;
        "help"|*)
            show_usage
            ;;
    esac
}

# Handle script interruption
trap 'log_error "Script interrupted"; exit 1' INT TERM

# Run main function
main "$@"
