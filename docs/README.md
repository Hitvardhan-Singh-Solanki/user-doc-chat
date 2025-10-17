# User Doc Chat Documentation

A comprehensive legal document chat application with AI-powered document analysis and secure infrastructure.

## 🚀 Quick Start

### Development Setup
```bash
# Setup development environment
./scripts/dev.sh setup

# Generate secrets
./scripts/dev.sh secrets

# Run tests
./scripts/dev.sh test
```

### Infrastructure Deployment
```bash
# Deploy infrastructure
./scripts/infra.sh deploy

# Check status
./scripts/infra.sh status
```

## 📖 Documentation

### Core Documentation
- **[API Reference](./API.md)** - Complete API documentation with examples
- **[Architecture](./ARCHITECTURE.md)** - System design and technology stack
- **[Features](./FEATURES.md)** - Feature overview and capabilities

### Security & Deployment
- **[Security Guide](./SECURITY.md)** - Security guidelines, secrets management, and best practices
- **[Deployment Guide](./DEPLOYMENT.md)** - Production deployment with CI/CD and monitoring

### Development
- **[Setup Guide](./SETUP.md)** - Development environment setup
- **[Testing Guide](./TESTING.md)** - Testing strategies and guidelines

## 🛠️ Scripts

### Development Scripts
```bash
./scripts/dev.sh setup      # Setup development environment
./scripts/dev.sh secrets    # Generate secrets
./scripts/dev.sh certs      # Generate certificates
./scripts/dev.sh test       # Run tests
./scripts/dev.sh build      # Build application
```

### Infrastructure Scripts
```bash
./scripts/infra.sh check    # Check prerequisites
./scripts/infra.sh test     # Run infrastructure tests
./scripts/infra.sh preview  # Preview infrastructure
./scripts/infra.sh deploy   # Deploy infrastructure
./scripts/infra.sh status   # Show status
./scripts/infra.sh destroy  # Destroy infrastructure
```

### Security Scripts
```bash
./scripts/security.sh rotate # Rotate credentials
./scripts/security.sh k8s    # Setup Kubernetes secrets
./scripts/security.sh secure # Secure production
./scripts/security.sh audit  # Run security audit
```

## 🔧 Technology Stack

- **Backend**: Node.js, TypeScript, Express
- **Database**: PostgreSQL with pgvector
- **Cache**: Redis
- **Storage**: MinIO/S3
- **AI/ML**: Hugging Face, OpenAI
- **Infrastructure**: AWS, Kubernetes, Pulumi
- **Monitoring**: Prometheus, Grafana
- **CI/CD**: GitHub Actions

## 📋 Project Structure

```
├── src/                    # Source code
│   ├── domains/           # Domain logic
│   ├── infrastructure/    # Infrastructure code
│   └── shared/           # Shared utilities
├── infrastructure/        # Pulumi infrastructure
├── k8s/                  # Kubernetes manifests
├── scripts/              # Utility scripts
├── docs/                 # Documentation
└── .github/workflows/    # CI/CD pipelines
```

## 🚀 Getting Started

1. **Clone the repository**
2. **Run setup**: `./scripts/dev.sh setup`
3. **Start development**: `npm run dev`
4. **Deploy infrastructure**: `./scripts/infra.sh deploy`

## 📞 Support

For questions and support, please refer to the documentation or create an issue in the repository.