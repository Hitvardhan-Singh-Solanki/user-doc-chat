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
- **E2E Tests**: Full user workflow testing
- **Mock Services**: External service mocking for reliable testing

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

### 📝 Future Features

- [ ] **Custom Models** - Fine-tuned models for specific legal domains
- [ ] **Enterprise Features** - Multi-tenancy, advanced permissions
- [ ] **Integration APIs** - Third-party integrations, webhooks

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check the [docs](./docs/) directory for comprehensive guides
- **Issues**: Report bugs and request features via GitHub Issues
- **Security**: Report security issues privately to the maintainers

---

**Built with ❤️ for the legal community**