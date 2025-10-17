#!/bin/bash

# Infrastructure Tests Runner
# This script runs all infrastructure tests with proper setup and cleanup
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
    
    if ! command_exists node; then
        print_error "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    fi
    
    if ! command_exists npm; then
        print_error "npm is not installed. Please install npm from https://www.npmjs.com/"
        exit 1
    fi
    
    if ! command_exists pulumi; then
        print_warning "Pulumi CLI is not installed. Installing for testing..."
        curl -fsSL https://get.pulumi.com | sh
        export PATH="$PATH:$HOME/.pulumi/bin"
    fi
    
    print_success "All prerequisites are available"
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    if [ ! -d "node_modules" ]; then
        npm install
        print_success "Dependencies installed"
    else
        print_success "Dependencies already installed"
    fi
}

# Setup test environment
setup_test_environment() {
    print_status "Setting up test environment..."
    
    # Set test environment variables
    export NODE_ENV=test
    export PULUMI_CONFIG_PASSPHRASE=test-passphrase
    export AWS_ACCESS_KEY_ID=test-access-key
    export AWS_SECRET_ACCESS_KEY=test-secret-key
    export AWS_DEFAULT_REGION=us-west-2
    
    # Create test directory
    mkdir -p test-results
    
    print_success "Test environment configured"
}

# Run tests
run_tests() {
    print_status "Running infrastructure tests..."
    
    # Run infrastructure tests
    npm run test:infrastructure
    
    print_success "All tests completed successfully"
}

# Run tests with coverage
run_tests_with_coverage() {
    print_status "Running tests with coverage..."
    
    # Run tests with coverage
    npm run test:infrastructure:coverage
    
    print_success "Tests with coverage completed"
}

# Run specific test file
run_specific_test() {
    local test_file="$1"
    
    if [ -z "$test_file" ]; then
        print_error "Please specify a test file"
        exit 1
    fi
    
    if [ ! -f "$test_file" ]; then
        print_error "Test file $test_file not found"
        exit 1
    fi
    
    print_status "Running specific test: $test_file"
    
    npx vitest "$test_file"
    
    print_success "Test $test_file completed"
}

# Run tests matching pattern
run_tests_by_pattern() {
    local pattern="$1"
    
    if [ -z "$pattern" ]; then
        print_error "Please specify a test pattern"
        exit 1
    fi
    
    print_status "Running tests matching pattern: $pattern"
    
    npx vitest --grep "$pattern"
    
    print_success "Tests matching $pattern completed"
}

# Cleanup test environment
cleanup_test_environment() {
    print_status "Cleaning up test environment..."
    
    # Remove test environment variables
    unset NODE_ENV
    unset PULUMI_CONFIG_PASSPHRASE
    unset AWS_ACCESS_KEY_ID
    unset AWS_SECRET_ACCESS_KEY
    unset AWS_DEFAULT_REGION
    
    # Remove test results
    rm -rf test-results
    
    print_success "Test environment cleaned up"
}

# Show test results
show_test_results() {
    print_status "Test Results:"
    echo
    
    if [ -f "coverage/index.html" ]; then
        print_status "Coverage report available at: coverage/index.html"
    fi
    
    if [ -f "test-results/results.json" ]; then
        print_status "Test results available at: test-results/results.json"
    fi
    
    print_success "Test execution completed"
}

# Main function
main() {
    local command="$1"
    local argument="$2"
    
    case "$command" in
        "all")
            check_prerequisites
            install_dependencies
            setup_test_environment
            run_tests
            show_test_results
            cleanup_test_environment
            ;;
        "coverage")
            check_prerequisites
            install_dependencies
            setup_test_environment
            run_tests_with_coverage
            show_test_results
            cleanup_test_environment
            ;;
        "file")
            check_prerequisites
            install_dependencies
            setup_test_environment
            run_specific_test "$argument"
            cleanup_test_environment
            ;;
        "pattern")
            check_prerequisites
            install_dependencies
            setup_test_environment
            run_tests_by_pattern "$argument"
            cleanup_test_environment
            ;;
        "watch")
            check_prerequisites
            install_dependencies
            setup_test_environment
            npm run test:watch
            ;;
        "ui")
            check_prerequisites
            install_dependencies
            setup_test_environment
            npm run test:ui
            ;;
        "help"|"--help"|"-h")
            echo "Usage: $0 [command] [argument]"
            echo
            echo "Commands:"
            echo "  all                    Run all tests"
            echo "  coverage               Run tests with coverage"
            echo "  file <filename>        Run specific test file"
            echo "  pattern <pattern>      Run tests matching pattern"
            echo "  watch                  Run tests in watch mode"
            echo "  ui                     Run tests with UI"
            echo "  help                   Show this help message"
            echo
            echo "Examples:"
            echo "  $0 all"
            echo "  $0 coverage"
            echo "  $0 file infrastructure.test.ts"
            echo "  $0 pattern VPC"
            echo "  $0 watch"
            echo "  $0 ui"
            ;;
        *)
            print_error "Unknown command: $command"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
