#!/bin/bash

# Pre-push hook script
# Runs tests, linting, and type checking before allowing push
# Fails if any command fails

set -e  # Exit on any error

echo "🔍 Running pre-push checks..."

echo "📋 Running tests..."
npm run test

echo "🔧 Running linter..."
npm run lint

echo "📝 Running type check..."
npm run type-check

echo "🐍 Running comprehensive Python checks..."
npm run python:checks

echo "✅ All pre-push checks passed!"
