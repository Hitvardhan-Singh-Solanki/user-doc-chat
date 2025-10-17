#!/bin/bash

# Infrastructure Scripts
# Consolidated infrastructure management

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

# Check prerequisites
check_prereqs() {
    log "Checking prerequisites..."
    
    command -v pulumi >/dev/null || { error "Pulumi not installed"; exit 1; }
    command -v aws >/dev/null || { error "AWS CLI not installed"; exit 1; }
    command -v kubectl >/dev/null || { error "kubectl not installed"; exit 1; }
    
    success "Prerequisites OK"
}

# Install dependencies
install_deps() {
    log "Installing dependencies..."
    npm install
    success "Dependencies installed"
}

# Run infrastructure tests
test_infra() {
    log "Running infrastructure tests..."
    npm run test:infrastructure
    success "Infrastructure tests passed"
}

# Preview infrastructure
preview() {
    log "Previewing infrastructure..."
    cd infrastructure
    pulumi preview
    success "Preview completed"
}

# Deploy infrastructure
deploy() {
    log "Deploying infrastructure..."
    cd infrastructure
    pulumi up --yes
    success "Infrastructure deployed"
}

# Deploy to Kubernetes
deploy_k8s() {
    log "Deploying to Kubernetes..."
    kubectl apply -f k8s/
    success "Kubernetes deployment completed"
}

# Validate deployment
validate() {
    log "Validating deployment..."
    
    # Check if resources exist
    kubectl get pods --all-namespaces
    kubectl get services --all-namespaces
    
    success "Deployment validation completed"
}

# Show status
status() {
    log "Infrastructure status:"
    cd infrastructure
    pulumi stack output
}

# Destroy infrastructure
destroy() {
    warning "This will destroy all infrastructure!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd infrastructure
        pulumi destroy --yes
        success "Infrastructure destroyed"
    else
        log "Destruction cancelled"
    fi
}

# Show help
show_help() {
    echo "Usage: $0 [command]"
    echo
    echo "Commands:"
    echo "  check     - Check prerequisites"
    echo "  install   - Install dependencies"
    echo "  test      - Run infrastructure tests"
    echo "  preview   - Preview infrastructure changes"
    echo "  deploy    - Deploy infrastructure"
    echo "  k8s       - Deploy to Kubernetes"
    echo "  validate  - Validate deployment"
    echo "  status    - Show infrastructure status"
    echo "  destroy   - Destroy infrastructure"
    echo "  help      - Show this help"
}

# Main
case "${1:-help}" in
    "check")
        check_prereqs
        ;;
    "install")
        install_deps
        ;;
    "test")
        test_infra
        ;;
    "preview")
        check_prereqs
        preview
        ;;
    "deploy")
        check_prereqs
        install_deps
        test_infra
        preview
        deploy
        deploy_k8s
        validate
        ;;
    "k8s")
        deploy_k8s
        ;;
    "validate")
        validate
        ;;
    "status")
        status
        ;;
    "destroy")
        destroy
        ;;
    "help"|*)
        show_help
        ;;
esac
