#!/bin/bash

# SonarQube Setup Script for user-doc-chat
# This script sets up SonarQube for local development and CI/CD

set -e

echo "🔧 Setting up SonarQube for user-doc-chat..."

# Check if sonar-scanner is installed
if ! command -v sonar-scanner &> /dev/null; then
    echo "📦 Installing sonar-scanner..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install sonar-scanner
        else
            echo "❌ Homebrew not found. Please install sonar-scanner manually."
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        wget https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-4.8.0.2856-linux.zip
        unzip sonar-scanner-cli-4.8.0.2856-linux.zip
        sudo mv sonar-scanner-4.8.0.2856 /opt/sonar-scanner
        sudo ln -s /opt/sonar-scanner/bin/sonar-scanner /usr/local/bin/sonar-scanner
        rm sonar-scanner-cli-4.8.0.2856-linux.zip
    else
        echo "❌ Unsupported OS. Please install sonar-scanner manually."
        exit 1
    fi
fi

# Create coverage directory
mkdir -p coverage

# Generate coverage report
echo "📊 Generating test coverage report..."
npm run coverage

# Check if coverage report was generated
if [ ! -f "coverage/lcov.info" ]; then
    echo "❌ Coverage report not generated. Please check your test configuration."
    exit 1
fi

echo "✅ SonarQube setup complete!"
echo ""
echo "🚀 To run SonarQube analysis:"
echo "   npm run sonar:local  # For local SonarQube instance"
echo "   npm run sonar        # For cloud SonarQube"
echo ""
echo "📊 Coverage report generated at: coverage/lcov.info"
echo "📈 HTML coverage report: coverage/index.html"
