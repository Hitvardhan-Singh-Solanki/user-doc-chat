# 📄 AI Legal Document Q&A App

An **AI-powered document assistant** that allows users to upload documents and interact with them through a chatbot interface. Users can ask natural language questions about their uploaded documents and receive intelligent answers based on document content.

## 🚀 Quick Start

1. **Clone and Setup**:
   ```bash
   git clone <repository-url>
   cd user-doc-chat
   npm install
   ```

2. **Generate Secrets**:
   ```bash
   ./scripts/generate-secrets.sh
   ```

3. **Deploy**:
   ```bash
   docker-compose -f docker-compose.production-secure.yml up -d
   ```

> 📖 **For detailed setup instructions, see [Setup Guide](./docs/SETUP.md)**

## 🎯 What It Does

The AI Legal Document Q&A App enables users to:

- **Upload Documents**: Securely upload PDF, DOCX, and TXT files
- **Ask Questions**: Use natural language to query document content
- **Get AI Answers**: Receive intelligent responses based on document analysis
- **Chat Interface**: Interactive conversation with document context
- **Vector Search**: Find relevant information using semantic search

### Example Use Case

Upload a legal contract and ask: *"What are the key obligations mentioned in this document?"*

The system will:
1. Process and vectorize the document
2. Use AI to understand your question
3. Find relevant sections using semantic search
4. Generate a comprehensive answer with source references

## 🛠️ Tech Stack

- **Backend**: Node.js (TypeScript, Express) with modular architecture
- **AI/LLM**: Hugging Face Transformers, OpenAI API
- **Vector Store**: PostgreSQL + pgvector, Pinecone
- **Storage**: MinIO/S3-compatible storage
- **Database**: PostgreSQL with Redis caching
- **Containerization**: Docker & Docker Compose

## 🔒 Security

### 🚨 CRITICAL: Secure Deployment

**If you have used default MinIO credentials (`minioadmin`/`minioadmin`) in production, you MUST rotate them immediately:**

```bash
./scripts/rotate-minio-credentials.sh
```

> 📖 **See [Secure Deployment Guide](./docs/SECURE_DEPLOYMENT.md) for comprehensive security setup instructions**

### Security Features

- **Secrets Management**: Secure credential management with Docker secrets, Kubernetes secrets, and cloud secrets managers
- **Credential Rotation**: Automated scripts for rotating sensitive credentials
- **Input Validation**: All user inputs are validated and sanitized
- **Authentication**: JWT-based authentication system
- **Rate Limiting**: API rate limiting to prevent abuse
- **CORS**: Configurable CORS settings
- **SSRF Protection**: Protection against Server-Side Request Forgery attacks
- **Private IP Protection**: Prevents access to private IP addresses

## 📚 Documentation

> 📖 **[View All Documentation](./docs/README.md)** - Complete documentation index

### Core Documentation
- [**Setup Guide**](./docs/SETUP.md) - Installation and configuration instructions
- [**API Documentation**](./docs/API.md) - Complete API reference and examples
- [**Features Guide**](./docs/FEATURES.md) - Feature capabilities and use cases
- [**Architecture Guide**](./docs/ARCHITECTURE.md) - System architecture and design

### Security & Deployment
- [**Secure Deployment Guide**](./docs/SECURE_DEPLOYMENT.md) - Comprehensive security deployment guide
- [**Secrets Management**](./docs/SECRETS_MANAGEMENT.md) - Secrets management best practices
- [**Security Analysis**](./docs/SECURITY_ANALYSIS.md) - Security analysis and recommendations
- [**Prompt Injection Security**](./docs/PROMPT_INJECTION_SECURITY.md) - Prompt injection vulnerabilities and protections

### Development & Migration
- [**JWT Migration Guide**](./docs/JWT_MIGRATION.md) - JWT token migration documentation

### Certificates
- [**Certificate Management**](./certs/README.md) - SSL/TLS certificate setup and management

## 🏗️ Architecture Overview

The application follows a **modular domain-driven design** with clear separation of concerns:

```
src/
├── domains/           # Domain-specific modules
│   ├── auth/         # Authentication domain
│   ├── files/        # File management domain
│   ├── chat/         # Chat and Q&A domain
│   └── vector/       # Vector operations domain
├── infrastructure/   # External integrations
│   ├── database/     # Database repositories
│   ├── external-services/ # AI, search, storage
│   └── monitoring/   # Observability tools
└── shared/          # Common utilities
    ├── middleware/   # Express middleware
    ├── utils/       # Utility functions
    └── types/       # Type definitions
```

### Key Benefits

- **Domain Separation**: Each feature is self-contained
- **Scalability**: Easy to add new features or modify existing ones
- **Maintainability**: Related code is grouped together
- **Testability**: Tests are co-located with their modules
- **Team Collaboration**: Multiple developers can work on different modules

> 📖 **See [Architecture Guide](./docs/ARCHITECTURE.md) for detailed system design**

## 🚀 Features

- **Document Upload** – Users can securely upload PDF, DOCX, and text files
- **AI-Powered Q&A** – Chatbot answers questions using the uploaded documents as context
- **File Processing Pipeline** – Documents are parsed, chunked, and embedded for efficient retrieval
- **Contextual Search** – Uses embeddings + vector search to fetch the most relevant passages
- **Chat Interface** – Natural conversation flow with memory for follow-up questions
- **Cloud Storage** – Files are stored in S3-compatible storage (AWS S3 / Cloudflare R2)
- **Dockerized** – Fully containerized for easy deployment

> 📖 **See [Features Guide](./docs/FEATURES.md) for complete feature list and capabilities**

## 📦 Development Commands

```bash
# Development
npm run dev          # Starts both API server and worker
npm run dev:api      # Starts only the API server
npm run worker:dev   # Starts only the file processing worker

# Production
npm run build        # Builds both API and worker
npm run start        # Starts both API server and worker in production

# Database
npm run migrate:up   # Run pending migrations
npm run migrate:down # Rollback last migration

# Testing
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode
npm run coverage     # Generate test coverage report

# Code quality
npm run lint         # Run ESLint
npm run lint-fix     # Fix ESLint issues
npm run type-check   # TypeScript type checking

# Docker
docker-compose up --build                    # Production
docker-compose -f docker-compose.dev.yml up --build -d  # Development
```

## 🧪 Testing

The project includes comprehensive testing:

- **Unit Tests**: Individual service and utility testing
- **Integration Tests**: API endpoint and service interaction testing
- **E2E Tests**: Full user workflow testing with real gRPC services
- **Mock Services**: External service mocking for reliable testing

### Test Types

#### Unit Tests
```bash
# Run unit tests
npm test

# Run with coverage
npm run coverage

# Watch mode
npm run test:watch
```

#### End-to-End Tests
E2E tests verify the complete integration between Node.js and Python gRPC services:

```bash
# Run e2e tests (requires Python service running)
npm run test:e2e

# Run e2e tests in watch mode
npm run test:e2e:watch

# Run all tests (unit + e2e)
npm run test:all

# Local e2e testing with automatic service setup
./scripts/test-e2e-local.sh
```

#### gRPC Service Testing
The e2e tests specifically verify:
- ✅ gRPC communication between Node.js and Python services
- ✅ File sanitization workflows (text and PDF)
- ✅ Error handling and edge cases
- ✅ Performance and concurrency
- ✅ Service health and connectivity

> 📖 **See [E2E Test Documentation](./src/tests/e2e/README.md) for detailed testing information**

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run coverage
```

## 🚀 Deployment Options

- **Docker Compose** (recommended for development and small deployments)
- **Kubernetes** with Helm charts
- **Manual service deployment**
- **Cloud platforms** (AWS, Azure, GCP)

> 📖 **See [Setup Guide](./docs/SETUP.md) for detailed deployment instructions**

## 📊 Project Status

### ✅ Completed Features

- [x] **User Authentication** - JWT-based auth with protected routes
- [x] **File Upload & Processing** - Multi-format support with background processing
- [x] **AI-Powered Q&A** - Natural language querying with document context
- [x] **Vector Search** - Semantic search using embeddings
- [x] **Real-time Chat** - WebSocket-based interactive interface
- [x] **Security Features** - Input validation, SSRF protection, secure file handling

### 🚧 In Progress

- [ ] **Enhanced AI Capabilities** - Multi-language support, advanced summarization
- [ ] **User Experience** - Document annotation, collaborative features
- [ ] **Performance** - CDN integration, advanced caching

### 📝 Legal-Specific Roadmap

#### 🔒 Legal-Grade Compliance Layer (Basic Implementation)
- [x] **Basic Security Headers** - XSS protection, CSRF protection, content security policy
- [x] **Input Sanitization** - XSS and injection attack prevention
- [x] **File Security** - Secure file upload with validation and type checking
- [x] **JWT Authentication** - Secure authentication with token validation
- [ ] **Data Residency Controls** - Jurisdictional data storage (EU vs US vs APAC) for law firms bound by jurisdictional rules
- [ ] **Field-Level Encryption** - Encrypt highly sensitive clauses and confidential information
- [ ] **Key Management Service (KMS)** - Integration with HashiCorp Vault or AWS KMS for encryption key management separate from app stack
- [x] **Basic Audit Logging** - Request/response logging with security monitoring

#### 🧠 RAG Optimization for Legal Documents
- [x] **Vector Search** - Pinecone-based semantic search for document retrieval
- [x] **Document Processing** - PDF, DOCX, and TXT file processing with background jobs
- [x] **Chat History Caching** - Redis-based chat history storage and retrieval
- [ ] **Hybrid Search** - Combine BM25 + semantic embeddings (Pinecone hybrid search) for better legal document retrieval
- [ ] **Legal Document Chunking** - Section-based and clause-aware chunking strategies optimized for legal documents
- [ ] **Retrieval Caching** - Cache retrieval results in Redis for repeated queries in same legal session
- [ ] **Legal Citation Integration** - Automatic extraction and linking of legal citations and case law references

#### 🛡️ Security Hardening
- [x] **Rate Limiting** - Basic rate limiting middleware (needs enhancement for production)
- [x] **Security Logging** - Suspicious pattern detection and security event logging
- [x] **CORS Protection** - Configurable CORS with security considerations
- [x] **Request Size Limits** - Protection against large request attacks
- [ ] **mTLS for gRPC** - Enforce mutual TLS for Node ↔ Python gRPC communication
- [ ] **Advanced Rate Limiting** - Legal SaaS-specific rate limiting and abuse detection with Redis
- [ ] **Dependency Security** - Regular vulnerability scans with Snyk/GitHub Dependabot
- [ ] **Zero-Trust Architecture** - Implement zero-trust principles for legal document access

#### 🚀 Production Readiness
- [x] **Basic Monitoring** - Prometheus metrics and Grafana dashboards
- [x] **Structured Logging** - Pino-based logging with request tracking
- [x] **Health Checks** - Application health monitoring endpoints
- [x] **Docker Deployment** - Containerized deployment with Docker Compose
- [x] **Background Processing** - BullMQ job queue for asynchronous file processing
- [ ] **OpenTelemetry Tracing** - Distributed tracing across Node, Python, Redis, and Postgres
- [ ] **Circuit Breakers** - Fallback mechanisms when Pinecone or HuggingFace API is down
- [ ] **Document Versioning** - Immutable record-keeping in S3 for legal compliance
- [ ] **High Availability** - Multi-region deployment for legal firms with global operations

#### 🏗️ Architecture Enhancements (Advanced Implementation)
- [ ] **Redis-Based Rate Limiting** - Replace in-memory rate limiting with Redis for multi-instance scaling
- [ ] **Advanced Caching Strategy** - Redis caching for expensive operations (embeddings, LLM responses)
- [ ] **Load Balancing** - Horizontal scaling with proper load balancer configuration
- [ ] **SLA Monitoring** - Business metrics and SLA tracking for legal document processing
- [ ] **Proactive Alerting** - Alerting strategy for system health and business metrics
- [ ] **Multi-Tenancy** - Support for multiple law firms with data isolation
- [ ] **Advanced Error Recovery** - Graceful degradation and recovery mechanisms

#### ⚖️ Legal-Specific UX Features
- [x] **Real-time Chat** - WebSocket-based interactive document Q&A
- [x] **File Upload & Processing** - Multi-format document upload with progress tracking
- [x] **User Isolation** - Multi-user document access control
- [ ] **Source Citations** - Responses with clause IDs, page numbers, and case law references
- [ ] **Multi-Document Analysis** - Compare contracts across different clients and cases
- [ ] **Audit-Ready Exports** - Download JSON/PDF logs of conversations for legal records
- [ ] **Legal Template Integration** - Pre-built templates for common legal document types
- [ ] **Client Matter Management** - Organize documents by client and matter for law firm workflows

## 🤝 Contributing

**This is proprietary software. Public contributions are not accepted.**

### For Authorized Contributors Only

If you are an authorized contributor with explicit written permission:

1. **Contact the maintainer** before making any changes
2. **Sign a contributor agreement** and confidentiality agreement
3. **Obtain written approval** for your proposed changes
4. **Follow internal development guidelines** and security protocols
5. **Submit changes through approved channels** only

### Public Forks and Pull Requests

- **Public forks are not permitted** under the proprietary license
- **Pull requests from public repositories will be rejected**
- **Unauthorized copying or modification is prohibited**

For licensing inquiries or collaboration opportunities, please contact the maintainer directly.

## 📄 License

This project is **proprietary and confidential**. All rights reserved.

**Copyright (c) 2025 Hitvardhan Singh Solanki**

This software is proprietary and confidential. Unauthorized copying, modification, distribution, or use is prohibited without explicit written permission.

See the [LICENSE.md](LICENSE.md) file for full terms and conditions.

## 🆘 Support

- **Documentation**: Check the [docs](./docs/) directory for comprehensive guides
- **Licensing Inquiries**: Contact the maintainer for licensing, permissions, or collaboration opportunities
- **Authorized Users**: For technical support, contact through approved channels only
- **Security**: Report security issues privately to the maintainer (do not use public GitHub Issues)
- **Legal Questions**: Consult the [LICENSE.md](LICENSE.md) file for full terms and conditions

**Note**: This is proprietary software. Support is limited to authorized users and licensees only.

---

**Built with ❤️ for the legal community**