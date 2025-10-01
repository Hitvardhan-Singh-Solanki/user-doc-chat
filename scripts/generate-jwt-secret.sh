#!/bin/bash

# JWT Secret Generation Script
# This script generates a cryptographically secure JWT secret using OpenSSL
# The generated secret is 256 bits (32 bytes) encoded in base64

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔐 JWT Secret Generator${NC}"
echo -e "${BLUE}========================${NC}"
echo

# Check if OpenSSL is available
if ! command -v openssl &> /dev/null; then
    echo -e "${RED}❌ Error: OpenSSL is not installed or not in PATH${NC}"
    echo -e "${YELLOW}Please install OpenSSL to generate secure secrets${NC}"
    exit 1
fi

# Generate the secret
echo -e "${YELLOW}Generating cryptographically secure JWT secret...${NC}"
SECRET=$(openssl rand -base64 32)

echo
echo -e "${GREEN}✅ Generated JWT Secret:${NC}"
echo -e "${GREEN}JWT_SECRET=${SECRET}${NC}"
echo

# Display security information
echo -e "${BLUE}📋 Security Information:${NC}"
echo -e "• Secret length: 256 bits (32 bytes)"
echo -e "• Encoding: Base64"
echo -e "• Entropy source: OpenSSL PRNG"
echo -e "• Cryptographically secure: Yes"
echo

# Display usage instructions
echo -e "${YELLOW}📝 Usage Instructions:${NC}"
echo -e "1. Copy the generated secret above"
echo -e "2. Set it in your environment variables:"
echo -e "   ${BLUE}export JWT_SECRET=\"${SECRET}\"${NC}"
echo -e "3. Or add it to your .env file:"
echo -e "   ${BLUE}JWT_SECRET=${SECRET}${NC}"
echo -e "4. For production, use a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)"
echo

# Security warnings
echo -e "${RED}⚠️  Security Warnings:${NC}"
echo -e "• NEVER commit this secret to version control"
echo -e "• Store it securely in your secrets manager for production"
echo -e "• Use different secrets for different environments"
echo -e "• Rotate secrets regularly (recommended: every 90 days)"
echo -e "• Ensure proper access controls on secret storage"
echo

# Optional: Save to file (with user confirmation)
read -p "Do you want to save this secret to a temporary file? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    TEMP_FILE="jwt-secret-$(date +%Y%m%d-%H%M%S).txt"
    echo "JWT_SECRET=${SECRET}" > "$TEMP_FILE"
    echo -e "${GREEN}✅ Secret saved to: ${TEMP_FILE}${NC}"
    echo -e "${RED}⚠️  Remember to delete this file after use!${NC}"
    echo -e "${YELLOW}   rm ${TEMP_FILE}${NC}"
fi

echo
echo -e "${GREEN}🎉 JWT secret generation complete!${NC}"
