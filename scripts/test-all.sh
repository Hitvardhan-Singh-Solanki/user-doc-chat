#!/bin/bash

# Comprehensive test script for both Node.js and Python services
# Runs all tests, linting, type checking, and security checks

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Logging functions
log() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# Change to project root
cd "$PROJECT_ROOT"

echo "🚀 Running comprehensive test suite..."
echo "=================================="

# Node.js Tests
echo ""
log "📋 Running Node.js tests..."
npm run test
log_success "Node.js tests completed"

# Python Tests
echo ""
log "🐍 Running Python tests..."
npm run python:test
log_success "Python tests completed"

# Node.js Linting
echo ""
log "🔧 Running Node.js linting..."
npm run lint
log_success "Node.js linting completed"

# Python Linting
echo ""
log "🐍 Running Python linting..."
npm run python:lint
log_success "Python linting completed"

# Type Checking
echo ""
log "📝 Running TypeScript type checking..."
npm run type-check
log_success "TypeScript type checking completed"

# Python Security
echo ""
log "🔒 Running Python security checks..."
npm run python:security
log_success "Python security checks completed"

# Node.js Security
echo ""
log "🔒 Running Node.js security audit..."
npm audit
log_success "Node.js security audit completed"

# Summary
echo ""
echo "=================================="
log_success "🎉 All tests completed successfully!"
echo ""
log "Summary:"
log "- ✅ Node.js tests passed"
log "- ✅ Python tests passed"
log "- ✅ Node.js linting passed"
log "- ✅ Python linting passed"
log "- ✅ TypeScript type checking passed"
log "- ✅ Python security checks passed"
log "- ✅ Node.js security audit passed"
echo ""
log_success "🚀 Project is ready for deployment!"
