# User Doc Chat Infrastructure

This document describes the Pulumi infrastructure code for deploying the User Doc Chat application to AWS.

## Architecture

The infrastructure includes:

- **VPC**: Custom VPC with public and private subnets across multiple AZs
- **EKS Cluster**: Managed Kubernetes cluster for container orchestration
- **RDS PostgreSQL**: Managed database with encryption and backups
- **ElastiCache Redis**: Managed Redis cluster for caching and sessions
- **S3 Bucket**: Object storage for file uploads
- **Application Load Balancer**: SSL termination and load balancing
- **Route 53**: DNS management
- **SSL Certificate**: ACM certificate for HTTPS
- **Monitoring**: Prometheus and Grafana for observability

## Prerequisites

1. **AWS CLI** configured with appropriate permissions
2. **Pulumi CLI** installed
3. **kubectl** for Kubernetes management
4. **Docker** for building container images

## Setup

### 1. Install Dependencies

```bash
# From project root
npm install
```

### 2. Configure Pulumi

```bash
# Login to Pulumi (if not already logged in)
pulumi login

# Create a new stack
cd infrastructure
pulumi stack init production

# Set configuration
pulumi config set aws:region us-west-2
pulumi config set environment prod
pulumi config set domain your-domain.com
```

### 3. Deploy Infrastructure

```bash
# Quick deployment using script
./scripts/deploy-infrastructure.sh

# Or manual deployment
pulumi preview
pulumi up
```

### 4. Deploy Application

```bash
# Deploy Kubernetes resources
pulumi up --target k8s-deployment

# Deploy monitoring
pulumi up --target monitoring
```

## Testing

### Run Infrastructure Tests

```bash
# From project root - run all infrastructure tests
npm run test:infrastructure

# Run tests in watch mode
npm run test:infrastructure:watch

# Run tests with coverage
npm run test:infrastructure:coverage

# Run tests with UI
npm run test:infrastructure:ui

# Or use the test runner script
./scripts/run-infrastructure-tests.sh
```

### Infrastructure Management

```bash
# Preview infrastructure changes
npm run infrastructure:preview

# Deploy infrastructure
npm run infrastructure:up

# Destroy infrastructure
npm run infrastructure:destroy

# Refresh infrastructure state
npm run infrastructure:refresh
```

### Validate Deployment

```bash
# Validate infrastructure configuration
./scripts/validate-infrastructure-deployment.sh
```

## Configuration

### Environment Variables

The following configuration options are available:

- `aws:region`: AWS region to deploy to (default: us-west-2)
- `environment`: Environment name (dev, staging, prod)
- `domain`: Domain name for the application

### Secrets Management

The following secrets need to be configured:

- Database passwords (auto-generated)
- Redis passwords (auto-generated)
- JWT secrets
- API keys (OpenAI, Anthropic, SERP, Bing)
- MinIO credentials

## Monitoring

### Prometheus
- Access: `http://prometheus-service.monitoring:9090`
- Metrics collection from all services
- Custom dashboards for application metrics

### Grafana
- Access: `http://grafana-service.monitoring:3000`
- Default credentials: admin/admin
- Pre-configured dashboards for application monitoring

## Security

### Network Security
- VPC with private subnets for databases
- Security groups with least privilege access
- SSL/TLS encryption for all communications

### Data Security
- Database encryption at rest
- Redis encryption in transit and at rest
- S3 bucket encryption
- Secrets management through Kubernetes secrets

## Scaling

### Horizontal Pod Autoscaler
The application is configured with:
- Minimum replicas: 1
- Maximum replicas: 10
- CPU target: 70%

### Database Scaling
- RDS with Multi-AZ for high availability
- Automated backups with 7-day retention
- Read replicas can be added for read scaling

## Backup and Recovery

### Database Backups
- Automated daily backups
- 7-day retention period
- Point-in-time recovery available

### Application Data
- S3 bucket with versioning enabled
- Cross-region replication available
- Lifecycle policies for cost optimization

## Cost Optimization

### Resource Sizing
- T3 instances for cost-effective performance
- Right-sized database instances
- S3 Intelligent Tiering for storage

### Monitoring Costs
- CloudWatch for cost tracking
- Resource tagging for cost allocation
- Automated scaling to optimize costs

## Troubleshooting

### Common Issues

1. **Certificate Validation**
   ```bash
   # Check certificate status
   aws acm describe-certificate --certificate-arn <certificate-arn>
   ```

2. **Database Connection**
   ```bash
   # Test database connectivity
   kubectl exec -it <pod-name> -- psql -h <db-endpoint> -U postgres -d user_doc_chat_prod
   ```

3. **Redis Connection**
   ```bash
   # Test Redis connectivity
   kubectl exec -it <pod-name> -- redis-cli -h <redis-endpoint> ping
   ```

### Logs

```bash
# Application logs
kubectl logs -f deployment/user-doc-chat-app-prod

# Prometheus logs
kubectl logs -f deployment/prometheus

# Grafana logs
kubectl logs -f deployment/grafana
```

## Cleanup

To destroy all resources:

```bash
# Destroy in reverse order
pulumi destroy --target monitoring
pulumi destroy --target k8s-deployment
pulumi destroy
```

## Production Considerations

### Security
- Enable AWS Config for compliance
- Set up CloudTrail for audit logging
- Implement WAF for application protection
- Regular security scanning

### Monitoring
- Set up CloudWatch alarms
- Configure log aggregation
- Implement distributed tracing
- Set up alerting for critical metrics

### Backup
- Test backup and recovery procedures
- Implement cross-region backups
- Document disaster recovery procedures
- Regular backup testing

### Performance
- Load testing before production
- Database performance tuning
- CDN for static assets
- Caching strategies

## Support

For infrastructure issues:
1. Check Pulumi logs: `pulumi logs`
2. Review AWS CloudFormation events
3. Check Kubernetes events: `kubectl get events`
4. Review application logs

For application issues:
1. Check application health: `kubectl get pods`
2. Review application logs
3. Check resource usage: `kubectl top pods`
4. Verify configuration: `kubectl describe configmap app-config`
