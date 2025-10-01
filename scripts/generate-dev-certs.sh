#!/bin/bash

# =============================================================================
# Generate Development TLS Certificates for gRPC Sanitizer Service
# =============================================================================
# This script generates self-signed certificates for development use only.
# DO NOT use these certificates in production environments.

set -e

CERT_DIR="certs"
CA_KEY="$CERT_DIR/ca-key.pem"
CA_CERT="$CERT_DIR/ca.pem"
CLIENT_KEY="$CERT_DIR/client-key.pem"
CLIENT_CERT="$CERT_DIR/client.pem"
CLIENT_CSR="$CERT_DIR/client.csr"

echo "🔐 Generating development TLS certificates for gRPC sanitizer service..."

# Create certificates directory if it doesn't exist
mkdir -p "$CERT_DIR"

# Generate CA private key and certificate
echo "📝 Creating Certificate Authority..."
openssl req -x509 -newkey rsa:4096 -keyout "$CA_KEY" -out "$CA_CERT" \
    -days 365 -nodes \
    -subj "/C=US/ST=Development/L=Local/O=DevOrg/CN=DevCA" \
    -config <(
        echo '[req]'
        echo 'distinguished_name = req'
        echo '[v3_ca]'
        echo 'basicConstraints = critical,CA:TRUE'
        echo 'keyUsage = critical,keyCertSign,cRLSign'
    ) -extensions v3_ca

# Generate client private key and certificate signing request
echo "📝 Creating client certificate..."
openssl req -newkey rsa:2048 -keyout "$CLIENT_KEY" -out "$CLIENT_CSR" \
    -nodes \
    -subj "/C=US/ST=Development/L=Local/O=DevOrg/CN=client"

# Sign the client certificate with the CA
openssl x509 -req -in "$CLIENT_CSR" -CA "$CA_CERT" -CAkey "$CA_KEY" \
    -out "$CLIENT_CERT" -days 365 -CAcreateserial \
    -extensions v3_req \
    -config <(
        echo '[req]'
        echo 'distinguished_name = req'
        echo '[v3_req]'
        echo 'basicConstraints = CA:FALSE'
        echo 'keyUsage = nonRepudiation,digitalSignature,keyEncipherment'
        echo 'extendedKeyUsage = clientAuth'
    )

# Clean up the CSR file
rm "$CLIENT_CSR"

# Set appropriate permissions
chmod 600 "$CA_KEY" "$CLIENT_KEY"
chmod 644 "$CA_CERT" "$CLIENT_CERT"

echo "✅ Development certificates generated successfully!"
echo ""
echo "📁 Certificate files created:"
echo "   - $CA_CERT (CA certificate)"
echo "   - $CA_KEY (CA private key)"
echo "   - $CLIENT_CERT (Client certificate)"
echo "   - $CLIENT_KEY (Client private key)"
echo ""
echo "🔧 To enable TLS in development, set the following in your .env.dev:"
echo "   SANITIZER_TLS_ENABLED=true"
echo ""
echo "⚠️  WARNING: These are self-signed certificates for development only!"
echo "   Do not use in production environments."
echo ""
echo "🔒 Certificate permissions set to 600 for private keys (secure)."
