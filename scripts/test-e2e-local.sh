#!/bin/bash

# Script to run e2e tests locally with Python service
# This script starts the Python gRPC service and runs the e2e tests

set -e

echo "🚀 Starting E2E Test Setup..."

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 is not installed or not in PATH"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the project root directory"
    exit 1
fi

# Check if Python service directory exists
if [ ! -d "python_service" ]; then
    echo "❌ Python service directory not found"
    exit 1
fi

echo "📦 Installing Python dependencies..."
cd python_service
pip install -r requirements.txt
cd ..

echo "🔧 Building TypeScript..."
npm run build:api

echo "🐍 Starting Python gRPC service in background..."
cd python_service
python3 main_grpc_server.py &
PYTHON_PID=$!
cd ..

# Function to cleanup on exit
cleanup() {
    echo "🧹 Cleaning up..."
    if [ ! -z "$PYTHON_PID" ]; then
        kill $PYTHON_PID 2>/dev/null || true
    fi
    # Kill any remaining Python processes
    pkill -f "main_grpc_server.py" 2>/dev/null || true
}

# Set trap to cleanup on script exit
trap cleanup EXIT

echo "⏳ Waiting for Python service to start..."
# Wait for service to be ready
for i in {1..30}; do
    if (echo > /dev/tcp/127.0.0.1/50051) >/dev/null 2>&1; then
        echo "✅ Python gRPC service is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Python service did not start within 30 seconds"
        exit 1
    fi
    sleep 1
done

echo "🧪 Running E2E tests..."
npm run test:e2e

echo "✅ E2E tests completed successfully!"
