#!/bin/bash

# Local CI Pipeline Script
# This script runs the same checks as the GitHub Actions CI pipeline locally

set -e

echo "🚀 Starting Local CI Pipeline..."
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "SUCCESS")
            echo -e "${GREEN}✅ $message${NC}"
            ;;
        "FAILURE")
            echo -e "${RED}❌ $message${NC}"
            ;;
        "WARNING")
            echo -e "${YELLOW}⚠️  $message${NC}"
            ;;
        "INFO")
            echo -e "${BLUE}ℹ️  $message${NC}"
            ;;
    esac
}

# Function to run a command and check result
run_check() {
    local name=$1
    local command=$2
    
    echo ""
    echo "🔍 Running: $name"
    echo "Command: $command"
    echo "----------------------------------------"
    
    if eval "$command"; then
        print_status "SUCCESS" "$name passed"
        return 0
    else
        print_status "FAILURE" "$name failed"
        return 1
    fi
}

# Track overall status
OVERALL_STATUS=0

echo ""
echo "📋 Running Test Checks..."
echo "========================="

# 1. Install dependencies
if ! run_check "Install Dependencies" "npm ci"; then
    OVERALL_STATUS=1
fi

# 2. Linting
if ! run_check "Linting" "npm run lint"; then
    OVERALL_STATUS=1
fi

# 3. Type checking
if ! run_check "Type Checking" "npm run type-check"; then
    OVERALL_STATUS=1
fi

# 4. Run tests
if ! run_check "Unit Tests" "npm test"; then
    OVERALL_STATUS=1
fi

echo ""
echo "🔒 Running Security Checks..."
echo "============================="

# 5. Security scan
if ! run_check "Security Scan" "./security-scan.sh"; then
    OVERALL_STATUS=1
fi

echo ""
echo "🐳 Running Build Checks..."
echo "=========================="

# 6. Docker build test
if ! run_check "Docker Build Test" "docker-compose -f docker-compose.dev.yml build"; then
    OVERALL_STATUS=1
fi

# 7. Docker compose config validation
if ! run_check "Docker Compose Config" "docker-compose -f docker-compose.dev.yml config"; then
    OVERALL_STATUS=1
fi

echo ""
echo "📊 CI Pipeline Summary"
echo "======================"

if [ $OVERALL_STATUS -eq 0 ]; then
    print_status "SUCCESS" "All checks passed! 🎉"
    echo ""
    echo "✅ Your code is ready for commit and push!"
    echo "✅ All CI checks should pass when you create a PR"
    exit 0
else
    print_status "FAILURE" "Some checks failed! 🚫"
    echo ""
    echo "❌ Please fix the failing checks before committing"
    echo "❌ The CI pipeline will fail if you push these changes"
    exit 1
fi
