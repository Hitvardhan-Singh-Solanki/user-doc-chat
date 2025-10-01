#!/bin/bash

# Fix for protoc-gen-ts bug: GrpWritableServiceInterface should be GrpcWritableServiceInterface
# This is a known issue in protoc-gen-ts 0.8.7 where the 'c' is missing from 'Grpc'

PROTO_FILE="src/infrastructure/external-services/grpc/proto/sanitizer.ts"

if [ -f "$PROTO_FILE" ]; then
    echo "Fixing typo in $PROTO_FILE..."
    sed -i '' 's/GrpWritableServiceInterface/GrpcWritableServiceInterface/g' "$PROTO_FILE"
    echo "Fixed: GrpWritableServiceInterface -> GrpcWritableServiceInterface"
else
    echo "Error: $PROTO_FILE not found"
    exit 1
fi
