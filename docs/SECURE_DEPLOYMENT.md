# Secure Deployment Guide

This guide provides comprehensive instructions for securely deploying the User Doc Chat application with proper secrets management.

## 🚨 CRITICAL SECURITY NOTICE

**If you have used default MinIO credentials (`minioadmin`/`minioadmin`) in production, you MUST rotate them immediately:**

```bash
./scripts/rotate-minio-credentials.sh
```

## Overview

This application implements multiple layers of security:

1. **Secrets Management**: Docker secrets, Kubernetes secrets, or cloud secrets managers
2. **Secure Credentials**: Cryptographically secure random credentials
3. **Access Control**: Role-based access control (RBAC)
4. **Audit Logging**: Comprehensive logging of all operations
5. **Encryption**: Data encryption at rest and in transit

## Prerequisites

- Docker and Docker Compose
- OpenSSL (for generating secure credentials)
- Access to a secrets management system (optional but recommended)

## Quick Start (Development)

For development environments only:

```bash
# Copy the template
cp env.production.template .env.development

# Generate secure credentials
JWT_SECRET=$(openssl rand -base64 32)
MINIO_ACCESS_KEY=$(openssl rand -base64 32)
MINIO_SECRET_KEY=$(openssl rand -base64 32)

# Update .env.development with generated values
# NEVER commit this file to version control!

# Start the application
docker-compose -f docker-compose.dev.yml up -d
```

## Production Deployment

### Option 1: Docker Secrets (Recommended)

1. **Generate Secure Credentials**:
   ```bash
   # Option A: Use the automated script (recommended)
   ./scripts/generate-secrets.sh
   
   # Option B: Generate manually
   JWT_SECRET=$(openssl rand -base64 32)
   DB_PASSWORD=$(openssl rand -base64 32)
   REDIS_PASSWORD=$(openssl rand -base64 32)
   MINIO_ACCESS_KEY=$(openssl rand -base64 32)
   MINIO_SECRET_KEY=$(openssl rand -base64 32)
   GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 32)
   ```

2. **Create Secrets Files**:
   ```bash
   # Create secrets directory
   mkdir -p secrets
   
    # Store MinIO credentials
    echo "$MINIO_ACCESS_KEY" > secrets/minio-access-key.txt
    echo "$MINIO_SECRET_KEY" > secrets/minio-secret-key.txt
    
    # Note: The secrets/ directory contains placeholder files with <your-*-key> values
    # Replace these with your actual generated credentials
   
   # Set proper permissions
   chmod 600 secrets/*.txt
   ```

3. **Create Environment File**:
   ```bash
   # Copy template
   cp env.production.template .env.production
   
   # Edit .env.production with your values (excluding secrets)
   # Secrets will be loaded from files
   ```

4. **Deploy with Secrets**:
   ```bash
   docker-compose -f docker-compose.production-secure.yml --env-file .env.production up -d
   ```

### Option 2: Docker Swarm Secrets

1. **Initialize Swarm**:
   ```bash
   docker swarm init
   ```

2. **Create Secrets**:
   ```bash
   # Create all required secrets
   echo "$JWT_SECRET" | docker secret create jwt_secret -
   echo "$DB_PASSWORD" | docker secret create db_password -
   echo "$REDIS_PASSWORD" | docker secret create redis_password -
   echo "$MINIO_ACCESS_KEY" | docker secret create minio_access_key -
   echo "$MINIO_SECRET_KEY" | docker secret create minio_secret_key -
   echo "$GRAFANA_ADMIN_PASSWORD" | docker secret create grafana_admin_password -
   ```

3. **Deploy Stack**:
   ```bash
   docker stack deploy -c docker-compose.production-secure.yml user-doc-chat
   ```

### Option 3: Kubernetes Secrets

1. **Create Kubernetes Secrets**:
   ```bash
   kubectl create secret generic app-secrets \
     --from-literal=jwt-secret="$JWT_SECRET" \
     --from-literal=db-password="$DB_PASSWORD" \
     --from-literal=redis-password="$REDIS_PASSWORD" \
     --from-literal=minio-access-key="$MINIO_ACCESS_KEY" \
     --from-literal=minio-secret-key="$MINIO_SECRET_KEY" \
     --from-literal=grafana-admin-password="$GRAFANA_ADMIN_PASSWORD"
   ```

2. **Deploy with Kubernetes**:
   ```bash
   kubectl apply -f k8s/
   ```

### Option 4: Cloud Secrets Managers

#### AWS Secrets Manager

```bash
# Store secrets
aws secretsmanager create-secret \
  --name "user-doc-chat/jwt-secret" \
  --secret-string "$JWT_SECRET"

aws secretsmanager create-secret \
  --name "user-doc-chat/minio-credentials" \
  --secret-string "{\"access_key\":\"$MINIO_ACCESS_KEY\",\"secret_key\":\"$MINIO_SECRET_KEY\"}"
```

#### HashiCorp Vault

```bash
# Enable KV secrets engine
vault secrets enable -path=secret kv-v2

# Store secrets
vault kv put secret/user-doc-chat \
  jwt_secret="$JWT_SECRET" \
  minio_access_key="$MINIO_ACCESS_KEY" \
  minio_secret_key="$MINIO_SECRET_KEY"
```

## Credential Rotation

### Automatic Rotation

Use the provided script for automatic credential rotation:

```bash
./scripts/rotate-minio-credentials.sh
```

### Manual Rotation

1. **Generate New Credentials**:
   ```bash
   NEW_ACCESS_KEY=$(openssl rand -base64 32)
   NEW_SECRET_KEY=$(openssl rand -base64 32)
   ```

2. **Update Secrets**:
   ```bash
   # For Docker secrets
   echo "$NEW_ACCESS_KEY" > secrets/minio-access-key.txt
   echo "$NEW_SECRET_KEY" > secrets/minio-secret-key.txt
   
   # For Docker Swarm
   docker secret rm minio_access_key minio_secret_key
   echo "$NEW_ACCESS_KEY" | docker secret create minio_access_key -
   echo "$NEW_SECRET_KEY" | docker secret create minio_secret_key -
   ```

3. **Restart Services**:
   ```bash
   docker-compose -f docker-compose.production-secure.yml restart minio app
   ```

## Security Best Practices

### 1. Secrets Management

- ✅ Use cryptographically secure random credentials
- ✅ Store secrets in dedicated secrets management systems
- ✅ Never commit secrets to version control
- ✅ Rotate credentials regularly (every 90 days)
- ✅ Use least privilege access controls
- ✅ Enable audit logging for secret access

### 2. Network Security

- ✅ Use HTTPS/TLS for all external connections
- ✅ Implement proper firewall rules
- ✅ Use private networks for internal communication
- ✅ Enable SSL/TLS for database connections

### 3. Application Security

- ✅ Enable CORS with specific origins
- ✅ Implement rate limiting
- ✅ Use secure JWT tokens with proper expiration
- ✅ Validate and sanitize all inputs
- ✅ Implement proper error handling

### 4. Monitoring and Logging

- ✅ Enable comprehensive audit logging
- ✅ Monitor for suspicious activities
- ✅ Set up alerts for security events
- ✅ Regular security assessments

## Environment Variables

### Required Secrets

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing secret | `openssl rand -base64 32` |
| `DB_PASSWORD` | Database password | `openssl rand -base64 32` |
| `REDIS_PASSWORD` | Redis password | `openssl rand -base64 32` |
| `MINIO_ACCESS_KEY` | MinIO access key | `openssl rand -base64 32` |
| `MINIO_SECRET_KEY` | MinIO secret key | `openssl rand -base64 32` |

### Optional Secrets

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | From OpenAI dashboard |
| `ANTHROPIC_API_KEY` | Anthropic API key | From Anthropic dashboard |
| `SERP_API_KEY` | SERP API key | From SERP API dashboard |
| `BING_SEARCH_API_KEY` | Bing Search API key | From Azure portal |

## Troubleshooting

### Common Issues

1. **MinIO Connection Failed**:
   - Verify credentials are correct
   - Check network connectivity
   - Ensure MinIO container is running

2. **JWT Token Invalid**:
   - Verify JWT_SECRET is set correctly
   - Check token expiration
   - Ensure clock synchronization

3. **Database Connection Failed**:
   - Verify database credentials
   - Check network connectivity
   - Ensure SSL configuration is correct

### Logs and Debugging

```bash
# View application logs
docker-compose -f docker-compose.production-secure.yml logs app

# View MinIO logs
docker-compose -f docker-compose.production-secure.yml logs minio

# Check container status
docker-compose -f docker-compose.production-secure.yml ps
```

## Compliance and Auditing

### GDPR Compliance

- Implement data retention policies
- Enable data export functionality
- Provide data deletion capabilities
- Maintain audit logs

### HIPAA Compliance (if applicable)

- Encrypt data at rest and in transit
- Implement access controls
- Maintain audit trails
- Regular security assessments

### Audit Logging

All operations are logged with:
- Timestamp
- User ID
- Action performed
- Resource accessed
- IP address
- User agent

## Support

For security-related issues or questions:

1. Check the logs for error messages
2. Verify all secrets are correctly configured
3. Ensure network connectivity
4. Review security best practices
5. Contact the security team for critical issues

## Emergency Procedures

### Security Incident Response

1. **Immediate Actions**:
   - Rotate all credentials immediately
   - Review access logs
   - Isolate affected systems

2. **Investigation**:
   - Analyze audit logs
   - Identify compromised accounts
   - Assess data exposure

3. **Recovery**:
   - Deploy new credentials
   - Update security configurations
   - Notify affected users

### Disaster Recovery

1. **Backup Verification**:
   - Verify database backups
   - Check MinIO data integrity
   - Test restore procedures

2. **Recovery Procedures**:
   - Restore from latest backup
   - Deploy with new credentials
   - Verify system functionality

Remember: **Security is an ongoing process, not a one-time setup!**
