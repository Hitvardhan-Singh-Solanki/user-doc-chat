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
        SCANNER_VERSION="4.8.0.2856"
        SCANNER_ZIP="sonar-scanner-cli-${SCANNER_VERSION}-linux.zip"
        BASE_URL="https://binaries.sonarsource.com/Distribution/sonar-scanner-cli"
        wget "${BASE_URL}/${SCANNER_ZIP}"
        wget "${BASE_URL}/${SCANNER_ZIP}.sha256"
        sha256sum -c "${SCANNER_ZIP}.sha256"
        unzip "${SCANNER_ZIP}"
        
        # Try system-wide installation first, fall back to user installation
        if sudo -n true 2>/dev/null; then
            echo "⚠️  This script requires sudo privileges to install sonar-scanner system-wide."
            echo "    You may be prompted for your password."
            sudo mv sonar-scanner-4.8.0.2856-linux /opt/sonar-scanner
            sudo ln -s /opt/sonar-scanner/bin/sonar-scanner /usr/local/bin/sonar-scanner
        else
            echo "⚠️  No sudo access. Installing to ~/.local/bin"
            mkdir -p ~/.local/bin
            mv sonar-scanner-4.8.0.2856-linux ~/.local/sonar-scanner
            ln -sf ~/.local/sonar-scanner/bin/sonar-scanner ~/.local/bin/sonar-scanner
            echo "ℹ️  Add ~/.local/bin to your PATH if not already present"
        fi
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
