# TLS Certificates for gRPC Sanitizer Service

This directory contains TLS certificates for secure gRPC communication between the Node.js backend and the Python sanitizer service.

## Certificate Files

Place the following certificate files in this directory:

- `ca.pem` - Root Certificate Authority certificate for server verification
- `client.pem` - Client certificate for mutual TLS (mTLS) authentication (optional)
- `client-key.pem` - Client private key for mutual TLS (mTLS) authentication (optional)

## Development Setup

For development, you can use self-signed certificates or disable TLS entirely by setting `SANITIZER_TLS_ENABLED=false` in your `.env.dev` file.

### Generating Self-Signed Certificates for Development

```bash
# Create a self-signed CA certificate
openssl req -x509 -newkey rsa:4096 -keyout ca-key.pem -out ca.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=CA"

# Create a client certificate signed by the CA
openssl req -newkey rsa:2048 -keyout client-key.pem -out client.csr -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=client"
openssl x509 -req -in client.csr -CA ca.pem -CAkey ca-key.pem -out client.pem -days 365 -CAcreateserial

# Clean up the CSR file
rm client.csr
```

## Production Setup

For production environments:

1. **Use a trusted Certificate Authority**: Obtain certificates from a trusted CA like Let's Encrypt, DigiCert, or your organization's internal CA.

2. **Secure certificate storage**: Ensure certificates are stored securely and have appropriate file permissions (600 for private keys).

3. **Certificate rotation**: Implement a process for regular certificate rotation and updates.

## Environment Variables

Configure the following environment variables in your `.env` files:

```bash
# Enable/disable TLS
SANITIZER_TLS_ENABLED=true

# Certificate paths (relative to /app/certs in containers)
SANITIZER_TLS_CA_PATH=/app/certs/ca.pem
SANITIZER_TLS_CERT_PATH=/app/certs/client.pem
SANITIZER_TLS_KEY_PATH=/app/certs/client-key.pem
```

## Security Notes

- **Never commit private keys to version control**
- **Use strong file permissions**: `chmod 600 *.pem` for private keys
- **Rotate certificates regularly**
- **Monitor certificate expiration dates**
- **Use separate certificates for different environments**

## Docker Volume Mounting

The certificates are mounted into containers via Docker volumes:

```yaml
volumes:
  - ./certs:/app/certs:ro # Read-only mount for security
```

This ensures certificates are available at `/app/certs/` inside the containers while maintaining security through read-only access.
