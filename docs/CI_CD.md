# CI/CD Pipeline Documentation

## Overview

This project implements a comprehensive CI/CD pipeline using GitHub Actions with automated testing, building, security scanning, and deployment capabilities.

## Pipeline Structure

### 1. CI Pipeline (`ci.yml`)
**Triggers:** Push to any branch, Pull Requests to main/develop

**Jobs:**
- **Build and Test**: Runs linting, type checking, unit tests, integration tests, performance tests, and infrastructure tests
- **Infrastructure Validation**: Validates Pulumi infrastructure configuration
- **Docker Build**: Builds and pushes Docker images to GitHub Container Registry
- **Security Scan**: Runs Trivy vulnerability scanner and CodeQL analysis
- **Code Quality**: Runs SonarCloud analysis and coverage reporting

### 2. CD Pipeline (`cd.yml`)
**Triggers:** Push to main branch, Manual workflow dispatch

**Jobs:**
- **Deploy to Production**: Full production deployment with infrastructure provisioning
- **Deploy to Staging**: Manual staging deployment
- **Rollback**: Automatic rollback on deployment failure

### 3. Security Pipeline (`security.yml`)
**Triggers:** Push to main/develop, Pull Requests, Weekly schedule

**Jobs:**
- **Dependency Security Scan**: npm audit and Snyk scanning
- **Code Security Scan**: Trivy and CodeQL analysis
- **Infrastructure Security**: Pulumi and Checkov security scanning
- **Container Security**: Docker image vulnerability scanning
- **Secrets Detection**: TruffleHog secrets scanning

### 4. Infrastructure Pipeline (`infrastructure.yml`)
**Triggers:** Changes to infrastructure files, Manual dispatch

**Jobs:**
- **Validate Infrastructure**: Runs infrastructure tests and Pulumi preview
- **Preview Infrastructure**: Shows infrastructure changes in PRs
- **Deploy Infrastructure**: Provisions AWS infrastructure
- **Destroy Infrastructure**: Manual infrastructure destruction
- **Health Check**: Validates deployed infrastructure

## Required Secrets

Configure the following secrets in your GitHub repository:

### AWS Credentials
```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

### Security Tools
```
SNYK_TOKEN
SONAR_TOKEN
```

### Notifications
```
SLACK_WEBHOOK
```

## Environment Variables

The pipeline uses the following environment variables:

```yaml
NODE_VERSION: '18'
REGISTRY: ghcr.io
IMAGE_NAME: ${{ github.repository }}
```

## Docker Configuration

### Dockerfile
- Multi-stage build for optimized production image
- Non-root user for security
- Health check endpoint
- Minimal attack surface

### .dockerignore
- Excludes development files, tests, and documentation
- Optimizes build context size

## Kubernetes Deployment

### Manifests
- **namespace.yaml**: Production namespace
- **configmap.yaml**: Application configuration
- **secrets.yaml**: Sensitive data (passwords, API keys)
- **deployment.yaml**: Application deployment with 3 replicas
- **service.yaml**: Internal service exposure
- **ingress.yaml**: External access with SSL termination

### Security Features
- Non-root containers
- Read-only root filesystem
- Dropped capabilities
- Resource limits and requests
- Health checks

## Pipeline Features

### Automated Testing
- **Unit Tests**: Fast, isolated tests
- **Integration Tests**: Database and external service tests
- **Performance Tests**: Memory and blocking operation tests
- **Infrastructure Tests**: Pulumi resource validation

### Security Scanning
- **Dependency Scanning**: npm audit, Snyk
- **Code Scanning**: Trivy, CodeQL
- **Container Scanning**: Docker image vulnerabilities
- **Infrastructure Scanning**: Pulumi, Checkov
- **Secrets Detection**: TruffleHog

### Quality Gates
- All tests must pass
- No high-severity vulnerabilities
- Code coverage thresholds
- SonarCloud quality gates

### Deployment Strategy
- **Blue-Green**: Zero-downtime deployments
- **Rollback**: Automatic rollback on failure
- **Health Checks**: Post-deployment validation
- **Notifications**: Slack integration

## Manual Workflows

### Infrastructure Management
```bash
# Preview infrastructure changes
gh workflow run infrastructure.yml -f environment=staging -f action=preview

# Deploy infrastructure
gh workflow run infrastructure.yml -f environment=production -f action=up

# Destroy infrastructure
gh workflow run infrastructure.yml -f environment=staging -f action=destroy
```

### Staging Deployment
```bash
# Deploy to staging
gh workflow run cd.yml -f environment=staging
```

## Monitoring and Observability

### Health Checks
- Application health endpoint: `/health`
- Kubernetes liveness and readiness probes
- Infrastructure component validation

### Notifications
- Slack notifications for deployment status
- Security scan results
- Infrastructure changes

### Logging
- Structured logging with Pino
- Centralized log aggregation
- Error tracking and alerting

## Best Practices

### Security
- Secrets management with GitHub Secrets
- Container security scanning
- Infrastructure as Code validation
- Regular dependency updates

### Performance
- Multi-stage Docker builds
- Resource optimization
- Caching strategies
- Parallel job execution

### Reliability
- Comprehensive test coverage
- Automated rollback
- Health check validation
- Monitoring and alerting

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check Node.js version compatibility
   - Verify dependency installation
   - Review test failures

2. **Deployment Issues**
   - Validate AWS credentials
   - Check infrastructure resources
   - Review Kubernetes manifests

3. **Security Scan Failures**
   - Update vulnerable dependencies
   - Fix security issues in code
   - Review infrastructure configuration

### Debug Commands

```bash
# Check pipeline status
gh run list

# View pipeline logs
gh run view <run-id>

# Re-run failed jobs
gh run rerun <run-id>
```

## Future Enhancements

- [ ] Multi-environment support
- [ ] Advanced deployment strategies
- [ ] Performance monitoring integration
- [ ] Automated security updates
- [ ] Cost optimization
- [ ] Disaster recovery procedures
