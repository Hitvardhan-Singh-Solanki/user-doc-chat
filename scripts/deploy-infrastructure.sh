#!/bin/bash

# User Doc Chat Infrastructure Deployment Script
# This script deploys the complete infrastructure for the User Doc Chat application
# Located in scripts/ directory for centralized script management

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command_exists pulumi; then
        print_error "Pulumi CLI is not installed. Please install it from https://www.pulumi.com/docs/get-started/install/"
        exit 1
    fi
    
    if ! command_exists aws; then
        print_error "AWS CLI is not installed. Please install it from https://aws.amazon.com/cli/"
        exit 1
    fi
    
    if ! command_exists kubectl; then
        print_error "kubectl is not installed. Please install it from https://kubernetes.io/docs/tasks/tools/"
        exit 1
    fi
    
    if ! command_exists docker; then
        print_error "Docker is not installed. Please install it from https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    print_success "All prerequisites are installed"
}

# Function to configure AWS
configure_aws() {
    print_status "Configuring AWS..."
    
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        print_error "AWS CLI is not configured. Please run 'aws configure' first"
        exit 1
    fi
    
    print_success "AWS is configured"
}

# Function to install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    if [ ! -d "node_modules" ]; then
        npm install
        print_success "Dependencies installed"
    else
        print_success "Dependencies already installed"
    fi
}

# Function to configure Pulumi
configure_pulumi() {
    print_status "Configuring Pulumi..."
    
    # Check if already logged in
    if ! pulumi whoami >/dev/null 2>&1; then
        print_warning "Pulumi is not logged in. Please run 'pulumi login' first"
        exit 1
    fi
    
    # Set default configuration if not set
    if ! pulumi config get aws:region >/dev/null 2>&1; then
        pulumi config set aws:region us-west-2
        print_status "Set default AWS region to us-west-2"
    fi
    
    if ! pulumi config get environment >/dev/null 2>&1; then
        pulumi config set environment prod
        print_status "Set default environment to prod"
    fi
    
    if ! pulumi config get domain >/dev/null 2>&1; then
        pulumi config set domain user-doc-chat.com
        print_status "Set default domain to user-doc-chat.com"
    fi
    
    print_success "Pulumi is configured"
}

# Function to deploy infrastructure
deploy_infrastructure() {
    print_status "Deploying infrastructure..."
    
    # Preview first
    print_status "Previewing infrastructure changes..."
    pulumi preview
    
    # Ask for confirmation
    read -p "Do you want to proceed with the deployment? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Deployment cancelled"
        exit 1
    fi
    
    # Deploy
    pulumi up --yes
    print_success "Infrastructure deployed"
}

# Function to build and push Docker image
build_and_push_image() {
    print_status "Building and pushing Docker image..."
    
    # Get AWS account ID and region
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    REGION=$(pulumi config get aws:region)
    
    # ECR repository name
    REPO_NAME="user-doc-chat"
    
    # Create ECR repository if it doesn't exist
    aws ecr describe-repositories --repository-names $REPO_NAME --region $REGION >/dev/null 2>&1 || {
        print_status "Creating ECR repository..."
        aws ecr create-repository --repository-name $REPO_NAME --region $REGION
    }
    
    # Login to ECR
    aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
    
    # Build image
    print_status "Building Docker image..."
    docker build -t $REPO_NAME:latest ../docker/Dockerfile
    
    # Tag image
    docker tag $REPO_NAME:latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:latest
    
    # Push image
    print_status "Pushing Docker image..."
    docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:latest
    
    print_success "Docker image built and pushed"
}

# Function to deploy application
deploy_application() {
    print_status "Deploying application..."
    
    # Deploy Kubernetes resources
    pulumi up --target k8s-deployment --yes
    print_success "Application deployed"
}

# Function to deploy monitoring
deploy_monitoring() {
    print_status "Deploying monitoring..."
    
    # Deploy monitoring resources
    pulumi up --target monitoring --yes
    print_success "Monitoring deployed"
}

# Function to show deployment status
show_status() {
    print_status "Deployment Status:"
    echo
    
    # Show Pulumi outputs
    print_status "Infrastructure outputs:"
    pulumi stack output
    
    echo
    print_status "Kubernetes resources:"
    kubectl get pods --all-namespaces
    
    echo
    print_status "Services:"
    kubectl get services --all-namespaces
    
    echo
    print_status "Ingress:"
    kubectl get ingress --all-namespaces
}

# Main deployment function
main() {
    print_status "Starting User Doc Chat infrastructure deployment..."
    echo
    
    check_prerequisites
    configure_aws
    install_dependencies
    configure_pulumi
    
    echo
    print_status "Ready to deploy. This will create:"
    echo "  - VPC with public and private subnets"
    echo "  - EKS cluster"
    echo "  - RDS PostgreSQL database"
    echo "  - ElastiCache Redis cluster"
    echo "  - S3 bucket for file storage"
    echo "  - Application Load Balancer"
    echo "  - SSL certificate"
    echo "  - Route 53 hosted zone"
    echo "  - Kubernetes deployments"
    echo "  - Monitoring (Prometheus + Grafana)"
    echo
    
    deploy_infrastructure
    build_and_push_image
    deploy_application
    deploy_monitoring
    
    echo
    print_success "Deployment completed successfully!"
    show_status
    
    echo
    print_status "Next steps:"
    echo "1. Update your domain's DNS to point to the ALB"
    echo "2. Configure your API keys in Kubernetes secrets"
    echo "3. Access your application at the ALB DNS name"
    echo "4. Set up monitoring dashboards in Grafana"
    echo
    print_status "Useful commands:"
    echo "  - View logs: kubectl logs -f deployment/user-doc-chat-app-prod"
    echo "  - Access Grafana: kubectl port-forward svc/grafana-service 3000:3000"
    echo "  - Access Prometheus: kubectl port-forward svc/prometheus-service 9090:9090"
}

# Run main function
main "$@"
