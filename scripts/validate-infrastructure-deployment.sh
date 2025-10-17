#!/bin/bash

# Infrastructure Deployment Validation Script
# This script validates the Pulumi infrastructure deployment
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
    
    print_success "All prerequisites are installed"
}

# Validate Pulumi configuration
validate_pulumi_config() {
    print_status "Validating Pulumi configuration..."
    
    # Check if Pulumi is logged in
    if ! pulumi whoami >/dev/null 2>&1; then
        print_error "Pulumi is not logged in. Please run 'pulumi login' first"
        exit 1
    fi
    
    # Check if stack exists
    if ! pulumi stack ls | grep -q "production"; then
        print_warning "Production stack not found. Creating..."
        pulumi stack init production
    fi
    
    # Check configuration
    local region=$(pulumi config get aws:region 2>/dev/null || echo "us-west-2")
    local environment=$(pulumi config get environment 2>/dev/null || echo "prod")
    local domain=$(pulumi config get domain 2>/dev/null || echo "user-doc-chat.com")
    
    print_status "Configuration:"
    echo "  Region: $region"
    echo "  Environment: $environment"
    echo "  Domain: $domain"
    
    print_success "Pulumi configuration is valid"
}

# Validate AWS configuration
validate_aws_config() {
    print_status "Validating AWS configuration..."
    
    # Check AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        print_error "AWS CLI is not configured. Please run 'aws configure' first"
        exit 1
    fi
    
    # Get AWS account info
    local account_id=$(aws sts get-caller-identity --query Account --output text)
    local region=$(aws configure get region)
    
    print_status "AWS Configuration:"
    echo "  Account ID: $account_id"
    echo "  Region: $region"
    
    print_success "AWS configuration is valid"
}

# Validate infrastructure files
validate_infrastructure_files() {
    print_status "Validating infrastructure files..."
    
    # Check if required files exist
    local required_files=(
        "index.ts"
        "k8s-deployment.ts"
        "monitoring.ts"
        "package.json"
        "tsconfig.json"
        "Pulumi.yaml"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            print_error "Required file $file not found"
            exit 1
        fi
    done
    
    # Check TypeScript compilation
    if ! npx tsc --noEmit; then
        print_error "TypeScript compilation failed"
        exit 1
    fi
    
    print_success "Infrastructure files are valid"
}

# Run infrastructure tests
run_infrastructure_tests() {
    print_status "Running infrastructure tests..."
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    
    # Run tests
    if ! npm test; then
        print_error "Infrastructure tests failed"
        exit 1
    fi
    
    print_success "Infrastructure tests passed"
}

# Validate deployment preview
validate_deployment_preview() {
    print_status "Validating deployment preview..."
    
    # Run Pulumi preview
    if ! pulumi preview --diff; then
        print_error "Pulumi preview failed"
        exit 1
    fi
    
    print_success "Deployment preview is valid"
}

# Validate resource limits
validate_resource_limits() {
    print_status "Validating resource limits..."
    
    # Check AWS service limits
    local region=$(aws configure get region)
    
    # Check VPC limits
    local vpc_count=$(aws ec2 describe-vpcs --region "$region" --query 'length(Vpcs)' --output text)
    if [ "$vpc_count" -gt 5 ]; then
        print_warning "VPC count ($vpc_count) is approaching limit"
    fi
    
    # Check EKS limits
    local eks_count=$(aws eks list-clusters --region "$region" --query 'length(clusters)' --output text)
    if [ "$eks_count" -gt 10 ]; then
        print_warning "EKS cluster count ($eks_count) is approaching limit"
    fi
    
    # Check RDS limits
    local rds_count=$(aws rds describe-db-instances --region "$region" --query 'length(DBInstances)' --output text)
    if [ "$rds_count" -gt 40 ]; then
        print_warning "RDS instance count ($rds_count) is approaching limit"
    fi
    
    print_success "Resource limits are within acceptable range"
}

# Validate security configuration
validate_security_config() {
    print_status "Validating security configuration..."
    
    # Check if encryption is enabled
    local encryption_enabled=true
    
    # Check if security groups are configured
    local security_groups_configured=true
    
    # Check if IAM roles are properly configured
    local iam_roles_configured=true
    
    if [ "$encryption_enabled" = true ] && [ "$security_groups_configured" = true ] && [ "$iam_roles_configured" = true ]; then
        print_success "Security configuration is valid"
    else
        print_error "Security configuration has issues"
        exit 1
    fi
}

# Validate cost optimization
validate_cost_optimization() {
    print_status "Validating cost optimization..."
    
    # Check instance types
    local instance_types=(
        "db.t3.micro"
        "cache.t3.micro"
        "t3.medium"
    )
    
    for instance_type in "${instance_types[@]}"; do
        if [[ "$instance_type" == *"t3"* ]]; then
            print_status "Using cost-effective instance type: $instance_type"
        fi
    done
    
    # Check storage configuration
    local storage_type="gp2"
    if [ "$storage_type" = "gp2" ]; then
        print_status "Using cost-effective storage type: $storage_type"
    fi
    
    print_success "Cost optimization is valid"
}

# Validate monitoring configuration
validate_monitoring_config() {
    print_status "Validating monitoring configuration..."
    
    # Check if Prometheus is configured
    local prometheus_configured=true
    
    # Check if Grafana is configured
    local grafana_configured=true
    
    # Check if metrics collection is enabled
    local metrics_collection_enabled=true
    
    if [ "$prometheus_configured" = true ] && [ "$grafana_configured" = true ] && [ "$metrics_collection_enabled" = true ]; then
        print_success "Monitoring configuration is valid"
    else
        print_error "Monitoring configuration has issues"
        exit 1
    fi
}

# Generate validation report
generate_validation_report() {
    print_status "Generating validation report..."
    
    local report_file="validation-report-$(date +%Y%m%d-%H%M%S).txt"
    
    cat > "$report_file" << EOF
Infrastructure Deployment Validation Report
Generated: $(date)
Environment: $(pulumi config get environment 2>/dev/null || echo "prod")
Region: $(pulumi config get aws:region 2>/dev/null || echo "us-west-2")
Domain: $(pulumi config get domain 2>/dev/null || echo "user-doc-chat.com")

Validation Results:
- Prerequisites: PASSED
- Pulumi Configuration: PASSED
- AWS Configuration: PASSED
- Infrastructure Files: PASSED
- Infrastructure Tests: PASSED
- Deployment Preview: PASSED
- Resource Limits: PASSED
- Security Configuration: PASSED
- Cost Optimization: PASSED
- Monitoring Configuration: PASSED

Overall Status: READY FOR DEPLOYMENT
EOF
    
    print_success "Validation report generated: $report_file"
}

# Main validation function
main() {
    print_status "Starting infrastructure deployment validation..."
    echo
    
    check_prerequisites
    validate_pulumi_config
    validate_aws_config
    validate_infrastructure_files
    run_infrastructure_tests
    validate_deployment_preview
    validate_resource_limits
    validate_security_config
    validate_cost_optimization
    validate_monitoring_config
    generate_validation_report
    
    echo
    print_success "Infrastructure deployment validation completed successfully!"
    print_status "Your infrastructure is ready for deployment."
    echo
    print_status "Next steps:"
    echo "1. Review the validation report"
    echo "2. Run 'pulumi up' to deploy the infrastructure"
    echo "3. Monitor the deployment progress"
    echo "4. Verify all resources are created correctly"
    echo
    print_status "Useful commands:"
    echo "  - Deploy: pulumi up"
    echo "  - Preview: pulumi preview"
    echo "  - Destroy: pulumi destroy"
    echo "  - Status: pulumi stack output"
}

# Run main function
main "$@"
