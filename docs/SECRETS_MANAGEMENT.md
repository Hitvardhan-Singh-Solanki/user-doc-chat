# Secrets Management Guide

This document provides comprehensive guidance on managing secrets securely in the user-doc-chat application.

## Overview

Secrets management is critical for maintaining the security of the application. This guide covers:

- Secure storage of database credentials
- API key management
- JWT secret rotation
- Deployment-specific secret handling
- Access control and permissions

## Security Principles

### 1. Never Commit Secrets to Version Control

- All `.env*` files containing real secrets are in `.gitignore`
- Use templates (`.env.production.template`) for configuration
- Store actual secrets in secure secret stores

### 2. Use Environment-Specific Secrets

- Different secrets for development, staging, and production
- No shared secrets between environments
- Regular rotation of production secrets

### 3. Least Privilege Access

- Only deployment pipelines have write access to secrets
- Application services have read-only access
- Developers should not have direct access to production secrets

## Secret Types

### Database Credentials
- `POSTGRES_USER`: Database username
- `POSTGRES_PASSWORD`: Database password
- `POSTGRES_DB`: Database name
- `DATABASE_URL`: Complete connection string

### Authentication Secrets
- `JWT_SECRET`: Cryptographically secure secret for JWT signing
- `JWT_AUDIENCE`: JWT audience claim
- `JWT_ISSUER`: JWT issuer claim

### External API Keys
- `OPENAI_API_KEY`: OpenAI API access key
- `ANTHROPIC_API_KEY`: Anthropic API access key
- `SERP_API_KEY`: SERP API access key
- `BING_SEARCH_API_KEY`: Bing Search API key
- `PINECONE_API_KEY`: Pinecone vector database API key
- `HUGGINGFACE_API_KEY`: Hugging Face API key

### Storage Credentials
- `MINIO_ACCESS_KEY`: MinIO/S3 access key
- `MINIO_SECRET_KEY`: MinIO/S3 secret key
- `S3_BUCKET`: S3 bucket name

### Cache Credentials
- `REDIS_PASSWORD`: Redis authentication password

## Secret Storage Options

### 1. Docker Secrets (Recommended for Docker Swarm)

```bash
# Create secrets
echo "your-db-password" | docker secret create postgres_password -
echo "your-jwt-secret" | docker secret create jwt_secret -
echo "your-redis-password" | docker secret create redis_password -

# Use in docker-compose.yml
secrets:
  - postgres_password
  - jwt_secret
  - redis_password

environment:
  - POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password
  - JWT_SECRET_FILE=/run/secrets/jwt_secret
  - REDIS_PASSWORD_FILE=/run/secrets/redis_password
```

### 2. Kubernetes Secrets

```bash
# Create secrets
kubectl create secret generic app-secrets \
  --from-literal=postgres-password="your-db-password" \
  --from-literal=jwt-secret="your-jwt-secret" \
  --from-literal=redis-password="your-redis-password"

# Use in deployment.yaml
env:
- name: POSTGRES_PASSWORD
  valueFrom:
    secretKeyRef:
      name: app-secrets
      key: postgres-password
```

### 3. Cloud Secrets Manager

#### AWS Secrets Manager
```bash
# Store secret
aws secretsmanager create-secret \
  --name "user-doc-chat/db-password" \
  --secret-string "your-db-password"

# Retrieve secret
aws secretsmanager get-secret-value \
  --secret-id "user-doc-chat/db-password" \
  --query SecretString --output text
```

#### Azure Key Vault
```bash
# Store secret
az keyvault secret set \
  --vault-name "your-vault" \
  --name "db-password" \
  --value "your-db-password"

# Retrieve secret
az keyvault secret show \
  --vault-name "your-vault" \
  --name "db-password" \
  --query value --output tsv
```

#### Google Secret Manager
```bash
# Store secret
echo -n "your-db-password" | gcloud secrets create db-password --data-file=-

# Retrieve secret
gcloud secrets versions access latest --secret="db-password"
```

### 4. HashiCorp Vault

```bash
# Store secret
vault kv put secret/user-doc-chat/database \
  username="postgres" \
  password="your-db-password"

# Retrieve secret
vault kv get -field=password secret/user-doc-chat/database
```

## Secret Generation

### Using the Provided Scripts

```bash
# Generate all secrets
./scripts/generate-secrets.sh

# Rotate database credentials
./scripts/rotate-db-credentials.sh rotate

# Setup Kubernetes secrets
./scripts/setup-k8s-secrets.sh setup
```

### Manual Generation

```bash
# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 32)

# Generate database password
DB_PASSWORD=$(openssl rand -base64 32)

# Generate Redis password
REDIS_PASSWORD=$(openssl rand -base64 32)
```

## Secret Rotation

### Rotation Schedule

- **JWT Secrets**: Every 90 days
- **Database Passwords**: Every 180 days
- **API Keys**: As needed (when compromised or expired)
- **Storage Credentials**: Every 90 days

### Rotation Procedure

1. **Generate New Secrets**
   ```bash
   ./scripts/generate-secrets.sh
   ```

2. **Update Secret Store**
   - Update your chosen secret store with new values
   - Keep old secrets temporarily for rollback

3. **Deploy New Configuration**
   - Update deployment configuration
   - Restart application services

4. **Verify Functionality**
   - Test all application features
   - Verify database connectivity
   - Check external API integrations

5. **Clean Up Old Secrets**
   - Remove old secrets from secret store
   - Update any external systems

### Emergency Rollback

```bash
# Rollback database credentials
./scripts/rotate-db-credentials.sh rollback

# Restore from backup
kubectl apply -f secrets/k8s-backup-YYYYMMDD_HHMMSS/
```

## Access Control

### Deployment Pipeline Permissions

- **Write Access**: Create, update, delete secrets
- **Read Access**: Retrieve secrets for deployment
- **Audit Logging**: All secret access logged

### Application Service Permissions

- **Read Access**: Retrieve secrets at runtime
- **No Write Access**: Cannot modify secrets
- **Limited Scope**: Only secrets needed for the service

### Developer Permissions

- **Development Environment**: Full access to dev secrets
- **Staging Environment**: Read-only access
- **Production Environment**: No direct access

## Monitoring and Alerting

### Secret Access Monitoring

- Log all secret retrieval attempts
- Alert on unusual access patterns
- Monitor for failed authentication attempts

### Secret Expiration Alerts

- Alert 30 days before secret expiration
- Alert on secret rotation failures
- Monitor secret store health

### Compliance Monitoring

- Track secret access for audit purposes
- Monitor for secret exposure in logs
- Alert on unauthorized secret access

## Best Practices

### 1. Secret Naming Conventions

- Use descriptive names: `user-doc-chat/db-password`
- Include environment: `user-doc-chat/prod/jwt-secret`
- Version secrets: `user-doc-chat/db-password/v2`

### 2. Secret Versioning

- Keep multiple versions of secrets
- Use versioned secret names
- Document secret changes

### 3. Secret Validation

- Validate secret format before storage
- Test secrets before deployment
- Implement secret health checks

### 4. Documentation

- Document all secret locations
- Maintain secret inventory
- Update documentation with changes

## Troubleshooting

### Common Issues

#### Secret Not Found
```bash
# Check secret exists
kubectl get secret app-secrets
docker secret ls

# Verify secret content
kubectl get secret app-secrets -o yaml
```

#### Permission Denied
```bash
# Check service account permissions
kubectl get serviceaccount your-service-account
kubectl describe serviceaccount your-service-account
```

#### Secret Format Issues
```bash
# Verify base64 encoding
echo "your-secret" | base64
echo "your-base64-secret" | base64 -d
```

### Debug Commands

```bash
# Test database connection
psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB

# Test Redis connection
redis-cli -h localhost -p 6379 -a $REDIS_PASSWORD ping

# Verify JWT secret
node -e "console.log(process.env.JWT_SECRET ? 'JWT_SECRET set' : 'JWT_SECRET not set')"
```

## Security Checklist

- [ ] All secrets stored in secure secret store
- [ ] No secrets committed to version control
- [ ] Environment-specific secrets configured
- [ ] Secret rotation schedule implemented
- [ ] Access controls properly configured
- [ ] Monitoring and alerting enabled
- [ ] Backup and recovery procedures tested
- [ ] Documentation up to date
- [ ] Team trained on secret management
- [ ] Regular security audits performed

## Emergency Procedures

### Secret Compromise

1. **Immediate Response**
   - Rotate compromised secrets immediately
   - Revoke access to affected systems
   - Notify security team

2. **Investigation**
   - Determine scope of compromise
   - Review access logs
   - Identify attack vector

3. **Recovery**
   - Generate new secrets
   - Update all systems
   - Verify security

### Secret Store Failure

1. **Backup Recovery**
   - Restore from backup
   - Verify secret integrity
   - Test application functionality

2. **Alternative Storage**
   - Use backup secret store
   - Update configuration
   - Monitor for issues

## Contact Information

For questions about secrets management:

- **Security Team**: security@yourcompany.com
- **DevOps Team**: devops@yourcompany.com
- **Emergency**: +1-XXX-XXX-XXXX

## References

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Kubernetes Secrets Documentation](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Docker Secrets Documentation](https://docs.docker.com/engine/swarm/secrets/)
- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [Azure Key Vault Documentation](https://docs.microsoft.com/en-us/azure/key-vault/)
- [Google Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [HashiCorp Vault Documentation](https://www.vaultproject.io/docs)